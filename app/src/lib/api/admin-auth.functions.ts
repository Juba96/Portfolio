import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { z } from "zod";

import { db, schema } from "@/db";
import { checkChatRequest } from "./rate-limit";

// Single-admin auth with optional TOTP 2FA and in-dashboard password change:
//   password — argon2id hash in admin_credentials (set from the Security
//              tab). Until that row exists, the ADMIN_PASSWORD env var is the
//              bootstrap credential. Once the row exists, ONLY the hash works.
//   ADMIN_TOTP_SECRET — optional base32 secret; when set, login also
//              requires a 6-digit authenticator-app code.
// A successful login sets a signed, expiring session token in an httpOnly
// SameSite=Strict cookie. The signing key covers the active credential AND
// the TOTP secret, so changing the password or rotating the secret
// invalidates every existing session. Every admin server fn calls
// `await requireAdmin()` first.

const COOKIE = "admin_session";
const SESSION_DAYS = 30;

// The server runs on Bun (argon2id built in); src/'s tsconfig doesn't load
// bun types, so declare the slice we use. Only referenced inside handlers,
// which never execute client-side.
declare const Bun: {
  password: {
    hash(password: string, options?: { algorithm?: "argon2id" | "bcrypt" }): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
};

const encoder = new TextEncoder();

// ---- credential source (DB hash > env bootstrap), cached in-memory --------

type Credential = { kind: "hash"; hash: string } | { kind: "env"; password: string };

let credentialCache: Credential | null = null;

async function getCredential(): Promise<Credential> {
  if (credentialCache) return credentialCache;
  try {
    const rows = await db()
      .select()
      .from(schema.adminCredentials)
      .where(eq(schema.adminCredentials.id, 1))
      .limit(1);
    if (rows.length > 0) {
      credentialCache = { kind: "hash", hash: rows[0].passwordHash };
      return credentialCache;
    }
  } catch (error) {
    console.error("admin credential read failed; using env bootstrap", error);
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD is not set");
  // Env fallback is NOT cached: the first DB write must take effect promptly.
  return { kind: "env", password: pw };
}

function invalidateCredentialCache() {
  credentialCache = null;
}

// Constant-time string comparison (env bootstrap path).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPassword(input: string): Promise<boolean> {
  const cred = await getCredential();
  if (cred.kind === "hash") {
    try {
      return await Bun.password.verify(input, cred.hash);
    } catch {
      return false;
    }
  }
  return safeEqual(input, cred.password);
}

// ---- session tokens -------------------------------------------------------

async function signingKeySource(): Promise<string> {
  const cred = await getCredential();
  const base = cred.kind === "hash" ? cred.hash : cred.password;
  return `${base}:${process.env.ADMIN_TOTP_SECRET ?? ""}`;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(await signingKeySource()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function issueSessionCookie() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = `${expires}.${await hmacHex(String(expires))}`;
  // Secure flag only over HTTPS — on plain-http localhost dev the browser
  // drops Secure cookies, which silently breaks session persistence.
  const req = getRequest();
  const isHttps =
    new URL(req.url).protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresStr, mac] = token.split(".");
  const expires = Number(expiresStr);
  if (!expires || !mac || expires < Date.now()) return false;
  try {
    return safeEqual(mac, await hmacHex(expiresStr));
  } catch {
    return false;
  }
}

// ---- TOTP -----------------------------------------------------------------

function totpEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOTP_SECRET);
}

function verifyTotpCode(code: string): boolean {
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!secret) return false;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: "taha.qaysariya.com",
      label: "Dashboard",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, "").toUpperCase()),
    });
    // window: 1 tolerates one 30s step of clock drift either way.
    return totp.validate({ token: code, window: 1 }) !== null;
  } catch (error) {
    console.error("TOTP verification error", error);
    return false;
  }
}

// ---- server functions -----------------------------------------------------

/** Throws unless the request carries a valid admin session cookie.
 * Wrapped as server-only so the client bundle gets a throwing stub instead
 * of a build error over the server-only cookie API. */
export const requireAdmin = createServerOnlyFn(async (): Promise<void> => {
  if (!(await verifyToken(getCookie(COOKIE)))) {
    throw new Error("Unauthorized");
  }
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      password: z.string().min(1).max(200),
      code: z.string().regex(/^\d{6}$/).optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Reuse the chat limiter as brute-force protection (covers both factors).
    if (checkChatRequest(getRequest())) return { ok: false as const };

    if (!(await verifyPassword(data.password))) return { ok: false as const };

    // Second factor (when configured).
    if (totpEnabled()) {
      if (!data.code) return { ok: false as const, needCode: true as const };
      if (!verifyTotpCode(data.code))
        return { ok: false as const, needCode: true as const, badCode: true as const };
    }

    await issueSessionCookie();
    return { ok: true as const };
  });

export const adminChangePassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      current: z.string().min(1).max(200),
      next: z.string().min(12, "At least 12 characters").max(200),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (checkChatRequest(getRequest())) return { ok: false, error: "Too many attempts — wait a minute." };
    if (!(await verifyPassword(data.current)))
      return { ok: false, error: "Current password is incorrect." };

    const hash = await Bun.password.hash(data.next, { algorithm: "argon2id" });
    await db()
      .insert(schema.adminCredentials)
      .values({ id: 1, passwordHash: hash, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.adminCredentials.id,
        set: { passwordHash: hash, updatedAt: new Date() },
      });
    invalidateCredentialCache();
    // Other devices/sessions are invalidated (signing key changed); keep THIS
    // session alive by issuing a fresh cookie under the new key.
    await issueSessionCookie();
    return { ok: true, error: null };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE, { path: "/" });
  return { ok: true };
});

// Lets the /admin page know whether a valid session already exists.
export const adminSession = createServerFn({ method: "GET" }).handler(async () => ({
  authed: await verifyToken(getCookie(COOKIE)),
}));

// Security-tab info: where the password lives and whether 2FA is on.
export const adminSecurityStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const cred = await getCredential();
  return {
    passwordSource: cred.kind, // "hash" (set from dashboard) | "env" (bootstrap)
    totpEnabled: totpEnabled(),
  };
});

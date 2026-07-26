import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { siteContentSchema } from "@/content/schema";
import { requireAdmin } from "./admin-auth.functions";
import { getSiteContent, invalidateContentCache } from "./content.server";
import { r2Configured, uploadToR2 } from "./storage.server";

// Everything the /admin dashboard reads and writes. Every handler starts with
// requireAdmin() — no session cookie, no data.

// Day bucketing uses Baghdad local time so "today" matches the owner's day.
const TZ = "Asia/Baghdad";
const chatDay = sql<string>`to_char(${schema.chatLogs.createdAt} at time zone ${TZ}, 'YYYY-MM-DD')`;
const leadDay = sql<string>`to_char(${schema.contactMessages.createdAt} at time zone ${TZ}, 'YYYY-MM-DD')`;

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" }).format(date);

export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const d = db();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    leadsByStatus,
    chatsTotal,
    chatsDay24,
    chatsWeek,
    unansweredWeek,
    hiringWeek,
    chatsDaily,
    leadsDaily,
    recentLeads,
    recentChats,
  ] = await Promise.all([
    d
      .select({ status: schema.contactMessages.status, n: count() })
      .from(schema.contactMessages)
      .groupBy(schema.contactMessages.status),
    d.select({ n: count() }).from(schema.chatLogs),
    d.select({ n: count() }).from(schema.chatLogs).where(gt(schema.chatLogs.createdAt, dayAgo)),
    d.select({ n: count() }).from(schema.chatLogs).where(gt(schema.chatLogs.createdAt, weekAgo)),
    d
      .select({ n: count() })
      .from(schema.chatLogs)
      .where(and(gt(schema.chatLogs.createdAt, weekAgo), eq(schema.chatLogs.tag, "unanswered"))),
    d
      .select({ n: count() })
      .from(schema.chatLogs)
      .where(and(gt(schema.chatLogs.createdAt, weekAgo), eq(schema.chatLogs.tag, "hiring"))),
    d
      .select({ day: chatDay, n: count() })
      .from(schema.chatLogs)
      .where(gt(schema.chatLogs.createdAt, twoWeeksAgo))
      .groupBy(sql`1`),
    d
      .select({ day: leadDay, n: count() })
      .from(schema.contactMessages)
      .where(gt(schema.contactMessages.createdAt, twoWeeksAgo))
      .groupBy(sql`1`),
    d
      .select({
        id: schema.contactMessages.id,
        name: schema.contactMessages.name,
        email: schema.contactMessages.email,
        source: schema.contactMessages.source,
        status: schema.contactMessages.status,
        createdAt: schema.contactMessages.createdAt,
      })
      .from(schema.contactMessages)
      .orderBy(desc(schema.contactMessages.createdAt))
      .limit(6),
    d
      .select({
        id: schema.chatLogs.id,
        question: schema.chatLogs.question,
        tag: schema.chatLogs.tag,
        createdAt: schema.chatLogs.createdAt,
      })
      .from(schema.chatLogs)
      .where(ne(schema.chatLogs.tag, "general"))
      .orderBy(desc(schema.chatLogs.createdAt))
      .limit(6),
  ]);

  // Last 14 days, oldest first, zero-filled.
  const chatMap = new Map(chatsDaily.map((r) => [r.day, r.n]));
  const leadMap = new Map(leadsDaily.map((r) => [r.day, r.n]));
  const daily: { day: string; chats: number; leads: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    daily.push({ day: key, chats: chatMap.get(key) ?? 0, leads: leadMap.get(key) ?? 0 });
  }

  const recent = [
    ...recentLeads.map((l) => ({ type: "lead" as const, ...l, question: null, tag: null })),
    ...recentChats.map((c) => ({
      type: "chat" as const,
      ...c,
      name: null,
      email: null,
      source: null,
      status: null,
    })),
  ]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  return {
    leads: Object.fromEntries(leadsByStatus.map((r) => [r.status, r.n])) as Record<string, number>,
    chats: { total: chatsTotal[0]?.n ?? 0, day: chatsDay24[0]?.n ?? 0, week: chatsWeek[0]?.n ?? 0 },
    week: { unanswered: unansweredWeek[0]?.n ?? 0, hiring: hiringWeek[0]?.n ?? 0 },
    daily,
    recent,
  };
});

export const adminListLeads = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return db()
    .select()
    .from(schema.contactMessages)
    .orderBy(desc(schema.contactMessages.createdAt))
    .limit(200);
});

export const adminSetLeadStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ id: z.number().int(), status: z.enum(["new", "contacted", "closed"]) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db()
      .update(schema.contactMessages)
      .set({ status: data.status })
      .where(eq(schema.contactMessages.id, data.id));
    return { ok: true };
  });

export const adminSetLeadNotes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int(), notes: z.string().max(4000) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db()
      .update(schema.contactMessages)
      .set({ notes: data.notes.trim() || null })
      .where(eq(schema.contactMessages.id, data.id));
    return { ok: true };
  });

// Full transcript of one chat session — shown next to chat-captured leads.
export const adminChatSession = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sessionId: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return db()
      .select()
      .from(schema.chatLogs)
      .where(eq(schema.chatLogs.sessionId, data.sessionId))
      .orderBy(asc(schema.chatLogs.createdAt))
      .limit(100);
  });

// Starred conversation keys, and a toggle for the star button in Chats.
export const adminListPins = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const rows = await db().select({ key: schema.pinnedConversations.key }).from(schema.pinnedConversations);
  return rows.map((r) => r.key);
});

export const adminTogglePin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1).max(64) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const existing = await db()
      .select({ key: schema.pinnedConversations.key })
      .from(schema.pinnedConversations)
      .where(eq(schema.pinnedConversations.key, data.key))
      .limit(1);
    if (existing.length > 0) {
      await db()
        .delete(schema.pinnedConversations)
        .where(eq(schema.pinnedConversations.key, data.key));
      return { pinned: false };
    }
    await db().insert(schema.pinnedConversations).values({ key: data.key }).onConflictDoNothing();
    return { pinned: true };
  });

export const adminListChatLogs = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return db().select().from(schema.chatLogs).orderBy(desc(schema.chatLogs.createdAt)).limit(150);
});

export const adminGetContent = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getSiteContent();
});

export const adminSaveContent = createServerFn({ method: "POST" })
  .inputValidator(siteContentSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = db();
    // Keep the previous version as a revision before overwriting.
    const current = await d.select().from(schema.siteContent).limit(1);
    if (current.length > 0) {
      await d.insert(schema.contentRevisions).values({ data: current[0].data });
      // Trim to the newest 20 revisions.
      const old = await d
        .select({ id: schema.contentRevisions.id })
        .from(schema.contentRevisions)
        .orderBy(desc(schema.contentRevisions.savedAt))
        .offset(20);
      for (const row of old) {
        await d.delete(schema.contentRevisions).where(eq(schema.contentRevisions.id, row.id));
      }
    }
    await d
      .insert(schema.siteContent)
      .values({ id: 1, data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.siteContent.id,
        set: { data, updatedAt: new Date() },
      });
    invalidateContentCache();
    return { ok: true };
  });

// Whether image uploads are available (R2 env vars present).
export const adminStorageStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return { configured: r2Configured() };
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const adminUploadImage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      filename: z.string().min(1).max(200),
      contentType: z.enum(IMAGE_TYPES),
      // ~4MB binary as base64 (~5.4M chars).
      dataBase64: z.string().min(1).max(5_600_000),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!r2Configured()) return { url: null, error: "R2 is not configured yet" };
    try {
      const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
      const ext = data.contentType.split("/")[1].replace("jpeg", "jpg");
      const slug = data.filename
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      const key = `uploads/${Date.now()}-${slug || "image"}.${ext}`;
      const url = await uploadToR2(key, bytes, data.contentType);
      return { url, error: null };
    } catch (error) {
      console.error("image upload failed", error);
      return { url: null, error: "Upload failed — check the R2 credentials" };
    }
  });

export const adminListRevisions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return db()
    .select({ id: schema.contentRevisions.id, savedAt: schema.contentRevisions.savedAt })
    .from(schema.contentRevisions)
    .orderBy(desc(schema.contentRevisions.savedAt))
    .limit(20);
});

export const adminRestoreRevision = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = db();
    const rows = await d
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.id, data.id))
      .limit(1);
    if (rows.length === 0) return { ok: false };
    // Current content becomes a revision; the chosen revision becomes current.
    const current = await d.select().from(schema.siteContent).limit(1);
    if (current.length > 0) {
      await d.insert(schema.contentRevisions).values({ data: current[0].data });
    }
    await d
      .insert(schema.siteContent)
      .values({ id: 1, data: rows[0].data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.siteContent.id,
        set: { data: rows[0].data, updatedAt: new Date() },
      });
    invalidateContentCache();
    return { ok: true };
  });

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

import type { SiteContent } from "@/content/schema";
import {
  adminChangePassword,
  adminLogin,
  adminLogout,
  adminSecurityStatus,
  adminSession,
} from "@/lib/api/admin-auth.functions";
import {
  adminGetContent,
  adminListChatLogs,
  adminListLeads,
  adminListRevisions,
  adminRestoreRevision,
  adminSaveContent,
  adminSetLeadStatus,
  adminStats,
  adminStorageStatus,
  adminUploadImage,
} from "@/lib/api/admin.functions";

// Private dashboard: funnel stats, leads + follow-up status, AI-chat
// transcripts, and the live content editor. Auth = httpOnly session cookie
// set by adminLogin; every server fn re-verifies it. Not linked anywhere,
// noindexed, and worthless without the cookie.

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Dashboard — Taha Yasir" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

type Lead = Awaited<ReturnType<typeof adminListLeads>>[number];
type ChatLog = Awaited<ReturnType<typeof adminListChatLogs>>[number];
type Stats = Awaited<ReturnType<typeof adminStats>>;
type Revision = Awaited<ReturnType<typeof adminListRevisions>>[number];

// ---- shared visual tokens (mirrors the portfolio's design system) --------

const glassCard =
  "bg-white rounded-2xl border border-black/10 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)]";
const fieldCls =
  "w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition-all";
const labelCls = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1";

const EASE = [0.16, 1, 0.3, 1] as const;

// Relative time with exact timestamp available on hover (title attr).
function timeAgo(value: string | Date): string {
  const t = new Date(value).getTime();
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(value).toLocaleDateString();
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} aria-hidden />;
}

// Inline SVG icons — same stroke language as the portfolio nav (1.8, round).
function Icon({
  name,
  color,
}: {
  name: "overview" | "leads" | "chats" | "content" | "security";
  color: string;
}) {
  const paths: Record<string, React.ReactNode> = {
    security: (
      <>
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
        <path d="M12 10v4M12 16.5v.5" />
      </>
    ),
    overview: (
      <>
        <rect x="3" y="12" width="4" height="8" rx="1" />
        <rect x="10" y="7" width="4" height="13" rx="1" />
        <rect x="17" y="3" width="4" height="17" rx="1" />
      </>
    ),
    leads: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
        <path d="M16 8h6M19 5v6" />
      </>
    ),
    chats: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" />
        <path d="M8.5 11h7M8.5 14h4" />
      </>
    ),
    content: (
      <>
        <path d="M4 20h16" />
        <path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5z" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[18px] h-[18px]"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

function AdminPage() {
  const [phase, setPhase] = useState<"loading" | "login" | "app">("loading");

  useEffect(() => {
    adminSession()
      .then((s) => setPhase(s.authed ? "app" : "login"))
      .catch(() => setPhase("login"));
  }, []);

  return (
    <div className="h-dvh w-full overflow-y-auto bg-white text-black">
      <div className="mx-auto max-w-4xl px-4 md:px-6 py-6 md:py-10 pb-24">
        {phase === "loading" && <PageSkeleton />}
        {phase === "login" && <LoginCard onSuccess={() => setPhase("app")} />}
        {phase === "app" && <Dashboard onLogout={() => setPhase("login")} />}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ---- Login ---------------------------------------------------------------

function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "checking" | "error" | "badCode">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("checking");
    try {
      const res = await adminLogin({
        data: { password, ...(code ? { code } : {}) },
      });
      if (res.ok) {
        onSuccess();
        return;
      }
      if ("needCode" in res && res.needCode) {
        // Password accepted — 2FA step.
        setStep("code");
        setState("badCode" in res && res.badCode ? "badCode" : "idle");
        setCode("");
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="min-h-[75dvh] flex items-center justify-center">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`${glassCard} w-full max-w-sm p-6`}
      >
        <div className="flex items-center gap-3 mb-5">
          <BrandMark />
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">Dashboard</h1>
            <p className="text-[11px] text-gray-500">Taha Yasir — private area</p>
          </div>
        </div>
        {step === "password" ? (
          <>
            <label className={labelCls} htmlFor="admin-password">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={show ? "text" : "password"}
                className={`${fieldCls} pr-11`}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (state === "error") setState("idle");
                }}
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
                  {show ? (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                      <path d="M4 4l16 16" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <label className={labelCls} htmlFor="admin-code">
              Two-factor code
            </label>
            <input
              id="admin-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              className={`${fieldCls} text-center text-lg tracking-[0.4em] font-semibold`}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                if (state === "badCode") setState("idle");
              }}
              autoFocus
            />
            <p className="mt-2 text-[11px] text-gray-400">
              Enter the 6-digit code from your authenticator app.
            </p>
          </>
        )}
        <button
          type="submit"
          disabled={state === "checking" || (step === "password" ? !password : code.length !== 6)}
          className="mt-4 w-full h-11 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === "checking" ? "Checking…" : step === "password" ? "Continue" : "Enter dashboard"}
        </button>
        {state === "error" && (
          <p className="mt-3 text-xs text-red-600" role="alert">
            That password isn't right. Attempts are rate-limited — wait a minute if it keeps failing.
          </p>
        )}
        {state === "badCode" && (
          <p className="mt-3 text-xs text-red-600" role="alert">
            That code didn't match — codes rotate every 30 seconds, try the current one.
          </p>
        )}
      </motion.form>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="w-9 h-9 rounded-xl border border-black/10 bg-white flex items-center justify-center shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] shrink-0">
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-black" aria-hidden>
        <path fill="currentColor" d="M12 2L6 18h4v4h4v-4h4L12 2zm0 4l3 7.5h-6L12 6z" />
      </svg>
    </div>
  );
}

// ---- Dashboard shell -----------------------------------------------------

type Tab = "overview" | "leads" | "chats" | "content" | "security";

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: "overview", label: "Overview", color: "#14b8a6" },
  { id: "leads", label: "Leads", color: "#eab308" },
  { id: "chats", label: "Chats", color: "#8b5cf6" },
  { id: "content", label: "Content", color: "#10b981" },
  { id: "security", label: "Security", color: "#ec4899" },
];

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    adminStats().then(setStats).catch(console.error);
  }, []);

  const logout = async () => {
    await adminLogout().catch(() => {});
    onLogout();
  };

  const newLeads = stats?.leads["new"] ?? 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight leading-tight">Dashboard</h1>
            <p className="text-[11px] text-gray-500">taha.qaysariya.com</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="h-9 px-4 rounded-full liquid-glass text-[12px] font-medium text-gray-600 hover:text-black transition-colors"
        >
          Log out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Dashboard sections">
        {TABS.map(({ id, label, color }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`h-11 px-4 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-all active:scale-[0.98] ${
                active ? "bg-black text-white shadow-md" : "liquid-glass text-gray-700 hover:text-black"
              }`}
            >
              <Icon name={id} color={active ? "#ffffff" : color} />
              {label}
              {id === "leads" && newLeads > 0 && (
                <span
                  className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    active ? "bg-white text-black" : "bg-amber-500 text-white"
                  }`}
                >
                  {newLeads}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {tab === "overview" && <OverviewTab stats={stats} />}
          {tab === "leads" && <LeadsTab onStatsChange={setStats} />}
          {tab === "chats" && <ChatsTab />}
          {tab === "content" && <ContentTab />}
          {tab === "security" && <SecurityTab />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ---- Overview ------------------------------------------------------------

function OverviewTab({ stats }: { stats: Stats | null }) {
  const leadTotal = stats ? Object.values(stats.leads).reduce((a, b) => a + b, 0) : 0;
  const cards = [
    { label: "New leads", value: stats?.leads["new"] ?? 0, accent: "#eab308" },
    { label: "Total leads", value: leadTotal, accent: "#f59e0b" },
    { label: "Chats today", value: stats?.chats.day ?? 0, accent: "#8b5cf6" },
    { label: "Chats · 7 days", value: stats?.chats.week ?? 0, accent: "#a78bfa" },
    { label: "Chats total", value: stats?.chats.total ?? 0, accent: "#c4b5fd" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
            className={`${glassCard} p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-all`}
          >
            {stats ? (
              <p className="text-[26px] font-black tracking-tight leading-none tabular-nums">{c.value}</p>
            ) : (
              <Skeleton className="h-7 w-10" />
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.accent }} aria-hidden />
              <p className="text-[11px] text-gray-500 leading-tight">{c.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className={`${glassCard} p-4 mt-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-50 border border-black/5 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" className="w-[18px] h-[18px]" aria-hidden>
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M15 7h6v6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Traffic analytics</p>
            <p className="text-[11px] text-gray-500">Visitors, sources, and page views live in Google Analytics.</p>
          </div>
        </div>
        <a
          href="https://analytics.google.com"
          target="_blank"
          rel="noreferrer"
          className="h-9 px-4 rounded-full bg-black text-white text-[12px] font-semibold inline-flex items-center hover:bg-gray-800 transition-colors"
        >
          Open GA →
        </a>
      </div>
    </div>
  );
}

// ---- Leads ---------------------------------------------------------------

const STATUS_META = {
  new: { label: "New", active: "bg-amber-500 text-white" },
  contacted: { label: "Contacted", active: "bg-blue-500 text-white" },
  closed: { label: "Closed", active: "bg-gray-700 text-white" },
} as const;

function LeadsTab({ onStatsChange }: { onStatsChange: (s: Stats) => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    adminListLeads().then(setLeads).catch(console.error);
  }, []);

  const setStatus = async (id: number, status: "new" | "contacted" | "closed") => {
    setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, status } : l)) ?? null);
    await adminSetLeadStatus({ data: { id, status } }).catch(console.error);
    adminStats().then(onStatsChange).catch(() => {});
  };

  const copyEmail = (id: number, email: string) => {
    navigator.clipboard.writeText(email).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!leads)
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );

  if (leads.length === 0)
    return (
      <div className={`${glassCard} p-10 text-center`}>
        <div className="text-3xl mb-2" aria-hidden>
          🌱
        </div>
        <p className="text-sm font-semibold">No leads yet</p>
        <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">
          When a visitor submits the contact form or shares their email with the AI chat, they'll
          show up here with follow-up tracking.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {leads.map((l, i) => (
        <motion.div
          key={l.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04, ease: EASE }}
          className={`${glassCard} p-4 md:p-5`}
        >
          <div className="flex items-start gap-3">
            {/* Avatar initial */}
            <div className="w-10 h-10 rounded-full bg-gray-100 border border-black/5 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
              {(l.name || l.email)[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold text-sm truncate">{l.name}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    l.source === "chat" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {l.source === "chat" ? "AI chat" : "Form"}
                </span>
                {l.autoRepliedAt && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                    auto-replied ✓
                  </span>
                )}
                <span
                  className="text-[11px] text-gray-400 ml-auto shrink-0"
                  title={new Date(l.createdAt).toLocaleString()}
                >
                  {timeAgo(l.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <a href={`mailto:${l.email}`} className="text-[13px] text-blue-600 hover:underline truncate">
                  {l.email}
                </a>
                <button
                  onClick={() => copyEmail(l.id, l.email)}
                  aria-label="Copy email address"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                >
                  {copied === l.id ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line mt-3 bg-gray-50 border border-black/5 rounded-xl px-3.5 py-2.5">
            {l.message}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label="Lead status">
              {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(l.id, s)}
                  aria-pressed={l.status === s}
                  className={`h-8 px-3.5 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97] ${
                    l.status === s ? STATUS_META[s].active : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            <a
              href={`mailto:${l.email}?subject=${encodeURIComponent("Re: your message on taha.qaysariya.com")}`}
              className="h-8 px-3.5 rounded-full border border-black/10 text-[11px] font-semibold text-gray-700 hover:border-black/30 inline-flex items-center gap-1.5 transition-colors ml-auto"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
                <path d="M4 4h16v16H4z" />
                <path d="M4 7l8 5 8-5" />
              </svg>
              Reply
            </a>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---- Chats ---------------------------------------------------------------

const TAG_META: Record<string, { label: string; cls: string }> = {
  lead: { label: "Lead", cls: "bg-green-100 text-green-700" },
  hiring: { label: "Client intent", cls: "bg-amber-100 text-amber-700" },
  unanswered: { label: "Couldn't answer", cls: "bg-red-100 text-red-600" },
};

type Conversation = {
  key: string;
  exchanges: ChatLog[]; // chronological
  latest: Date;
  tags: Set<string>;
};

// Group exchanges into conversations by sessionId; legacy rows without one
// are grouped by 30-minute proximity so old data still reads as threads.
function groupConversations(logs: ChatLog[]): Conversation[] {
  const bySession = new Map<string, ChatLog[]>();
  const legacy: ChatLog[] = [];
  for (const log of logs) {
    if (log.sessionId) {
      const list = bySession.get(log.sessionId) ?? [];
      list.push(log);
      bySession.set(log.sessionId, list);
    } else {
      legacy.push(log);
    }
  }
  const groups: ChatLog[][] = [...bySession.values()];
  legacy.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  let current: ChatLog[] = [];
  for (const log of legacy) {
    const prev = current[current.length - 1];
    if (prev && +new Date(log.createdAt) - +new Date(prev.createdAt) > 30 * 60 * 1000) {
      groups.push(current);
      current = [];
    }
    current.push(log);
  }
  if (current.length) groups.push(current);

  return groups
    .map((exchanges) => {
      exchanges.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return {
        key: exchanges[0].sessionId ?? `legacy-${exchanges[0].id}`,
        exchanges,
        latest: new Date(exchanges[exchanges.length - 1].createdAt),
        tags: new Set(exchanges.map((e) => e.tag).filter((t) => t !== "general")),
      };
    })
    .sort((a, b) => {
      // Important conversations first, then most recent.
      const score = (c: Conversation) =>
        (c.tags.has("lead") ? 4 : 0) + (c.tags.has("hiring") ? 2 : 0) + (c.tags.has("unanswered") ? 1 : 0);
      return score(b) - score(a) || +b.latest - +a.latest;
    });
}

type ChatFilter = "important" | "unanswered" | "all";

function ChatsTab() {
  const [logs, setLogs] = useState<ChatLog[] | null>(null);
  const [filter, setFilter] = useState<ChatFilter>("important");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    adminListChatLogs().then(setLogs).catch(console.error);
  }, []);

  const conversations = useMemo(() => (logs ? groupConversations(logs) : []), [logs]);

  const counts = useMemo(
    () => ({
      important: conversations.filter((c) => c.tags.has("lead") || c.tags.has("hiring")).length,
      unanswered: conversations.filter((c) => c.tags.has("unanswered")).length,
      all: conversations.length,
    }),
    [conversations],
  );

  // Don't land the user on an empty "Important" view.
  useEffect(() => {
    if (logs && counts.important === 0 && filter === "important") setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  if (!logs)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  if (conversations.length === 0)
    return (
      <div className={`${glassCard} p-10 text-center`}>
        <div className="text-3xl mb-2" aria-hidden>
          💬
        </div>
        <p className="text-sm font-semibold">No conversations yet</p>
        <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">
          Visitor conversations with the AI will appear here, grouped and tagged by importance.
        </p>
      </div>
    );

  const visible = conversations.filter((c) => {
    if (filter === "important") return c.tags.has("lead") || c.tags.has("hiring");
    if (filter === "unanswered") return c.tags.has("unanswered");
    return true;
  });

  const FILTERS: { id: ChatFilter; label: string; count: number }[] = [
    { id: "important", label: "Important", count: counts.important },
    { id: "unanswered", label: "Couldn't answer", count: counts.unanswered },
    { id: "all", label: "All", count: counts.all },
  ];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Conversation filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`h-9 px-3.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] ${
              filter === f.id ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:text-black"
            }`}
          >
            {f.label}
            <span
              className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                filter === f.id ? "bg-white/20 text-white" : "bg-white text-gray-500"
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className={`${glassCard} p-8 text-center`}>
          <p className="text-sm font-semibold">Nothing here</p>
          <p className="text-[12px] text-gray-500 mt-1">
            No conversations match this filter yet — that's a good thing for "Couldn't answer".
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((c, i) => {
          const isOpen = expanded.has(c.key) || c.exchanges.length <= 2;
          const shown = isOpen ? c.exchanges : c.exchanges.slice(-1);
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04, ease: EASE }}
              className={`${glassCard} p-4 md:p-5`}
            >
              {/* Conversation header */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
                {[...c.tags].map((t) => (
                  <span key={t} className={`px-2 py-0.5 rounded-full font-semibold ${TAG_META[t]?.cls ?? ""}`}>
                    {TAG_META[t]?.label ?? t}
                  </span>
                ))}
                <span className="px-2 py-0.5 rounded-full bg-gray-100 font-semibold text-gray-600">
                  {c.exchanges.length} {c.exchanges.length === 1 ? "exchange" : "exchanges"}
                </span>
                <span className="text-gray-400 ml-auto" title={c.latest.toLocaleString()}>
                  {timeAgo(c.latest)}
                </span>
              </div>

              {!isOpen && (
                <button
                  onClick={() => setExpanded((prev) => new Set(prev).add(c.key))}
                  className="w-full mb-2 h-8 rounded-xl bg-gray-50 border border-black/5 text-[11px] font-medium text-gray-500 hover:text-black hover:border-black/15 transition-colors"
                >
                  Show {c.exchanges.length - 1} earlier {c.exchanges.length - 1 === 1 ? "exchange" : "exchanges"} ↑
                </button>
              )}

              {shown.map((log) => (
                <div key={log.id} className="mb-2 last:mb-0">
                  <div className="flex justify-end mb-1.5">
                    <p className="max-w-[85%] bg-blue-500 text-white text-[13px] leading-relaxed rounded-2xl rounded-br-md px-3.5 py-2 whitespace-pre-line">
                      {log.question}
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <p className="max-w-[85%] bg-gray-100 text-gray-800 text-[13px] leading-relaxed rounded-2xl rounded-bl-md px-3.5 py-2 whitespace-pre-line">
                      {log.answer}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Image upload --------------------------------------------------------

// File picker → base64 → adminUploadImage (R2). Disabled with a hint when R2
// env vars aren't configured yet.
function UploadButton({
  storageReady,
  onUploaded,
  label = "Upload image",
}: {
  storageReady: boolean;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        setError("Max 4MB per image");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const res = await adminUploadImage({
          data: {
            filename: file.name,
            contentType: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            dataBase64: btoa(binary),
          },
        });
        if (res.url) onUploaded(res.url);
        else setError(res.error ?? "Upload failed");
      } catch {
        setError("Upload failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={pick}
        disabled={!storageReady || busy}
        title={storageReady ? undefined : "Set the R2 variables in Railway to enable uploads"}
        className="h-9 px-4 rounded-full border border-dashed border-black/20 text-[12px] font-medium text-gray-600 hover:border-black/40 hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 20h16" />
        </svg>
        {busy ? "Uploading…" : label}
      </button>
      {error && (
        <span className="text-[11px] text-red-600" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// ---- Security -------------------------------------------------------------

function generatePassword(): string {
  // 20 chars from an unambiguous alphabet, via CSPRNG.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function SecurityTab() {
  const [status, setStatus] = useState<{ passwordSource: string; totpEnabled: boolean } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    adminSecurityStatus().then(setStatus).catch(console.error);
  };
  useEffect(load, []);

  const generate = () => {
    const pw = generatePassword();
    setNext(pw);
    setConfirm(pw);
    setShowNext(true);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setState("saving");
    try {
      const res = await adminChangePassword({ data: { current, next } });
      if (res.ok) {
        setState("saved");
        setCurrent("");
        setNext("");
        setConfirm("");
        setShowNext(false);
        load();
      } else {
        setState("idle");
        setError(res.error ?? "Change failed.");
      }
    } catch {
      setState("idle");
      setError("Change failed — try again.");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${glassCard} p-5`}>
        <h2 className="text-sm font-bold tracking-tight mb-3">Status</h2>
        {!status ? (
          <Skeleton className="h-14" />
        ) : (
          <div className="space-y-2 text-[13px]">
            <div className="flex items-center gap-2">
              {status.passwordSource === "hash" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
                  <span>
                    Password: <strong>custom</strong> — set from this dashboard (argon2id-hashed in
                    the database). The old ADMIN_PASSWORD env value no longer works.
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden />
                  <span>
                    Password: <strong>bootstrap</strong> — still using the ADMIN_PASSWORD
                    environment variable. Set a custom one below.
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${status.totpEnabled ? "bg-green-500" : "bg-amber-500"}`}
                aria-hidden
              />
              <span>
                Two-factor (authenticator app): <strong>{status.totpEnabled ? "enabled" : "off"}</strong>
                {!status.totpEnabled && " — set ADMIN_TOTP_SECRET in the environment to enable."}
              </span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className={`${glassCard} p-5`}>
        <h2 className="text-sm font-bold tracking-tight mb-1">Change password</h2>
        <p className="text-[11px] text-gray-400 mb-4">
          Changing the password logs out every other device; this session stays signed in.
        </p>
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="sec-current">
              Current password
            </label>
            <input
              id="sec-current"
              type="password"
              className={fieldCls}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`} htmlFor="sec-next">
                New password (min 12 characters)
              </label>
              <button
                type="button"
                onClick={generate}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Generate strong password
              </button>
            </div>
            <input
              id="sec-next"
              type={showNext ? "text" : "password"}
              className={fieldCls}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="sec-confirm">
              Confirm new password
            </label>
            <input
              id="sec-confirm"
              type={showNext ? "text" : "password"}
              className={fieldCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {showNext && next && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Save this password in your password manager now — it won't be shown again:
              <span className="block font-mono font-semibold mt-1 select-all">{next}</span>
            </p>
          )}
          <button
            type="submit"
            disabled={state === "saving" || !current || !next || !confirm}
            className="h-11 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === "saving" ? "Changing…" : "Change password"}
          </button>
          {state === "saved" && (
            <p className="text-[12px] text-green-600 font-medium" role="status">
              Password changed ✓ — other devices are logged out.
            </p>
          )}
          {error && (
            <p className="text-[12px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

// ---- Content -------------------------------------------------------------

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${glassCard} p-5`}>
      <h2 className="text-sm font-bold tracking-tight">{title}</h2>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function ContentTab() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageReady, setStorageReady] = useState(false);

  const load = () => {
    adminGetContent()
      .then((c) => {
        setContent(c);
        setSavedSnapshot(JSON.stringify(c));
      })
      .catch(console.error);
    adminListRevisions().then(setRevisions).catch(console.error);
    adminStorageStatus()
      .then((s) => setStorageReady(s.configured))
      .catch(() => setStorageReady(false));
  };
  useEffect(load, []);

  const dirty = useMemo(
    () => content !== null && JSON.stringify(content) !== savedSnapshot,
    [content, savedSnapshot],
  );

  if (!content)
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );

  const set = (patch: Partial<SiteContent>) => {
    setContent({ ...content, ...patch });
    if (state === "saved" || state === "error") setState("idle");
  };

  const save = async () => {
    setState("saving");
    try {
      const res = await adminSaveContent({ data: content });
      if (res.ok) {
        setState("saved");
        setSavedSnapshot(JSON.stringify(content));
      } else {
        setState("error");
      }
      adminListRevisions().then(setRevisions).catch(() => {});
    } catch {
      setState("error");
    }
  };

  const restore = async (id: number) => {
    if (!window.confirm("Restore this version? Current content becomes a revision you can return to.")) return;
    await adminRestoreRevision({ data: { id } }).catch(console.error);
    load();
    setState("idle");
  };

  const linesToArray = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" hint="The landing headline visitors see first.">
        <div className="flex items-center gap-4 mb-4 p-3 rounded-xl border border-black/5 bg-gray-50/50">
          <img
            src={content.avatarUrl}
            alt="Current avatar"
            className="w-16 h-16 rounded-xl object-contain bg-white border border-black/5"
          />
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-1.5">Portrait / avatar</p>
            <UploadButton
              storageReady={storageReady}
              label="Replace avatar"
              onUploaded={(url) => set({ avatarUrl: url })}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Greeting</label>
            <input
              className={fieldCls}
              value={content.hero.greeting}
              onChange={(e) => set({ hero: { ...content.hero, greeting: e.target.value } })}
            />
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input
              className={fieldCls}
              value={content.hero.title}
              onChange={(e) => set({ hero: { ...content.hero, title: e.target.value } })}
            />
          </div>
          <div>
            <label className={labelCls}>Subtitle</label>
            <input
              className={fieldCls}
              value={content.hero.subtitle}
              onChange={(e) => set({ hero: { ...content.hero, subtitle: e.target.value } })}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Summary" hint="Shown on the overview page and used by the AI to describe you.">
        <textarea
          className={`${fieldCls} resize-y`}
          rows={3}
          value={content.summary}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </SectionCard>

      <SectionCard title="Experience">
        <div className="space-y-3">
          {content.experience.map((exp, i) => (
            <div key={i} className="rounded-xl border border-black/5 bg-gray-50/50 p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Period</label>
                  <input
                    className={fieldCls}
                    value={exp.period}
                    onChange={(e) => {
                      const experience = [...content.experience];
                      experience[i] = { ...exp, period: e.target.value };
                      set({ experience });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <input
                    className={fieldCls}
                    value={exp.role}
                    onChange={(e) => {
                      const experience = [...content.experience];
                      experience[i] = { ...exp, role: e.target.value };
                      set({ experience });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Organization</label>
                  <input
                    className={fieldCls}
                    value={exp.org}
                    onChange={(e) => {
                      const experience = [...content.experience];
                      experience[i] = { ...exp, org: e.target.value };
                      set({ experience });
                    }}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  className={`${fieldCls} resize-y`}
                  rows={2}
                  value={exp.desc}
                  onChange={(e) => {
                    const experience = [...content.experience];
                    experience[i] = { ...exp, desc: e.target.value };
                    set({ experience });
                  }}
                />
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`Remove "${exp.role || "this entry"}"?`))
                    set({ experience: content.experience.filter((_, j) => j !== i) });
                }}
                className="text-[11px] font-medium text-red-500 hover:text-red-700 transition-colors"
              >
                Remove entry
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              set({ experience: [...content.experience, { period: "", role: "", org: "", desc: "" }] })
            }
            className="h-9 px-4 rounded-full border border-dashed border-black/20 text-[12px] font-medium text-gray-600 hover:border-black/40 hover:text-black transition-colors"
          >
            + Add experience
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Projects" hint="Screens/images are managed in code — all text is editable here.">
        <div className="space-y-3">
          {content.projects.map((p, i) => (
            <div key={i} className="rounded-xl border border-black/5 bg-gray-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg" aria-hidden>
                  {p.icon}
                </span>
                <span className="text-[12px] font-bold text-gray-700">{p.title || `Project ${i + 1}`}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className={labelCls}>Title</label>
                  <input
                    className={fieldCls}
                    value={p.title}
                    onChange={(e) => {
                      const projects = [...content.projects];
                      projects[i] = { ...p, title: e.target.value };
                      set({ projects });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Subtitle</label>
                  <input
                    className={fieldCls}
                    value={p.subtitle}
                    onChange={(e) => {
                      const projects = [...content.projects];
                      projects[i] = { ...p, subtitle: e.target.value };
                      set({ projects });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Tag</label>
                  <input
                    className={fieldCls}
                    value={p.tag}
                    onChange={(e) => {
                      const projects = [...content.projects];
                      projects[i] = { ...p, tag: e.target.value };
                      set({ projects });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Icon</label>
                  <input
                    className={fieldCls}
                    value={p.icon}
                    onChange={(e) => {
                      const projects = [...content.projects];
                      projects[i] = { ...p, icon: e.target.value };
                      set({ projects });
                    }}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Description — interactive app</label>
                <textarea
                  className={`${fieldCls} resize-y`}
                  rows={2}
                  value={p.desc}
                  onChange={(e) => {
                    const projects = [...content.projects];
                    projects[i] = { ...p, desc: e.target.value };
                    set({ projects });
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Description — overview & résumé</label>
                <textarea
                  className={`${fieldCls} resize-y`}
                  rows={2}
                  value={p.overviewDesc}
                  onChange={(e) => {
                    const projects = [...content.projects];
                    projects[i] = { ...p, overviewDesc: e.target.value };
                    set({ projects });
                  }}
                />
              </div>
              {/* App screens shown inside the iPhone frame (first = cover). */}
              <div>
                <label className={labelCls}>Screens ({p.screens.length})</label>
                <div className="flex flex-wrap items-start gap-2">
                  {p.screens.map((src, si) => (
                    <div key={`${src}-${si}`} className="relative group">
                      <img
                        src={src}
                        alt={`${p.title} screen ${si + 1}`}
                        className="w-14 h-24 rounded-lg object-cover object-top bg-white border border-black/10"
                      />
                      {si === 0 && (
                        <span className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full bg-black text-white text-[9px] font-bold">
                          cover
                        </span>
                      )}
                      <div className="absolute inset-x-0 -bottom-1.5 flex justify-center gap-1">
                        {si > 0 && (
                          <button
                            type="button"
                            aria-label="Move image earlier"
                            onClick={() => {
                              const screens = [...p.screens];
                              [screens[si - 1], screens[si]] = [screens[si], screens[si - 1]];
                              const projects = [...content.projects];
                              projects[i] = { ...p, screens };
                              set({ projects });
                            }}
                            className="w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center text-gray-600 hover:text-black text-[11px]"
                          >
                            ←
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => {
                            if (!window.confirm("Remove this screen?")) return;
                            const projects = [...content.projects];
                            projects[i] = { ...p, screens: p.screens.filter((_, j) => j !== si) };
                            set({ projects });
                          }}
                          className="w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center text-red-500 hover:text-red-700 text-[11px]"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  <UploadButton
                    storageReady={storageReady}
                    label="Add screen"
                    onUploaded={(url) => {
                      const projects = [...content.projects];
                      projects[i] = { ...p, screens: [...p.screens, url] };
                      set({ projects });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          {!storageReady && (
            <p className="text-[11px] text-gray-400">
              Image uploads need Cloudflare R2 — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
              R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL in Railway to enable.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Skills & languages">
        <div className="space-y-3">
          {content.skillCategories.map((cat, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2">
              <div>
                <label className={labelCls}>Category</label>
                <input
                  className={fieldCls}
                  value={`${cat.icon} ${cat.name}`}
                  onChange={(e) => {
                    const [icon, ...rest] = e.target.value.split(" ");
                    const skillCategories = [...content.skillCategories];
                    skillCategories[i] = { ...cat, icon, name: rest.join(" ") };
                    set({ skillCategories });
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Skills (comma separated)</label>
                <input
                  className={fieldCls}
                  value={cat.skills.join(", ")}
                  onChange={(e) => {
                    const skillCategories = [...content.skillCategories];
                    skillCategories[i] = {
                      ...cat,
                      skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    };
                    set({ skillCategories });
                  }}
                />
              </div>
            </div>
          ))}
          <div>
            <label className={labelCls}>Overview page skill chips (one per line)</label>
            <textarea
              className={`${fieldCls} resize-y`}
              rows={4}
              value={content.overviewSkills.join("\n")}
              onChange={(e) => set({ overviewSkills: linesToArray(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelCls}>Languages (one per line)</label>
            <textarea
              className={`${fieldCls} resize-y`}
              rows={2}
              value={content.languages.join("\n")}
              onChange={(e) => set({ languages: linesToArray(e.target.value) })}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Education & fun facts">
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Education & certifications (one per line)</label>
            <textarea
              className={`${fieldCls} resize-y`}
              rows={4}
              value={content.education.join("\n")}
              onChange={(e) => set({ education: linesToArray(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelCls}>Fun cards</label>
            <div className="space-y-2">
              {content.funItems.map((f, i) => (
                <div key={i} className="grid grid-cols-[56px_1fr_2fr] gap-2">
                  <input
                    aria-label="Icon"
                    className={fieldCls}
                    value={f.icon}
                    onChange={(e) => {
                      const funItems = [...content.funItems];
                      funItems[i] = { ...f, icon: e.target.value };
                      set({ funItems });
                    }}
                  />
                  <input
                    aria-label="Title"
                    className={fieldCls}
                    value={f.title}
                    onChange={(e) => {
                      const funItems = [...content.funItems];
                      funItems[i] = { ...f, title: e.target.value };
                      set({ funItems });
                    }}
                  />
                  <input
                    aria-label="Description"
                    className={fieldCls}
                    value={f.desc}
                    onChange={(e) => {
                      const funItems = [...content.funItems];
                      funItems[i] = { ...f, desc: e.target.value };
                      set({ funItems });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contact & AI knowledge">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Email</label>
            <input
              className={fieldCls}
              type="email"
              value={content.contact.email}
              onChange={(e) => set({ contact: { ...content.contact, email: e.target.value } })}
            />
          </div>
          <div>
            <label className={labelCls}>LinkedIn URL</label>
            <input
              className={fieldCls}
              value={content.contact.linkedin}
              onChange={(e) => set({ contact: { ...content.contact, linkedin: e.target.value } })}
            />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input
              className={fieldCls}
              value={content.contact.location}
              onChange={(e) => set({ contact: { ...content.contact, location: e.target.value } })}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>Extra facts for the AI agent</label>
          <p className="text-[11px] text-gray-400 mb-1.5">
            Only the chatbot sees this — metrics, FAQs, anything it should know.
          </p>
          <textarea
            className={`${fieldCls} resize-y`}
            rows={4}
            value={content.chatFacts}
            onChange={(e) => set({ chatFacts: e.target.value })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Lead auto-reply email"
        hint="Sent once to every new lead. Requires RESEND_API_KEY in Railway — without it nothing sends. Use {{name}} for the lead's name."
      >
        <label className="flex items-center gap-2.5 mb-3 text-sm font-medium cursor-pointer select-none">
          <input
            type="checkbox"
            checked={content.crm.autoReplyEnabled}
            onChange={(e) => set({ crm: { ...content.crm, autoReplyEnabled: e.target.checked } })}
            className="w-4 h-4 accent-black"
          />
          Auto-reply enabled
        </label>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Subject</label>
            <input
              className={fieldCls}
              value={content.crm.autoReplySubject}
              onChange={(e) => set({ crm: { ...content.crm, autoReplySubject: e.target.value } })}
            />
          </div>
          <div>
            <label className={labelCls}>Body (plain text)</label>
            <textarea
              className={`${fieldCls} resize-y`}
              rows={7}
              value={content.crm.autoReplyBody}
              onChange={(e) => set({ crm: { ...content.crm, autoReplyBody: e.target.value } })}
            />
          </div>
        </div>
      </SectionCard>

      {revisions.length > 0 && (
        <SectionCard title="Revision history" hint="Restoring keeps the current version as a new revision — nothing is ever lost.">
          <div className="divide-y divide-black/5">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-[12px]">
                <span className="text-gray-600" title={new Date(r.savedAt).toLocaleString()}>
                  {timeAgo(r.savedAt)}
                </span>
                <button
                  onClick={() => restore(r.id)}
                  className="h-8 px-3 rounded-full border border-black/10 font-medium text-gray-700 hover:border-black/30 transition-colors"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10">
        <div className={`${glassCard} px-4 py-3 flex items-center gap-3 backdrop-blur-md bg-white/90`}>
          <button
            onClick={save}
            disabled={state === "saving" || (!dirty && state !== "error")}
            className="h-11 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
          <span className="text-[12px]" role="status" aria-live="polite">
            {state === "saved" && !dirty && <span className="text-green-600 font-medium">Saved ✓ — live on the site now</span>}
            {state === "error" && <span className="text-red-600 font-medium">Save failed — try again.</span>}
            {dirty && state !== "saving" && (
              <span className="text-amber-600 font-medium inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                Unsaved changes
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

import type { SiteContent } from "@/content/schema";
import QRCode from "qrcode";

import {
  adminChangePassword,
  adminLogin,
  adminLogout,
  adminSecurityStatus,
  adminSession,
  adminTotpBegin,
  adminTotpDisable,
  adminTotpEnable,
} from "@/lib/api/admin-auth.functions";
import { BorderBeam } from "@/components/lightswind/border-beam";
import { ExpandableSearchBar } from "@/components/lightswind/expandable-search-bar";
import { ShineButton } from "@/components/lightswind/shine-button";
import { topicOf, visitorLabel } from "@/lib/topics";
import {
  adminChatSession,
  adminDeleteConversation,
  adminGetContent,
  adminListChatLogs,
  adminListConversations,
  adminListLeads,
  adminListRevisions,
  adminRestoreRevision,
  adminSaveContent,
  adminSetLeadNotes,
  adminSetLeadStatus,
  adminStats,
  adminStorageStatus,
  adminTogglePin,
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

type Lead = Awaited<ReturnType<typeof adminListLeads>>["rows"][number];
type ChatLog = Awaited<ReturnType<typeof adminListChatLogs>>[number];
type ConvMeta = Awaited<ReturnType<typeof adminListConversations>>["page"][number];
type StatusKey = "new" | "contacted" | "closed";
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
        <ShineButton
          disabled={state === "checking" || (step === "password" ? !password : code.length !== 6)}
          className="mt-4 w-full"
        >
          {state === "checking" ? "Checking…" : step === "password" ? "Continue" : "Enter dashboard"}
        </ShineButton>
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
  // Set when another tab wants Leads opened pre-filtered (e.g. a chat's lead).
  const [leadsPreset, setLeadsPreset] = useState<string | null>(null);
  // Set when Chats sends an unanswered question to Content → AI knowledge.
  const [teachQuestion, setTeachQuestion] = useState<string | null>(null);

  // ⌘K / Ctrl+K expands and focuses the Lightswind search bar on the
  // current tab (the component shows the hint; the shortcut lives here).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const searchButton = document.querySelector<HTMLButtonElement>('button[aria-label="Search"]');
      if (!searchButton) return;
      event.preventDefault();
      const input = searchButton.closest("form")?.querySelector("input");
      if (input && input.style.opacity === "1") input.focus();
      else searchButton.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

      {/* No exit animation / AnimatePresence here: mode="wait" blocks the next
          tab until the fade-out finishes, and browsers pause animation frames
          in background tabs — which froze the dashboard mid-switch. */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        {tab === "overview" && <OverviewTab stats={stats} go={setTab} />}
          {tab === "leads" && (
            <LeadsTab
              onStatsChange={setStats}
              preset={leadsPreset}
              onPresetConsumed={() => setLeadsPreset(null)}
            />
          )}
          {tab === "chats" && (
            <ChatsTab
              openLead={(email) => {
                setLeadsPreset(email);
                setTab("leads");
              }}
              teach={(question) => {
                setTeachQuestion(question);
                setTab("content");
              }}
            />
          )}
          {tab === "content" && (
            <ContentTab
              teachQuestion={teachQuestion}
              onTeachConsumed={() => setTeachQuestion(null)}
            />
          )}
          {tab === "security" && <SecurityTab />}
      </motion.div>
    </motion.div>
  );
}

// ---- Overview ------------------------------------------------------------

function OverviewTab({ stats, go }: { stats: Stats | null; go: (tab: Tab) => void }) {
  const leadTotal = stats ? Object.values(stats.leads).reduce((a, b) => a + b, 0) : 0;
  const cards: { label: string; value: number; accent: string; tab: Tab }[] = [
    { label: "New leads", value: stats?.leads["new"] ?? 0, accent: "#eab308", tab: "leads" },
    { label: "Total leads", value: leadTotal, accent: "#f59e0b", tab: "leads" },
    { label: "Chats today", value: stats?.chats.day ?? 0, accent: "#8b5cf6", tab: "chats" },
    { label: "Chats · 7 days", value: stats?.chats.week ?? 0, accent: "#a78bfa", tab: "chats" },
    { label: "Chats total", value: stats?.chats.total ?? 0, accent: "#c4b5fd", tab: "chats" },
  ];

  const attention: { label: string; detail: string; accent: string; tab: Tab }[] = [];
  if (stats) {
    if ((stats.leads["new"] ?? 0) > 0)
      attention.push({
        label: `${stats.leads["new"]} new lead${stats.leads["new"] === 1 ? "" : "s"} waiting`,
        detail: "Follow up while they're warm",
        accent: "#eab308",
        tab: "leads",
      });
    if (stats.week.hiring > 0)
      attention.push({
        label: `${stats.week.hiring} client-intent chat${stats.week.hiring === 1 ? "" : "s"} this week`,
        detail: "Someone asked about hiring or a project",
        accent: "#f59e0b",
        tab: "chats",
      });
    if (stats.week.unanswered > 0)
      attention.push({
        label: `${stats.week.unanswered} question${stats.week.unanswered === 1 ? "" : "s"} the AI couldn't answer`,
        detail: "Add the missing facts in Content → AI knowledge",
        accent: "#ef4444",
        tab: "chats",
      });
  }

  const maxDay = stats ? Math.max(1, ...stats.daily.map((d) => d.chats + d.leads)) : 1;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <motion.button
            key={c.label}
            type="button"
            onClick={() => go(c.tab)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
            className={`${glassCard} p-4 text-left cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-all`}
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
          </motion.button>
        ))}
      </div>

      {attention.length > 0 && (
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          {attention.map((a, i) => (
            <motion.button
              key={a.label}
              type="button"
              onClick={() => go(a.tab)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 + i * 0.05, ease: EASE }}
              className={`${glassCard} relative p-4 text-left cursor-pointer flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-all`}
            >
              {/* Lightswind border beam — a slow luminous sweep that marks
                  these as the "act on this" cards. */}
              <BorderBeam colorFrom={a.accent} colorTo={a.accent} duration={7} delay={i * 2.3} opacity={0.8} />
              <span
                className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                style={{ background: a.accent }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">{a.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{a.detail}</span>
              </span>
              <span className="ml-auto text-gray-300 text-sm" aria-hidden>
                →
              </span>
            </motion.button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {/* 14-day activity */}
        <div className={`${glassCard} p-5 flex flex-col`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold tracking-tight">Activity · last 14 days</h2>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-[3px] bg-violet-400" aria-hidden /> Chats
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-[3px] bg-amber-400" aria-hidden /> Leads
              </span>
            </div>
          </div>
          {stats ? (
            <>
              <p className="text-[11px] text-gray-400 mb-4 tabular-nums">
                {stats.daily.reduce((a, d) => a + d.chats, 0)} chats ·{" "}
                {stats.daily.reduce((a, d) => a + d.leads, 0)} leads in this window
              </p>
              {/* Chart area grows to fill the card (the grid stretches both
                  columns to equal height) instead of hugging the top. */}
              <div className="flex-1 min-h-[140px] relative flex items-end gap-[3px] pt-6">
                {/* horizontal gridlines */}
                <div className="absolute inset-x-0 top-6 bottom-0 pointer-events-none" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-dashed border-black/[0.06]"
                      style={{ top: `${i * 25}%` }}
                    />
                  ))}
                  <div className="absolute inset-x-0 bottom-0 border-t border-black/10" />
                  <span className="absolute -top-4 left-0 text-[9px] text-gray-400 tabular-nums">
                    max {maxDay}/day
                  </span>
                </div>
                {stats.daily.map((d) => (
                  <div key={d.day} className="flex-1 h-full flex flex-col justify-end gap-[2px] group relative cursor-default">
                    {/* tooltip */}
                    <div className="hidden group-hover:flex absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-10 px-2 py-1 rounded-lg bg-black text-white text-[10px] font-medium whitespace-nowrap shadow-lg pointer-events-none">
                      {d.day.slice(5).replace("-", "/")} · {d.chats} chat{d.chats === 1 ? "" : "s"} ·{" "}
                      {d.leads} lead{d.leads === 1 ? "" : "s"}
                    </div>
                    {d.leads > 0 && (
                      <div
                        className="rounded-t-[4px] rounded-b-[2px] bg-amber-400 group-hover:bg-amber-500 transition-colors"
                        style={{ height: `${(d.leads / maxDay) * 100}%`, minHeight: 5 }}
                      />
                    )}
                    <div
                      className={`transition-colors ${
                        d.chats > 0
                          ? `bg-violet-400 group-hover:bg-violet-500 rounded-b-[2px] ${d.leads > 0 ? "rounded-t-[2px]" : "rounded-t-[4px]"}`
                          : "bg-black/[0.05] rounded-[2px]"
                      }`}
                      style={{ height: d.chats > 0 ? `${(d.chats / maxDay) * 100}%` : 3, minHeight: d.chats > 0 ? 5 : 3 }}
                    />
                  </div>
                ))}
              </div>
              {/* x-axis day ticks, one per column */}
              <div className="flex gap-[3px] mt-1.5 border-t border-transparent text-[9px] text-gray-400 tabular-nums">
                {stats.daily.map((d, i) => {
                  const isLast = i === stats.daily.length - 1;
                  const show = isLast || i % 3 === 0;
                  return (
                    <span key={d.day} className={`flex-1 text-center ${isLast ? "font-semibold text-gray-600" : ""}`}>
                      {show ? (isLast ? "today" : d.day.slice(8)) : ""}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <Skeleton className="flex-1 min-h-[140px] w-full mt-3" />
          )}
        </div>

        {/* Recent activity */}
        <div className={`${glassCard} p-5`}>
          <h2 className="text-sm font-bold tracking-tight mb-3">Recent activity</h2>
          {!stats ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : stats.recent.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-6 text-center">
              Nothing yet — leads and important chats will show up here.
            </p>
          ) : (
            <ul className="space-y-1">
              {stats.recent.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => go(r.type === "lead" ? "leads" : "chats")}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-xl text-left hover:bg-black/[0.03] transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${
                        r.type === "lead" ? "bg-amber-100" : "bg-violet-100"
                      }`}
                      aria-hidden
                    >
                      {r.type === "lead" ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.4-.7L3 21l1.8-4.4a8.4 8.4 0 1 1 16.2-5.1Z" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium truncate">
                        {r.type === "lead" ? r.name || r.email : r.question}
                      </span>
                      <span className="block text-[10px] text-gray-400 truncate">
                        {r.type === "lead"
                          ? `Lead · ${r.source === "chat" ? "from AI chat" : "contact form"}`
                          : (TAG_META[r.tag ?? ""]?.label ?? "Chat")}
                      </span>
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums" title={new Date(r.createdAt).toLocaleString()}>
                      {timeAgo(r.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* What visitors are interested in */}
      {stats && stats.topics.length > 0 && (
        <div className={`${glassCard} p-5 mt-4`}>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-bold tracking-tight">What visitors ask about</h2>
            <span className="text-[10px] text-gray-400">
              last 90 days · {stats.topicSample} questions
            </span>
          </div>
          <div className="space-y-2.5">
            {stats.topics.map((t) => {
              const max = stats.topics[0]?.n ?? 1;
              return (
                <div key={t.label} className="flex items-center gap-3">
                  <span className="w-[170px] shrink-0 text-[12px] font-medium text-gray-700 truncate">
                    {t.label}
                  </span>
                  <div className="flex-1 h-5 rounded-lg bg-gray-50 border border-black/5 overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-gradient-to-r from-violet-400 to-violet-300"
                      style={{ width: `${Math.max(6, (t.n / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[12px] font-bold tabular-nums text-gray-600">
                    {t.n}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">
            Counted from chat questions with keyword matching — one question can touch several
            topics.
          </p>
        </div>
      )}

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

const STATUS_ORDER = ["new", "contacted", "closed"] as const;

// Private follow-up notes, saved per lead.
function LeadNotes({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(Boolean(lead.notes));
  const [value, setValue] = useState(lead.notes ?? "");
  const [baseline, setBaseline] = useState(lead.notes ?? "");
  const [saved, setSaved] = useState<null | "saving" | "saved">(null);

  const save = async () => {
    setSaved("saving");
    await adminSetLeadNotes({ data: { id: lead.id, notes: value } }).catch(console.error);
    setBaseline(value);
    setSaved("saved");
    setTimeout(() => setSaved(null), 1500);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-3.5 rounded-full border border-dashed border-black/15 text-[11px] font-semibold text-gray-500 hover:text-gray-800 hover:border-black/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add note
      </button>
    );

  return (
    <div className="basis-full mt-1">
      <label className={labelCls} htmlFor={`notes-${lead.id}`}>
        Notes <span className="normal-case font-normal text-gray-400">(only you see these)</span>
      </label>
      <textarea
        id={`notes-${lead.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Follow-up plan, context, agreed budget…"
        className={`${fieldCls} resize-y min-h-[60px]`}
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={save}
          disabled={saved === "saving" || value === baseline}
          className="h-8 px-3.5 rounded-full bg-black text-white text-[11px] font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40 cursor-pointer"
        >
          {saved === "saving" ? "Saving…" : "Save note"}
        </button>
        {saved === "saved" && (
          <span className="text-[11px] text-green-600 font-medium" role="status">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  );
}

// Chat-lead content: the stored summary (their last messages) swaps in place
// with the full transcript — never both at once, so nothing reads twice.
function LeadChatThread({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ChatLog[] | null>(null);

  const toggle = () => {
    setOpen((v) => !v);
    if (!logs && lead.sessionId)
      adminChatSession({ data: { sessionId: lead.sessionId } })
        .then(setLogs)
        .catch(console.error);
  };

  return (
    <div className="mt-3 bg-gray-50 border border-black/5 rounded-xl px-3.5 py-2.5">
      {!open ? (
        <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">
          {lead.message}
        </p>
      ) : !logs ? (
        <Skeleton className="h-16 w-full" />
      ) : logs.length === 0 ? (
        <p className="text-[12px] text-gray-400 text-center py-2">
          No transcript stored for this session — showing their messages instead.
        </p>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="space-y-1">
              <p className="text-[12px] font-semibold text-gray-800 leading-snug">{log.question}</p>
              <p className="text-[12px] text-gray-500 leading-snug whitespace-pre-line border-l-2 border-black/10 pl-2">
                {log.answer}
              </p>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        className="mt-1.5 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
      >
        {open ? "Show summary" : "View full conversation"}
      </button>
    </div>
  );
}

// Compact card for the pipeline board.
function PipelineCard({
  lead,
  onMove,
}: {
  lead: Lead;
  onMove: (id: number, status: (typeof STATUS_ORDER)[number]) => void;
}) {
  const idx = STATUS_ORDER.indexOf(lead.status as (typeof STATUS_ORDER)[number]);
  const named = lead.name && lead.name !== "Chat visitor" ? lead.name : null;
  const topic = topicOf(lead.message);
  return (
    <div className="bg-white rounded-xl border border-black/10 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-bold truncate">{named ?? lead.email}</span>
        <span
          className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${
            lead.source === "chat" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {lead.source === "chat" ? "chat" : "form"}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto shrink-0" title={new Date(lead.createdAt).toLocaleString()}>
          {timeAgo(lead.createdAt)}
        </span>
      </div>
      {named ? (
        <a href={`mailto:${lead.email}`} className="block text-[11px] text-blue-600 hover:underline truncate mt-0.5">
          {lead.email}
        </a>
      ) : (
        topic && (
          <p className="text-[10px] font-semibold text-violet-600 truncate mt-0.5">{topic}</p>
        )
      )}
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-snug">{lead.message}</p>
      {lead.notes && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-1.5 line-clamp-2">
          📝 {lead.notes}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => idx > 0 && onMove(lead.id, STATUS_ORDER[idx - 1])}
          disabled={idx <= 0}
          aria-label="Move to previous stage"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-50 disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-default"
        >
          ←
        </button>
        <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">
          {STATUS_META[lead.status as keyof typeof STATUS_META]?.label ?? lead.status}
        </span>
        <button
          type="button"
          onClick={() => idx < STATUS_ORDER.length - 1 && onMove(lead.id, STATUS_ORDER[idx + 1])}
          disabled={idx >= STATUS_ORDER.length - 1}
          aria-label="Move to next stage"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-50 disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-default"
        >
          →
        </button>
      </div>
    </div>
  );
}

// Long messages collapse so the list stays scannable.
function LeadMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 260;
  const shown = expanded || !isLong ? text : `${text.slice(0, 260).trimEnd()}…`;
  return (
    <div className="mt-3 bg-gray-50 border border-black/5 rounded-xl px-3.5 py-2.5">
      <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

const PAGE = 30;

function LeadsTab({
  onStatsChange,
  preset,
  onPresetConsumed,
}: {
  onStatsChange: (s: Stats) => void;
  preset?: string | null;
  onPresetConsumed?: () => void;
}) {
  // Server-driven: search/filter/pagination happen in the database, the
  // browser only holds the pages it has loaded.
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [board, setBoard] = useState<Record<StatusKey, Lead[]> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ new: 0, contacted: 0, closed: 0 });
  const [total, setTotal] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState(""); // debounced
  const [statusFilter, setStatusFilter] = useState<"all" | keyof typeof STATUS_META>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "form" | "chat">("all");
  const [view, setView] = useState<"list" | "board">("list");
  const [busyMore, setBusyMore] = useState(false);

  // Arriving from another tab with a lead preselected: seed the search.
  useEffect(() => {
    if (preset) {
      setQuery(preset);
      setQ(preset);
      setStatusFilter("all");
      setSourceFilter("all");
      setView("list");
      onPresetConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const baseParams = useMemo(
    () => ({
      q: q || undefined,
      source: sourceFilter === "all" ? undefined : sourceFilter,
    }),
    [q, sourceFilter],
  );

  useEffect(() => {
    let alive = true;
    if (view === "list") {
      adminListLeads({
        data: {
          ...baseParams,
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: PAGE,
          offset: 0,
        },
      })
        .then((r) => {
          if (!alive) return;
          setRows(r.rows);
          setCounts(r.counts);
          setTotal(r.total);
        })
        .catch(console.error);
    } else {
      Promise.all(
        STATUS_ORDER.map((s) =>
          adminListLeads({ data: { ...baseParams, status: s, limit: PAGE, offset: 0 } }),
        ),
      )
        .then(([n, c, cl]) => {
          if (!alive) return;
          setBoard({ new: n.rows, contacted: c.rows, closed: cl.rows });
          setCounts(n.counts);
          setTotal(n.total);
        })
        .catch(console.error);
    }
    return () => {
      alive = false;
    };
  }, [baseParams, statusFilter, view]);

  const setStatus = (id: number, status: StatusKey) => {
    const current =
      rows?.find((l) => l.id === id) ??
      (board ? STATUS_ORDER.flatMap((s) => board[s]).find((l) => l.id === id) : undefined);
    const prev = current?.status as StatusKey | undefined;
    if (!current || prev === status) return;

    setRows(
      (rs) =>
        rs
          ?.map((l) => (l.id === id ? { ...l, status } : l))
          .filter((l) => statusFilter === "all" || l.status === statusFilter) ?? null,
    );
    setBoard((b) => {
      if (!b || !prev) return b;
      const moved = b[prev].find((l) => l.id === id);
      if (!moved) return b;
      return {
        ...b,
        [prev]: b[prev].filter((l) => l.id !== id),
        [status]: [{ ...moved, status }, ...b[status]],
      };
    });
    if (prev)
      setCounts((c) => ({
        ...c,
        [prev]: Math.max(0, (c[prev] ?? 0) - 1),
        [status]: (c[status] ?? 0) + 1,
      }));
    adminSetLeadStatus({ data: { id, status } }).catch(console.error);
    adminStats().then(onStatsChange).catch(() => {});
  };

  const loadMore = async () => {
    if (!rows) return;
    setBusyMore(true);
    try {
      const r = await adminListLeads({
        data: {
          ...baseParams,
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: PAGE,
          offset: rows.length,
        },
      });
      setRows((prev) => [...(prev ?? []), ...r.rows]);
      setCounts(r.counts);
      setTotal(r.total);
    } catch (error) {
      console.error(error);
    } finally {
      setBusyMore(false);
    }
  };

  const loadMoreColumn = async (s: StatusKey) => {
    if (!board) return;
    const r = await adminListLeads({
      data: { ...baseParams, status: s, limit: PAGE, offset: board[s].length },
    }).catch(() => null);
    if (r) setBoard((b) => (b ? { ...b, [s]: [...b[s], ...r.rows] } : b));
  };

  const copyEmail = (id: number, email: string) => {
    navigator.clipboard.writeText(email).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (view === "list" ? !rows : !board)
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );

  const pristine = !q && sourceFilter === "all" && statusFilter === "all";
  if (total === 0 && pristine)
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

  const filtered = rows ?? [];
  const filteredTotal = statusFilter === "all" ? total : (counts[statusFilter] ?? 0);
  const countFor = (s: keyof typeof STATUS_META) => counts[s] ?? 0;

  return (
    <div className="space-y-3">
      {/* Toolbar: search + status + source filters */}
      <div className={`${glassCard} p-3 flex flex-wrap items-center gap-2`}>
        <ExpandableSearchBar
          onChange={setQuery}
          placeholder="Search name, email, or message…"
          expandedWidth="17rem"
        />
        {view === "list" && (
          <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label="Filter by status">
            {(["all", ...Object.keys(STATUS_META)] as ("all" | keyof typeof STATUS_META)[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                aria-pressed={statusFilter === s}
                className={`h-8 px-3 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97] cursor-pointer ${
                  statusFilter === s
                    ? s === "all"
                      ? "bg-black text-white"
                      : STATUS_META[s as keyof typeof STATUS_META].active
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {s === "all" ? `All ${total}` : `${STATUS_META[s as keyof typeof STATUS_META].label} ${countFor(s as keyof typeof STATUS_META)}`}
              </button>
            ))}
          </div>
        )}
        <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label="Filter by source">
          {(
            [
              ["all", "Any source"],
              ["form", "Form"],
              ["chat", "AI chat"],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              aria-pressed={sourceFilter === s}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97] cursor-pointer ${
                sourceFilter === s ? "bg-black text-white" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label="View mode">
          {(
            [
              ["list", "List"],
              ["board", "Pipeline"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97] cursor-pointer ${
                view === v ? "bg-black text-white" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "list" && filtered.length === 0 && (
        <div className={`${glassCard} p-8 text-center`}>
          <p className="text-sm font-semibold">No leads match</p>
          <p className="text-[12px] text-gray-500 mt-1">Try a different search or filter.</p>
        </div>
      )}

      {view === "board" && board && (
        <div className="grid md:grid-cols-3 gap-3 items-start">
          {STATUS_ORDER.map((s) => {
            const column = board[s];
            const columnTotal = counts[s] ?? 0;
            const dot = s === "new" ? "#f59e0b" : s === "contacted" ? "#3b82f6" : "#6b7280";
            return (
              <div key={s} className="rounded-2xl bg-gray-50/80 border border-black/5 p-2.5">
                <div className="flex items-center gap-2 px-1.5 pb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: dot }} aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                    {STATUS_META[s].label}
                  </span>
                  <span className="text-[11px] text-gray-400 tabular-nums">{columnTotal}</span>
                </div>
                <div className="space-y-2">
                  {column.length === 0 ? (
                    <p className="text-[11px] text-gray-400 text-center py-6">Empty</p>
                  ) : (
                    column.map((l) => <PipelineCard key={l.id} lead={l} onMove={setStatus} />)
                  )}
                  {column.length < columnTotal ? (
                    <button
                      type="button"
                      onClick={() => loadMoreColumn(s)}
                      className="w-full h-8 rounded-xl bg-white border border-black/5 text-[11px] font-medium text-gray-500 hover:text-black hover:border-black/15 transition-colors cursor-pointer"
                    >
                      Show more ({columnTotal - column.length} left)
                    </button>
                  ) : (
                    column.length > 0 && (
                      <p className="text-center text-[10px] text-gray-400 py-1">
                        All {columnTotal} loaded
                      </p>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" &&
        filtered.map((l, i) => (
        <motion.div
          key={l.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04, ease: EASE }}
          className={`${glassCard} p-4 md:p-5`}
        >
          {(() => {
            // Identity-first (same rules as the Chats inbox): a real name
            // wins, otherwise the email IS the identity — never "Chat visitor".
            const named = l.name && l.name !== "Chat visitor" ? l.name : null;
            const identity = named ?? l.email;
            const topic = topicOf(l.message);
            return (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 border border-black/5 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">
                  {identity[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-sm truncate max-w-[260px]">{identity}</span>
                    {!named && (
                      <button
                        onClick={() => copyEmail(l.id, l.email)}
                        aria-label="Copy email address"
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0 cursor-pointer"
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
                    )}
                    {topic && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                        {topic}
                      </span>
                    )}
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
                  {named && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <a href={`mailto:${l.email}`} className="text-[13px] text-blue-600 hover:underline truncate">
                        {l.email}
                      </a>
                      <button
                        onClick={() => copyEmail(l.id, l.email)}
                        aria-label="Copy email address"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0 cursor-pointer"
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
                  )}
                </div>
              </div>
            );
          })()}

          {l.sessionId ? <LeadChatThread lead={l} /> : <LeadMessage text={l.message} />}

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

          {/* Private follow-up notes */}
          <div className="flex flex-wrap items-start gap-2 mt-3">
            <LeadNotes lead={l} />
          </div>
        </motion.div>
      ))}

      {view === "list" &&
        filtered.length > 0 &&
        (filtered.length < filteredTotal ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={busyMore}
            className={`${glassCard} w-full h-11 text-[12px] font-semibold text-gray-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50`}
          >
            {busyMore
              ? "Loading…"
              : `Load ${Math.min(PAGE, filteredTotal - filtered.length)} more (${filteredTotal - filtered.length} left)`}
          </button>
        ) : (
          <p className="text-center text-[11px] text-gray-400 py-2">
            All {filteredTotal} {filteredTotal === 1 ? "lead" : "leads"} loaded
          </p>
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

type ChatFilter = "important" | "starred" | "unanswered" | "all";

// Bucket a date into a human section label for the Newest sort.
function dayLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const CHAT_PAGE = 15;

function ChatsTab({
  openLead,
  teach,
}: {
  openLead: (email: string) => void;
  teach: (question: string) => void;
}) {
  // Server-driven: grouping, tagging, search, sort, and pagination all run
  // in the database (adminListConversations); the browser only holds the
  // loaded pages.
  const [meta, setMeta] = useState<ConvMeta[] | null>(null);
  const [exchangesByKey, setExchangesByKey] = useState<Map<string, ChatLog[]>>(new Map());
  const [counts, setCounts] = useState({ important: 0, starred: 0, unanswered: 0, total: 0 });
  const [filter, setFilter] = useState<ChatFilter>("all");
  // Land on today's conversations; older ones are one click away.
  const [scope, setScope] = useState<"today" | "older" | "all">("today");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState(""); // debounced
  // Inbox layout: which thread is open. null = none chosen explicitly
  // (desktop falls back to the first in the list; mobile shows the list).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busyMore, setBusyMore] = useState(false);
  const [landed, setLanded] = useState(false);

  // The right data at the right time, without a sort toggle:
  // - searching → all history, newest first
  // - triage filters (leads/starred/gaps) → priority order
  // - browsing All → chronological with date sections
  const effectiveScope = q ? "all" : scope;
  const sort: "priority" | "newest" = q || filter === "all" ? "newest" : "priority";

  useEffect(() => {
    setSelectedKey(null);
  }, [q, filter, scope]);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const mergeExchanges = (prev: Map<string, ChatLog[]>, incoming: ChatLog[], reset: boolean) => {
    const next = reset ? new Map<string, ChatLog[]>() : new Map(prev);
    for (const e of incoming) {
      const key = e.sessionId ?? `legacy-${e.id}`;
      const arr = next.get(key) ?? [];
      if (!arr.some((x) => x.id === e.id)) arr.push(e);
      next.set(key, arr);
    }
    return next;
  };

  const [refreshing, setRefreshing] = useState(false);
  // Mirrors how many conversations are loaded, for the auto-refresh guard.
  const loadedCountRef = useRef(0);
  useEffect(() => {
    loadedCountRef.current = meta?.length ?? 0;
  }, [meta]);

  const fetchFirstPage = (silent = false) => {
    if (!silent) setRefreshing(true);
    return adminListConversations({
      data: { q: q || undefined, filter, scope: effectiveScope, sort, limit: CHAT_PAGE, offset: 0 },
    })
      .then((r) => {
        setMeta(r.page);
        setCounts(r.counts);
        setExchangesByKey((prev) => mergeExchanges(prev, r.exchanges, true));
        // Nothing today yet? Land on the full history instead (first load only).
        if (!landed) {
          setLanded(true);
          if (r.counts.total === 0 && scope === "today" && !q) setScope("all");
        }
      })
      .catch(console.error)
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchFirstPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, scope]);

  // Live-ish inbox: re-fetch the first page every 30s while the tab is
  // visible, so new visitor conversations appear without a manual reload.
  // Skipped when the owner has paged deeper (a reset would collapse that).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (loadedCountRef.current > CHAT_PAGE) return;
      fetchFirstPage(true);
    }, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, scope]);

  const togglePin = (key: string) => {
    const wasPinned = meta?.find((c) => c.key === key)?.pinned ?? false;
    setMeta((m) => m?.map((c) => (c.key === key ? { ...c, pinned: !c.pinned } : c)) ?? null);
    setCounts((c) => ({ ...c, starred: Math.max(0, c.starred + (wasPinned ? -1 : 1)) }));
    setPendingDelete(null);
    adminTogglePin({ data: { key } }).catch(console.error);
  };

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Two-step delete: first click arms the button, second click removes the
  // conversation (optimistically) and tells the server.
  const removeConversation = (key: string) => {
    const conv = meta?.find((c) => c.key === key);
    if (!conv) return;
    setMeta((m) => m?.filter((c) => c.key !== key) ?? null);
    setCounts((c) => ({
      important: Math.max(0, c.important - (conv.has_lead || conv.has_hiring ? 1 : 0)),
      starred: Math.max(0, c.starred - (conv.pinned ? 1 : 0)),
      unanswered: Math.max(0, c.unanswered - (conv.has_unanswered ? 1 : 0)),
      total: Math.max(0, c.total - 1),
    }));
    setPendingDelete(null);
    adminDeleteConversation({ data: { key } }).catch(console.error);
  };

  const filterTotal =
    filter === "all"
      ? counts.total
      : filter === "important"
        ? counts.important
        : filter === "starred"
          ? counts.starred
          : counts.unanswered;

  const loadMore = async () => {
    if (!meta) return;
    setBusyMore(true);
    try {
      const r = await adminListConversations({
        data: {
          q: q || undefined,
          filter,
          scope: effectiveScope,
          sort,
          limit: CHAT_PAGE,
          offset: meta.length,
        },
      });
      setMeta((prev) => [...(prev ?? []), ...r.page]);
      setCounts(r.counts);
      setExchangesByKey((prev) => mergeExchanges(prev, r.exchanges, false));
    } catch (error) {
      console.error(error);
    } finally {
      setBusyMore(false);
    }
  };

  if (!meta)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  if (counts.total === 0 && !q)
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

  // Server order is already the display order. Each conversation gets a
  // stable, meaningful name: the linked lead when known, otherwise a short
  // visitor ID — plus a rule-based topic label from its questions.
  const sorted = meta.map((c) => {
    const exchanges = exchangesByKey.get(c.key) ?? [];
    const named = c.lead_name && c.lead_name !== "Chat visitor" ? c.lead_name : null;
    return {
      key: c.key,
      pinned: c.pinned,
      latest: new Date(c.latest),
      exchangeCount: c.exchange_count,
      leadEmail: c.lead_email,
      identity: named ?? c.lead_email ?? visitorLabel(c.key),
      isLead: Boolean(c.lead_email),
      topic: topicOf(exchanges.map((e) => e.question).join("\n")),
      firstQ: exchanges[0]?.question ?? "…",
      exchanges,
      tags: new Set(
        [c.has_lead && "lead", c.has_hiring && "hiring", c.has_unanswered && "unanswered"].filter(
          (t): t is string => Boolean(t),
        ),
      ),
    };
  });

  // Chips that earn their place: zero-count triage chips are hidden (unless
  // active), "All" is always there. Counts are color-coded by urgency.
  const FILTERS = (
    [
      { id: "all", label: "All", count: counts.total, countCls: "bg-white text-gray-500" },
    {
      id: "unanswered",
      label: "Couldn't answer",
      count: counts.unanswered,
      countCls: "bg-red-100 text-red-600",
    },
    {
      id: "important",
      label: "Leads & clients",
      count: counts.important,
      countCls: "bg-green-100 text-green-700",
    },
      { id: "starred", label: "Starred", count: counts.starred, countCls: "bg-amber-100 text-amber-700" },
    ] as { id: ChatFilter; label: string; count: number; countCls: string }[]
  ).filter((f) => f.id === "all" || f.count > 0 || filter === f.id);

  return (
    <div>
      {/* Toolbar: search (collapsed to an icon), triage chips, time scope */}
      <div className={`${glassCard} p-3 flex flex-wrap items-center gap-2 mb-4`}>
        <ExpandableSearchBar
          onChange={setQuery}
          placeholder="Search questions and answers…"
          expandedWidth="16rem"
        />

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Conversation filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`h-9 px-3.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                filter === f.id ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:text-black"
              }`}
            >
              {f.label}
              <span
                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  filter === f.id ? "bg-white/20 text-white" : f.countCls
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {q ? (
            <span className="h-8 px-3 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-semibold inline-flex items-center">
              Searching all history
            </span>
          ) : (
            <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label="Time scope">
              {(
                [
                  ["today", "Today"],
                  ["older", "Older"],
                  ["all", "All time"],
                ] as const
              ).map(([s, label]) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  aria-pressed={scope === s}
                  className={`h-8 px-3 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97] cursor-pointer ${
                    scope === s ? "bg-black text-white" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => fetchFirstPage()}
          disabled={refreshing}
          aria-label="Refresh conversations"
          title="Refresh — new conversations also appear automatically every 30s"
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {sorted.length === 0 && (
        <div className={`${glassCard} p-8 text-center`}>
          <p className="text-sm font-semibold">Nothing here</p>
          <p className="text-[12px] text-gray-500 mt-1">
            {q
              ? "No conversations match your search."
              : scope === "today"
                ? "No conversations today yet — switch to Older or All time for history."
                : 'No conversations match this filter yet — that\'s a good thing for "Couldn\'t answer".'}
          </p>
        </div>
      )}

      {sorted.length > 0 && (() => {
        const selected = sorted.find((c) => c.key === selectedKey) ?? sorted[0];
        // On mobile the list and the thread swap; on desktop both show.
        const mobileThreadOpen = selectedKey !== null;
        const TAG_DOT: Record<string, string> = {
          lead: "#22c55e",
          hiring: "#f59e0b",
          unanswered: "#ef4444",
        };
        return (
          <div className="grid md:grid-cols-[minmax(260px,320px)_1fr] gap-3 items-start">
            {/* Conversation list */}
            <div
              className={`${glassCard} p-1.5 md:max-h-[68vh] md:overflow-y-auto ${
                mobileThreadOpen ? "hidden md:block" : ""
              }`}
            >
              {sorted.map((c, i) => {
                const label = dayLabel(c.latest);
                const showHeader =
                  sort === "newest" && (i === 0 || dayLabel(sorted[i - 1].latest) !== label);
                const active = selected.key === c.key;
                return (
                  <div key={c.key}>
                    {showHeader && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2.5 pt-2.5 pb-1">
                        {label}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(c.key);
                        setPendingDelete(null);
                      }}
                      aria-current={active}
                      className={`w-full text-left px-2.5 py-2.5 rounded-xl transition-colors cursor-pointer ${
                        active ? "bg-black" : "hover:bg-black/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Identity avatar: lead initial, or a visitor glyph */}
                        <div
                          className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${
                            c.isLead
                              ? active
                                ? "bg-green-400 text-black"
                                : "bg-green-100 text-green-700"
                              : active
                                ? "bg-white/20 text-white"
                                : "bg-gray-100 text-gray-500"
                          }`}
                          aria-hidden
                        >
                          {c.isLead ? (
                            c.identity[0]?.toUpperCase()
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {c.pinned && (
                              <svg viewBox="0 0 24 24" fill="#f59e0b" className="w-3 h-3 shrink-0" aria-label="Starred">
                                <path d="m12 3 2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9Z" />
                              </svg>
                            )}
                            <span
                              className={`text-[12px] font-bold truncate ${active ? "text-white" : "text-gray-800"}`}
                            >
                              {c.identity}
                            </span>
                            {[...c.tags].map((t) => (
                              <span
                                key={t}
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: TAG_DOT[t] ?? "#9ca3af" }}
                                title={TAG_META[t]?.label ?? t}
                              />
                            ))}
                            <span
                              className={`text-[10px] shrink-0 ml-auto tabular-nums ${
                                active ? "text-white/50" : "text-gray-400"
                              }`}
                              title={c.latest.toLocaleString()}
                            >
                              {timeAgo(c.latest)}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${active ? "text-white/60" : "text-gray-400"}`}
                          >
                            {c.topic ? (
                              <>
                                <span className={active ? "text-white/80 font-semibold" : "text-gray-500 font-semibold"}>
                                  {c.topic}
                                </span>
                                {" — "}
                              </>
                            ) : null}
                            {c.firstQ}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}

              {sorted.length < filterTotal ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={busyMore}
                  className="w-full h-9 mt-1 rounded-xl bg-gray-50 border border-black/5 text-[11px] font-medium text-gray-500 hover:text-black hover:border-black/15 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busyMore ? "Loading…" : `Load more (${filterTotal - sorted.length} left)`}
                </button>
              ) : (
                <p className="text-center text-[10px] text-gray-400 py-2">
                  All {filterTotal} loaded
                </p>
              )}
            </div>

            {/* Thread pane */}
            <div className={`${glassCard} p-4 md:p-5 ${mobileThreadOpen ? "" : "hidden md:block"}`}>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="md:hidden mb-3 text-[12px] font-semibold text-gray-500 hover:text-black cursor-pointer"
              >
                ← All conversations
              </button>

              {/* Thread header */}
              <div className="flex flex-wrap items-center gap-1.5 pb-3 mb-3 border-b border-black/5 text-[11px]">
                <span className="text-[13px] font-bold text-gray-900 mr-0.5 truncate max-w-[240px]">
                  {selected.identity}
                </span>
                {selected.topic && (
                  <span className="px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                    {selected.topic}
                  </span>
                )}
                {[...selected.tags].map((t) => (
                  <span key={t} className={`px-2 py-0.5 rounded-full font-semibold ${TAG_META[t]?.cls ?? ""}`}>
                    {TAG_META[t]?.label ?? t}
                  </span>
                ))}
                {selected.leadEmail && (
                  <button
                    type="button"
                    onClick={() => openLead(selected.leadEmail!)}
                    title="Open this lead in the Leads tab"
                    className="px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer inline-flex items-center gap-1 max-w-[220px]"
                  >
                    <span className="truncate">{selected.leadEmail}</span>
                    <span aria-hidden>→</span>
                  </button>
                )}
                <span className="px-2 py-0.5 rounded-full bg-gray-100 font-semibold text-gray-600">
                  {selected.exchangeCount} {selected.exchangeCount === 1 ? "exchange" : "exchanges"}
                </span>
                <span className="text-gray-400 ml-auto" title={selected.latest.toLocaleString()}>
                  {timeAgo(selected.latest)}
                </span>
                <button
                  type="button"
                  onClick={() => togglePin(selected.key)}
                  aria-pressed={selected.pinned}
                  aria-label={selected.pinned ? "Unstar conversation" : "Star conversation"}
                  title={selected.pinned ? "Unstar — drop from the top" : "Star — keep on top of Priority"}
                  className="w-7 h-7 -my-1 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill={selected.pinned ? "#f59e0b" : "none"}
                    stroke={selected.pinned ? "#f59e0b" : "#9ca3af"}
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden
                  >
                    <path d="m12 3 2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9Z" />
                  </svg>
                </button>
                {pendingDelete === selected.key ? (
                  <button
                    type="button"
                    onClick={() => removeConversation(selected.key)}
                    className="h-7 px-2.5 -my-1 rounded-lg bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(selected.key)}
                    aria-label="Delete conversation"
                    title="Delete this conversation"
                    className="w-7 h-7 -my-1 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden>
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Full thread */}
              <div className="max-h-[56vh] overflow-y-auto pr-1">
                {selected.exchanges.map((log) => (
                  <div key={log.id} className="mb-2.5 last:mb-0">
                    <div className="flex justify-end mb-1.5">
                      <p className="max-w-[85%] bg-blue-500 text-white text-[13px] leading-relaxed rounded-2xl rounded-br-md px-3.5 py-2 whitespace-pre-line">
                        {log.question}
                      </p>
                    </div>
                    {log.tag === "unanswered" && (
                      <div className="flex justify-start items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                          ⚠ Couldn't answer this one
                        </span>
                        <button
                          type="button"
                          onClick={() => teach(log.question)}
                          title="Add the answer to the AI's knowledge in Content"
                          className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          Teach the AI →
                        </button>
                      </div>
                    )}
                    <div className="flex justify-start">
                      <p className="max-w-[85%] bg-gray-100 text-gray-800 text-[13px] leading-relaxed rounded-2xl rounded-bl-md px-3.5 py-2 whitespace-pre-line">
                        {log.answer}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
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
              </span>
            </div>
          </div>
        )}
      </div>

      {status && <TotpCard enabled={status.totpEnabled} onChanged={load} />}

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
          <ShineButton disabled={state === "saving" || !current || !next || !confirm} size="sm">
            {state === "saving" ? "Changing…" : "Change password"}
          </ShineButton>
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

// ---- 2FA wizard -----------------------------------------------------------

function TotpCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [phase, setPhase] = useState<"idle" | "setup" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await adminTotpBegin();
      setSecret(res.secret);
      setQr(await QRCode.toDataURL(res.uri, { width: 220, margin: 1 }));
      setCode("");
      setPhase("setup");
    } catch {
      setError("Couldn't start setup — try again.");
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminTotpEnable({ data: { secret, code } });
      if (res.ok) {
        setPhase("idle");
        setDone("Two-factor enabled ✓ — you'll need a code on every future login.");
        setQr(null);
        setSecret("");
        onChanged();
      } else {
        setError(res.error ?? "Verification failed.");
      }
    } catch {
      setError("Verification failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminTotpDisable({ data: { password } });
      if (res.ok) {
        setPhase("idle");
        setPassword("");
        setDone("Two-factor disabled.");
        onChanged();
      } else {
        setError(res.error ?? "Couldn't disable.");
      }
    } catch {
      setError("Couldn't disable — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${glassCard} p-5`}>
      <h2 className="text-sm font-bold tracking-tight mb-1">Two-factor authentication</h2>
      <p className="text-[11px] text-gray-400 mb-4">
        A 6-digit code from your authenticator app, required at every login.
      </p>

      {phase === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          {enabled ? (
            <>
              <button
                onClick={() => {
                  setPhase("disable");
                  setDone(null);
                  setError(null);
                }}
                className="h-10 px-5 rounded-full border border-red-200 text-[13px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                Disable 2FA
              </button>
              <button
                onClick={begin}
                disabled={busy}
                className="h-10 px-5 rounded-full border border-black/10 text-[13px] font-semibold text-gray-700 hover:border-black/30 transition-colors disabled:opacity-40"
              >
                {busy ? "Preparing…" : "Re-enroll (new secret)"}
              </button>
            </>
          ) : (
            <ShineButton onClick={begin} disabled={busy} size="sm">
              {busy ? "Preparing…" : "Enable 2FA"}
            </ShineButton>
          )}
          {done && (
            <span className="text-[12px] text-green-600 font-medium" role="status">
              {done}
            </span>
          )}
        </div>
      )}

      {phase === "setup" && (
        <form onSubmit={enable} className="space-y-4">
          <ol className="text-[12px] text-gray-600 space-y-1 list-decimal list-inside">
            <li>Open your authenticator app (Google Authenticator, Apple Passwords, Authy…)</li>
            <li>Scan the QR code, or enter the setup key manually</li>
            <li>Type the 6-digit code the app shows to confirm</li>
          </ol>
          <div className="flex flex-wrap items-start gap-5">
            {qr && (
              <img
                src={qr}
                alt="Scan this QR code with your authenticator app"
                className="w-[180px] h-[180px] rounded-xl border border-black/10"
              />
            )}
            <div className="min-w-[220px] flex-1 space-y-3">
              <div>
                <label className={labelCls}>Setup key (manual entry)</label>
                <p className="font-mono text-[12px] font-semibold bg-gray-50 border border-black/5 rounded-lg px-3 py-2 select-all break-all">
                  {secret}
                </p>
              </div>
              <div>
                <label className={labelCls} htmlFor="totp-confirm">
                  Code from your app
                </label>
                <input
                  id="totp-confirm"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className={`${fieldCls} text-center text-lg tracking-[0.4em] font-semibold max-w-[220px]`}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="flex items-center gap-2">
                <ShineButton disabled={busy || code.length !== 6} size="sm">
                  {busy ? "Verifying…" : "Verify & enable"}
                </ShineButton>
                <button
                  type="button"
                  onClick={() => {
                    setPhase("idle");
                    setQr(null);
                    setSecret("");
                    setError(null);
                  }}
                  className="h-10 px-4 rounded-full text-[13px] font-medium text-gray-500 hover:text-black transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-[12px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      {phase === "disable" && (
        <form onSubmit={disable} className="space-y-3 max-w-sm">
          <div>
            <label className={labelCls} htmlFor="totp-disable-pw">
              Confirm with your password
            </label>
            <input
              id="totp-disable-pw"
              type="password"
              className={fieldCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !password}
              className="h-10 px-5 rounded-full bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              {busy ? "Disabling…" : "Disable 2FA"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setPassword("");
                setError(null);
              }}
              className="h-10 px-4 rounded-full text-[13px] font-medium text-gray-500 hover:text-black transition-colors"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-[12px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
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

function ContentTab({
  teachQuestion,
  onTeachConsumed,
}: {
  teachQuestion?: string | null;
  onTeachConsumed?: () => void;
}) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageReady, setStorageReady] = useState(false);

  // Question handed over from Chats ("Teach the AI"). Kept in a ref and
  // applied to every content fetch result: StrictMode double-fires load(),
  // and the second resolve would otherwise clobber an appended draft.
  const teachRef = useRef<string | null>(null);
  if (teachQuestion) teachRef.current = teachQuestion;

  const applyTeach = (c: SiteContent): SiteContent => {
    const q = teachRef.current;
    if (!q || c.chatFacts.includes(`Q: ${q}`)) return c;
    return { ...c, chatFacts: `${c.chatFacts.trimEnd()}\n\nQ: ${q}\nA: ` };
  };

  const load = () => {
    adminGetContent()
      .then((c) => {
        setContent(applyTeach(c));
        // Snapshot the SERVER version, so a teach scaffold counts as dirty.
        setSavedSnapshot(JSON.stringify(c));
      })
      .catch(console.error);
    adminListRevisions().then(setRevisions).catch(console.error);
    adminStorageStatus()
      .then((s) => setStorageReady(s.configured))
      .catch(() => setStorageReady(false));
  };
  useEffect(load, []);

  // Once content is on screen with a pending teach question: scroll to the
  // AI-knowledge box, focus it, and tell the dashboard it's been handled.
  useEffect(() => {
    if (!teachQuestion || !content) return;
    onTeachConsumed?.();
    setTimeout(() => {
      const el = document.getElementById("chatfacts-input") as HTMLTextAreaElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachQuestion, content === null]);

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
              <div>
                <label className={labelCls}>Tech stack (comma separated)</label>
                <input
                  className={fieldCls}
                  value={p.stack.join(", ")}
                  placeholder="React, TypeScript, PostgreSQL…"
                  onChange={(e) => {
                    const projects = [...content.projects];
                    projects[i] = {
                      ...p,
                      stack: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    };
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
            id="chatfacts-input"
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
          <ShineButton
            onClick={save}
            disabled={state === "saving" || (!dirty && state !== "error")}
            size="sm"
          >
            {state === "saving" ? "Saving…" : "Save changes"}
          </ShineButton>
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

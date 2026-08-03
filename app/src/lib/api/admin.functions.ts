import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { siteContentSchema } from "@/content/schema";
import { TOPIC_RULES } from "@/lib/topics";
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

// Topic buckets live in src/lib/topics.ts — shared with the Chats inbox UI.

export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const d = db();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

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
    recentQuestions,
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
    // Newest 500 questions of the last 90 days feed the topics card —
    // bounded so the query stays cheap at any table size.
    d
      .select({ question: schema.chatLogs.question })
      .from(schema.chatLogs)
      .where(gt(schema.chatLogs.createdAt, ninetyDaysAgo))
      .orderBy(desc(schema.chatLogs.createdAt))
      .limit(500),
  ]);

  const topicCounts = new Map<string, number>();
  for (const { question } of recentQuestions) {
    for (const rule of TOPIC_RULES) {
      if (rule.re.test(question)) topicCounts.set(rule.label, (topicCounts.get(rule.label) ?? 0) + 1);
    }
  }
  const topics = [...topicCounts.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

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
    topics,
    topicSample: recentQuestions.length,
  };
});

// Server-side search/filter/pagination so the dashboard scales past a few
// hundred leads: the browser only ever holds the pages it has asked for,
// and counts are computed by the database over ALL rows.
function leadConditions(q?: string, status?: string, source?: string) {
  const conds = [];
  if (status) conds.push(eq(schema.contactMessages.status, status));
  if (source) conds.push(eq(schema.contactMessages.source, source));
  if (q) {
    const pat = `%${q}%`;
    conds.push(
      or(
        ilike(schema.contactMessages.name, pat),
        ilike(schema.contactMessages.email, pat),
        ilike(schema.contactMessages.message, pat),
        ilike(schema.contactMessages.notes, pat),
      ),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

export const adminListLeads = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().max(200).optional(),
      status: z.enum(["new", "contacted", "closed"]).optional(),
      source: z.enum(["form", "chat"]).optional(),
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = db();
    const [rows, grouped] = await Promise.all([
      d
        .select()
        .from(schema.contactMessages)
        .where(leadConditions(data.q, data.status, data.source))
        .orderBy(desc(schema.contactMessages.createdAt), desc(schema.contactMessages.id))
        .limit(data.limit)
        .offset(data.offset),
      // Status counts share the q/source filters (but not status), so the
      // pills always show accurate totals for the current search.
      d
        .select({ status: schema.contactMessages.status, n: count() })
        .from(schema.contactMessages)
        .where(leadConditions(data.q, undefined, data.source))
        .groupBy(schema.contactMessages.status),
    ]);
    const counts = { new: 0, contacted: 0, closed: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.status] = g.n;
    return { rows, counts, total: counts.new + counts.contacted + counts.closed };
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

// Conversation list, fully database-side: exchanges are grouped into
// conversations (by sessionId; pre-session rows stand alone), tagged,
// scored, searched, and paginated in SQL — the browser never loads more
// than one page. Returns conversation metadata in display order plus the
// exchanges for just those conversations.
export const adminListConversations = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().max(200).optional(),
      filter: z.enum(["important", "starred", "unanswered", "all"]).default("all"),
      // Time scope: today's conversations, older-than-today, or everything.
      scope: z.enum(["today", "older", "all"]).default("all"),
      sort: z.enum(["priority", "newest"]).default("priority"),
      limit: z.number().int().min(1).max(50).default(15),
      offset: z.number().int().min(0).max(100000).default(0),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = db();
    const pat = data.q ? `%${data.q}%` : null;
    // Midnight in Baghdad (fixed +03:00, no DST) — the owner's "today".
    const todayStart = new Date(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" }).format(new Date())}T00:00:00+03:00`,
    );
    const scopeCond =
      data.scope === "today"
        ? sql`and c.latest >= ${todayStart.toISOString()}`
        : data.scope === "older"
          ? sql`and c.latest < ${todayStart.toISOString()}`
          : sql``;

    const conv = sql`
      select coalesce(cl.session_id, 'legacy-' || cl.id::text) as key,
        max(cl.created_at) as latest,
        count(*)::int as exchange_count,
        bool_or(cl.tag = 'lead') as has_lead,
        bool_or(cl.tag = 'hiring') as has_hiring,
        bool_or(cl.tag = 'unanswered') as has_unanswered,
        ${pat ? sql`bool_or(cl.question ilike ${pat} or cl.answer ilike ${pat})` : sql`true`} as matches
      from chat_logs cl
      group by 1`;

    const filterCond =
      data.filter === "important"
        ? sql`and (c.has_lead or c.has_hiring)`
        : data.filter === "starred"
          ? sql`and p.key is not null`
          : data.filter === "unanswered"
            ? sql`and c.has_unanswered`
            : sql``;

    const orderBy =
      data.sort === "newest"
        ? sql`c.latest desc`
        : sql`(case when p.key is not null then 8 else 0 end)
            + (case when c.has_lead then 4 else 0 end)
            + (case when c.has_hiring then 2 else 0 end)
            + (case when c.has_unanswered then 1 else 0 end) desc, c.latest desc`;

    const [pageRes, countsRes] = await Promise.all([
      d.execute(sql`
        with conv as (${conv})
        select c.key, c.latest, c.exchange_count, c.has_lead, c.has_hiring, c.has_unanswered,
          (p.key is not null) as pinned,
          cm.email as lead_email, cm.id as lead_id, cm.name as lead_name
        from conv c
        left join pinned_conversations p on p.key = c.key
        left join lateral (
          select email, id, name from contact_messages
          where session_id = c.key
          order by created_at desc limit 1
        ) cm on true
        where c.matches ${scopeCond} ${filterCond}
        order by ${orderBy}
        limit ${data.limit} offset ${data.offset}`),
      d.execute(sql`
        with conv as (${conv})
        select
          count(*) filter (where c.has_lead or c.has_hiring)::int as important,
          count(*) filter (where p.key is not null)::int as starred,
          count(*) filter (where c.has_unanswered)::int as unanswered,
          count(*)::int as total
        from conv c left join pinned_conversations p on p.key = c.key
        where c.matches ${scopeCond}`),
    ]);

    const page = pageRes as unknown as {
      key: string;
      latest: string;
      exchange_count: number;
      has_lead: boolean;
      has_hiring: boolean;
      has_unanswered: boolean;
      pinned: boolean;
      lead_email: string | null;
      lead_id: number | null;
      lead_name: string | null;
    }[];
    const counts = (countsRes[0] ?? { important: 0, starred: 0, unanswered: 0, total: 0 }) as {
      important: number;
      starred: number;
      unanswered: number;
      total: number;
    };

    // Exchanges for just this page of conversations.
    const sessionKeys = page.map((c) => c.key).filter((k) => !k.startsWith("legacy-"));
    const legacyIds = page
      .map((c) => c.key)
      .filter((k) => k.startsWith("legacy-"))
      .map((k) => Number(k.slice(7)))
      .filter(Number.isFinite);
    const exchangeConds = [];
    if (sessionKeys.length) exchangeConds.push(inArray(schema.chatLogs.sessionId, sessionKeys));
    if (legacyIds.length)
      exchangeConds.push(and(isNull(schema.chatLogs.sessionId), inArray(schema.chatLogs.id, legacyIds)));
    const exchanges = exchangeConds.length
      ? await d
          .select()
          .from(schema.chatLogs)
          .where(exchangeConds.length === 1 ? exchangeConds[0] : or(...exchangeConds))
          .orderBy(asc(schema.chatLogs.createdAt))
      : [];

    return { page, counts, exchanges };
  });

// Remove a whole conversation (its exchanges + pin). Used to clean up test
// chats and noise from the dashboard.
export const adminDeleteConversation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1).max(64) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = db();
    if (data.key.startsWith("legacy-")) {
      const id = Number(data.key.slice(7));
      if (Number.isFinite(id))
        await d
          .delete(schema.chatLogs)
          .where(and(isNull(schema.chatLogs.sessionId), eq(schema.chatLogs.id, id)));
    } else {
      await d.delete(schema.chatLogs).where(eq(schema.chatLogs.sessionId, data.key));
    }
    await d.delete(schema.pinnedConversations).where(eq(schema.pinnedConversations.key, data.key));
    return { ok: true };
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

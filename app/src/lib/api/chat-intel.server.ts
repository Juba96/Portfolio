import { and, eq, gt } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ChatTurn } from "./chat-prompt";
import { getSiteContent } from "./content.server";
import { sendAutoReply, sendLeadNotification } from "./email.server";

// Post-processing for chat exchanges: transcript logging and in-chat lead
// capture. Everything here is fire-and-forget — errors are logged and
// swallowed so the visitor's reply is never delayed or broken.

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// English + Arabic signals of client/hiring intent in the visitor's question.
const HIRING_RE =
  /\b(hire|hiring|job|recruit|freelance|collaborat|partner|project|budget|price|pricing|cost|quote|rate|work (with|together)|consult|opportunit|available|availability)\b|توظيف|وظيف|مشروع|تعاون|سعر|تكلفة|ميزانية|شراكة|استشار/i;

// "Couldn't answer" detection now relies solely on the model's own
// [[offtopic]] marker (passed in as forcedTag) — the old answer-phrase
// regex flagged healthy replies like "reach out directly at …" as gaps.
function classify(question: string): string {
  if (EMAIL_IN_TEXT.test(question)) return "lead";
  if (HIRING_RE.test(question)) return "hiring";
  return "general";
}

export function logChatExchange(
  question: string,
  answer: string,
  provider: string,
  sessionId?: string,
  forcedTag?: string,
) {
  db()
    .insert(schema.chatLogs)
    .values({
      question: question.slice(0, 4000),
      answer: answer.slice(0, 8000),
      provider,
      sessionId: sessionId?.slice(0, 40) ?? null,
      // A lead/hiring signal in the question wins; otherwise the model's
      // own off-topic marker (forcedTag) decides "unanswered".
      tag: (() => {
        const heuristic = classify(question);
        if (heuristic === "lead" || heuristic === "hiring") return heuristic;
        return forcedTag ?? heuristic;
      })(),
    })
    .then(() => {})
    .catch((error) => console.error("chat log insert failed", error));
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// If the visitor's latest message contains an email address, record it as a
// lead (source 'chat') with recent conversation context. Deduped per email
// per 24h so an enthusiastic visitor doesn't create a pile of rows.
export async function captureChatLead(messages: ChatTurn[], sessionId?: string) {
  try {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    const email = last.content.match(EMAIL_RE)?.[0];
    if (!email) return;

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db()
      .select({ id: schema.contactMessages.id })
      .from(schema.contactMessages)
      .where(
        and(
          eq(schema.contactMessages.email, email),
          gt(schema.contactMessages.createdAt, dayAgo),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    // Recent user turns as context, so the lead row explains what they wanted.
    const context = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join("\n");

    const [row] = await db()
      .insert(schema.contactMessages)
      .values({
        name: "Chat visitor",
        email,
        message: context.slice(0, 4000),
        source: "chat",
        sessionId: sessionId?.slice(0, 40) ?? null,
      })
      .returning({ id: schema.contactMessages.id });

    // Automated thank-you (no-op without RESEND_API_KEY / when toggled off)
    // plus a new-lead notification to the owner. Both fire-and-forget.
    const content = await getSiteContent();
    void sendAutoReply({ id: row.id, name: "Chat visitor", email }, content);
    void sendLeadNotification(
      { name: "Chat visitor", email, message: context.slice(0, 4000), source: "chat" },
      content,
    );
  } catch (error) {
    console.error("chat lead capture failed", error);
  }
}

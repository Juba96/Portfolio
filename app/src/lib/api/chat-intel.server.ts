import { and, eq, gt } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ChatTurn } from "./chat-prompt";
import { getSiteContent } from "./content.server";
import { sendAutoReply } from "./email.server";

// Post-processing for chat exchanges: transcript logging and in-chat lead
// capture. Everything here is fire-and-forget — errors are logged and
// swallowed so the visitor's reply is never delayed or broken.

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// English + Arabic signals of client/hiring intent in the visitor's question.
const HIRING_RE =
  /\b(hire|hiring|job|recruit|freelance|collaborat|partner|project|budget|price|pricing|cost|quote|rate|work (with|together)|consult|opportunit|available|availability)\b|توظيف|وظيف|مشروع|تعاون|سعر|تكلفة|ميزانية|شراكة|استشار/i;

// Signals the AI declined/deflected — the visitor asked something the
// profile can't answer or that's off-topic. These are content gaps worth
// reviewing. Heuristic, so it errs on the side of catching redirects.
const UNANSWERED_RE =
  /\b(i (don'?t|do not) (know|have)|not something i|can'?t (answer|help with|share)|don'?t have (that|this|the) (info|information|detail)|reach out directly|outside (of )?my|unrelated to|i focus on|my (mind|focus) is (usually )?on|i('?m| am) all about|i (mainly|only|usually) (talk|answer|discuss)|let'?s (talk|stick to)|stick to|happy to (chat|talk) about my)\b|لا أعرف|ليس لدي|لا أستطيع|خارج نطاق|أركز على/i;

function classify(question: string, answer: string): string {
  if (EMAIL_IN_TEXT.test(question)) return "lead";
  if (HIRING_RE.test(question)) return "hiring";
  if (UNANSWERED_RE.test(answer)) return "unanswered";
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
      // The model's own off-topic marker beats the regex heuristics, but a
      // lead/hiring signal in the question still wins.
      tag: (() => {
        const heuristic = classify(question, answer);
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

    // Automated thank-you (no-op without RESEND_API_KEY / when toggled off).
    void sendAutoReply({ id: row.id, name: "Chat visitor", email }, await getSiteContent());
  } catch (error) {
    console.error("chat lead capture failed", error);
  }
}

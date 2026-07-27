// Rule-based topic buckets (EN + AR), shared by the Overview "what visitors
// ask about" insights and the conversation labels in the Chats inbox.
// Free and instant — no LLM call. Order matters: the first match names a
// conversation, so more specific topics come first.

export const TOPIC_RULES: { label: string; re: RegExp }[] = [
  { label: "AI & chatbots", re: /\b(ai|chatbot|chat ?bot|llm|gpt|machine learning|agent)\b|ذكاء|روبوت/i },
  { label: "Mobile apps", re: /\b(mobile|app|ios|android|flutter|react native)\b|تطبيق/i },
  { label: "Web & websites", re: /\b(website|web ?app|frontend|landing page|portfolio)\b|موقع/i },
  { label: "Telecom & VAS", re: /\b(telecom|vas|sms|operator|carrier|billing|dcb|zain|asiacell)\b|اتصالات/i },
  { label: "Pricing & rates", re: /\b(price|pricing|rate|cost|budget|quote|charge)\b|سعر|تكلفة|ميزانية/i },
  { label: "Hiring & collaboration", re: /\b(hire|hiring|job|freelance|collaborat|partner|work (with|together))\b|توظيف|تعاون|وظيف/i },
  { label: "Background & skills", re: /\b(experience|skills?|cv|resume|education|stud(y|ied)|certification|stack|degree)\b|خبرة|مهارات|دراسة|شهادة/i },
];

/** All topic labels matching a text (a question can touch several). */
export function topicsFor(text: string): string[] {
  return TOPIC_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.label);
}

/** The single best label for a conversation, or null if nothing matches. */
export function topicOf(text: string): string | null {
  return TOPIC_RULES.find((rule) => rule.re.test(text))?.label ?? null;
}

/** Stable, human-referenceable name for an anonymous conversation. */
export function visitorLabel(key: string): string {
  if (key.startsWith("legacy-")) return `Visitor #${key.slice(7)}`;
  return `Visitor ${key.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}`;
}

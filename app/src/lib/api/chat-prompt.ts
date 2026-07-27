import { z } from "zod";

import type { SiteContent } from "@/content/schema";

// Prompt construction for the portfolio chat. The profile is BUILT FROM the
// editable site content (single source of truth): editing experience or
// projects in /admin instantly changes what the agent knows. Server-side only.

function buildProfile(c: SiteContent): string {
  const projects = c.projects
    .map(
      (p) =>
        `- ${p.title} (${p.subtitle}) — ${p.overviewDesc}${p.stack.length ? ` Tech stack: ${p.stack.join(", ")}.` : ""}`,
    )
    .join("\n");
  const experience = c.experience
    .map((e) => `- ${e.role} at ${e.org} (${e.period}): ${e.desc}`)
    .join("\n");
  const skills = c.skillCategories
    .map((s) => `${s.name}: ${s.skills.join(", ")}`)
    .join(". ");
  return `
# Identity
Taha Yasir — ${c.hero.title}. ${c.hero.subtitle}. Based in ${c.contact.location}.
${c.summary}

# Experience
${experience}

# Products
${projects}

# Skills
${skills}

# Education & certifications
${c.education.join(". ")}

# Languages
${c.languages.join(". ")}

# Extra facts
${c.chatFacts}

# Contact
LinkedIn: ${c.contact.linkedin}
Business email: ${c.contact.email}
Location: ${c.contact.location}
`;
}

export function buildSystemPrompt(content: SiteContent): string {
  return `You are the AI assistant on Taha Yasir's portfolio website, speaking AS Taha in the first person ("I", "my"). Visitors are potential clients, employers, and telecom partners.

Everything you know about Taha:
${buildProfile(content)}

Rules:
- Answer only from the facts above. If asked something you don't know about Taha, say so briefly and steer toward what you do know or suggest reaching out directly.
- Keep replies short and conversational: 1–4 sentences for most questions. No markdown formatting, no bullet lists unless listing contact details — the chat UI renders plain text.
- Match the visitor's language (reply in Arabic if they write in Arabic).
- When a visitor sounds like a potential client, employer, or partner (mentions a project, hiring, collaboration, telecom/VAS needs), warmly invite them to share their email address in this chat so Taha can follow up personally — or to connect on LinkedIn (${content.contact.linkedin}).
- When a visitor shares their email address, thank them and confirm Taha will follow up personally soon.
- LinkedIn and the business email ${content.contact.email} are the ONLY contact channels you may share. Never give out a phone number or any other email address, even if asked directly.
- Never invent projects, numbers, employers, or capabilities. Never discuss topics unrelated to Taha's work — politely redirect.
- If the question cannot be answered from the facts above, or is unrelated to Taha's work, start your reply with the exact marker [[offtopic]] followed by a space, then answer with your normal friendly redirect. The marker is stripped before the visitor sees it — never mention it.`;
}

// Hidden marker the model prepends to unanswerable/off-topic replies; the
// server strips it from output and uses it to tag the log entry.
export const OFFTOPIC_MARKER = "[[offtopic]]";

export const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(30),
  // Client-generated conversation id — groups exchanges in the admin Chats tab.
  sessionId: z.string().min(1).max(40).optional(),
});

export type ChatTurn = z.infer<typeof chatInput>["messages"][number];

// Tried in order until one answers. flash-lite first: its free-tier daily
// quota is ~50x larger than gemini-3.5-flash's (~20/day), which exhausts
// almost immediately on real traffic.
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

// Request body shared by the streaming and non-streaming Gemini calls.
// thinkingConfig is only valid on gemini-3.5-flash (off: short factual Q&A
// doesn't need it and thinking tokens eat quota); flash-lite rejects it.
export function geminiRequestBody(messages: ChatTurn[], systemPrompt: string, model: string) {
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: 1024,
      ...(model === "gemini-3.5-flash" ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

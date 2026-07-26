import Anthropic from "@anthropic-ai/sdk";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import {
  GEMINI_MODELS,
  OFFTOPIC_MARKER,
  buildSystemPrompt,
  chatInput,
  geminiRequestBody,
  type ChatTurn,
} from "./chat-prompt";
import { captureChatLead, logChatExchange } from "./chat-intel.server";
import { getSiteContent } from "./content.server";
import { checkChatRequest } from "./rate-limit";

// Non-streaming portfolio chat — the fallback behind the streaming route
// (routes/api.chat.ts). API keys stay server-side (.env locally / Railway
// variables in prod); the browser only ever talks to server endpoints. When no
// provider is available the client falls back to its built-in keyword matcher,
// so the chat never breaks.

async function askGemini(
  messages: ChatTurn[],
  systemPrompt: string,
  apiKey: string,
): Promise<string | null> {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(geminiRequestBody(messages, systemPrompt, model)),
      },
    );
    if (!res.ok) {
      lastError = `${model} ${res.status}: ${await res.text()}`;
      continue;
    }
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  throw new Error(`Gemini API failed: ${lastError}`);
}

async function askClaude(messages: ChatTurn[], systemPrompt: string): Promise<string | null> {
  const response = await new Anthropic().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });
  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return reply || null;
}

export const askPortfolioChat = createServerFn({ method: "POST" })
  .inputValidator(chatInput)
  .handler(async ({ data }) => {
    // Same abuse guard as /api/chat — server functions are public HTTP
    // endpoints too. A rejected request degrades to the keyword fallback.
    if (checkChatRequest(getRequest())) return { reply: null };

    const systemPrompt = buildSystemPrompt(await getSiteContent());
    const question = data.messages[data.messages.length - 1]?.content ?? "";
    const finish = (rawReply: string | null, provider: string) => {
      // Strip the model's hidden off-topic marker; it drives the log tag.
      const offtopic = rawReply?.startsWith(OFFTOPIC_MARKER) ?? false;
      const reply = offtopic
        ? rawReply!.slice(OFFTOPIC_MARKER.length).replace(/^\s+/, "")
        : rawReply;
      if (reply)
        logChatExchange(question, reply, provider, data.sessionId, offtopic ? "unanswered" : undefined);
      void captureChatLead(data.messages, data.sessionId);
      return { reply };
    };

    // Provider chain: Gemini (free tier) → Claude Haiku (if key set) →
    // { reply: null }, which the client turns into the keyword fallback.
    if (process.env.GEMINI_API_KEY) {
      try {
        return finish(
          await askGemini(data.messages, systemPrompt, process.env.GEMINI_API_KEY),
          "gemini",
        );
      } catch (error) {
        console.error("portfolio chat: Gemini call failed", error);
      }
    }
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        return finish(await askClaude(data.messages, systemPrompt), "claude");
      } catch (error) {
        console.error("portfolio chat: Claude call failed", error);
      }
    }
    return { reply: null };
  });

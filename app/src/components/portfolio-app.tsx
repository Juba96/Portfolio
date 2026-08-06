"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useAnimationControls } from "motion/react";
import SmokeyCursor from "./lightswind/smokey-cursor";
import { Iphone16Pro } from "./lightswind/iphone16-pro";
import { FluidActionPanel } from "./lightswind/fluid-action-panel";
import { BorderBeam } from "./lightswind/border-beam";
import { TypingText } from "./lightswind/typing-text";
import { askPortfolioChat } from "@/lib/api/chat.functions";
import { submitLead } from "@/lib/api/leads.functions";
import type { Project, SiteContent } from "@/content/schema";

type View = "me" | "projects" | "skills" | "fun" | "contact";

// ---- Analytics (GA4) ----------------------------------------------------
// gtag ships only when VITE_GA_MEASUREMENT_ID is set at build; these helpers
// no-op otherwise. Never send message text or personal data.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// One conversation id per tab visit: kept in sessionStorage so view changes
// and reloads continue the same thread instead of splitting it.
function getChatSessionId(): string {
  const fresh = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem("chat-session-id");
    if (existing) return existing;
    const id = fresh();
    window.sessionStorage.setItem("chat-session-id", id);
    return id;
  } catch {
    return fresh();
  }
}

function track(name: string, params?: Record<string, string>) {
  if (typeof window !== "undefined") window.gtag?.("event", name, params ?? {});
}

// Virtual page view: the SPA keeps one URL, but GA page reports (incl.
// Realtime "Pages") should split by section — /projects, /skills, /chat …
function trackVirtualPage(path: string, title: string) {
  track("page_view", { page_path: path, page_title: title });
}

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

// Static fallback answers (used when the LLM is unreachable). Entries that
// depend on editable content are overridden per-render in PortfolioApp.
const knowledgeBase: { [key: string]: string } = {
  "who": "I'm Taha Yasir — an AI product builder with deep telecom roots. By day I'm Senior VAS & Product Development Manager working with Tier-1 operators across Iraq, Saudi Arabia, UAE, and Algeria; through Qaysariya, my product studio, I design and ship AI products end-to-end.",
  "about": "Based in Baghdad, I specialize in partner relationship management, technical integrations, and scalable platform delivery across E-Sports, Music, Video, Gaming, Fitness, and E-Learning.",
  "name": "I'm Taha Yasir — AI product builder, Senior VAS & Product Development Manager, and founder of Qaysariya Studio.",
  "experience": "7+ years across telecom and product development. Currently Senior VAS & Product Development Manager at Trendy Technologies (2022–present), managing partner onboarding across 4 markets. Previously IT Engineer at Metco (2018–2022) supporting Zain Iraq.",
  "skills": "Key strengths: Partner Development & Account Management, Direct Carrier Billing & Subscription Management, Stakeholder Management, Mobile Payments & Revenue Optimization, Technical Onboarding & API Integrations, and Project Delivery. I speak Arabic natively and English professionally.",
  "projects": "I've built 4 products under Qaysariya Studio: QuizQ (bilingual speed-quiz PWA with DCB), Ramba (car-wash subscription platform), OoredooAI (AI-powered VAS engine), and Voyalla (AI-driven travel content). I also led the Ooredoo Algeria Mega Promo Service launch and Khalaspay carrier billing integration.",
  "products": "Four products through Qaysariya: QuizQ, Ramba, OoredooAI, Voyalla — each solving a specific MENA market problem from gaming to fintech to travel.",
  "work": "I'm Senior VAS & Product Development Manager at Trendy Technologies, and I run Qaysariya Studio where I build AI products — QuizQ, Ramba, and OoredooAI are all studio work.",
  "contact": "📧 Taha@qaysariya.com\n🔗 linkedin.com/in/taha-algburi\n📍 Baghdad, Iraq",
  "email": "You can email me at Taha@qaysariya.com — or connect on LinkedIn: linkedin.com/in/taha-algburi.",
  "phone": "I keep calls off the site — email me at Taha@qaysariya.com or connect on LinkedIn (linkedin.com/in/taha-algburi) and we can take it from there.",
  "location": "Baghdad, Iraq 🇮🇶",
  "company": "Trendy Technologies and Qaysariya Studio.",
  "qaysariya": "Qaysariya is my independent product studio building AI-directed, monetized digital products for MENA markets. Products: QuizQ, Ramba, OoredooAI, Voyalla.",
  "quizq": "QuizQ is a bilingual true-or-false speed-quiz PWA monetized through Direct Carrier Billing. Flagship POC for the Anthropic Claude Partner Network, prepared for launch on Zain Iraq.",
  "ramba": "Ramba is a car-wash subscription platform for Iraq. Monthly plans redeemable across partner car washes. Integrated with Wayl payment API with automated settlement via FIB / ZainCash.",
  "ooredooai": "OoredooAI is an AI-powered VAS & customer-acquisition engine — MVP delivered to Ooredoo Tunisia and Algeria. Multi-channel targeting with AI-driven lead scoring and CPA optimization.",
  "voyalla": "Voyalla is an AI-driven travel content app that generates cinematic destination media through generative-AI video, voice, and character-driven storytelling.",
  "telecom": "Telecom VAS is my core domain. I work with Tier-1 operators (Ooredoo, Zain, Khalaspay) across Iraq, Saudi, UAE, and Algeria — partner onboarding, integrations, SLM, and end-to-end delivery.",
  "vas": "VAS (Value-Added Services) management is my specialty. End-to-end onboarding, integration requirements, SLM frameworks for billing & reporting, cross-functional team coordination.",
  "education": "Al-Iraqia University — College of Engineering, Networks Department (2014–2018). CS50 — Harvard University (2020). Recoded for Entrepreneurship (2018).",
  "certifications": "Avaya Certified Implementation Specialist (2020), Avaya Certified Support Specialist (2020), CS50 — Harvard University (2020), Recoded for Entrepreneurship (2018).",
  "languages": "Arabic — Native. English — Professional.",
  "hello": "Hey! 👋 Ask me anything about my work, projects, skills, or experience.",
  "hi": "Hey! 👋 Feel free to ask me anything. Try 'What projects have you built?'",
  "help": "Ask me about: projects, experience, skills, contact info, Qaysariya studio, or any specific product.",
  "what can you do": "I can answer questions about Taha's work, projects, skills, experience, and background.",
  "fun": "Outside of work, I love exploring new AI tools, following the MENA startup scene, and building side projects. I'm always experimenting with new technologies!",
  "hobby": "I enjoy building side projects, exploring new AI tools, and following the tech and startup scene across the Middle East.",
  "default": "I can answer questions about Taha's work, projects, skills, and experience. Try asking about his projects or telecom experience.",
};

function findAnswerIn(kb: { [key: string]: string }, question: string): string {
  const q = question.toLowerCase().trim();
  for (const key of Object.keys(kb)) {
    if (q.includes(key)) return kb[key];
  }
  return kb["default"];
}

// Content-derived overrides so offline answers stay in sync with /admin edits.
function contentKnowledge(c: SiteContent): { [key: string]: string } {
  const projectsLine = c.projects.map((p) => `${p.title} (${p.subtitle})`).join(", ");
  return {
    "experience": c.experience
      .map((e) => `${e.role} at ${e.org} (${e.period}).`)
      .join(" "),
    "projects": `I've built ${c.projects.length} products under Qaysariya Studio: ${projectsLine}.`,
    "products": `Products through Qaysariya: ${c.projects.map((p) => p.title).join(", ")}.`,
    "skills": `Key strengths: ${c.skillCategories.flatMap((s) => s.skills).join(", ")}. ${c.languages.join(", ").replace(/🇮🇶 |🇬🇧 /g, "")}.`,
    "contact": `📧 ${c.contact.email}\n🔗 ${c.contact.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}\n📍 ${c.contact.location}`,
    "email": `You can email me at ${c.contact.email} — or connect on LinkedIn: ${c.contact.linkedin}`,
    "phone": `I keep calls off the site — email me at ${c.contact.email} or connect on LinkedIn (${c.contact.linkedin}) and we can take it from there.`,
    "location": `${c.contact.location} 🇮🇶`,
    "education": c.education.join(". "),
  };
}

const suggestedQuestions = [
  "What projects have you built?",
  "What's your experience?",
  "What are your skills?",
  "How can I contact you?",
];


const navItems: { id: View; label: string; iconColor: string }[] = [
  { id: "me", label: "Me", iconColor: "#14b8a6" },
  { id: "projects", label: "Projects", iconColor: "#10b981" },
  { id: "skills", label: "Skills", iconColor: "#8b5cf6" },
  { id: "fun", label: "Fun", iconColor: "#ec4899" },
  { id: "contact", label: "Contact", iconColor: "#eab308" },
];

const NavIcon = ({ view, color }: { view: View; color: string }) => {
  const icons: Record<View, any> = {
    me: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-[22px] sm:h-[22px] md:w-6 md:h-6">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    ),
    projects: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-[22px] sm:h-[22px] md:w-6 md:h-6">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M8 6V4h8v2" />
      </svg>
    ),
    skills: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-[22px] sm:h-[22px] md:w-6 md:h-6">
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    fun: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-[22px] sm:h-[22px] md:w-6 md:h-6">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <circle cx="9" cy="10" r="0.5" fill={color} />
        <circle cx="15" cy="10" r="0.5" fill={color} />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
      </svg>
    ),
    contact: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-[22px] sm:h-[22px] md:w-6 md:h-6">
        <path d="M4 4h16v16H4z" />
        <path d="M4 7l8 5 8-5" />
      </svg>
    ),
  };
  return icons[view];
};

export function PortfolioApp({ content }: { content: SiteContent }) {
  const [view, setView] = useState<View>("me");
  // Offline keyword answers, with content-derived entries overriding statics.
  const kb = useMemo(
    () => ({ ...knowledgeBase, ...contentKnowledge(content) }),
    [content],
  );
  const findAnswer = (q: string) => findAnswerIn(kb, q);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Conversation history sent to the Claude server function (multi-turn
  // context). Kept in a ref: it's request payload, not render state.
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  // Anonymous conversation id — lets the admin dashboard group a visitor's
  // exchanges into one conversation. One id per tab visit (sessionStorage),
  // so navigating between views or reloading doesn't split the thread.
  const chatSessionRef = useRef<string>(getChatSessionId());
  const inputRef = useRef<HTMLInputElement>(null);
  // Desktop = precise hovering pointer. On touch devices the fluid cursor has
  // nothing to follow and only burns GPU/memory. (Component is client-only.)
  const [hasFinePointer] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );

  useEffect(() => {
    // Scroll ONLY the chat's own scroll container. scrollIntoView would also
    // scroll every scrollable ancestor — shifting the whole page up off the
    // viewport (the overflow-hidden root can still be scrolled by the browser).
    const scroller = messagesEndRef.current?.parentElement;
    if (scroller && showChat) {
      // Instant scroll: restarting a *smooth* scroll animation on every
      // typewriter tick thrashes the compositor on mobile.
      scroller.scrollTo({ top: scroller.scrollHeight });
    }
  }, [messages, isTyping, showChat]);

  // Prefetch all project screens once the page is idle, so the Projects
  // switcher and its auto-cycle never show a loading pop-in.
  useEffect(() => {
    const prefetch = () => {
      for (const p of content.projects) {
        for (const src of p.screens) {
          const img = new Image();
          img.src = src;
        }
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (idle) idle(prefetch);
    else setTimeout(prefetch, 1200);
  }, []);

  // Typewriter effect. Batches 4 chars per 40ms tick (~100 chars/sec) instead
  // of 1 char per 10ms — the old version forced ~100 full re-renders/sec,
  // which crashed mobile browsers mid-response on top of the WebGL cursor.
  const typeOutMessage = (text: string, id: number) => {
    setIsTyping(true);
    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + 4, text.length);
      const shown = text.slice(0, i);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: shown } : m)));
      if (i >= text.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 40);
  };

  // Stream the LLM reply from /api/chat into a live assistant bubble.
  // Returns the full reply text, or null when the client should fall back
  // (endpoint unavailable, upstream error, or empty stream). If the stream
  // dies midway with partial text already shown, the partial is kept.
  const streamAssistantReply = async (
    history: { role: "user" | "assistant"; content: string }[],
  ): Promise<string | null> => {
    let assistantId: number | null = null;
    let full = "";
    const showChunk = (text: string) => {
      if (assistantId === null) {
        assistantId = Date.now() + 1;
        const id = assistantId;
        setMessages((prev) => [...prev, { id, role: "assistant", content: text }]);
      } else {
        const id = assistantId;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: text } : m)));
      }
    };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20), sessionId: chatSessionRef.current }),
      });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        if (!piece) continue;
        full += piece;
        showChunk(full);
      }
    } catch {
      // Mid-stream failure: keep the partial but tell the visitor it was cut
      // off (an empty result still falls through to the fallback below).
      if (full.trim()) {
        full += "\n\n… connection dropped — ask again to continue.";
        showChunk(full);
      }
    }
    if (!full.trim()) {
      if (assistantId !== null) {
        const id = assistantId;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
      return null;
    }
    setIsTyping(false);
    return full;
  };

  const sendMessage = async (text: string) => {
    const content = text.trim();
    if (!content || isTyping) return;
    setShowChat(true);
    track("chat_message", { source: suggestedQuestions.includes(content) ? "chip" : "typed" });
    trackVirtualPage("/chat", "Chat");
    // Typing dots show while the request is in flight; the assistant bubble
    // appears with the first streamed chunk (or the fallback answer).
    setIsTyping(true);
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content }]);
    setInput("");
    const history = [...chatHistoryRef.current, { role: "user" as const, content }];

    // Quick questions are fixed strings with curated answers — reply
    // instantly instead of paying an LLM round trip.
    if (suggestedQuestions.includes(content)) {
      const answer = findAnswer(content);
      chatHistoryRef.current = [...history, { role: "assistant", content: answer }];
      await new Promise((r) => setTimeout(r, 350));
      const assistantId = Date.now() + 1;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      typeOutMessage(answer, assistantId);
      return;
    }

    // Free-typed questions: streamed LLM reply first, then the non-streaming
    // server function, then the keyword matcher — the chat always answers.
    const streamed = await streamAssistantReply(history);
    if (streamed) {
      chatHistoryRef.current = [...history, { role: "assistant", content: streamed }];
      return;
    }
    let answer: string;
    try {
      const res = await askPortfolioChat({
        data: { messages: history.slice(-20), sessionId: chatSessionRef.current },
      });
      answer = res.reply ?? findAnswer(content);
    } catch {
      answer = findAnswer(content);
    }
    chatHistoryRef.current = [...history, { role: "assistant", content: answer }];
    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    typeOutMessage(answer, assistantId);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const handleNavClick = (v: View) => {
    setView(v);
    setShowChat(false);
    // Keep messages, history, and the session id: coming back to the chat
    // continues the same conversation instead of starting a fragment.
    setInput("");
    trackVirtualPage(v === "me" ? "/" : `/${v}`, v);
  };

  return (
    <div className="h-dvh w-full flex flex-col bg-white text-black overflow-hidden relative">
      {/* Smokey cursor — behind content, liquid glass effect. Desktop only:
          it's a mouse effect, and the WebGL fluid sim's GPU/memory load was
          crashing mobile browsers during chat responses. */}
      {hasFinePointer && (
        <SmokeyCursor
          transparent={true}
          simulationResolution={128}
          dyeResolution={1024}
          densityDissipation={1}
          velocityDissipation={0.5}
          curl={3}
          splatRadius={0.2}
          splatForce={6000}
          pressure={0.1}
          pressureIterations={20}
          colorUpdateSpeed={10}
          backgroundColor={{ r: 1, g: 1, b: 1 }}
          enableShading={true}
          className="!z-0 !cursor-auto opacity-60"
        />
      )}

      {/* Massive watermark */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none select-none leading-none">
        <span className="text-[20vw] font-black text-black/[0.025] tracking-tighter whitespace-nowrap translate-y-[0.136em] block">
          TAHA
        </span>
      </div>

      {/* Info hub — morphing fluid action panel (replaces the old i-button modal) */}
      <FluidActionPanel position="top-right" contact={content.contact} />

      {/* Main content area. Mobile: scrollable so no view ever clips (m-auto
          keeps short content centered); desktop: fixed, centered. */}
      <main className="flex-1 flex px-3 md:px-10 relative z-10 overflow-y-auto md:overflow-hidden md:items-center md:justify-center">
        <AnimatePresence mode="wait">
          {!showChat && (
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl m-auto py-3 md:py-0"
            >
              {view === "me" && <MeView hero={content.hero} avatarUrl={content.avatarUrl} />}
              {view === "projects" && <ProjectsView projects={content.projects.filter((p) => p.screens.length > 0)} />}
              {view === "skills" && <SkillsView skillCategories={content.skillCategories} languages={content.languages} />}
              {view === "fun" && <FunView funItems={content.funItems} />}
              {view === "contact" && <ContactView contact={content.contact} />}
            </motion.div>
          )}

          {showChat && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xl m-auto py-3 md:py-0"
            >
              <ChatView
                messages={messages}
                isTyping={isTyping}
                messagesEndRef={messagesEndRef}
                contact={content.contact}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom section */}
      <footer className="relative z-20 px-3 md:px-10 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6 pt-1 md:pt-2">
        {/* Toggle / back button */}
        <div className="flex items-center justify-center mb-3">
          {showChat ? (
            <button
              onClick={() => { setShowChat(false); setMessages([]); }}
              className="text-xs text-gray-500 hover:text-black transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to {view === "me" ? "me" : view}
            </button>
          ) : (
            <button
              onClick={() => setShowQuickQuestions((s) => !s)}
              className="text-[10px] text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              {showQuickQuestions ? "Hide quick questions" : "Show quick questions"}
              <svg
                className={`w-3 h-3 transition-transform ${showQuickQuestions ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Quick questions */}
        <AnimatePresence>
          {showQuickQuestions && !showChat && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="flex flex-wrap justify-center gap-2 mb-3 max-w-md md:max-w-none mx-auto"
            >
              {suggestedQuestions.map((q, i) => (
                <motion.button
                  key={q}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.06 }}
                  onClick={() => sendMessage(q)}
                  className="quick-q-btn liquid-glass text-[11px] px-3 py-2 md:text-[10px] md:px-2.5 md:py-1.5 rounded-full text-gray-600 transition-all duration-300"
                >
                  {q}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav cards */}
        {!showChat && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center mb-3"
          >
            <div className="grid grid-cols-5 gap-2 w-full max-w-[360px] md:w-auto md:max-w-none md:flex md:items-stretch md:gap-3">
              {navItems.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.25 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => handleNavClick(item.id)}
                  whileHover={{ y: -3, scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={`nav-card liquid-glass flex flex-col items-center justify-center gap-1 w-full aspect-square md:aspect-auto md:w-[72px] md:h-[72px] lg:w-20 lg:h-20 rounded-xl md:rounded-[16px] transition-all duration-300 ease-out ${
                    view === item.id ? "liquid-glass-active nav-card-active" : ""
                  }`}
                >
                  <NavIcon view={item.id} color={item.iconColor} />
                  <span className="text-[10px] md:text-[11px] font-medium text-gray-600">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Chat input */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-sm sm:max-w-md mx-auto"
        >
          <div className="relative rounded-full">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Ask me anything"
              className="liquid-glass w-full rounded-full px-4 md:px-5 py-2.5 md:py-3.5 pr-12 md:pr-14 text-base md:text-sm placeholder:text-gray-400 focus:outline-none transition-all duration-300"
            />
            {/* Aurora typing placeholder — native placeholders are plain text
                only, so this overlay stands in while the input is empty. It
                retypes each time the field is cleared (remounts on !input).
                The aurora gradient is clipped to the typed letters. */}
            {!input && (
              <div className="pointer-events-none absolute inset-y-0 left-4 md:left-5 flex items-center text-base md:text-sm">
                <style>{`
                  @keyframes aurora-pan {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                  }
                `}</style>
                <TypingText
                  as="span"
                  loop
                  delay={0.3}
                  duration={1.5}
                  fontSize="text-[1em]"
                  fontWeight="font-normal"
                  color="text-transparent"
                  letterSpacing="tracking-normal"
                  className="bg-[linear-gradient(90deg,#22d3ee,#facc15,#4ade80,#a855f7,#22d3ee)] [background-size:300%_100%] bg-clip-text [animation:aurora-pan_10s_ease-in-out_infinite]"
                >
                  Ask me anything...
                </TypingText>
              </div>
            )}
            {/* Two counter-phased rainbow beams tracing the pill border. */}
            <BorderBeam
              size={64}
              duration={7}
              beamBorderRadius={26}
              borderThickness={2}
              colorFrom="#ff2daf"
              glowIntensity={2}
              style={{ backgroundImage: "linear-gradient(to left, #ff2daf, #ff8a00, #ffd60a, transparent)" }}
            />
            <BorderBeam
              size={64}
              duration={7}
              delay={3.5}
              beamBorderRadius={26}
              borderThickness={2}
              colorFrom="#22d3ee"
              glowIntensity={2}
              style={{ backgroundImage: "linear-gradient(to left, #22d3ee, #7b5bff, #34d399, transparent)" }}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="liquid-glass-dark absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 md:w-9 md:h-9 rounded-full text-white flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all duration-200"
              aria-label="Send"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </motion.form>

        <p className="text-center text-[9px] text-gray-500 mt-3 tracking-wider uppercase">
          Powered by AI
        </p>
      </footer>

    </div>
  );
}

/* ---------- Views ---------- */

function MeView({ hero, avatarUrl }: { hero: SiteContent["hero"]; avatarUrl: string }) {
  // Preserve the bold name styling when the greeting contains "Taha".
  const [greetPre, greetPost] = hero.greeting.includes("Taha")
    ? hero.greeting.split(/Taha(.*)/s)
    : [hero.greeting, undefined];
  return (
    <div className="text-center">
      {/* Y logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-center mb-4 md:mb-6"
      >
        <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl border border-black/10 bg-white flex items-center justify-center shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)]">
          <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-black">
            <path
              fill="currentColor"
              d="M12 2L6 18h4v4h4v-4h4L12 2zm0 4l3 7.5h-6L12 6z"
            />
          </svg>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="text-sm md:text-base mb-2 text-gray-700 font-medium"
      >
        {greetPost !== undefined ? (
          <>
            {greetPre}
            <span className="font-semibold text-black">Taha</span>
            {greetPost}
          </>
        ) : (
          hero.greeting
        )}
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-2 md:mb-4 leading-tight"
      >
        {hero.title}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-xs md:text-sm text-gray-500 mb-6 max-w-[300px] md:max-w-none mx-auto leading-relaxed [text-wrap:balance]"
      >
        {hero.subtitle}
      </motion.p>

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mb-2 md:mb-4"
      >
        <div className="w-44 h-44 sm:w-48 sm:h-48 md:w-52 md:h-52 mx-auto">
          <img
            src={avatarUrl}
            alt="Taha Yasir"
            width={416}
            height={416}
            fetchPriority="high"
            className="w-full h-full object-contain avatar-float"
          />
        </div>
      </motion.div>

      {/* Recruiter fast lane — zero-click scannable overview */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <a
            href="/overview"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full liquid-glass text-xs md:text-sm font-medium text-gray-700 hover:text-black transition-colors"
          >
            In a hurry? 60-second overview
            <span aria-hidden>→</span>
          </a>
          <a
            href="/resume.pdf"
            download="Taha-Yasir-Resume.pdf"
            onClick={() => track("resume_download")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full liquid-glass text-xs md:text-sm font-medium text-gray-700 hover:text-black transition-colors"
          >
            Résumé PDF
          </a>
        </div>
      </motion.div>
    </div>
  );
}

function ProjectsView({ projects }: { projects: Project[] }) {
  const [active, setActive] = useState(0);
  const [screenIdx, setScreenIdx] = useState(0);
  const p = projects[active];
  const goTo = (dir: number) =>
    setActive((a) => (a + dir + projects.length) % projects.length);

  useEffect(() => {
    track("project_view", { project: projects[active]?.title ?? "" });
  }, [active, projects]);

  // Slide/rotate pulse on the persistent phone when the active app changes.
  const phoneControls = useAnimationControls();
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      phoneControls.set({ opacity: 0, x: 40, rotate: 5 });
    } else {
      phoneControls.set({ opacity: 0.35, x: 40, rotate: 5 });
    }
    phoneControls.start({
      opacity: 1,
      x: 0,
      rotate: 0,
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    });
  }, [active, phoneControls]);

  // Warm every screen the moment Projects opens — switching apps or cycling
  // should never wait on the network.
  useEffect(() => {
    for (const proj of projects) {
      for (const src of proj.screens) {
        const img = new Image();
        img.src = src;
      }
    }
  }, []);

  // Auto-cycle through the active app's screens (QuizQ has several).
  useEffect(() => {
    setScreenIdx(0);
    if (projects[active].screens.length < 2) return;
    const t = setInterval(() => {
      setScreenIdx((i) => (i + 1) % projects[active].screens.length);
    }, 3500);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 tracking-tight text-center"
      >
        My Projects
      </motion.h2>

      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12">
        {/* The phone. ONE persistent mount — remounting the SVG per switch
            made Safari blank the whole layer (white flash) while the screen
            image decoded. The switch animation runs on this wrapper instead,
            and only the image href swaps. */}
        <div className="w-[132px] md:w-[150px] shrink-0">
          <motion.div
            animate={phoneControls}
            // Native-feel swipe between apps; vertical panning stays free
            // for page scroll.
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) goTo(1);
              else if (info.offset.x > 60) goTo(-1);
            }}
            style={{ touchAction: "pan-y" }}
          >
            <Iphone16Pro
              src={p.screens[screenIdx]}
              contentInsetTop={p.screenInsetTop ?? 0}
              screenBackground={p.screenInsetTop ? "#ffffff" : "#0a0a0a"}
              showIsland={p.frameIsland ?? true}
              showCamera={p.frameIsland ?? true}
              frameColor="titanium"
              bezelColor="#000000"
              shadow
              rounded
              // No filter shadow on phones: iOS Safari rasterizes the filter
              // against the layer's rectangular bounds while the element is
              // dragged/animated, painting a boxy shadow ghost behind the
              // device. (This className overrides the component's own
              // drop-shadow class.)
              className="w-full h-auto md:drop-shadow-2xl"
            />
          </motion.div>
        </div>

        {/* Project info — animates alongside the phone */}
        <AnimatePresence mode="wait">
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[280px] text-center md:text-left"
          >
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mb-1">
              {p.subtitle}
            </div>
            <h3 className="font-bold text-xl md:text-2xl mb-2">{p.title}</h3>
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">{p.desc}</p>
            {p.stack.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-1.5 mt-3">
                {p.stack.map((tech) => (
                  <span
                    key={tech}
                    className="px-2 py-0.5 rounded-full bg-gray-100 border border-black/5 text-[10px] font-medium text-gray-600"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* App switcher */}
      <div className="flex justify-center gap-2 mt-4 md:mt-6">
        {projects.map((proj, i) => (
          <button
            key={proj.title}
            onClick={() => setActive(i)}
            className={`liquid-glass px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300 ${
              i === active ? "liquid-glass-active text-black" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="mr-1">{proj.icon}</span>
            {proj.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillsView({
  skillCategories,
  languages,
}: {
  skillCategories: SiteContent["skillCategories"];
  languages: string[];
}) {
  return (
    <div className="max-w-xl mx-auto">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 tracking-tight text-center"
      >
        Skills &amp; Expertise
      </motion.h2>

      <div className="space-y-4">
        {skillCategories.map((cat, ci) => (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + ci * 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base">{cat.icon}</span>
              <h3 className="text-xs font-semibold text-gray-600">{cat.name}</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cat.skills.map((skill, si) => (
                <motion.span
                  key={skill}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 + ci * 0.1 + si * 0.04 }}
                  className="skill-pill text-[11px] font-medium px-2.5 py-1 rounded-full bg-black text-white cursor-default"
                >
                  {skill}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-6 flex items-center justify-center gap-2.5 text-[11px] text-gray-500"
      >
        {languages.map((lang) => (
          <span key={lang} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {lang}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function FunView({ funItems }: { funItems: SiteContent["funItems"] }) {
  return (
    <div className="max-w-xl mx-auto">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 tracking-tight text-center"
      >
        Fun Stuff
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {funItems.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4, scale: 1.03 }}
            className="rounded-2xl p-4 border border-black/10 bg-white hover:border-black/15 transition-all duration-300 text-center shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]"
          >
            <div className="text-3xl mb-2">{item.icon}</div>
            <h3 className="font-bold text-sm mb-2">{item.title}</h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">{item.desc}</p>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="text-center text-xs text-gray-500 mt-6"
      >
        Always curious, always building. 🚀
      </motion.p>
    </div>
  );
}

function ContactView({ contact }: { contact: SiteContent["contact"] }) {
  return (
    <div className="max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-2xl p-6 border border-black/10 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-xl font-bold tracking-tight">Contacts</h2>
          <span className="text-[11px] text-gray-500">@tahayasir</span>
        </div>

        <motion.a
          href={`mailto:${contact.email}`}
          onClick={() => track("email_click")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-blue-500 font-medium text-sm hover:text-blue-600 transition-colors inline-flex items-center gap-1 mb-6"
        >
          {contact.email}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.a>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-wrap gap-x-4 gap-y-2"
        >
          {["Email", "LinkedIn"].map((s) => (
            <a
              key={s}
              href={s === "Email" ? `mailto:${contact.email}` : contact.linkedin}
              onClick={() => track(s === "Email" ? "email_click" : "linkedin_click")}
              {...(s === "LinkedIn" ? { target: "_blank", rel: "noreferrer" } : {})}
              className="text-[12px] text-gray-500 hover:text-gray-800 transition-colors"
            >
              {s}
            </a>
          ))}
        </motion.div>
      </motion.div>

      {/* Lead form — writes to contact_messages via the rate-limited server fn */}
      <LeadForm />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="text-center text-xs text-gray-500 mt-6"
      >
        You can reach me super easily! Just hit me up via:
      </motion.p>
    </div>
  );
}

function LeadForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending" || state === "sent") return;
    setState("sending");
    try {
      const res = await submitLead({ data: { name, email, message } });
      setState(res.ok ? "sent" : "error");
      if (res.ok) track("lead_submitted");
    } catch {
      setState("error");
    }
  };

  const field =
    "w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-black/25 transition-colors";

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white rounded-2xl p-6 border border-black/10 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)] mt-4 text-left"
    >
      <h3 className="text-sm font-bold tracking-tight mb-3">Or leave me a message</h3>
      {state === "sent" ? (
        <p className="text-sm text-gray-600 py-2">
          Thanks! I got your message and I'll get back to you soon. 🙌
        </p>
      ) : (
        <div className="space-y-2.5">
          <input
            className={field}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
          <input
            className={field}
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={320}
          />
          <textarea
            className={`${field} resize-none`}
            placeholder="What can I help you with?"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send message"}
          </button>
          {state === "error" && (
            <p className="text-xs text-red-500">
              Couldn't send right now — please email me instead.
            </p>
          )}
        </div>
      )}
    </motion.form>
  );
}

// Matches URLs and email addresses inside assistant replies so they render
// as tappable chips instead of raw text.
const CHAT_LINK_RE = /(https?:\/\/[^\s)]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function AssistantText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(CHAT_LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    // Trailing punctuation belongs to the sentence, not the link.
    let token = match[0];
    const trimmed = token.replace(/[.,;:!?)]+$/, "");
    const trailing = token.slice(trimmed.length);
    token = trimmed;
    const isEmail = !token.startsWith("http");
    const href = isEmail ? `mailto:${token}` : token;
    const label = isEmail
      ? token
      : /linkedin\.com/i.test(token)
        ? "LinkedIn"
        : token.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    parts.push(
      <a
        key={key++}
        href={href}
        target={isEmail ? undefined : "_blank"}
        rel="noreferrer"
        onClick={() => track(isEmail ? "email_click" : /linkedin/i.test(token) ? "linkedin_click" : "chat_link_click")}
        className="inline-flex items-center gap-1 px-2 py-[1px] mx-0.5 rounded-full bg-white border border-black/10 text-blue-600 font-medium text-[12px] align-middle hover:border-blue-300 hover:bg-blue-50 transition-colors break-all"
      >
        {label}
      </a>,
    );
    if (trailing) parts.push(trailing);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ChatView({
  messages,
  isTyping,
  messagesEndRef,
  contact,
}: {
  messages: Message[];
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  contact: SiteContent["contact"];
}) {
  return (
    <div className="h-[55dvh] flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 px-1">
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            // When the assistant invites the visitor to connect, surface the
            // contact channels as real buttons under the bubble.
            const offersContact =
              !isUser &&
              (/linkedin\.com/i.test(msg.content) ||
                msg.content.toLowerCase().includes(contact.email.toLowerCase()));
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    isUser
                      ? "bg-blue-500 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-800 rounded-bl-md"
                  }`}
                >
                  {isUser ? msg.content : <AssistantText text={msg.content} />}
                </div>
                {offersContact && (
                  <div className="flex flex-wrap gap-2 mt-1.5 max-w-[82%]">
                    <a
                      href={contact.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => track("linkedin_click")}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#0a66c2] text-white text-[12px] font-semibold hover:bg-[#0a5cb0] transition-colors active:scale-[0.98]"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
                        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05a3.75 3.75 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.32 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zm1.78 13.02H3.54V9h3.56v11.45z" />
                      </svg>
                      Connect on LinkedIn
                    </a>
                    <a
                      href={`mailto:${contact.email}`}
                      onClick={() => track("email_click")}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white border border-black/10 text-gray-800 text-[12px] font-semibold hover:border-black/30 transition-colors active:scale-[0.98]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 7 9 6 9-6" />
                      </svg>
                      Email Taha
                    </a>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dot-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dot-2" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dot-3" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

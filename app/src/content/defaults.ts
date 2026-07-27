import type { SiteContent } from "./schema";

// Built-in content — exactly what the site shipped with before the CMS.
// Used when the DB has no saved content (or is unreachable): the portfolio
// can never render broken because of the CMS. Saved edits deep-merge over this.

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    greeting: "Hey, I'm Taha 👋",
    title: "AI Product Builder",
    subtitle:
      "Senior VAS & Product Development Manager · 7+ years in telecom across MENA",
  },
  avatarUrl: "/assets/avatar.png",
  summary:
    "7+ years shipping carrier billing, VAS, and AI products across MENA with Tier-1 operators (Ooredoo, Zain, Khalaspay). I manage partner ecosystems and technical integrations by day, and design, build, and launch AI products end-to-end through my studio, Qaysariya.",
  projects: [
    {
      title: "QuizQ",
      subtitle: "Gamified Trivia App",
      tag: "Gamified Trivia · DCB",
      icon: "🎮",
      color: "from-[#C21F2E] to-[#7a1020]",
      desc: "Arabic-first trivia game — timed questions, monthly leaderboards, and real prizes like phones and cash, with game tokens paid via carrier billing.",
      overviewDesc:
        "Arabic-first speed-quiz PWA with real prizes; game tokens paid via Direct Carrier Billing. Claude Partner Network POC, prepared for launch on Zain Iraq.",
      screens: [
        "/assets/quizq/screens/home-light.png",
        "/assets/quizq/screens/game-light.png",
        "/assets/quizq/screens/prizes-light.png",
      ],
      screenInsetTop: 60,
    },
    {
      title: "Ramba",
      subtitle: "Car-Wash Platform",
      tag: "Subscriptions · Payments",
      icon: "🚗",
      color: "from-emerald-500 to-teal-600",
      desc: "Car-wash subscriptions for Iraq — wash plans, live queue tracking with Dynamic Island updates, nearby partner shops, and mobile-wallet payments.",
      overviewDesc:
        "Car-wash subscription platform for Iraq — plans redeemable across partner shops, live queue tracking, Wayl payments with FIB / ZainCash settlement.",
      screens: [
        "/assets/ramba/screens/home.png",
        "/assets/ramba/screens/queue.png",
        "/assets/ramba/screens/washing.png",
      ],
      frameIsland: false,
    },
    {
      title: "OoredooAI",
      subtitle: "Telco AI Assistant",
      tag: "Telco AI · VAS",
      icon: "🤖",
      color: "from-rose-500 to-pink-600",
      desc: "AI assistant for Ooredoo subscribers — bilingual chat, balance and data queries, image generation, and daily or weekly plans billed straight to phone credit.",
      overviewDesc:
        "AI-powered VAS & customer-acquisition engine — MVP delivered to Ooredoo Tunisia and Algeria. Bilingual chat, balance queries, plans billed to phone credit.",
      screens: [
        "/assets/ooredooai/screens/chat.png",
        "/assets/ooredooai/screens/balance.png",
        "/assets/ooredooai/screens/plans.png",
      ],
      frameIsland: false,
    },
    {
      title: "Voyalla",
      subtitle: "AI Travel Content",
      tag: "GenAI · Travel Content",
      icon: "✈️",
      color: "from-sky-500 to-indigo-600",
      desc: "AI-driven travel content app that generates cinematic destination media through generative-AI video, voice, and character-driven storytelling.",
      overviewDesc:
        "AI-driven travel content app generating cinematic destination media with generative video, voice, and character-driven storytelling.",
      screens: [],
    },
  ],
  experience: [
    {
      period: "2022 — Present",
      role: "Senior VAS & Product Development Manager",
      org: "Trendy Technologies",
      desc: "Partner onboarding, technical integrations, and SLM frameworks with Tier-1 operators across Iraq, Saudi Arabia, UAE, and Algeria. Led the Ooredoo Algeria Mega Promo launch and the Khalaspay carrier-billing integration.",
    },
    {
      period: "2022 — Present",
      role: "Founder",
      org: "Qaysariya Studio",
      desc: "Independent product studio designing and shipping AI-directed, monetized digital products for MENA markets end-to-end — QuizQ, Ramba, OoredooAI, Voyalla.",
    },
    {
      period: "2018 — 2022",
      role: "IT Engineer",
      org: "Metco (supporting Zain Iraq)",
      desc: "Telecom infrastructure and enterprise support for one of Iraq's largest operators.",
    },
  ],
  skillCategories: [
    {
      name: "Product & Partnerships",
      icon: "🤝",
      skills: [
        "Partner Development",
        "Account Management",
        "Product Strategy",
        "Stakeholder Management",
        "Project Delivery",
      ],
    },
    {
      name: "Telecom & VAS",
      icon: "📡",
      skills: [
        "Direct Carrier Billing",
        "Subscription Management",
        "USSD / SMS / WhatsApp",
        "Tier-1 Integrations",
        "Revenue Optimization",
      ],
    },
    {
      name: "Technology",
      icon: "⚡",
      skills: [
        "API Integrations",
        "PWA Development",
        "AI Product Design",
        "Payment Systems",
        "Mobile Payments",
      ],
    },
  ],
  overviewSkills: [
    "Direct Carrier Billing",
    "VAS & Subscription Management",
    "Partner Development",
    "Mobile Payments",
    "API Integrations & Onboarding",
    "AI Product Development",
    "Stakeholder Management",
    "Project Delivery",
    "Arabic (native) · English (professional)",
  ],
  languages: ["🇮🇶 Arabic — Native", "🇬🇧 English — Professional"],
  funItems: [
    {
      title: "Side Projects",
      desc: "Always building something new — from AI tools to mini apps",
      icon: "🛠️",
    },
    {
      title: "MENA Startup Scene",
      desc: "Passionate about the growing tech ecosystem across the Middle East",
      icon: "🚀",
    },
    {
      title: "AI Exploration",
      desc: "Constantly experimenting with new AI models and workflows",
      icon: "🧪",
    },
  ],
  education: [
    "Al-Iraqia University — College of Engineering, Networks (2014–2018)",
    "CS50 — Harvard University (2020)",
    "Avaya Certified Implementation & Support Specialist (2020)",
    "Recoded for Entrepreneurship (2018)",
  ],
  contact: {
    email: "Taha@qaysariya.com",
    linkedin: "https://www.linkedin.com/in/taha-algburi/",
    location: "Baghdad, Iraq",
  },
  chatFacts:
    "QuizQ is the flagship POC for the Anthropic Claude Partner Network. Ramba integrates the Wayl payment API with automated settlement via FIB / ZainCash. OoredooAI includes AI-driven lead scoring and CPA optimization. Also led the Ooredoo Algeria Mega Promo Service launch and the Khalaspay carrier billing integration.",
  crm: {
    autoReplyEnabled: true,
    autoReplySubject: "Thanks for reaching out — Taha Yasir",
    autoReplyBody:
      "Hi {{name}},\n\nThanks for getting in touch through my portfolio — I've received your message and I'll get back to you personally within a day.\n\nIn the meantime, feel free to check my work at https://taha.qaysariya.com/overview or connect on LinkedIn: https://www.linkedin.com/in/taha-algburi/\n\nBest,\nTaha Yasir\nAI Product Builder · Qaysariya Studio",
  },
};

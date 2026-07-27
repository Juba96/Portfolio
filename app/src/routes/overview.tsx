import { Link, createFileRoute } from "@tanstack/react-router";

import { fetchSiteContent } from "../lib/api/content.functions";

// Zero-click scannable overview — the recruiter fast lane. Everything worth
// knowing in one scroll: summary, projects, experience, skills, education,
// contact. Server-rendered (no ClientOnly, no motion) so it paints instantly
// and reads well for crawlers too. All copy comes from the editable site
// content (loader), so /admin edits appear without a redeploy.

export const Route = createFileRoute("/overview")({
  loader: () => fetchSiteContent(),
  head: () => ({
    meta: [
      { title: "Taha Yasir — Overview" },
      {
        name: "description",
        content:
          "One-page overview of Taha Yasir — AI Product Builder & Senior VAS Product Manager. Products, experience, skills, and contact in a 60-second scroll.",
      },
      { property: "og:title", content: "Taha Yasir — Overview" },
    ],
    links: [{ rel: "canonical", href: "https://taha.qaysariya.com/overview" }],
  }),
  component: OverviewPage,
});

function trackEvent(name: string) {
  if (typeof window !== "undefined") window.gtag?.("event", name, {});
}

function OverviewPage() {
  const c = Route.useLoaderData();
  const linkedinLabel = c.contact.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    // html/body are overflow:hidden globally (the interactive app is a fixed
    // viewport) — this page scrolls inside its own full-height container.
    // print: variants let the same page render as the PDF résumé.
    <div className="h-dvh w-full overflow-y-auto bg-white text-black print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        {/* Header */}
        <header className="flex items-center gap-5">
          <img
            src={c.avatarUrl}
            alt="Taha Yasir"
            className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover bg-gray-100"
          />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Taha Yasir</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              {c.hero.title} · {c.experience[0]?.role}
            </p>
            <p className="text-xs md:text-sm text-gray-400 mt-1">{c.contact.location} · MENA-wide</p>
            {/* Print/PDF only — the interactive buttons are hidden in print */}
            <p className="hidden print:block text-xs text-gray-600 mt-1">
              {c.contact.email} · {linkedinLabel}
            </p>
          </div>
        </header>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <a
            href={c.contact.linkedin}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackEvent("linkedin_click")}
            className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Connect on LinkedIn
          </a>
          <a
            href={`mailto:${c.contact.email}`}
            onClick={() => trackEvent("email_click")}
            className="px-5 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            {c.contact.email}
          </a>
          <a
            href="/resume.pdf"
            download="Taha-Yasir-Resume.pdf"
            onClick={() => trackEvent("resume_download")}
            className="px-5 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            Download résumé (PDF)
          </a>
          <Link
            to="/"
            className="px-5 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            Interactive portfolio →
          </Link>
        </div>

        {/* Summary */}
        <p className="mt-8 text-[15px] leading-relaxed text-gray-700 [text-wrap:pretty]">
          {c.summary}
        </p>

        {/* Projects */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            Products I&apos;ve built
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {c.projects.map((p) => (
              <div
                key={p.title}
                className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4"
              >
                {p.screens[0] ? (
                  <img
                    src={p.screens[0]}
                    alt={`${p.title} screen`}
                    className="w-16 h-28 rounded-lg object-cover object-top shrink-0 bg-white border border-gray-100"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-16 h-28 rounded-lg shrink-0 bg-white border border-gray-100 flex items-center justify-center text-2xl">
                    {p.icon}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-bold text-[15px]">{p.title}</h3>
                  </div>
                  <p className="text-[11px] font-medium text-gray-400 mt-0.5">{p.tag}</p>
                  <p className="text-[13px] leading-snug text-gray-600 mt-1.5">{p.overviewDesc}</p>
                  {p.stack.length > 0 && (
                    <p className="text-[11px] leading-snug text-gray-400 mt-1.5">
                      {p.stack.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            Experience
          </h2>
          <div className="space-y-5">
            {c.experience.map((e) => (
              <div key={e.role} className="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] gap-3">
                <div className="text-[12px] text-gray-400 pt-0.5 whitespace-nowrap">{e.period}</div>
                <div>
                  <h3 className="font-semibold text-[15px]">
                    {e.role} <span className="text-gray-400 font-normal">· {e.org}</span>
                  </h3>
                  <p className="text-[13px] leading-snug text-gray-600 mt-1">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {c.overviewSkills.map((s) => (
              <span
                key={s}
                className="px-3 py-1.5 rounded-full bg-gray-100 text-[12px] font-medium text-gray-700"
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* Education */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            Education &amp; certifications
          </h2>
          <ul className="text-[13px] leading-relaxed text-gray-600 space-y-1">
            {c.education.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {/* Footer CTA */}
        <footer className="mt-12 pt-6 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-[13px] text-gray-500">
            Want the full experience? Try the AI-powered interactive portfolio.
          </p>
          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-black text-white text-[13px] font-medium hover:bg-gray-800 transition-colors"
          >
            Open it →
          </Link>
        </footer>
      </div>
    </div>
  );
}

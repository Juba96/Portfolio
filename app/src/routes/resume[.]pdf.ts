import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { getSiteContent } from "@/lib/api/content.server";

// /resume.pdf — generated on request from the live site content, so the
// downloadable CV always matches the dashboard: summary, experience,
// projects, skills, education, and languages included. Replaces the old
// static public/resume.pdf, which drifted out of date.

const NAME = "Taha Yasir";
const SITE = "taha.qaysariya.com";

const A4: [number, number] = [595.28, 841.89];
const M = 50; // page margin
const INK = rgb(0.07, 0.07, 0.08);
const GRAY = rgb(0.42, 0.44, 0.47);
const LIGHT = rgb(0.85, 0.86, 0.88);

// Standard PDF fonts only encode WinAnsi — map curly punctuation down and
// drop anything else (emoji, Arabic) rather than crash.
function sanitize(text: string): string {
  return text
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const probe = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(probe, size) > max) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildResumePdf(): Promise<Uint8Array> {
  const content = await getSiteContent();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${NAME} — Resume`);
  pdf.setAuthor(NAME);
  pdf.setCreator(SITE);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [W, H] = A4;
  const maxW = W - M * 2;
  let page: PDFPage = pdf.addPage(A4);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage(A4);
      y = H - M;
    }
  };

  const para = (
    raw: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; leading?: number; x?: number; max?: number } = {},
  ) => {
    const { size = 9.5, font = regular, color = INK, leading = 1.45, x = M, max = maxW } = opts;
    const lineH = size * leading;
    for (const line of wrap(sanitize(raw), font, size, max)) {
      ensure(lineH);
      y -= lineH;
      page.drawText(line, { x, y, size, font, color });
    }
  };

  const gap = (px: number) => {
    y -= px;
  };

  const section = (title: string) => {
    // Room for the header plus at least one entry, so a section title never
    // sits orphaned at the bottom of a page.
    ensure(80);
    gap(18);
    page.drawText(title.toUpperCase(), { x: M, y: y - 8, size: 8.5, font: bold, color: GRAY });
    y -= 12;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: LIGHT });
    gap(4);
  };

  // ---- header ----
  y -= 24;
  page.drawText(NAME, { x: M, y, size: 25, font: bold, color: INK });
  gap(18);
  para(`${content.hero.title} — ${content.hero.subtitle}`, { size: 10.5, color: GRAY, leading: 1.35 });
  gap(6);
  const linkedin = content.contact.linkedin.replace(/^https?:\/\/(www\.)?/, "");
  para(`${content.contact.email}  ·  ${linkedin}  ·  ${content.contact.location}  ·  ${SITE}`, {
    size: 8.5,
    color: GRAY,
  });
  gap(6);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: INK });

  // ---- summary ----
  gap(10);
  para(content.summary, { size: 9.5, leading: 1.5 });

  // ---- experience ----
  section("Experience");
  for (const job of content.experience) {
    ensure(40);
    gap(10);
    const period = sanitize(job.period);
    const periodW = regular.widthOfTextAtSize(period, 8.5);
    y -= 12;
    page.drawText(sanitize(job.role), { x: M, y, size: 10.5, font: bold, color: INK });
    page.drawText(period, { x: W - M - periodW, y: y + 1, size: 8.5, font: regular, color: GRAY });
    gap(3);
    para(job.org, { size: 9, color: GRAY });
    gap(2);
    para(job.desc, { size: 9, leading: 1.45 });
  }

  // ---- projects ----
  if (content.projects.length > 0) {
    section("Selected Products");
    for (const project of content.projects) {
      ensure(34);
      gap(9);
      y -= 12;
      page.drawText(sanitize(`${project.title} — ${project.tag}`), {
        x: M,
        y,
        size: 10,
        font: bold,
        color: INK,
      });
      gap(2);
      para(project.overviewDesc || project.desc, { size: 9, leading: 1.45 });
    }
  }

  // ---- skills ----
  section("Skills");
  if (content.skillCategories.length > 0) {
    for (const category of content.skillCategories) {
      gap(6);
      para(`${category.name}:  ${category.skills.join(", ")}`, { size: 9, leading: 1.45 });
    }
  } else {
    gap(6);
    para(content.overviewSkills.join("  ·  "), { size: 9, leading: 1.5 });
  }

  // ---- education ----
  if (content.education.length > 0) {
    section("Education");
    for (const line of content.education) {
      gap(5);
      para(line, { size: 9, leading: 1.45 });
    }
  }

  // ---- languages ----
  if (content.languages.length > 0) {
    section("Languages");
    gap(6);
    para(content.languages.join("  ·  "), { size: 9 });
  }

  return pdf.save();
}

export const Route = createFileRoute("/resume.pdf")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const bytes = await buildResumePdf();
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'inline; filename="Taha-Yasir-Resume.pdf"',
              // Always fresh so dashboard edits show up immediately.
              "cache-control": "no-cache",
            },
          });
        } catch (error) {
          console.error("resume generation failed", error);
          return new Response("Resume temporarily unavailable", { status: 500 });
        }
      },
    },
  },
});

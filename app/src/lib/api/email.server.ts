import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { SiteContent } from "@/content/schema";

// Automated thank-you email to new leads, via Resend. Fully dormant until
// RESEND_API_KEY is set (Railway variables / .env) AND the CRM toggle in the
// admin Content tab is on. Fire-and-forget: a failed send never affects lead
// capture, and each lead is emailed at most once (autoRepliedAt guard).
//
// Setup (one-time): resend.com free account → Domains → add qaysariya.com →
// add the DNS records Resend shows into Cloudflare → create API key →
// RESEND_API_KEY in Railway + app/.env.

const FROM = "Taha Yasir <hello@qaysariya.com>";

export async function sendAutoReply(
  lead: { id: number; name: string; email: string },
  content: SiteContent,
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !content.crm.autoReplyEnabled) return;

    const name = lead.name && lead.name !== "Chat visitor" ? lead.name : "there";
    const body = content.crm.autoReplyBody.replaceAll("{{name}}", name);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        reply_to: content.contact.email,
        subject: content.crm.autoReplySubject,
        text: body,
      }),
    });
    if (!res.ok) {
      console.error("auto-reply send failed", res.status, await res.text());
      return;
    }
    await db()
      .update(schema.contactMessages)
      .set({ autoRepliedAt: new Date() })
      .where(eq(schema.contactMessages.id, lead.id));
  } catch (error) {
    console.error("auto-reply error", error);
  }
}

// New-lead notification to the site owner (content.contact.email), so leads
// can be followed up without checking the admin panel. Dormant without
// RESEND_API_KEY, independent of the auto-reply toggle. Reply-to is the lead,
// so replying from the inbox answers them directly.
export async function sendLeadNotification(
  lead: { name: string; email: string; message: string; source: string },
  content: SiteContent,
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const sourceLabel = lead.source === "chat" ? "AI chat" : "contact form";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [content.contact.email],
        reply_to: lead.email,
        subject: `New lead: ${lead.name} — ${lead.email}`,
        text: `New lead from the portfolio ${sourceLabel}.\n\nName: ${lead.name}\nEmail: ${lead.email}\n\nMessage:\n${lead.message}\n\nReply to this email to answer them directly, or manage leads at https://taha.qaysariya.com/admin`,
      }),
    });
    if (!res.ok) {
      console.error("lead notification send failed", res.status, await res.text());
    }
  } catch (error) {
    console.error("lead notification error", error);
  }
}

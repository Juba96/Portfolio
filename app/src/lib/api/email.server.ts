import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { SiteContent } from "@/content/schema";

// Lead emails via Resend, fully dormant until RESEND_API_KEY is set (Railway
// variables / .env). Two sends per new lead, threaded together:
//   1. Automated thank-you to the lead (needs the CRM toggle in the admin
//      Content tab on) — stamped with a Message-ID we control.
//   2. New-lead notification to the owner (content.contact.email), sent as a
//      reply *in that same thread* (In-Reply-To/References + same subject),
//      with reply-to set to the lead. Replying from the inbox therefore lands
//      in the lead's existing thank-you thread instead of starting a new one.
// Fire-and-forget: a failed send never affects lead capture, and each lead is
// auto-replied at most once (autoRepliedAt guard).
//
// Setup (one-time): resend.com free account → Domains → add qaysariya.com →
// add the DNS records Resend shows into Cloudflare → create API key →
// RESEND_API_KEY in Railway + app/.env.

const FROM = "Taha Yasir <hello@qaysariya.com>";

type NewLead = {
  id: number;
  name: string;
  email: string;
  message: string;
  source: string;
};

// Entry point for both lead sources (form + chat): thank the lead, then
// notify the owner in the same thread when the thank-you actually went out.
export async function handleNewLead(lead: NewLead, content: SiteContent): Promise<void> {
  const messageId = await sendAutoReply(lead, content);
  await sendLeadNotification(lead, content, messageId);
}

// Sends the automated thank-you and returns its real Message-ID (assigned by
// Resend/SES — custom Message-ID headers are overridden, so it must be read
// back from GET /emails/{id}, available a couple of seconds after the send).
// Returns null when the send was skipped (no key / toggle off) or failed.
async function sendAutoReply(
  lead: { id: number; name: string; email: string },
  content: SiteContent,
): Promise<string | null> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !content.crm.autoReplyEnabled) return null;

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
      return null;
    }
    const { id: emailId } = (await res.json()) as { id: string };
    await db()
      .update(schema.contactMessages)
      .set({ autoRepliedAt: new Date() })
      .where(eq(schema.contactMessages.id, lead.id));
    return await fetchMessageId(emailId, apiKey);
  } catch (error) {
    console.error("auto-reply error", error);
    return null;
  }
}

// Polls Resend for the Message-ID it assigned to a sent email. Runs in the
// fire-and-forget background path, so a few seconds of waiting is fine.
async function fetchMessageId(emailId: string, apiKey: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const { message_id } = (await res.json()) as { message_id?: string | null };
    if (message_id) return message_id;
  }
  console.error("could not resolve Message-ID for email", emailId);
  return null;
}

// New-lead notification to the site owner, so leads can be followed up without
// checking the admin panel. Independent of the auto-reply toggle: with
// inReplyTo it joins the thank-you thread; without it (auto-reply skipped or
// failed) it goes out standalone with a "New lead" subject.
async function sendLeadNotification(
  lead: { name: string; email: string; message: string; source: string },
  content: SiteContent,
  inReplyTo: string | null,
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
        // Same subject as the thank-you so mail clients keep the reply in the
        // lead's thread; the lead's details live in the body instead.
        subject: inReplyTo
          ? `Re: ${content.crm.autoReplySubject}`
          : `New lead: ${lead.name} — ${lead.email}`,
        text: `New lead from the portfolio ${sourceLabel}.\n\nName: ${lead.name}\nEmail: ${lead.email}\n\nMessage:\n${lead.message}\n\nReply to this email to answer them in the same thread as the automated thank-you, or manage leads at https://taha.qaysariya.com/admin`,
        ...(inReplyTo && {
          headers: { "In-Reply-To": inReplyTo, References: inReplyTo },
        }),
      }),
    });
    if (!res.ok) {
      console.error("lead notification send failed", res.status, await res.text());
    }
  } catch (error) {
    console.error("lead notification error", error);
  }
}

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { db, schema } from "@/db";
import { getSiteContent } from "./content.server";
import { sendAutoReply, sendLeadNotification } from "./email.server";
import { checkChatRequest } from "./rate-limit";

// Public contact-form submission → a lead in contact_messages (source 'form').
// Rate-limited with the same guard as the chat endpoints. Write-only: there is
// deliberately no public read function.
export const submitLead = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(200),
      email: z.string().email().max(320),
      message: z.string().min(1).max(4000),
    }),
  )
  .handler(async ({ data }) => {
    if (checkChatRequest(getRequest())) return { ok: false };
    const [row] = await db()
      .insert(schema.contactMessages)
      .values({ ...data, source: "form" })
      .returning({ id: schema.contactMessages.id });

    // Automated thank-you (no-op without RESEND_API_KEY / when toggled off)
    // plus a new-lead notification to the owner. Both fire-and-forget.
    const content = await getSiteContent();
    void sendAutoReply({ id: row.id, name: data.name, email: data.email }, content);
    void sendLeadNotification({ ...data, source: "form" }, content);
    return { ok: true };
  });

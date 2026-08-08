import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { db, schema } from "@/db";
import { getSiteContent } from "./content.server";
import { handleNewLead } from "./email.server";
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

    // Thank-you to the lead + threaded owner notification, fire-and-forget.
    void handleNewLead({ id: row.id, ...data, source: "form" }, await getSiteContent());
    return { ok: true };
  });

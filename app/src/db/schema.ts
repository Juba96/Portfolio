import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Run `bun run db:push` after changing this file (dev) or
// `bun run db:generate` + `bun run db:migrate` (versioned migrations).

// Leads — from the contact form ('form') or detected in AI chat ('chat').
// status drives the follow-up workflow in /admin: new → contacted → closed.
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  source: varchar("source", { length: 20 }).notNull().default("form"),
  // Owner's private follow-up notes, edited from the CRM view in /admin.
  notes: text("notes"),
  // For chat-captured leads: the chat session they came from, so the
  // dashboard can show the full conversation next to the lead.
  sessionId: varchar("session_id", { length: 40 }),
  // Set when the automated thank-you email was sent (null = not sent).
  autoRepliedAt: timestamp("auto_replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every AI-chat exchange (anonymous — no IPs or identities stored).
// sessionId groups exchanges into one visitor conversation; tag is a
// rule-based importance signal computed at log time:
//   lead — visitor shared an email · hiring — client/job intent detected ·
//   unanswered — the AI couldn't answer (content gap) · general — the rest.
export const chatLogs = pgTable("chat_logs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 40 }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  tag: varchar("tag", { length: 20 }).notNull().default("general"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Singleton editable site content (id always 1). Shape = siteContentSchema.
export const siteContent = pgTable("site_content", {
  id: integer("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Rollback safety net: previous content versions (trimmed to the last 20).
export const contentRevisions = pgTable("content_revisions", {
  id: serial("id").primaryKey(),
  data: jsonb("data").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin password (argon2id hash), singleton row id=1. When present it is the
// ONLY accepted password; the ADMIN_PASSWORD env var is just the bootstrap
// credential used until the first in-dashboard password change.
export const adminCredentials = pgTable("admin_credentials", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin TOTP state, singleton row id=1, managed from the Security tab:
//   no row            → fall back to the ADMIN_TOTP_SECRET env var (bootstrap)
//   row, secret set   → 2FA enabled with this secret
//   row, secret NULL  → 2FA explicitly disabled (env var ignored)
export const adminTotp = pgTable("admin_totp", {
  id: integer("id").primaryKey(),
  secret: text("secret"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

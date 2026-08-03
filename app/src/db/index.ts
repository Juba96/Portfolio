import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

// Server-only Postgres + Drizzle client. The postgres-js driver speaks the
// standard wire protocol, so it works against any Postgres — the Coolify
// container on the VPS, Neon, or a local instance.
//
// DATABASE_URL is read lazily, per call — not at module scope — so importing
// this file never crashes a build or a request that doesn't touch the DB.
let cached: ReturnType<typeof createDb> | undefined;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Postgres connection string to .env (local) or the Coolify service environment (production).",
    );
  }
  return drizzle(postgres(url, { max: 5 }), { schema });
}

export function db() {
  cached ??= createDb();
  return cached;
}

export { schema };

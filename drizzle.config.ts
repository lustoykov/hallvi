import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { defineConfig } from "drizzle-kit";

const databasePath =
  process.env.SERVER_GUY_DB_PATH ??
  join(process.cwd(), ".server-guy", "server-guy.db");
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db-schema.ts",
  dbCredentials: { url: databasePath },
});

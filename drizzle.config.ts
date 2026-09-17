import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { defineConfig } from "drizzle-kit";
import { stateLocation } from "./scripts/state-location.mjs";

const databasePath =
  process.env.HALDUR_DB_PATH ??
  stateLocation(process.cwd(), { hidden: true }).database;
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db-schema.ts",
  dbCredentials: { url: databasePath },
});

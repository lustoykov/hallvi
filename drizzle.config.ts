import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { defineConfig } from "drizzle-kit";
import {
  adoptLegacyEnvironment,
  stateLocation,
} from "./scripts/legacy-names.mjs";

const databasePath =
  adoptLegacyEnvironment().HALDUR_DB_PATH ??
  stateLocation(process.cwd(), { hidden: true }).database;
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db-schema.ts",
  dbCredentials: { url: databasePath },
});

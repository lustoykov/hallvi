import Database from "better-sqlite3";
import { join } from "node:path";

const databasePath =
  process.env.SERVER_GUY_DB_PATH ?? join(process.cwd(), ".server-guy", "server-guy.db");
const database = new Database(databasePath);
database.pragma("user_version = 3");
database.close();

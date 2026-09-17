import { execFileSync } from "node:child_process";

export function pushTestDatabase(databasePath: string) {
  execFileSync("npm", ["run", "db:push", "--silent"], {
    cwd: process.cwd(),
    env: { ...process.env, HALDUR_DB_PATH: databasePath },
    stdio: "pipe",
  });
}

// Throwaway UI review: synthetic records in Hallvi's existing preview shell.
// Run with Node 22: npm run prototype:overview -- [port]
import { spawn } from "node:child_process";
const port = Number(process.argv[2] ?? 3741);
console.log(
  "Overview alternatives: http://127.0.0.1:" +
    port +
    "/prototype/traffic?page=overview&scenario=busy&variant=A",
);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { stdio: "inherit" },
);
console.log(
  "Preview launcher PID: " + process.pid + "; Next PID: " + child.pid,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

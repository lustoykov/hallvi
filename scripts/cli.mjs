// The `hallvi` command. Most of it looks after this machine's background
// service (cli-service.mjs), which reads the installation's state and
// settings as it loads. The request commands — apps, exec, wait, inspect —
// talk to a controller named explicitly and must not read either, so they
// are sent on before the service half is loaded at all.
import { REQUEST_COMMANDS, runRequest } from "./cli-requests.mjs";

if (REQUEST_COMMANDS.includes(process.argv[2]))
  process.exitCode = await runRequest(process.argv.slice(2));
else await import("./cli-service.mjs");

// Run Pi's own implementation in the workspace, not in the controller: inside
// the Docker container at /workspace, or as a child process in the scratch
// folder named by the first argument, with an environment Hallvi stripped.
import * as pi from "@earendil-works/pi-coding-agent";

const root = process.argv[2] ?? "/workspace";
// Hallvi stops a cancelled call with SIGTERM. Aborting lets Pi's shell tools
// kill the command's whole process tree before this process exits.
const cancel = new AbortController();
process.on("SIGTERM", () => cancel.abort());

// Pi's default PowerShell launcher is Windows-only. Its supported operations
// hook lets the same tool use pwsh on Linux and macOS. Encode the script
// so Bash never interprets its variables or quoting.
const bashOperations = pi.createLocalBashOperations();
const powershellOperations = {
  exec: (command, cwd, options) =>
    bashOperations.exec(
      `pwsh -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(command, "utf16le").toString("base64")}`,
      cwd,
      options,
    ),
};

const factories = {
  read: pi.createReadTool,
  write: pi.createWriteTool,
  edit: pi.createEditTool,
  bash: pi.createBashTool,
  powershell: (cwd) =>
    pi.createPowerShellTool(cwd, { operations: powershellOperations }),
  grep: pi.createGrepTool,
  find: pi.createFindTool,
  ls: pi.createLsTool,
};
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
// One JSON object per line. A tool that reports progress sends {partial}
// lines as it goes; the last line is always {result} or {error}. Reading it
// line by line is what lets the conversation show output before the command
// has finished.
const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
try {
  const factory = factories[input.name];
  if (!factory) throw new Error("Unknown built-in tool");
  const result = await factory(root).execute(
    input.id,
    input.args,
    cancel.signal,
    // The built-in tools take an update callback as their fourth argument and
    // send the result so far; passing nothing is why nothing used to stream.
    (partial) => line({ partial }),
  );
  line({ result });
} catch (error) {
  line({ error: String(error.message ?? error) });
  process.exitCode = 1;
}

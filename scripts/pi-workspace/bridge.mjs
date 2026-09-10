// Run Pi's own implementation inside the workspace, not in the controller.
import * as pi from "@earendil-works/pi-coding-agent";

// Pi's default PowerShell launcher is Windows-only. Its supported operations
// hook lets the same tool use pwsh in this Linux workspace. Encode the script
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
try {
  const factory = factories[input.name];
  if (!factory) throw new Error("Unknown built-in tool");
  const result = await factory("/workspace").execute(input.id, input.args);
  process.stdout.write(JSON.stringify({ result }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: String(error.message ?? error) }),
  );
  process.exitCode = 1;
}

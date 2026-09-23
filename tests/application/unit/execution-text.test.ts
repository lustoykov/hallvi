// Reading the envelope, so no surface has to.
//
// Every case here is a string that was actually rendered to a user: History
// titled entries with JSON, Deployment described a step as a port pair, and a
// script's first line turned out to be `set -euo pipefail` on the executions a
// reader most wants to scan.

import { describe, expect, it } from "vitest";

import {
  clip,
  commandOf,
  essence,
  executionLine,
  hostOf,
  plainText,
  whereItRan,
} from "@/components/hallvi/execution-text";

describe("reading the envelope", () => {
  it("takes the command out of a tool payload", () => {
    expect(commandOf('{"command":"docker ps","timeoutSeconds":30}')).toBe(
      "docker ps",
    );
  });

  it("leaves a bare command alone", () => {
    expect(commandOf("docker ps")).toBe("docker ps");
  });

  it("reads the longest string when no key is named command", () => {
    expect(
      commandOf('{"title":"x","body":"the whole thing that was said"}'),
    ).toBe("the whole thing that was said");
  });

  it("says something for a payload that is only settings", () => {
    // This one rendered as {"remotePort":3100,"localPort":3100} on Deployment.
    const said = commandOf('{"remotePort":3100,"localPort":3100}');
    expect(said).toContain("3100");
    expect(said).not.toContain("{");
  });

  it("shows text cut at a storage limit as it is, rather than as nothing", () => {
    const cut = '{"command":"curl https://example.com/very-long';
    expect(commandOf(cut)).toBe(cut);
  });
});

describe("the first line that acts", () => {
  it("skips the shell preamble", () => {
    // The bug: line one of a script is boilerplate, so a title built from it
    // said `set -euo pipefail` on every server command in History.
    const script = "set -euo pipefail\ncurl -fsS http://127.0.0.1:3100/health";
    expect(essence(script)).toBe("curl -fsS http://127.0.0.1:3100/health");
  });

  it.each([
    "#!/usr/bin/env bash",
    "# check the endpoint",
    "set -e",
    "shopt -s nullglob",
    "cd /srv/app",
    "IFS=$'\\n'",
  ])("skips %s", (line) => {
    expect(essence(`${line}\ndocker compose up -d`)).toBe(
      "docker compose up -d",
    );
  });

  it("falls back to the first line when a script is all preamble", () => {
    expect(essence("set -euo pipefail")).toBe("set -euo pipefail");
  });

  it("keeps an assignment that does the work", () => {
    const script = "set -eu\ncode=$(curl --silent --output /tmp/out example)";
    expect(essence(script)).toMatch(/^code=\$\(curl/);
  });
});

describe("clipping", () => {
  it("cuts to fit, at a word boundary where there is one, and says it cut", () => {
    const sentence = clip("the quick brown fox jumps over the lazy dog", 20);
    expect(sentence.endsWith("…")).toBe(true);
    expect(sentence).not.toMatch(/\s…$/);
    expect(sentence.length).toBeLessThanOrEqual(21);
    // A single long token has no boundary to cut at, and returning nothing
    // would lose the line altogether.
    const token = clip("a".repeat(120), 20);
    expect(token.length).toBeLessThanOrEqual(21);
    expect(token.endsWith("…")).toBe(true);
    expect(clip("docker ps", 40)).toBe("docker ps");
    // A title is one line, whatever the command was.
    expect(clip("one\ntwo", 40)).toBe("one two");
  });
});

describe("one readable line for an execution", () => {
  it("names where it ran and what it did", () => {
    expect(
      executionLine({
        tool: "server_bash",
        input: '{"command":"set -euo pipefail\\ncurl -fsS http://127.0.0.1/x"}',
      }),
    ).toBe("On the server · curl -fsS http://127.0.0.1/x");
  });

  it("never renders the envelope", () => {
    const line = executionLine({
      tool: "server_bash",
      input:
        '{"command":"set -euo pipefail\\ncode=$(curl --silent --show-error --output /tmp/hallvi-check http://example.com)","timeoutSeconds":30}',
    });
    expect(line).not.toContain('{"');
    expect(line).not.toContain("\\n");
    expect(line).not.toContain("timeoutSeconds");
  });

  it("distinguishes the repository copy from the server", () => {
    expect(executionLine({ tool: "bash", input: "npm test" })).toBe(
      "In the repository copy · npm test",
    );
  });

  it("keeps an unplaced tool's own name rather than guessing", () => {
    expect(executionLine({ tool: "some_new_tool", input: "" })).toBe(
      "some new tool",
    );
  });
});

describe("the full payload, for a disclosure", () => {
  it("shows the script as a script, with its settings beneath", () => {
    const said = plainText(
      '{"command":"set -eu\\ndocker ps","timeoutSeconds":30}',
    );
    expect(said).toContain("docker ps");
    expect(said).toContain("timeoutSeconds: 30");
    expect(said).not.toContain("\\n");
  });

  it("leaves plain text alone", () => {
    expect(plainText("just text")).toBe("just text");
  });
});

describe("which machine a command ran on", () => {
  // The console printed "on your server" over a shell command and the raw
  // recorded target over everything else, so a container on this PC, a
  // tunnel this PC holds open and a call to Hetzner all arrived as prose the
  // reader had to decode — and the one that can break the application read
  // like the rest of them.

  it("names the application's server, and the address a person recognises", () => {
    expect(
      whereItRan({ tool: "server_bash", target: "root@203.0.113.7:22" }),
    ).toEqual({ said: "On the server", detail: "203.0.113.7" });
  });

  it("does not call the repository workspace the server", () => {
    expect(
      whereItRan({ tool: "bash", target: "Repository workspace" }),
    ).toEqual({
      said: "In the repository copy",
      detail: "a scratch copy on this PC, not the server",
    });
  });

  it("puts controller-side work on this PC", () => {
    for (const tool of [
      "open_server_port",
      "server_public_key",
      "connect_server",
      "check_public_access",
    ])
      expect(whereItRan({ tool, target: "Private access" })?.said, tool).toBe(
        "On this PC",
      );
  });

  it("says nothing rather than guessing about a tool it does not know", () => {
    expect(whereItRan({ tool: "some_future_tool", target: "x" })).toBeNull();
    // An approval is a question and runs nowhere at all.
    expect(
      whereItRan({ tool: "request_approval", target: "User decision" }),
    ).toBeNull();
  });

  it("reads the host out of a login string, and leaves prose alone", () => {
    expect(hostOf("deploy@example.test:2222")).toBe("example.test");
    expect(hostOf("Repository workspace")).toBeNull();
    expect(
      hostOf("What the internet gets from https://shop.example.test"),
    ).toBeNull();
  });
});

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
  plainText,
} from "@/components/server-guy/execution-text";

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
  it("cuts at a word boundary and says it was cut", () => {
    const said = clip("the quick brown fox jumps over the lazy dog", 20);
    expect(said.endsWith("…")).toBe(true);
    expect(said).not.toMatch(/\s…$/);
    expect(said.length).toBeLessThanOrEqual(21);
  });

  it("leaves a short line alone", () => {
    expect(clip("docker ps", 40)).toBe("docker ps");
  });

  it("cuts a single long token rather than returning nothing", () => {
    const said = clip("a".repeat(120), 20);
    expect(said.length).toBeLessThanOrEqual(21);
    expect(said.endsWith("…")).toBe(true);
  });

  it("flattens newlines so a title stays one line", () => {
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
        '{"command":"set -euo pipefail\\ncode=$(curl --silent --show-error --output /tmp/server-guy-check http://example.com)","timeoutSeconds":30}',
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

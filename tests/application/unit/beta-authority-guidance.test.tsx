import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HostRequest,
  type HostRequestProgress,
} from "../../../src/components/hallvi/onboarding/host-request";
import { ModeLine } from "../../../src/components/hallvi/onboarding/pieces";
import type {
  OnboardingTransport,
  PermissionMode,
} from "../../../src/components/hallvi/onboarding/types";

const transport: OnboardingTransport = {
  checkHetzner: async () => ({ kind: "unreachable" }),
  checkMachine: async () => ({ kind: "failed", at: "timeout" }),
  whoHostsDns: async () => ({ kind: "unreachable" }),
  checkCloudflare: async () => ({ kind: "unreachable" }),
  existingCloudflare: async () => ({ kind: "not-connected" }),
  recordResolves: async () => false,
};

function host(choice: HostRequestProgress["choice"], mode: PermissionMode) {
  return renderToStaticMarkup(
    <HostRequest
      application="Notes"
      needs="Notes needs one small Linux server."
      estimate="about €5 a month"
      recommended="hetzner"
      hetznerConnected={false}
      transport={transport}
      mode={mode}
      publicKey={`ssh-ed25519 ${"A".repeat(68)}`}
      progress={{ choice, guideAt: 0 }}
      onProgress={() => undefined}
      connected={null}
      onConnected={() => undefined}
    />,
  );
}

describe("beta authority guidance", () => {
  it("keeps first-run precautions contextual before a host is selected", () => {
    const html = host(null, "pi-decides");

    expect(html).toContain("Safer first run");
    expect(html).toContain("dedicated test server");
    expect(html).toContain(
      "Repository files and server output can mislead an AI",
    );
    expect(html).toContain("tested recovery copy");
    expect(html).toContain("this server and its credentials cannot delete");
  });

  it("states the provider boundary and Pi-decides consequence", () => {
    const html = host("hetzner", "pi-decides");

    expect(html).toContain("create, change and delete servers");
    expect(html).toContain("separate project containing only");
    expect(html).toContain("everything inside it is within reach");
    expect(html).toContain("Connecting can be enough authority");
    expect(html).toContain(
      "Choose Always ask if you want every command to wait",
    );
  });

  it("states administrator reach and the Always-ask boundary", () => {
    const html = host("machine", "always-ask");

    expect(html).toContain("run commands there, including as administrator");
    expect(html).toContain("reach unrelated software and files");
    expect(html).toContain("You are on <b>Always ask</b>");
    expect(html).toContain("the exact command waits for your approval");
  });

  it("keeps every permission mode consequence plain", () => {
    const pi = renderToStaticMarkup(
      <ModeLine mode="pi-decides" action="change the server" />,
    );
    const bypass = renderToStaticMarkup(
      <ModeLine mode="bypass" action="change the server" />,
    );

    expect(pi).toContain("Hallvi chooses whether a command needs approval");
    expect(bypass).toContain("without asking again");
  });
});

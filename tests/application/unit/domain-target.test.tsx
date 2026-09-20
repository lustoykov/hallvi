// Which name gets published, said out loud.
//
// The zone a Cloudflare token reaches and the address an application answers
// at are different names, and a subdomain makes them different. A card that
// prints only the zone reads as though the root domain were the target, and
// an owner who accepts it publishes at the wrong name.

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import {
  DomainConnect,
  wantedName,
  type DomainProgress,
} from "@/components/hallvi/onboarding/domain-connect";
import type { OnboardingTransport } from "@/components/hallvi/onboarding/types";

const NAME = "test.accountant-agent.com";
const ZONE = "accountant-agent.com";

const asleep: OnboardingTransport = {
  checkHetzner: async () => ({ kind: "unreachable" }),
  checkMachine: async () => ({ kind: "failed", at: "timeout" }),
  whoHostsDns: async () => ({ kind: "unreachable" }),
  checkCloudflare: async () => ({ kind: "unreachable" }),
  existingCloudflare: async () => ({ kind: "not-connected" }),
  recordResolves: async () => false,
};

function card(progress: DomainProgress, done = false) {
  return renderToStaticMarkup(
    <DomainConnect
      application="Paper"
      serverAddress="203.0.113.7"
      transport={asleep}
      mode="always-ask"
      progress={progress}
      onProgress={() => {}}
      done={done}
      onReady={() => {}}
      onCancel={() => {}}
    />,
  );
}

const atCloudflare: DomainProgress = {
  name: NAME,
  host: { kind: "cloudflare", zone: ZONE },
  way: "cloudflare",
  guideAt: 0,
};

it("names the application address beside the Cloudflare zone, not instead of it", () => {
  const html = card(atCloudflare);
  expect(html).toContain("Application address");
  expect(html).toContain("Cloudflare zone");
  expect(html).toContain(NAME);
  // The zone is named for the token's scope, and the address for publishing.
  expect(html).toContain(`choose only <b>${ZONE}</b>`);
  expect(html).toContain(`Hallvi writes the record for <b>${NAME}</b>`);
});

it("keeps the subdomain in the settled receipt instead of showing only the zone", () => {
  const html = card({ ...atCloudflare }, true);
  expect(html).toContain(`${NAME} opens the application`);
  expect(html).toContain(`Cloudflare connected for ${ZONE}`);
  expect(html).toContain(`Hallvi writes one record, for ${NAME}`);
});

it("says which name an unregistered answer was about, rather than its parent", () => {
  const html = card({ ...atCloudflare, host: { kind: "unregistered" } });
  expect(html).toContain(`Nobody answers for ${NAME}`);
  expect(html).not.toContain(`Nobody answers for ${ZONE}`);
});

it("reads a typed box the same way the lookup does, so an edit is seen as one", () => {
  expect(wantedName(" HTTPS://Test.Accountant-Agent.com/app ")).toBe(NAME);
  expect(wantedName("test.accountant-agent.com.")).toBe(NAME);
  expect(wantedName("other.accountant-agent.com")).not.toBe(NAME);
  expect(wantedName("not a domain")).toBe("");
});

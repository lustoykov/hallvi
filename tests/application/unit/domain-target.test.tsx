// Which name gets published, said out loud.
//
// The zone a Cloudflare token reaches and the address an application answers
// at are different names, and a subdomain makes them different. A card that
// prints only the zone reads as though the root domain were the target, and
// an owner who accepts it publishes at the wrong name.

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { cloudflareHandoff } from "@/components/hallvi/onboarding/connection-requests";
import {
  DomainConnect,
  wantedName,
  type DomainProgress,
} from "@/components/hallvi/onboarding/domain-connect";
import type { OnboardingTransport } from "@/components/hallvi/onboarding/types";

const NAME = "test.example.org";
const ZONE = "example.org";

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
  // What the token can reach and what Hallvi means to write are separate
  // claims: a Cloudflare grant is zone-wide, and saying otherwise would
  // promise a limit the token does not carry.
  expect(html).toContain(`can reach every record in <b>${ZONE}</b>`);
  expect(html).toContain(`sets out to write is <b>${NAME}</b>`);
});

it("keeps the settled receipt to the connection, which is all that is done", () => {
  const html = card({ ...atCloudflare }, true);
  expect(html).toContain(`Cloudflare connected for ${ZONE}`);
  expect(html).toContain(`ready to open ${NAME}`);
  // Access is stored here; no record is written, nothing is published and
  // nothing is verified. A receipt that says the name already opens the
  // application is a success the owner cannot yet check.
  expect(html).not.toContain(`${NAME} opens the application`);
  expect(html).toContain(`Hallvi will write one record, for ${NAME}`);
});

it("tells Hallvi the publishing name apart from the zone, and only when they differ", () => {
  expect(cloudflareHandoff(NAME, ZONE)).toBe(
    `Cloudflare is connected for the zone ${ZONE}, which holds ${NAME}. ` +
      `Please point ${NAME} at the server and publish the application at ${NAME}, not at ${ZONE}.`,
  );
  // A root domain is its own zone; "at X, not at X" contradicts itself.
  expect(cloudflareHandoff(ZONE, ZONE)).toBe(
    `Cloudflare is connected for ${ZONE}. ` +
      `Please point ${ZONE} at the server and publish the application there.`,
  );
});

it("says which name an unregistered answer was about, rather than its parent", () => {
  const html = card({ ...atCloudflare, host: { kind: "unregistered" } });
  expect(html).toContain(`Nobody answers for ${NAME}`);
  expect(html).not.toContain(`Nobody answers for ${ZONE}`);
});

it("reads a typed box the same way the lookup does, so an edit is seen as one", () => {
  expect(wantedName(" HTTPS://Test.Example.org/app ")).toBe(NAME);
  expect(wantedName("test.example.org.")).toBe(NAME);
  expect(wantedName("other.example.org")).not.toBe(NAME);
  expect(wantedName("not a domain")).toBe("");
});

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SecurityView } from "../../../src/components/server-guy/views/security-view";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import { stackOf } from "../../../src/server/application-stack";
import type { SecurityFacts } from "../../../src/server/application-facts";

function render(security: SecurityFacts) {
  const state = richScenario.initial();
  return renderToStaticMarkup(
    <SecurityView
      deployment={state.deployment}
      stack={stackOf(state.deployment)}
      facts={{ security }}
      operations={[]}
      chats={[]}
      now={Date.now()}
      onOpenDestination={() => {}}
      onOpenConversation={() => {}}
      onAsk={() => {}}
    />,
  );
}
const security: SecurityFacts = {
  firewall: { state: "active", provider: "Hetzner Cloud", detail: "Read back" },
  rules: [],
  ssh: { state: "unknown", detail: "Authentication not inspected" },
  privateServices: [],
  privateServicesDetail: "Host networking not inspected",
};

it("does not claim an instance is closed when no firewall is attached", () => {
  const html = render({
    ...security,
    firewall: { ...security.firewall, state: "not-configured" },
  });
  expect(html).toContain("No Hetzner firewall is attached");
  expect(html).toContain("No attached firewall restricts incoming traffic");
  expect(html).not.toContain("Nothing should be reachable");
  expect(html).not.toContain("no published port");
});
it("distinguishes pending firewall application from missing protection", () => {
  const html = render({
    ...security,
    firewall: { ...security.firewall, state: "unknown" },
  });
  expect(html).toContain("Firewall rules are not confirmed as applied");
  expect(html).not.toContain("No Hetzner firewall is attached");
});
it("recognizes public SSH in a port range without inferring key-only authentication", () => {
  const html = render({
    ...security,
    rules: [
      {
        id: "range",
        port: "1-100",
        protocol: "tcp",
        sources: ["0.0.0.0/0"],
        reach: "internet",
      },
    ],
  });
  expect(html).toContain("Firewall allows SSH from any network");
  expect(html).toContain(
    "SSH authentication settings must be checked separately",
  );
  expect(html).not.toContain("only a key will let them");
});

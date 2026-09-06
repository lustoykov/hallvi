// Shared by the dashboard and the tests themselves; IDs select exact Playwright
// tags.
export const browserJourneys = [
  {
    id: "activity-history",
    name: "Inspect application Activity and reply recovery",
    description:
      "Keep Activity to saved requirements and repository checks, preserve normal Chat, reload, cancel, retry, and record a GitHub disconnect once.",
    smoke: false,
  },
  {
    id: "add-application",
    name: "Add application and save a priority",
    description:
      "Create an application, send a priority, reload and check its saved message and Decision.",
    smoke: true,
  },
  {
    id: "settings",
    name: "Settings and privacy help",
    description:
      "Open help, cancel disconnect, save reasoning effort and verify it after returning.",
    smoke: true,
  },
  {
    id: "provider-failure",
    name: "Recover from a provider failure",
    description:
      "Keep the accepted message after failure, then retry its reply without duplicating the message or saving partial Decisions.",
    smoke: false,
  },
  {
    id: "isolation",
    name: "Keep applications separate",
    description:
      "Switch applications without leaking Decisions or unsent drafts.",
    smoke: false,
  },
  {
    id: "chat-navigation",
    name: "Navigate chats and inspect evidence",
    description:
      "Keep drafts separate, restore the selected transcript after refresh, read archived chats and navigate Record tabs with the keyboard.",
    smoke: false,
  },
  {
    id: "revision",
    name: "Revise a Decision safely",
    description:
      "Replace the exact Decision; reject a fabricated replacement without saving partial changes.",
    smoke: false,
  },
  {
    id: "removal",
    name: "Remove and recreate an application",
    description:
      "Require the repository name as confirmation; recreate it with fresh IDs and no old Decisions.",
    smoke: false,
  },
  {
    id: "disconnect",
    name: "Disconnect without losing history",
    description:
      "Keep chats, disable new messages and require consent before reusing a discovered login.",
    smoke: false,
  },
  {
    id: "slow-reply",
    name: "Handle a slow reply and double Enter",
    description:
      "Save one message pair and preserve the next draft typed while waiting.",
    smoke: false,
  },
  {
    id: "github-connection",
    name: "Connect GitHub and verify repository access",
    description:
      "Reuse a login with consent, authorize or cancel a separate account, verify repository permissions, disconnect and re-check.",
    smoke: false,
  },
  {
    id: "durable-requests",
    name: "Reconnect and cancel durable replies",
    description:
      "Close the browser while Server Guy works, recover saved progress, cancel a request and explicitly retry its reply.",
    smoke: false,
  },
  {
    id: "native-history",
    name: "Continue conversation history and recover from loss",
    description:
      "Continue native history across reloads, isolate Chats while sharing saved Decisions, and start a fresh Chat when native history is missing.",
    smoke: false,
  },
  {
    id: "phase-two-contract",
    name: "Continue to Inspect app and establish the Application Contract",
    description:
      "Continue from a ready Launch Brief, watch the auto-started inspection propose a sourced contract, revise it from a correction, reject an invented source, re-inspect, and read Phase 1 as completed history.",
    smoke: false,
  },
  {
    id: "dashboard",
    name: "Testing dashboard and saved reviews",
    description:
      "Check selection, spending confirmation and saved human reviews. Tests this dashboard, not the product app.",
    smoke: false,
  },
] as const;

export function journey(id: (typeof browserJourneys)[number]["id"]) {
  const entry = browserJourneys.find((candidate) => candidate.id === id)!;
  return { tag: [`@journey-${id}`, ...(entry.smoke ? ["@smoke"] : [])] };
}

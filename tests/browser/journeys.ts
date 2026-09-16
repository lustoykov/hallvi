// Shared by the dashboard and the tests themselves; IDs select exact Playwright
// tags.
export const browserJourneys = [
  {
    id: "still-working",
    name: "A turn in flight, and letting go of it",
    description:
      "Say what a running turn is actually doing, above the composer as well as in the transcript, and take the next message once it finishes.",
    smoke: false,
  },
  {
    id: "streaming-output",
    name: "Inline command output",
    description:
      "Follow live output, read back and inspect completion in chat.",
    smoke: false,
  },
  {
    id: "shared-information",
    name: "Shared outcome cards",
    description:
      "Render rich records in chat and their selected views, including after refresh.",
    smoke: true,
  },
  {
    id: "application-shell",
    name: "Application workspace",
    description:
      "Main and side conversations, navigation and application views.",
    smoke: true,
  },
  {
    id: "activity-history",
    name: "Inspect application Activity and reply recovery",
    description:
      "Keep Activity to saved requirements and repository checks, preserve normal Chat, reload, cancel, retry, and record a GitHub disconnect once.",
    smoke: false,
  },
  {
    id: "add-application",
    name: "Add application and chat",
    description:
      "Create an application, send a message, reload and check the saved conversation.",
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
    id: "record-destinations",
    name: "Every destination, drawn from records",
    description:
      "Walk all sixteen views on every running application: deep link, reload, two desktop widths, and no console error, overflow or clipped text anywhere.",
    smoke: false,
  },
  {
    id: "controller-protection",
    name: "Server Guy's own protection",
    description:
      "State Server Guy's own copies on Backups: unprotected without storage, copied but not yet recoverable, and recoverable once the owner saves the kit.",
    smoke: false,
  },
] as const;

export function journey(id: (typeof browserJourneys)[number]["id"]) {
  const entry = browserJourneys.find((candidate) => candidate.id === id)!;
  return { tag: [`@journey-${id}`, ...(entry.smoke ? ["@smoke"] : [])] };
}

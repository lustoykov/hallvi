// Shared by the dashboard and the tests themselves; IDs select exact Playwright tags.
export const browserJourneys = [
  { id: "add-application", name: "Add application and save a priority", description: "Create an application, send a priority, reload and check its saved message and Decision.", smoke: true },
  { id: "settings", name: "Settings and privacy help", description: "Open help, cancel disconnect, save reasoning effort and verify it after returning.", smoke: true },
  { id: "provider-failure", name: "Recover from a provider failure", description: "Show an error without a partial conversation, then retry successfully.", smoke: false },
  { id: "isolation", name: "Keep applications separate", description: "Switch applications without leaking Decisions or unsent drafts.", smoke: false },
  { id: "revision", name: "Revise a Decision safely", description: "Replace the exact Decision; reject a fabricated replacement without saving partial changes.", smoke: false },
  { id: "removal", name: "Remove and recreate an application", description: "Require the repository name as confirmation; recreate it with fresh IDs and no old Decisions.", smoke: false },
  { id: "disconnect", name: "Disconnect without losing history", description: "Keep chats, disable new messages and require consent before reusing a discovered login.", smoke: false },
  { id: "slow-reply", name: "Handle a slow reply and double Enter", description: "Save one message pair and preserve the next draft typed while waiting.", smoke: false },
  { id: "dashboard", name: "Testing dashboard and saved reviews", description: "Check selection, spending confirmation and saved human reviews. Tests this dashboard, not the product app.", smoke: false },
] as const;

export function journey(id: typeof browserJourneys[number]["id"]) {
  const entry = browserJourneys.find((candidate) => candidate.id === id)!;
  return { tag: [`@journey-${id}`, ...(entry.smoke ? ["@smoke"] : [])] };
}

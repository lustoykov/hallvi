// PROTOTYPE · claude/hallvi-onboarding-design · proposed onboarding journey.
// Route: /prototype/onboarding
//
// The cards under src/components/hallvi/onboarding are written to ship. What
// is invented here is everything around them: the conversation is scripted
// and every provider answer comes from the bar at the bottom of the page.
// Nothing on this route reaches Hetzner, Cloudflare, a machine or a model.
import { notFound } from "next/navigation";

import { OnboardingPrototype } from "./onboarding-prototype";

export const dynamic = "force-dynamic";

export default function OnboardingPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OnboardingPrototype />;
}

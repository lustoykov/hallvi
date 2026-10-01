"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// Five variants of the deployed application's Overview, switchable via
// ?variant= on the existing Overview route. See README.md beside this file.

import type { ReactNode } from "react";

import type { Facts } from "./facts";
import { OverviewSwitcher } from "./switcher";
import type { OverviewVariant } from "./variant";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { VariantD } from "./variant-d";
import { VariantE } from "./variant-e";
import "./prototype.css";

const BODIES = {
  a: VariantA,
  b: VariantB,
  c: VariantC,
  d: VariantD,
  e: VariantE,
};

export function OverviewDirections({
  variant,
  facts,
  bar,
}: {
  variant: Exclude<OverviewVariant, "now">;
  facts: Facts;
  bar: ReactNode;
}) {
  const Body = BODIES[variant];
  return (
    <div className="hv-section-page hv-section-overview ovx">
      <Body facts={facts} bar={bar} />
      <OverviewSwitcher value={variant} />
    </div>
  );
}

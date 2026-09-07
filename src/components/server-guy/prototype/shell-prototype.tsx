"use client";

// PROTOTYPE — three variants of the application workspace shell (top bar,
// right-hand inspector, action placement), switchable via `?variant=A|B|C`
// on the existing /applications/[applicationId] route. Same server data as
// production; every action is a stub reported in the floating bar.
import { useState } from "react";

import type { PiSetupStatus } from "@/server/pi-setup";
import type { OperatorView } from "@/server/types";

import {
  PrototypeActionContext,
  PrototypeSwitcher,
  VARIANTS,
  type VariantKey,
} from "./switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

export function ShellPrototype({
  variant,
  view,
  piSetup,
}: {
  variant: string;
  view: OperatorView;
  piSetup: PiSetupStatus;
}) {
  const key: VariantKey = VARIANTS.some((item) => item.key === variant)
    ? (variant as VariantKey)
    : "A";
  const [lastAction, setLastAction] = useState<string | null>(null);
  return (
    <PrototypeActionContext.Provider value={setLastAction}>
      {key === "A" && <VariantA view={view} piSetup={piSetup} />}
      {key === "B" && <VariantB view={view} piSetup={piSetup} />}
      {key === "C" && <VariantC view={view} piSetup={piSetup} />}
      <PrototypeSwitcher current={key} lastAction={lastAction} />
    </PrototypeActionContext.Provider>
  );
}

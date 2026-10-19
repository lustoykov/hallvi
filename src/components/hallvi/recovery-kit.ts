import type { recoveryKit } from "@/server/controller-protection";

export type RecoveryKit = NonNullable<ReturnType<typeof recoveryKit>>;

/** Read the passphrase only when the owner chooses to reveal the kit. */
export async function readRecoveryKit(): Promise<RecoveryKit> {
  const response = await fetch("/api/controller-protection/kit");
  const value = response.ok ? await response.json().catch(() => null) : null;
  if (!value?.passphrase)
    throw new Error("The recovery kit could not be read.");
  return value as RecoveryKit;
}

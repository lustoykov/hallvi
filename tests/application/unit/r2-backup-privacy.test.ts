import { expect, it } from "vitest";
import { verifyR2PrivacyOutputs } from "../../../scripts/backup-proof/check-r2-private.mjs";

it("refuses uploads when public R2 URLs are enabled or privacy is unknown", () => {
  const disabled = "Public access via the r2.dev URL is disabled.";
  const noDomains = "There are no custom domains connected to this bucket.";
  expect(verifyR2PrivacyOutputs(disabled, noDomains)).toEqual({
    r2DevEnabled: false,
    customDomains: 0,
  });
  expect(() =>
    verifyR2PrivacyOutputs("Public access enabled", noDomains),
  ).toThrow();
  expect(() =>
    verifyR2PrivacyOutputs(disabled, "backups.example.com"),
  ).toThrow();
  expect(() => verifyR2PrivacyOutputs("", "")).toThrow();
});

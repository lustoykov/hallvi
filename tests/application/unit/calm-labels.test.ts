// Hallvi never labels anything by who it needs: the owner found "Needs you"
// too attention demanding and panic inducing. Open work is Unresolved, a
// decision is Awaiting approval, Pi's warning is Worth a look. The rule is
// "Calm by default" in src/components/hallvi/DESIGN.md.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const SUMMONS =
  /\b(needs? you|wants? you|waiting (for|on) you|waiting for your (approval|decision)|needs? attention)\b/i;

it("never labels anything by who it needs", () => {
  const sources = [
    ...readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
      .filter((name) => /\.(tsx?|css)$/.test(name))
      // Pi's instructions are addressed to the model, never drawn as a label.
      .filter((name) => name !== join("server", "pi.ts"))
      .map((name) => join("src", name)),
    join("plugins", "hallvi", "panel.html"),
  ];
  const summoning = sources.filter((path) =>
    SUMMONS.test(readFileSync(join(root, path), "utf8").replace(/\s+/g, " ")),
  );
  expect(summoning).toEqual([]);
});

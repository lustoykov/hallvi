import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsNav } from "../../../src/components/server-guy/settings-nav";

afterEach(() => vi.unstubAllEnvs());

describe("Settings testing shortcut", () => {
  it.each(["pi", "github"] as const)(
    "links to the local dashboard from %s settings during development",
    (current) => {
      vi.stubEnv("NODE_ENV", "development");
      const html = renderToStaticMarkup(<SettingsNav current={current} />);

      expect(html).toContain('href="http://127.0.0.1:4317/"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain("Testing dashboard (opens in a new tab)");
      const currentLink = html
        .match(/<a\b[^>]*>/g)
        ?.find((link) => link.includes(`href="/setup/${current}"`));
      expect(currentLink).toContain('aria-current="page"');
    },
  );

  it.each(["production", "test"])(
    "does not expose the local developer tool in %s",
    (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      const html = renderToStaticMarkup(<SettingsNav current="github" />);

      expect(html).not.toContain("4317");
      expect(html).not.toContain("Testing dashboard");
      expect(html).toContain("ChatGPT &amp; model");
      expect(html).toContain("GitHub");
    },
  );
});

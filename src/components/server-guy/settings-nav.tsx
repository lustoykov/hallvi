import Link from "next/link";
import s from "./pi-setup-screen.module.css";

export function SettingsNav({
  current,
  prototype = false,
}: {
  current: "pi" | "github" | "execution" | "connections";
  /** The reference prototype adds the designed Connections home. */
  prototype?: boolean;
}) {
  return (
    <nav className={s.settingsNav} aria-label="Settings">
      {prototype && (
        <Link
          href="/prototype/settings/connections"
          aria-current={current === "connections" ? "page" : undefined}
        >
          Connections
        </Link>
      )}
      <Link
        href="/setup/pi"
        aria-current={current === "pi" ? "page" : undefined}
      >
        ChatGPT &amp; model
      </Link>
      <Link
        href="/setup/github"
        aria-current={current === "github" ? "page" : undefined}
      >
        GitHub
      </Link>
      <Link
        href="/setup/execution"
        aria-current={current === "execution" ? "page" : undefined}
      >
        Execution
      </Link>
      {process.env.NODE_ENV === "development" && (
        <a
          className={s.testingLink}
          href="http://127.0.0.1:4317/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Testing dashboard (opens in a new tab)"
        >
          Testing dashboard
        </a>
      )}
    </nav>
  );
}

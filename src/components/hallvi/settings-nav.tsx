import Link from "next/link";
import s from "./pi-setup-screen.module.css";

export function SettingsNav({
  current,
  returnTo,
}: {
  current: "pi" | "github" | "connections" | "workspace";
  /** The conversation Settings was opened from; every tab keeps it. */
  returnTo?: { query: string };
}) {
  const query = returnTo?.query ?? "";
  return (
    <nav className={s.settingsNav} aria-label="Settings">
      {/* Connections is a real page now: it asks each provider whether the
          credential works rather than reporting that a variable is set. */}
      <Link
        href={`/setup/connections${query}`}
        aria-current={current === "connections" ? "page" : undefined}
      >
        Connections
      </Link>
      <Link
        href={`/setup/pi${query}`}
        aria-current={current === "pi" ? "page" : undefined}
      >
        ChatGPT &amp; model
      </Link>
      <Link
        href={`/setup/github${query}`}
        aria-current={current === "github" ? "page" : undefined}
      >
        GitHub
      </Link>
      <Link
        href={`/setup/workspace${query}`}
        aria-current={current === "workspace" ? "page" : undefined}
      >
        Workspace
      </Link>
      {process.env.NODE_ENV === "development" && (
        <span className={s.developerLinks}>
          <a
            href="http://127.0.0.1:4317/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Testing dashboard (opens in a new tab)"
          >
            Testing dashboard
          </a>
          {/* Studio opens on the whole controller database: it has no URL for
              a table or a row, so this cannot be scoped to one application. */}
          <a
            href="https://local.drizzle.studio/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Database in Drizzle Studio (opens in a new tab)"
          >
            Database
          </a>
        </span>
      )}
    </nav>
  );
}

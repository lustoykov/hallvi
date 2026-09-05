import Link from "next/link";
import s from "./pi-setup-screen.module.css";

export function SettingsNav({ current }: { current: "pi" | "github" }) {
  return (
    <nav className={s.settingsNav} aria-label="Settings">
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

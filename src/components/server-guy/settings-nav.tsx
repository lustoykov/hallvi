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
    </nav>
  );
}

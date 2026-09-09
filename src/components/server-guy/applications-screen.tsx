import Link from "next/link";

import s from "./applications.module.css";

/**
 * One application as the list shows it: its condition in words, the stack
 * it records, and whether anything needs the user. Derived from records;
 * never a phase or a check count.
 */
export interface ApplicationListItem {
  id: string;
  name: string;
  source: string;
  condition: { tone: "live" | "warn" | "bad" | "muted"; text: string };
  /** "Web · PostgreSQL 16 · 3 jobs" or "Not deployed yet". */
  stack: string;
  attention: number;
  protection: string;
}

export function ApplicationsScreen({
  applications,
  piReady,
  preview = false,
  hrefFor = (id) => `/applications/${id}`,
}: {
  applications: ApplicationListItem[];
  piReady: boolean;
  preview?: boolean;
  /** The prototype links its own routes; the product links the workspace. */
  hrefFor?: (id: string) => string;
}) {
  return (
    <main className={s.page}>
      <header className={s.topbar}>
        <Link
          className={s.brand}
          href={preview ? "/prototype/applications" : "/applications"}
        >
          <span className="sg-app-mark">SG</span>Server Guy
        </Link>
        <Link href={preview ? "/prototype/settings/connections" : "/setup/pi"}>
          {piReady ? "Settings" : "Settings · Connect ChatGPT"}
        </Link>
      </header>
      <section className={s.content} aria-labelledby="applications-heading">
        <div className={s.heading}>
          <div>
            <h1 id="applications-heading">Applications</h1>
            <p>Each application has its own conversations, records and host.</p>
          </div>
          {applications.length > 0 && (
            <Link
              className={s.primary}
              href={preview ? "/prototype/new" : "/applications/new"}
            >
              Add application
            </Link>
          )}
        </div>
        {applications.length === 0 ? (
          <div className={s.empty}>
            <h2>Add your first application</h2>
            <p>
              Start with a GitHub repository. Server Guy inspects it, recommends
              a server and deploys when you approve.
            </p>
            <Link
              className={s.primary}
              href={preview ? "/prototype/new" : "/applications/new"}
            >
              Add application
            </Link>
            <small>Nothing is bought or changed until you approve it.</small>
          </div>
        ) : (
          <ul className={s.list} aria-label="Applications">
            {applications.map((item) => (
              <li key={item.id}>
                <Link className={s.application} href={hrefFor(item.id)}>
                  <div className={s.repository}>
                    <h2>{item.name}</h2>
                    <span>{item.source}</span>
                  </div>
                  <div className={s.phase}>
                    <strong className={s[`tone_${item.condition.tone}`]}>
                      <i className={s.dot} aria-hidden="true" />
                      {item.condition.text}
                    </strong>
                    <span>{item.stack}</span>
                  </div>
                  <div className={s.checks}>
                    <strong className={item.attention ? s.attention : s.ready}>
                      {item.attention
                        ? `${item.attention} need${item.attention === 1 ? "s" : ""} you`
                        : "Nothing needs you"}
                    </strong>
                    <span>{item.protection}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

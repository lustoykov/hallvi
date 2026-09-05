import Link from "next/link";

import type { listApplicationSummaries } from "@/server/phase-one";
import { PHASE_ONE } from "@/server/phase-one-spec";

import s from "./applications.module.css";

export function ApplicationsScreen({
  applications,
  piReady,
}: {
  applications: ReturnType<typeof listApplicationSummaries>;
  piReady: boolean;
}) {
  return (
    <main className={s.page}>
      <header className={s.topbar}>
        <Link className={s.brand} href="/applications">
          <span className="sg-app-mark">SG</span>Server Guy
        </Link>
        <Link href="/setup/pi">
          {piReady ? "Settings" : "Settings · Connect ChatGPT"}
        </Link>
      </header>
      <section className={s.content} aria-labelledby="applications-heading">
        <div className={s.heading}>
          <div>
            <h1 id="applications-heading">Applications</h1>
            <p>Choose a workspace or connect another repository.</p>
          </div>
          {applications.length > 0 && (
            <Link className={s.primary} href="/applications/new">
              Add application
            </Link>
          )}
        </div>
        {applications.length === 0 ? (
          <div className={s.empty}>
            <h2>Add your first application</h2>
            <p>
              Start with a GitHub repository. Server Guy will create its Launch
              Brief and check repository access.
            </p>
            <Link className={s.primary} href="/applications/new">
              Add application
            </Link>
            <small>No code changes or infrastructure will be created.</small>
          </div>
        ) : (
          <ul className={s.list} aria-label="Applications">
            {applications.map(({ application, passedChecks, totalChecks }) => (
              <li key={application.id}>
                <Link
                  className={s.application}
                  href={`/applications/${application.id}`}
                >
                  <div className={s.repository}>
                    <h2>{application.name}</h2>
                    <span>
                      {application.repositoryOwner}/{application.repositoryName}
                    </span>
                  </div>
                  <div className={s.phase}>
                    <strong>
                      Phase {PHASE_ONE.number} · {PHASE_ONE.deliverable}
                    </strong>
                    <span>Production</span>
                  </div>
                  <div className={s.checks}>
                    <strong
                      className={
                        passedChecks === totalChecks ? s.ready : s.attention
                      }
                    >
                      {passedChecks === totalChecks
                        ? "Launch Brief ready"
                        : "Needs attention"}
                    </strong>
                    <span>
                      {passedChecks} of {totalChecks} checks pass
                    </span>
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

"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

import type { ChangelogRelease } from "../../../scripts/changelog.mjs";
import type { SetupReturn } from "@/server/setup-return";
import { HallviMark } from "./hallvi-mark";
import { Markdown } from "./markdown";
import s from "./pi-setup-screen.module.css";
import w from "./whats-new.module.css";

/**
 * What changed in each release, newest first, as the CHANGELOG.md this Hallvi
 * shipped with tells it. A newer release's notes are one link away in the
 * update offer; these are the ones for what is running.
 */
export function WhatsNewScreen({
  releases,
  returnTo,
}: {
  releases: ChangelogRelease[];
  returnTo?: SetupReturn;
}) {
  return (
    <main className={`hv-setup-shell ${s.root}`}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/applications">
          <HallviMark size={22} />
          <span>Hallvi</span>
        </Link>
        <Link
          className="hv-setup-back"
          href={returnTo?.href ?? "/applications"}
        >
          <ArrowLeft aria-hidden="true" />{" "}
          {returnTo?.label ?? "All applications"}
        </Link>
      </header>
      <div className={s.page}>
        <header className={s.heading}>
          <h1>What&apos;s new</h1>
          <p>What changed in each Hallvi release, newest first.</p>
        </header>
        {releases.length === 0 ? (
          <p className={w.none}>This Hallvi carries no release notes.</p>
        ) : (
          releases.map((release) => (
            <section
              className={w.release}
              key={release.version}
              aria-labelledby={`release-${release.version}`}
            >
              <h2 id={`release-${release.version}`}>
                {release.version} {release.date && <span>{release.date}</span>}
              </h2>
              <div className={w.notes}>
                <Markdown source={release.notes} />
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

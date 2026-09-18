"use client";

import { SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import s from "./applications.module.css";

export function NewApplicationScreen({
  githubLogin = null,
}: {
  githubLogin?: string | null;
}) {
  const router = useRouter();
  const draftKey = "hallvi:add-application:v1";
  const applicationsHref = "/applications";
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [name, setName] = useState("");
  const creationRequest = useRef<{ key: string; settings: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const derivedName =
    /[/:]([^/\s:]+?)(?:\.git)?\/?$/.exec(repositoryUrl.trim())?.[1] ?? "";

  useEffect(() => {
    active.current = true;
    // Restore the tab-local form after a visit to GitHub settings. Do not put
    // pasted repository text (which could contain credentials) into a URL.
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (draft && typeof draft.repositoryUrl === "string") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate an external, tab-local form draft once after mount.
        setRepositoryUrl(draft.repositoryUrl);
        setName(typeof draft.name === "string" ? draft.name : "");
        if (
          typeof draft.requestKey === "string" &&
          typeof draft.settings === "string"
        )
          creationRequest.current = {
            key: draft.requestKey,
            settings: draft.settings,
          };
      }
    } catch {
      /* Storage can be unavailable; creating an application still works. */
    }
    // The server-rendered form must not accept edits before React owns the
    // inputs and the saved draft is restored; those early edits can be lost.
    setReady(true);
    return () => {
      active.current = false;
    };
  }, [draftKey]);

  function keepDraft() {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          repositoryUrl,
          name,
          requestKey: creationRequest.current?.key,
          settings: creationRequest.current?.settings,
        }),
      );
    } catch {
      /* Do not block connection setup when browser storage is unavailable. */
    }
  }

  async function createApplication() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const settings = JSON.stringify({
        repositoryUrl: repositoryUrl.trim(),
        name: name.trim(),
      });
      if (creationRequest.current?.settings !== settings)
        creationRequest.current = { key: crypto.randomUUID(), settings };
      keepDraft();
      const view = await api.createApplication({
        requestKey: creationRequest.current.key,
        repositoryUrl,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      // Leaving the form does not undo creation, but must stop its late
      // navigation.
      if (!active.current) return;
      if (!view.application)
        throw new Error("No application was returned. Try again.");
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Storage is optional. */
      }
      router.push(`/applications/${view.application.id}`);
      router.refresh();
    } catch (caught) {
      if (!active.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add this application. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <header className={s.topbar}>
        <Link className={s.brand} href={applicationsHref}>
          <span className="hv-app-mark">H</span>Hallvi
        </Link>
        <Link href={applicationsHref}>All applications</Link>
      </header>
      <section
        className={`${s.content} ${s.newContent}`}
        aria-labelledby="new-application-heading"
      >
        <div className={s.heading}>
          <div>
            <h1 id="new-application-heading">What do you want to run?</h1>
            <p>
              Paste the repository of the application. Hallvi reads it, tells
              you what it needs, and gets it working on a server you control.
            </p>
          </div>
        </div>
        <form
          className={s.form}
          onSubmit={(event) => {
            event.preventDefault();
            void createApplication();
          }}
        >
          <label className={s.field} htmlFor="repository-url">
            GitHub repository
          </label>
          <input
            id="repository-url"
            name="repositoryUrl"
            autoComplete="url"
            spellCheck={false}
            disabled={!ready || busy}
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            required
            type="text"
            aria-describedby="repository-help"
          />
          <p className={s.helper} id="repository-help">
            A public repository needs no GitHub sign-in.{" "}
            {githubLogin ? (
              <>
                Private ones are read as <strong>{githubLogin}</strong>.{" "}
                <Link href="/setup/github?from=add" onClick={keepDraft}>
                  Change
                </Link>
              </>
            ) : (
              <>
                For a private one,{" "}
                <Link href="/setup/github?from=add" onClick={keepDraft}>
                  Connect GitHub
                </Link>{" "}
                first; what you typed here is kept.
              </>
            )}
          </p>
          <label
            className={`${s.field} ${s.secondary}`}
            htmlFor="application-name"
          >
            Application name <span>optional</span>
          </label>
          <input
            id="application-name"
            name="name"
            value={name}
            maxLength={120}
            disabled={!ready || busy}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              derivedName
                ? `${derivedName}, from the repository`
                : "Defaults to the repository name"
            }
          />
          <p className={s.scope}>
            Nothing is rented or changed at this step. A new application starts
            on <strong>Pi decides</strong>: Hallvi asks before consequential
            steps such as renting a server, at its own judgment. You can change
            that in the conversation before anything happens.
          </p>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          {busy && (
            <p className={s.helper} role="status">
              Creation continues if you leave this page.
            </p>
          )}
          <div className={s.actions}>
            <Link href={applicationsHref}>
              {busy ? "Back to applications" : "Cancel"}
            </Link>
            <button
              className={s.primary}
              disabled={!ready || busy || !repositoryUrl.trim()}
              type="submit"
            >
              {busy && <SpinnerGap className="spin" />}
              {busy ? "Checking repository…" : "Add application"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

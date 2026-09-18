"use client";

import { HallviMark } from "./hallvi-mark";
import { SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { api } from "./api";
import s from "./applications.module.css";
import w from "./welcome.module.css";
import { WelcomeSteps } from "./welcome-steps";

/** What Little Server says while nobody is typing, one line at a time. */
const CHATTER = [
  "Hello! Got something you want running?",
  "Paste a repository and I’ll read it. No forms about it, promise.",
  "No server yet? I can rent a small one, or use a machine you have.",
  "Nothing gets rented until you have seen the plan and the price.",
  "I check that it really works before I call it done.",
  "Click me. I dance.",
];
const DANCES = ["shuffle", "robot", "floss", "cartwheel", "backflip"] as const;

const Mascot = dynamic(
  () => import("./home/mascot-scene").then((m) => m.MascotScene),
  {
    ssr: false,
    loading: () => <div className={w.mascotPlaceholder} aria-hidden="true" />,
  },
);

export function NewApplicationScreen({
  githubLogin = null,
  first = false,
}: {
  githubLogin?: string | null;
  /** Nothing has been added yet: say what Hallvi is before asking. */
  first?: boolean;
}) {
  const router = useRouter();
  const draftKey = "hallvi:add-application:v1";
  const applicationsHref = "/applications";
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const creationRequest = useRef<{ key: string; settings: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const [chatter, setChatter] = useState(0);
  const [dances, setDances] = useState(0);
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
      });
      if (creationRequest.current?.settings !== settings)
        creationRequest.current = { key: crypto.randomUUID(), settings };
      keepDraft();
      const view = await api.createApplication({
        requestKey: creationRequest.current.key,
        repositoryUrl,
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

  useEffect(() => {
    const timer = window.setInterval(
      () => setChatter((line) => line + 1),
      6500,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Little Server follows the form and keeps the owner company: a wave, a
  // listening antenna once there is a repository, the wrench while it is
  // read, a worried look when it could not be. Left alone it waves and dances
  // now and then, says a little more about itself, and dances when clicked.
  const mood = error
    ? "attention"
    : busy
      ? "working"
      : derivedName
        ? "checking"
        : "waving";
  const idle = !error && !busy && !derivedName;
  const said = error
    ? "Hmm, that did not work. The reason is under the field."
    : busy
      ? `Reading ${derivedName || "the repository"}…`
      : derivedName
        ? `Ooh, ${derivedName}. I’ll read it first and tell you what it needs.`
        : chatter === 0 && !first
          ? "Hello again. What’s next?"
          : CHATTER[chatter % CHATTER.length];

  return (
    <main className={s.page}>
      <header className={s.topbar}>
        <Link className={s.brand} href={applicationsHref}>
          <HallviMark size={28} onDark />
          Hallvi
        </Link>
        {!first && <Link href={applicationsHref}>All applications</Link>}
      </header>
      <section className={w.welcome} aria-labelledby="new-application-heading">
        <div className={w.hero}>
          <div className={w.hello}>
            <div className={w.greeting}>
              <button
                type="button"
                className={w.mascot}
                aria-label="Make Hallvi dance"
                onClick={() => setDances((count) => count + 1)}
              >
                <Mascot
                  color="#7a8bd6"
                  mood={mood}
                  ambient={idle}
                  dance={DANCES[dances % DANCES.length]}
                  danceRequest={dances}
                />
              </button>
              {/* Chatter is company, not news: only what the form did is
                  announced. */}
              <p
                className={w.says}
                key={said}
                role={idle ? undefined : "status"}
              >
                {said}
              </p>
            </div>
            <h1 id="new-application-heading">
              {first ? "Hi, I’m Hallvi." : "What shall we run next?"}
            </h1>
            <p>
              {first
                ? "I get self-hosted software running on a server you control, check that it really works, and keep an eye on it afterwards. You bring an application; I do the infrastructure, and explain what I am doing as I go."
                : "Same as before: I read it, you choose where it runs, and I hand it over working."}
            </p>
            <ul className={w.yours} aria-label="What stays yours">
              <li>Your server</li>
              <li>Your accounts</li>
              <li>Your data</li>
              <li>Hallvi runs on this computer</li>
            </ul>
          </div>
          <div className={w.ask}>
            <h2>What do you want to run?</h2>
            <p>
              Paste the GitHub repository of the application. It can be yours or
              someone else&rsquo;s open-source project.
            </p>
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
              {derivedName && (
                <p className={s.helper}>
                  It will be called <strong>{derivedName}</strong>. You can
                  rename it afterwards from the application&rsquo;s menu.
                </p>
              )}
              <p className={s.scope}>
                Nothing is rented or changed at this step. A new application
                starts on <strong>Pi decides</strong>: Hallvi decides when to
                ask for your approval. Switch to <strong>Always ask</strong>{" "}
                there if every command should wait for your approval.
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
                {/* With nothing added yet there is nowhere to go back to. */}
                {first ? (
                  <span />
                ) : (
                  <Link href={applicationsHref}>
                    {busy ? "Back to applications" : "Cancel"}
                  </Link>
                )}
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
          </div>
        </div>
        <h2 className={w.how}>How it goes from here</h2>
        <WelcomeSteps />
      </section>
    </main>
  );
}

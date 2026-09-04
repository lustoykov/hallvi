"use client";

import { SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { APPROVAL_MODES } from "@/server/types";
import type { ApprovalMode } from "@/server/types";

import { api } from "./api";
import s from "./applications.module.css";

const permissionOptions = Object.entries(APPROVAL_MODES) as Array<[ApprovalMode, (typeof APPROVAL_MODES)[ApprovalMode]]>;

export function NewApplicationScreen({ githubLogin = null }: { githubLogin?: string | null }) {
  const router = useRouter();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("pi-decides");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function createApplication() {
    if (busy || !githubLogin) return;
    setBusy(true);
    setError(null);
    try {
      const view = await api.createApplication({ repositoryUrl, approvalMode });
      // Leaving the form does not undo creation, but must stop its late navigation.
      if (!active.current) return;
      if (!view.application) throw new Error("No application was returned. Try again.");
      router.push(`/applications/${view.application.id}`);
      router.refresh();
    } catch (caught) {
      if (!active.current) return;
      setError(caught instanceof Error ? caught.message : "Could not add this application. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <header className={s.topbar}>
        <Link className={s.brand} href="/applications"><span className="sg-app-mark">SG</span>Server Guy</Link>
        <Link href="/applications">All applications</Link>
      </header>
      <section className={`${s.content} ${s.newContent}`} aria-labelledby="new-application-heading">
        <div className={s.heading}><div><h1 id="new-application-heading">Add application</h1><p>Each application has its own chats, decisions, and checks.</p></div></div>
        <form className={s.form} onSubmit={(event) => { event.preventDefault(); void createApplication(); }}>
          <div className={s.githubConnection}><div><strong>{githubLogin ? `GitHub · ${githubLogin}` : "Connect GitHub first"}</strong><p className={s.helper}>{githubLogin ? "Repository access is verified when you add the application." : "Choose the login Server Guy should use for this repository."}</p></div><Link href="/setup/github?from=add">{githubLogin ? "Change" : "Connect GitHub"}</Link></div>
          <label className={s.field} htmlFor="repository-url">GitHub repository</label>
          <input id="repository-url" name="repositoryUrl" autoComplete="url" spellCheck={false} disabled={busy} value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repository" required type="text" aria-describedby="repository-help" />
          <p className={s.helper} id="repository-help">HTTPS and SSH repository URLs are supported.</p>
          <fieldset disabled={busy} className={s.permissions}>
            <legend>Permission policy</legend>
            <div className={s.options}>
              {permissionOptions.map(([value, option]) => <label key={value}><input type="radio" name="approvalMode" value={value} checked={approvalMode === value} onChange={() => setApprovalMode(value)} />{option.label}</label>)}
            </div>
            <p className={s.helper}>{APPROVAL_MODES[approvalMode].hint}</p>
          </fieldset>
          <p className={s.scope}>Target: <strong>Production</strong>. Adding an application checks repository access; it does not deploy or change your code.</p>
          {error && <p role="alert" className={s.error}>{error}</p>}
          {busy && <p className={s.helper} role="status">Creation continues if you leave this page.</p>}
          <div className={s.actions}><Link href="/applications">{busy ? "Back to applications" : "Cancel"}</Link><button className={s.primary} disabled={busy || !repositoryUrl.trim() || !githubLogin} type="submit">{busy && <SpinnerGap className="spin" />}{busy ? "Checking repository…" : "Add application"}</button></div>
        </form>
      </section>
    </main>
  );
}

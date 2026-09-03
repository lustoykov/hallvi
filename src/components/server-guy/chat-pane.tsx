"use client";

import { Archive, Check, GithubLogo, SpinnerGap } from "@phosphor-icons/react";
import { useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PRODUCTION_BASELINE } from "@/server/phase-one-spec";
import type {
  ApprovalMode,
  Chat,
  GateCheck,
  PhaseOneOperatorView,
} from "@/server/types";

import { formatTimestamp } from "./format";

export interface CreateApplicationInput {
  repositoryUrl: string;
  approvalMode: ApprovalMode;
}

const permissionOptions: Array<{ value: ApprovalMode; label: string; hint: string }> = [
  { value: "pi-decides", label: "Pi decides", hint: "Pi asks when the consequence warrants it." },
  { value: "always-ask", label: "Always ask", hint: "Ask before every external change." },
  { value: "full-autonomy", label: "Full autonomy", hint: "Act within the launch scope without asking." },
];

function LaunchForm({
  checks,
  busy,
  error,
  onCreate,
}: {
  checks: GateCheck[];
  busy: string | null;
  error: string | null;
  onCreate: (input: CreateApplicationInput) => void;
}) {
  const [repositoryUrl, setRepositoryUrl] = useState("https://github.com/lustoykov/todo-fastapi");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("pi-decides");
  const passed = checks.filter((check) => check.status === "passed").length;
  const selectedPermission = permissionOptions.find((option) => option.value === approvalMode)!;

  return (
    <form
      className="sg-launch-card"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ repositoryUrl, approvalMode });
      }}
    >
      <div className="sg-card-heading">
        <div>
          <span className="sg-eyebrow">Phase deliverable</span>
          <h2>Launch Brief</h2>
        </div>
        <span>{passed} of {checks.length} checks</span>
      </div>
      <label className="sg-field">
        <span>GitHub repository</span>
        <span className="sg-input-with-icon">
          <GithubLogo weight="fill" />
          <input
            autoComplete="url"
            onChange={(event) => setRepositoryUrl(event.target.value)}
            required
            type="url"
            value={repositoryUrl}
          />
        </span>
      </label>
      <div className="sg-fixed-fact">
        <span>Target environment</span>
        <strong>Production</strong>
        <small>Journey 1 launches one production application.</small>
      </div>
      <fieldset className="sg-permission-field">
        <legend>How should Pi ask for permission?</legend>
        <div className="sg-segmented-control">
          {permissionOptions.map((option) => (
            <button
              aria-pressed={approvalMode === option.value}
              className={approvalMode === option.value ? "selected" : ""}
              key={option.value}
              onClick={() => setApprovalMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <p>{selectedPermission.hint} Applies to this application launch.</p>
      </fieldset>
      <div className="sg-default-priorities">
        <span className="sg-eyebrow">Built into every production launch</span>
        {PRODUCTION_BASELINE.map((rule) => (
          <div key={rule.key}>
            <Check weight="bold" /> {rule.label}
          </div>
        ))}
      </div>
      {error && <div className="sg-error" role="alert">{error}</div>}
      <button className="sg-primary-button" disabled={busy !== null} type="submit">
        {busy === "create" ? <SpinnerGap className="spin" /> : null}
        {busy === "create" ? "Checking repository…" : "Create application workspace"}
      </button>
    </form>
  );
}

export function ChatPane({
  view,
  activeChat,
  checks,
  busy,
  error,
  composer,
  onComposerChange,
  onSend,
  onArchive,
  onCreateApplication,
}: {
  view: PhaseOneOperatorView;
  activeChat: Chat | null;
  checks: GateCheck[];
  busy: string | null;
  error: string | null;
  composer: string;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onArchive: () => void;
  onCreateApplication: (input: CreateApplicationInput) => void;
}) {
  const application = view.application;

  return (
    <section className="sg-chat-pane">
      <header className="sg-pane-title sg-chat-title">
        <div>
          <span className="sg-eyebrow">Working toward</span>
          <strong>Launch Brief</strong>
        </div>
        {activeChat && !activeChat.isPrimary && !activeChat.archivedAt && (
          <button className="sg-text-button" disabled={busy !== null} onClick={onArchive} type="button">
            <Archive /> Archive chat
          </button>
        )}
      </header>

      <Conversation className="sg-conversation">
        <ConversationContent className="sg-messages">
          {!application && (
            <Message from="assistant">
              <div className="sg-message-heading">
                <span className="sg-avatar">Pi</span>
                <strong>Pi</strong>
                <span className="sg-message-state">Needs input</span>
              </div>
              <MessageContent>
                <MessageResponse>
                  Welcome. Give me the GitHub repository and choose how I should ask for permission. I’ll create a durable Launch Brief and verify the exact repository revision. This step does not change code or create paid infrastructure.
                </MessageResponse>
              </MessageContent>
            </Message>
          )}

          {view.messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <div className="sg-message-heading">
                <span className={`sg-avatar ${message.role === "user" ? "user" : ""}`}>
                  {message.role === "user" ? "You" : "Pi"}
                </span>
                <strong>{message.role === "user" ? "You" : "Pi"}</strong>
                {message.source === "server-guy" && <span className="sg-source-tag">Recorded event</span>}
                <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
              </div>
              <MessageContent>
                <MessageResponse>{message.body}</MessageResponse>
              </MessageContent>
            </Message>
          ))}

          {!application && (
            <LaunchForm checks={checks} busy={busy} error={error} onCreate={onCreateApplication} />
          )}

          {application && view.workspace?.status === "ready" && (
            <div className="sg-ready-card">
              <span className="sg-ready-icon"><Check weight="bold" /></span>
              <div>
                <strong>Launch Brief ready</strong>
                <p>All four checks pass. Phase 2 is intentionally not implemented in this pull request.</p>
              </div>
            </div>
          )}
          {error && application && <div className="sg-error" role="alert">{error}</div>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form
        className="sg-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          disabled={!application || !activeChat || Boolean(activeChat.archivedAt)}
          id="pi-composer"
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!busy) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={application ? "Ask Pi, correct a decision, or add context…" : "Create the application workspace to start chatting"}
          rows={2}
          value={composer}
        />
        <div>
          <span>Recognized Decisions are saved for the application and shown in the shared Operator View.</span>
          <button
            disabled={
              !composer.trim() ||
              busy !== null ||
              !application ||
              !activeChat ||
              Boolean(activeChat.archivedAt)
            }
            type="submit"
          >
            {busy === "message" ? <SpinnerGap className="spin" /> : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

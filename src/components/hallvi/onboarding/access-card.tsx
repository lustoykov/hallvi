"use client";

// The hand-over: the application works, here is how to open it, and here is
// who else could.
//
// Three rungs, always in this order, and every address says out loud where it
// works: on this computer, for anyone who has the address, at the owner's own
// name. The first rung is where every deployment lands, because it is the
// only one that exposes nothing while the owner claims the application's
// first account. The second needs no domain and no other account; the third
// continues from an application that already works.

import {
  ArrowSquareOut,
  Check,
  Globe,
  Laptop,
  SignIn,
  WifiHigh,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { RequestCard } from "./pieces";

import "./onboarding.css";

export type Reach = "private" | "direct" | "domain";

/** 203.0.113.9 → https://203-0-113-9.sslip.io. Null for anything else. */
export function directAddress(address: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address)
    ? `https://${address.replaceAll(".", "-")}.sslip.io`
    : null;
}

export interface ReachLadderProps {
  application: string;
  /** Null once the application is public and the tunnel record is gone. */
  privateUrl: string | null;
  /** A home-network machine cannot be given a public address by Hallvi. */
  home: boolean;
  /** https://203-0-113-9.sslip.io, or the machine's own address at home. */
  directUrl: string | null;
  domainUrl: string | null;
  reach: Reach;
  /**
   * Whether the first visitor would become its administrator. "unknown" is
   * the honest answer until Pi has recorded it: the ladder cautions, and the
   * check stays with Pi, which looks before it publishes anything.
   */
  unclaimed: boolean | "unknown";
  busy: Reach | null;
  onDirect: () => void;
  onDomain: () => void;
}

function Rung({
  icon,
  title,
  where,
  url,
  current,
  children,
}: {
  icon: ReactNode;
  title: string;
  where: string;
  url?: string | null;
  current: boolean;
  children?: ReactNode;
}) {
  return (
    <li data-current={current ? "" : undefined}>
      <span className="hv-ob-rung-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>
          {title}
          {current && (
            <em>
              <Check weight="bold" aria-hidden="true" /> on
            </em>
          )}
        </strong>
        <span>{where}</span>
        {url && current && (
          <a href={url} target="_blank" rel="noreferrer noopener">
            {url} <ArrowSquareOut weight="bold" aria-hidden="true" />
          </a>
        )}
        {children}
      </div>
    </li>
  );
}

/** Who can open the application, and the next rung up. */
export function ReachLadder({
  application,
  privateUrl,
  home,
  directUrl,
  domainUrl,
  reach,
  unclaimed,
  busy,
  onDirect,
  onDomain,
}: ReachLadderProps) {
  const held = unclaimed === true && reach === "private";
  return (
    <>
      {unclaimed !== false && reach === "private" && (
        <p className="hv-ob-note">
          <SignIn weight="bold" aria-hidden="true" />{" "}
          {unclaimed === true
            ? `${application} gives its administrator account to whoever opens it first. Open it now and create yours, while you are the only one who can reach it.`
            : `Many applications give their administrator account to whoever opens them first. If ${application} asks you to create one, do it through the private link before opening it to anyone else; Hallvi also checks before it publishes.`}
        </p>
      )}
      <h4 className="hv-ob-ladder-title">Who can open it</h4>
      <ol className="hv-ob-ladder">
        <Rung
          icon={<Laptop />}
          title="Only this computer"
          where="A private link. It works in a browser on the computer running Hallvi, for as long as the SSH tunnel stays open — which outlasts Hallvi itself, so quitting does not close it. Nothing on the server is open to anyone else."
          url={privateUrl}
          current={reach === "private"}
        />
        {home ? (
          <Rung
            icon={<WifiHigh />}
            title="Devices on your network"
            where="The machine’s own address on your home network. Phones and computers on the same Wi-Fi can open it. The connection is not encrypted, and it does not work from outside your home."
            url={directUrl}
            current={reach === "direct"}
          >
            {reach === "private" && (
              <button
                type="button"
                className="hv-ob-rung-action"
                disabled={busy !== null}
                onClick={onDirect}
              >
                {busy === "direct" ? "Asking Hallvi…" : "Open it to my network"}
              </button>
            )}
          </Rung>
        ) : (
          <Rung
            icon={<Globe />}
            title="Anyone with the address"
            where="A public address with HTTPS, straight to your server. No domain and no other account needed."
            url={directUrl}
            current={reach === "direct"}
          >
            {reach === "private" && directUrl && (
              <>
                <details className="hv-ob-more">
                  <summary>
                    What Hallvi changes, and what the address is
                  </summary>
                  <p>
                    It opens ports 80 and 443 on the server, puts a small web
                    server (Caddy) in front for a real HTTPS certificate, and
                    checks the result from outside. Everything else stays
                    closed. The name <code>{new URL(directUrl).host}</code> is
                    your server&rsquo;s IP address written as a name by
                    sslip.io, a free public service; a certificate cannot be
                    issued for a bare IP address here yet. If that service is
                    ever down the name stops working; the application keeps
                    running, and Hallvi can reopen the private link.
                  </p>
                </details>
                <button
                  type="button"
                  className="hv-ob-rung-action"
                  disabled={busy !== null || held}
                  onClick={onDirect}
                >
                  {busy === "direct" ? "Asking Hallvi…" : "Make it public"}
                </button>
                {held && (
                  <small>Create your administrator account first.</small>
                )}
              </>
            )}
          </Rung>
        )}
        <Rung
          icon={<Globe weight="fill" />}
          title="Your own domain"
          where={
            home
              ? "Reaching a home machine from the internet needs a tunnel or a forwarded port. Hallvi does not set that up yet."
              : "A name you own, such as app.example.com, with HTTPS. Works with any DNS provider; with Cloudflare, Hallvi can add the record for you."
          }
          url={domainUrl}
          current={reach === "domain"}
        >
          {!home && reach !== "domain" && (
            <button
              type="button"
              className="hv-ob-rung-action"
              disabled={busy !== null || held}
              onClick={onDomain}
            >
              Use my domain
            </button>
          )}
        </Rung>
      </ol>
    </>
  );
}

export interface AccessCardProps extends ReachLadderProps {
  /** What Hallvi actually verified, in its own words. */
  verified: string[];
  /** Whether the tunnel behind the private link is open right now. */
  privateOpen: boolean;
  onReopen: () => void;
}

/** The whole hand-over as one turn. The prototype draws it; see ReachLadder. */
export function AccessCard(props: AccessCardProps) {
  const { application, reach } = props;
  const best =
    reach === "domain" && props.domainUrl
      ? props.domainUrl
      : reach === "direct" && props.directUrl
        ? props.directUrl
        : (props.privateUrl ?? "#");
  return (
    <RequestCard
      asks={`has ${application} running`}
      state="done"
      label={`${application} is running`}
    >
      <div className="hv-ob-handover">
        <div>
          <span className="hv-ob-chip" data-tone="verified">
            <Check weight="bold" aria-hidden="true" /> Verified
          </span>
          <h4>{application} is running</h4>
          <ul className="hv-ob-verified">
            {props.verified.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        {reach === "private" && !props.privateOpen ? (
          <button
            type="button"
            className="hv-ob-primary"
            onClick={props.onReopen}
          >
            Reopen the private link
          </button>
        ) : (
          <a
            className="hv-ob-primary"
            href={best}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open {application}{" "}
            <ArrowSquareOut weight="bold" aria-hidden="true" />
          </a>
        )}
      </div>
      <ReachLadder {...props} />
    </RequestCard>
  );
}

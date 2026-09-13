"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CaretUpDown,
  Check,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useRef, type MouseEvent } from "react";

/**
 * Which application you are in, and the way to another one. Placement is a
 * property rather than four copies of the markup, so the shell and the
 * prototype's variant explorer render the same component.
 *
 * - `navigation` sits in the sidebar head, where the product mark used to
 *   be: identity belongs beside the destinations it scopes.
 * - `topbar` is the original: identity above the workspace.
 * - `breadcrumb` states the path and has no menu; switching is the
 *   Applications screen, so there is one way to choose an application.
 */
export type IdentityVariant = "navigation" | "topbar" | "breadcrumb";

export interface IdentityApplication {
  id: string;
  name?: string;
  repositoryOwner: string;
  repositoryName: string;
}

function initial(application: IdentityApplication) {
  return (application.name ?? application.repositoryName)
    .slice(0, 1)
    .toUpperCase();
}

function nameOf(application: IdentityApplication) {
  return application.name ?? application.repositoryName;
}

export function ApplicationIdentity({
  variant,
  application,
  applications,
  menuId,
  hrefFor,
  onSelect,
  addHref,
  onRemove,
  disabled,
  listHref = "/applications",
}: {
  variant: IdentityVariant;
  application: IdentityApplication | null | undefined;
  applications: IdentityApplication[];
  menuId: string;
  hrefFor: (item: IdentityApplication) => string;
  /** Intercepts a choice; the prototype swaps scenario instead of routing. */
  onSelect?: (item: IdentityApplication, event: MouseEvent) => void;
  addHref: string;
  onRemove?: () => void;
  disabled?: boolean;
  listHref?: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  if (!application) return null;
  const repository = `${application.repositoryOwner}/${application.repositoryName}`;

  if (variant === "breadcrumb")
    return (
      <div className="sg-identity-breadcrumb">
        <Link href={listHref}>Applications</Link>
        <span aria-hidden="true">/</span>
        <strong title={nameOf(application)}>{nameOf(application)}</strong>
        <small title={repository}>{repository}</small>
      </div>
    );

  return (
    <div className={`sg-app-identity sg-identity-${variant}`}>
      <button
        ref={anchor}
        className="sg-identity"
        type="button"
        popoverTarget={menuId}
        disabled={disabled}
        aria-label={`Switch application: ${nameOf(application)}`}
      >
        <span className="sg-identity-mark" aria-hidden="true">
          {initial(application)}
        </span>
        {/* Both of these truncate in a 240px column — which is right — so
            each carries its full value for hover and assistive technology.
            "docker/getting-started-app" was cut to "docker/getting-started-"
            on every page of that application with no way to read the rest. */}
        <span className="sg-identity-text">
          <strong title={nameOf(application)}>{nameOf(application)}</strong>
          <small title={repository}>{repository}</small>
        </span>
        <CaretUpDown aria-hidden="true" weight="bold" />
      </button>
      <nav
        id={menuId}
        popover="auto"
        className="sg-application-menu"
        aria-label="Applications"
        onBeforeToggle={(event) => {
          if (event.newState !== "open") return;
          const box = anchor.current?.getBoundingClientRect();
          if (!box) return;
          const menu = event.currentTarget;
          const width = Math.max(box.width, 260);
          menu.style.minWidth = `${width}px`;
          menu.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
          // Below the control normally; above it when the control sits low.
          const room = window.innerHeight - box.bottom;
          menu.style.top = room > 280 ? `${box.bottom + 6}px` : "";
          menu.style.bottom =
            room > 280 ? "" : `${window.innerHeight - box.top + 6}px`;
        }}
      >
        <span className="sg-eyebrow sg-application-menu-label">
          Switch application
        </span>
        {applications.map((item) => (
          <Link
            key={item.id}
            href={hrefFor(item)}
            aria-current={item.id === application.id ? "page" : undefined}
            onClick={(event) => {
              event.currentTarget
                .closest<HTMLElement>("[popover]")
                ?.hidePopover();
              onSelect?.(item, event);
            }}
          >
            <span aria-hidden="true" className="sg-application-menu-mark">
              {initial(item)}
            </span>
            <div>
              <strong>{nameOf(item)}</strong>
              <small>
                {item.repositoryOwner}/{item.repositoryName}
              </small>
            </div>
            {item.id === application.id && (
              <Check aria-label="Current application" weight="bold" />
            )}
          </Link>
        ))}
        <Link className="sg-application-menu-action" href={addHref}>
          <Plus /> Add application
        </Link>
        <Link className="sg-application-menu-action" href={listHref}>
          <ArrowLeft /> All applications
        </Link>
        {onRemove && (
          <>
            <hr />
            <button
              type="button"
              className="sg-remove-application"
              disabled={disabled}
              onClick={(event) => {
                event.currentTarget
                  .closest<HTMLElement>("[popover]")
                  ?.hidePopover();
                onRemove();
              }}
            >
              <Trash /> Remove application…
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

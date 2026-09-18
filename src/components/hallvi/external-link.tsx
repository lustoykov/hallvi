"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import { createContext, useContext } from "react";

/**
 * True when this application's repository is synthetic (the QA fixture): its
 * GitHub pages do not exist, so outbound links are shown but never followed.
 * The server page sets it from the fixture root it runs under.
 */
export const DemoContext = createContext(false);

export function useDemo() {
  return useContext(DemoContext);
}

/** An outbound link to GitHub or another external page, demo-aware. */
export function ExternalLink({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const demo = useDemo();
  if (demo)
    return (
      <span
        className={`hv-demo-link${className ? ` ${className}` : ""}`}
        title="Demo repository: this page does not exist on GitHub"
      >
        {children} <em>demo · not a real link</em>
      </span>
    );
  return (
    <a
      className={className}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      {children} <ArrowSquareOut aria-hidden="true" />
    </a>
  );
}

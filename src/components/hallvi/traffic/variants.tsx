"use client";

// Development tools on the Traffic page, bottom right: simulated traffic, and
// whatever else is passed in. Absent in a production build.

import type { ReactNode } from "react";

export function DevPanel({ children }: { children?: ReactNode }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <aside className="tf-variants" aria-label="Development">
      {children}
    </aside>
  );
}

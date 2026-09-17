// Every dark, monospace panel in the product is a terminal, and a terminal
// wears its three lights at the top left. One component, so the next one
// cannot forget them.

import "./terminal-lights.css";

export function TerminalLights() {
  return (
    <span className="hd-term-lights" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * The slim title bar for a terminal that has no header of its own. Hidden
 * from assistive technology: every panel it sits in already carries a label,
 * and some are lists or logs whose children must be items.
 */
export function TerminalBar({ title }: { title: string }) {
  return (
    <div className="hd-term-bar" aria-hidden="true">
      <TerminalLights />
      <span>{title}</span>
    </div>
  );
}

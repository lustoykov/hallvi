import type { CSSProperties } from "react";

/**
 * Hallvi's face: the mark from the homepage, wherever Hallvi speaks or the
 * product names itself. It replaced a letter H in a circle, which said
 * nothing about who was talking.
 */
export function HallviMark({
  size = 22,
  onDark = false,
}: {
  size?: number;
  /** On the navy top bar the tile lightens so the face still reads. */
  onDark?: boolean;
}) {
  return (
    <span
      className="hv-mark"
      data-on-dark={onDark ? "" : undefined}
      style={{ "--size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <i />
      <i />
      <b />
    </span>
  );
}

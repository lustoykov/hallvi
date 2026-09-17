"use client";

import { useEffect, useState } from "react";

/**
 * Whether something in the transcript has scrolled out of sight.
 *
 * Two things sit above the composer only while the thing they refer to is not
 * on screen: the outstanding-secret chip, and the line saying what the turn in
 * flight is doing. Both are useful when the reader cannot see the real thing
 * and are the same sentence twice when they can.
 *
 * The retry loop is the part worth keeping. What is being watched is a
 * sibling in the transcript, so on a cold load this runs a frame or two before
 * there is anything to observe, and giving up on the first miss is how the
 * hint goes missing exactly when the transcript is long enough to need it.
 */
export function useOffScreen(elementId: string | null, active: boolean) {
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!active || !elementId) return;
    let watch: IntersectionObserver | null = null;
    let frame = 0;
    let tries = 0;
    const attach = () => {
      const block = document.getElementById(elementId);
      if (block) {
        watch = new IntersectionObserver(
          ([entry]) => setAway(!entry.isIntersecting),
          { threshold: 0.12 },
        );
        watch.observe(block);
        return;
      }
      if (tries++ < 60) frame = requestAnimationFrame(attach);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      watch?.disconnect();
    };
  }, [elementId, active]);

  // Derived rather than reset in the effect: with nothing to watch the answer
  // is "not away", and writing that back through state is a second render to
  // reach a value already known.
  return Boolean(active && elementId && away);
}

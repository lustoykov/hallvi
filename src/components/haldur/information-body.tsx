"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";

export function InformationBody({ source }: { source: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  // A record can be a sentence or six dense lines. Fold the long ones so a
  // view full of cards stays scannable, and only offer the control when
  // there is something folded away.
  useEffect(() => {
    const element = body.current;
    // Only measurable while folded; unfolded, the answer stays as it was.
    if (!element || open) return;
    const timer = setTimeout(
      () => setLong(element.scrollHeight - element.clientHeight > 4),
      0,
    );
    return () => clearTimeout(timer);
  }, [source, open]);

  return (
    <>
      <div
        className="hd-info-body"
        ref={body}
        data-folded={open ? undefined : ""}
      >
        <Markdown source={source} />
      </div>
      {long && (
        <button
          type="button"
          className="hd-info-unfold"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <CaretDown weight="bold" aria-hidden="true" />
          {open ? "Show less" : "Read the whole account"}
        </button>
      )}
    </>
  );
}

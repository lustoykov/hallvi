"use client";

// A long conversation, drawn from its latest message back.
//
// Drawing every message before showing any made opening a conversation cost
// what its whole history costs, and then it travelled from the first message
// to the last while the reader watched. It now opens on its latest messages,
// already in place. The earlier ones are drawn above them a stretch at a
// time, between frames, and what is on screen does not move as they arrive.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { StickToBottomContext } from "use-stick-to-bottom";

/** Drawn at once on opening: a few screens of the newest messages. */
const LATEST = 24;
/** Drawn above them in each step after that. */
const STRETCH = 48;
/** How far from its latest message a conversation still counts as on it. */
const NEAR = 70;

export function useLatestFirst(conversationId: string | null, count: number) {
  const [drawing, setDrawing] = useState(() => ({
    conversationId,
    earlier: Math.max(0, count - LATEST),
  }));
  // Another conversation starts again from its own latest messages.
  if (drawing.conversationId !== conversationId)
    setDrawing({ conversationId, earlier: Math.max(0, count - LATEST) });
  /** How many messages, from the first, are still to be drawn. */
  const earlier = Math.max(0, Math.min(drawing.earlier, count - LATEST));
  const conversation = useRef<StickToBottomContext>(null);
  /** Where the reader was last seen, to notice them going up. */
  const seen = useRef(0);

  // On its latest message before it is first shown, not after a journey.
  useLayoutEffect(() => {
    const scroller = conversation.current?.scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight });
    seen.current = scroller.scrollTop;
  }, [conversationId]);

  // The browser's own scroll anchoring is set aside for the one change that
  // adds messages above, so the place is kept once, and the same way in
  // every browser.
  const place = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const scroller = conversation.current?.scrollRef.current;
    const before = place.current;
    place.current = null;
    if (!scroller || !before) return;
    scroller.scrollTo({
      top: before.top + scroller.scrollHeight - before.height,
    });
    scroller.style.removeProperty("overflow-anchor");
    seen.current = scroller.scrollTop;
  }, [earlier]);
  // The conversation keeps to its latest message as it grows, and learns
  // that the reader has left it from the wheel. While messages are being
  // added above, a key or the scrollbar would go unnoticed, and the next
  // stretch would carry the reader back down. So their going up is noticed
  // here: when they scroll, and before each stretch is drawn.
  const notice = useCallback(() => {
    const scroller = conversation.current?.scrollRef.current;
    if (!scroller) return;
    const top = scroller.scrollTop;
    if (
      top < seen.current - 2 &&
      scroller.scrollHeight - scroller.clientHeight - top > NEAR
    )
      conversation.current?.stopScroll();
    seen.current = top;
  }, []);
  const filling = earlier > 0;
  useEffect(() => {
    const scroller = conversation.current?.scrollRef.current;
    if (!filling || !scroller) return;
    scroller.addEventListener("scroll", notice, { passive: true });
    return () => scroller.removeEventListener("scroll", notice);
  }, [filling, notice]);
  useEffect(() => {
    if (!earlier) return;
    const timer = window.setTimeout(() => {
      notice();
      const scroller = conversation.current?.scrollRef.current;
      if (scroller) {
        place.current = {
          height: scroller.scrollHeight,
          top: scroller.scrollTop,
        };
        scroller.style.setProperty("overflow-anchor", "none");
      }
      // Drawn at once, so nothing moves between the measure and the change.
      flushSync(() =>
        setDrawing((current) => ({
          ...current,
          earlier: Math.max(0, earlier - STRETCH),
        })),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [earlier, notice]);

  /** Take the reader to a message or a record, and leave them there. */
  const show = useCallback((element: Element) => {
    conversation.current?.stopScroll();
    element.scrollIntoView({ block: "center" });
  }, []);

  return { earlier, conversation, show };
}

/** Keep a fitting keyboard target visible within its actual scroll ancestors. */
export function revealKeyboardControl(target: HTMLElement) {
  if (!target.matches(":focus-visible")) return;
  const rect = target.getBoundingClientRect();
  let top = 0;
  let bottom = window.innerHeight;
  for (
    let ancestor = target.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowY)) {
      const bounds = ancestor.getBoundingClientRect();
      top = Math.max(top, bounds.top + ancestor.clientTop);
      bottom = Math.min(
        bottom,
        bounds.top + ancestor.clientTop + ancestor.clientHeight,
      );
    }
  }
  if (rect.height <= bottom - top && (rect.top < top || rect.bottom > bottom)) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

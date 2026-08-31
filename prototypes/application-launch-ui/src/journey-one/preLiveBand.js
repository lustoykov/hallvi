// Renders the "setup only · not live yet" band under phases 5-7 as a real DOM
// element, positioned by measurement. CSS anchor positioning was tried first
// and abandoned: Chromium fails to repaint anchored pseudo-elements after the
// web font swap shifts item widths, leaving the band painted against a stale
// layout. A measured element with observers cannot go stale, and the caption
// is centered by flexbox inside the band, so centering is structural.
const CAPTION = "setup only · not live yet";

function position() {
  const rail = document.querySelector(".phase-rail");
  if (!rail) return;
  const phases = rail.querySelectorAll(":scope > .rail-phase");
  if (phases.length < 9) return;
  let band = rail.querySelector(":scope > .pre-live-band");
  if (!band) {
    band = document.createElement("div");
    band.className = "pre-live-band";
    band.append(document.createElement("i"));
    const caption = document.createElement("span");
    caption.textContent = CAPTION;
    band.append(caption);
    band.append(document.createElement("i"));
    rail.append(band);
  }
  const railBox = rail.getBoundingClientRect();
  const first = phases[4].getBoundingClientRect();
  const last = phases[6].getBoundingClientRect();
  band.style.left = `${first.left - railBox.left}px`;
  band.style.width = `${last.right - first.left}px`;
}

const schedule = () => requestAnimationFrame(position);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("resize", schedule);
if (document.fonts?.ready) document.fonts.ready.then(schedule);
schedule();

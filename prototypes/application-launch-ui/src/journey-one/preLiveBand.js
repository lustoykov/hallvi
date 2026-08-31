// Renders the three phase-zone bands under the rail as real DOM elements,
// positioned by measurement: PLAN (1-4), SETUP · NOT LIVE YET (5-7), and
// LIVE (8-9). CSS anchor positioning was tried first and abandoned: Chromium
// fails to repaint anchored pseudo-elements after the web font swap shifts
// item widths. Measured elements with observers cannot go stale, and each
// caption is centered by flexbox inside its band, so centering is structural.
const ZONES = [
  { cls: "zone-plan", from: 0, to: 3, text: "plan" },
  { cls: "zone-setup", from: 4, to: 6, text: "setup · not live yet" },
  { cls: "zone-live", from: 7, to: 8, text: "live" },
];

function position() {
  const rail = document.querySelector(".phase-rail");
  if (!rail) return;
  const phases = rail.querySelectorAll(":scope > .rail-phase");
  if (phases.length < 9) return;
  const railBox = rail.getBoundingClientRect();
  for (const zone of ZONES) {
    let band = rail.querySelector(`:scope > .${zone.cls}`);
    if (!band) {
      band = document.createElement("div");
      band.className = `pre-live-band ${zone.cls}`;
      band.append(document.createElement("i"));
      const caption = document.createElement("span");
      caption.textContent = zone.text;
      band.append(caption);
      band.append(document.createElement("i"));
      rail.append(band);
    }
    const first = phases[zone.from].getBoundingClientRect();
    const last = phases[zone.to].getBoundingClientRect();
    band.style.left = `${first.left - railBox.left}px`;
    band.style.width = `${last.right - first.left}px`;
  }
}

const schedule = () => requestAnimationFrame(position);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("resize", schedule);
if (document.fonts?.ready) document.fonts.ready.then(schedule);
schedule();

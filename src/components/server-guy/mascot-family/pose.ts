import * as THREE from "three";

import { HW, type MouthShape, type Rig } from "./build";
import { memberById, type FamilyId } from "./roster";

/**
 * Motion for the whole family. This is Little Server's render loop from
 * home/mascot-scene.tsx, generalised over body sizes: the same moods,
 * dances and acrobatics, plus the waiting mood, reactions (poke, idle,
 * celebrate, flinch), walking, and each cousin's signature extras.
 */

export type Mood =
  | "ready"
  | "checking"
  | "working"
  | "waiting"
  | "attention"
  | "resting"
  | "celebrating";
export type ActionKind = "poke" | "dance" | "idle" | "celebrate" | "flinch";
export type Action = { kind: ActionKind; start: number; duration: number };

export type PoseInput = {
  /** Milliseconds, and since the previous frame. */
  t: number;
  dt: number;
  mood: Mood;
  moodElapsed: number;
  /** Reduced motion or a snapshot: no loops, travel or flips; poses snap. */
  still: boolean;
  /** Pointer relative to the stage, about -0.5 to 0.5. */
  px: number;
  py: number;
  /** Press spring: 1 is fully squashed; negative is the rebound's stretch. */
  squash: number;
  action: Action | null;
  /** Walking direction on the terminal edge: -1, 0 or 1. */
  walk: number;
  /** Looking down at a log line. */
  look: boolean;
  /** Per-character offset so the family does not blink in unison. */
  offset: number;
};

export type PoseResult = { trick: boolean; face: Face; nap: boolean };

type Face =
  | "smile"
  | "squint"
  | "focus"
  | "hopeful"
  | "concern"
  | "sleep"
  | "happy"
  | "startled";

const TAU = Math.PI * 2;
const { lerp, clamp, smoothstep } = THREE.MathUtils;
const bump = (x: number, a: number, b: number) =>
  x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI);
const wrap = (a: number) => a - TAU * Math.round(a / TAU);

/** Trove's hug, solved with forward kinematics for its shoulders and disk. */
const HUG = { sx: -0.75, sz: -0.9, ex: 0.1, ez: 0 };

export function actionDuration(
  kind: ActionKind,
  id: FamilyId,
  still: boolean,
): number {
  const m = memberById(id);
  if (still)
    return {
      poke: 700,
      dance: 1400,
      idle: m.idle === "nap" ? 3000 : 1800,
      celebrate: 1300,
      flinch: 0,
    }[kind];
  if (kind === "dance")
    return m.dance === "backflip" || m.dance === "cartwheel" ? 2600 : 3680;
  if (kind === "idle")
    return {
      wave: 2600,
      look: 3400,
      nap: 3800,
      peek: 3000,
      pat: 2800,
      listen: 3200,
    }[m.idle];
  return { poke: 950, celebrate: 1400, flinch: 480 }[kind];
}

/** Idle behaviours only make sense when nothing is happening. */
export const idleAllowed = (mood: Mood) =>
  mood === "ready" || mood === "resting";

export function applyPose(rig: Rig, p: PoseInput): PoseResult {
  const m = memberById(rig.id);
  const { t, still } = p;
  // Frame-rate independent smoothing; snapshots and reduced motion snap.
  const ease = (k: number) =>
    still ? 1 : 1 - Math.pow(1 - k, Math.min(p.dt, 64) / 16.67);
  const a =
    p.action && t - p.action.start < p.action.duration ? p.action : null;
  const kind = a?.kind ?? null;
  const ae = a ? t - a.start : 0;
  const ap = a ? ae / a.duration : 0;

  const routine = m.dance;
  const special = routine === "backflip" || routine === "cartwheel";
  const dancing = kind === "dance" && !still;
  const jumping = kind === "celebrate" && !still;
  const idle = kind === "idle" ? m.idle : null;
  const moving = !still && idle !== null;
  const poke = kind === "poke";
  const walking = p.walk !== 0 && !still;
  const busy = dancing || jumping;
  const napping = idle === "nap";
  const celebrate =
    (p.mood === "celebrating" || kind === "celebrate") && !dancing;
  // A reaction wakes a sleeper for its length; it dozes off again afterwards.
  const awake =
    kind === "poke" ||
    kind === "dance" ||
    kind === "celebrate" ||
    kind === "flinch" ||
    (idle !== null && !napping);
  const resting =
    (p.mood === "resting" || napping) && !busy && !celebrate && !awake;
  const waving = idle === "wave";
  const checking = p.mood === "checking" && !busy;
  const working = p.mood === "working" && !busy;
  const waiting = p.mood === "waiting" && !busy && !napping;
  const attention = p.mood === "attention" && !busy;

  // Expression.
  let face: Face = "smile";
  if (dancing || celebrate || waving || (kind === "dance" && still))
    face = "happy";
  else if (poke)
    face =
      (rig.id === "tower" || rig.id === "relay") && ap < 0.42 && !still
        ? "startled"
        : "happy";
  else if (resting) face = "sleep";
  else if (attention)
    face = kind === "flinch" && ae < 320 ? "startled" : "concern";
  else if (working) face = "focus";
  else if (checking) face = "squint";
  else if (waiting || idle === "peek" || idle === "listen") face = "hopeful";
  else if (idle === "pat") face = ap > 0.55 ? "happy" : "smile";

  // Gaze: eyes shift toward the pointer; states and behaviours steer them.
  let gx = clamp(p.px, -0.6, 0.6) * 0.1;
  let gy = -clamp(p.py, -0.5, 0.9) * 0.06;
  if (checking) {
    gx = gx * 0.3 - 0.01 + (still ? 0 : Math.sin(t * 0.0021) * 0.022);
    gy = -0.025;
  }
  if (waiting) {
    gx *= 0.35;
    gy *= 0.35;
  }
  if (moving && idle === "look") gx = Math.sin(ap * TAU) * 0.07;
  if (moving && idle === "listen") gx = Math.sin(ap * TAU) * 0.06;
  if (moving && idle === "peek")
    gx =
      ap > 0.3 && ap < 0.7 ? Math.sin(((ap - 0.3) / 0.4) * TAU) * 0.08 : 0.04;
  if (idle === "pat" || p.look) {
    gx *= 0.3;
    gy = -0.07;
  }
  if (resting) gx = gy = 0;
  const blinking = !still && (t + p.offset) % 5300 > 5120;
  applyFace(rig, face, gx, gy, blinking);

  // Body orientation, as Little Server: lean toward the pointer, a slow sway.
  const body = rig.body;
  const sway = still ? 0 : Math.sin(t * 0.00055) * 0.025;
  let ry = p.px * 0.16 + (checking ? -0.08 : sway);
  let rz = attention
    ? -0.07
    : checking
      ? 0.055
      : waiting
        ? 0.035
        : still
          ? 0
          : Math.sin(t * 0.001) * 0.009;
  let rx = resting ? 0.05 : checking ? 0.06 : p.py * 0.06;
  // Waiting turns to face the camera: it is looking at you.
  if (waiting) ry = 0.127 + p.px * 0.06 + sway * 0.4;
  if (resting) rz = still ? 0 : Math.sin(t * 0.0009) * 0.035;
  if (p.look) rx += 0.1;
  if (idle === "pat") rx += 0.08;
  let x = 0;
  let y = 0;
  let snap = still || dancing;

  // Breathing: slower and deeper while asleep.
  const breath = still
    ? 0
    : Math.sin(t * (resting ? 0.0012 : attention ? 0.0015 : 0.0019) + p.offset);
  let sy = 1 + breath * (resting ? 0.018 : 0.011);
  let sxz = 1 - breath * 0.005;

  if (waving && !still) rz = Math.sin(ae * 0.008) * 0.045;

  if (jumping) {
    // A wind-up, one big hop and one small one, arms up the whole way.
    const hop1 = bump(ae, 110, 620);
    const hop2 = bump(ae, 700, 1120);
    y = hop1 * 0.34 + hop2 * 0.18;
    const rising =
      ae > 110 && ae < 620
        ? Math.max(0, Math.sin(((ae - 110) / 510) * TAU))
        : 0;
    const squash =
      bump(ae, 0, 130) * 0.1 +
      bump(ae, 590, 730) * 0.12 +
      bump(ae, 1090, 1260) * 0.07;
    sy *= 1 - squash + rising * 0.05;
    sxz *= 1 + squash * 0.5 - rising * 0.02;
    rz = Math.sin(ae * 0.012) * 0.05;
  }

  if (poke && !still) {
    if (rig.id === "server") y += bump(ae, 60, 420) * 0.12;
    if (rig.id === "tower") {
      sy *= 1 + bump(ae, 0, 460) * 0.08;
      sxz *= 1 - bump(ae, 0, 460) * 0.03;
    }
    if (rig.id === "rack") {
      // A loaf wobble: squash, stretch, settle; a tiny hop on the first beat.
      const j = Math.exp(-ae / 280) * Math.sin(ae * 0.03);
      sy *= 1 - j * 0.16;
      sxz *= 1 + j * 0.09;
      y += bump(ae, 0, 240) * 0.06;
    }
    if (rig.id === "pip") {
      ry += smoothstep(ae, 60, 760) * TAU;
      y += bump(ae, 60, 520) * 0.14;
      snap = true;
    }
    if (rig.id === "vault") {
      // Hugs the disk tighter with a happy little bounce.
      sxz *= 1 - bump(ae, 0, 700) * 0.04;
      sy *= 1 + bump(ae, 0, 700) * 0.03;
      y += bump(ae, 100, 460) * 0.07;
    }
    if (rig.id === "relay") y += bump(ae, 0, 300) * 0.08;
  }

  if (kind === "flinch" && !still)
    x += Math.sin(ae * 0.06) * 0.035 * (1 - ae / 480);

  if (moving) {
    if (idle === "look") ry = Math.sin(ap * TAU) * 0.5;
    if (idle === "listen") rz = Math.sin(ap * TAU) * 0.08;
    if (idle === "peek") {
      x = 0.35 * (smoothstep(ap, 0.05, 0.3) - smoothstep(ap, 0.7, 0.95));
      y += (bump(ap, 0.05, 0.3) + bump(ap, 0.7, 0.95)) * 0.12;
      ry =
        ap > 0.3 && ap < 0.7
          ? Math.sin(((ap - 0.3) / 0.4) * TAU) * 0.45
          : ap <= 0.3
            ? 0.3
            : -0.3;
    }
  }

  if (walking) {
    const ph = t * 0.0125;
    ry = p.walk * 0.62;
    rz = Math.sin(ph) * 0.03;
    rx = 0.03;
    y += Math.abs(Math.sin(ph)) * 0.035;
  }

  // Little Server's dances.
  const danceLength = a?.duration ?? 0;
  const danceActive = dancing && ae < danceLength;
  const envelope = danceActive
    ? Math.min(1, ae / 220, (danceLength - ae) / 350)
    : 0;
  const beat = ae / 460;
  const danceStep = Math.sin(beat * Math.PI) * envelope;
  const robotPoses = [-1, -1, 0, 1, 1, 0, -1, 0];
  const poseIndex = Math.floor(beat) % robotPoses.length;
  const robotBeat =
    lerp(
      robotPoses[poseIndex],
      robotPoses[(poseIndex + 1) % robotPoses.length],
      smoothstep(beat % 1, 0, 0.22),
    ) * envelope;
  if (dancing && !special) {
    x = danceStep * (routine === "floss" ? -0.12 : 0.065);
    y = (1 - Math.cos(beat * TAU)) * 0.012 * envelope;
    ry = routine === "robot" ? robotBeat * 0.3 : danceStep * 0.2;
    rz = routine === "robot" ? robotBeat * 0.04 : -danceStep * 0.065;
  }

  // A spin can leave a whole turn behind; unwind it invisibly.
  if (!snap && Math.abs(body.rotation.y) > Math.PI)
    body.rotation.y = wrap(body.rotation.y);
  body.rotation.set(
    snap ? rx : lerp(body.rotation.x, rx, ease(0.1)),
    snap ? ry : lerp(body.rotation.y, ry, ease(0.07)),
    snap ? rz : lerp(body.rotation.z, rz, ease(0.1)),
  );
  body.position.set(x, y, 0);
  const press = p.squash;
  sy *= 1 - 0.14 * press;
  sxz *= 1 + 0.1 * press;
  body.scale.set(sxz, sy, sxz);

  // Arms.
  const vault = rig.id === "vault";
  rig.arms.forEach((arm, i) => {
    const side = arm.side;
    let angle = side * rig.armRest;
    let sx = 0;
    let elbow = 0;
    let ez = 0;
    let wz = 0;
    const busyArm =
      (checking && i === 0) ||
      (working && i === 1) ||
      (waiting && i === rig.cardHand) ||
      celebrate ||
      dancing ||
      waving ||
      (walking && !vault);
    if (vault && !busyArm && !working) {
      angle = side * HUG.sz;
      sx = HUG.sx;
      elbow = HUG.ex;
      ez = side * HUG.ez;
      if (poke && !still) {
        // Clutch the disk a little tighter.
        const s = bump(ae, 0, 700);
        angle -= side * s * 0.12;
        ez -= side * s * 0.2;
      }
      if (moving && idle === "pat" && i === 0) {
        const pat = bump(ap, 0.2, 0.45) + bump(ap, 0.45, 0.7);
        angle += side * pat * 0.35;
        elbow -= pat * 0.4;
      }
    }
    if (checking && i === 0) {
      angle = -0.65;
      elbow = -0.2;
    }
    if (working && i === 1) {
      angle = 0.95 + (!still ? Math.sin(t * 0.004) * 0.12 : 0);
      elbow = 0.22;
    }
    if (waiting && i === rig.cardHand) {
      if (!still && p.moodElapsed < 1500)
        angle = side * (2.4 + Math.sin(p.moodElapsed * 0.011) * 0.22);
      else {
        angle = side * 1.85;
        wz = -side * 1.7;
      }
    }
    if (attention && i === 0 && !vault) angle = -0.7;
    if (celebrate) {
      angle = side * (jumping ? 2.2 + Math.sin(ae * 0.012) * 0.15 : 2.05);
      if (vault && i === 1) wz = -side * 1.9;
    }
    if (waving && i === 1)
      angle = !still ? 2.4 + Math.sin(ae * 0.009) * 0.22 : 2.2;
    if (walking && !vault) {
      sx = Math.sin(t * 0.0125 + (i ? Math.PI : 0)) * 0.45;
      angle = side * 0.16;
    }
    let sy_ = 0;
    if (dancing) {
      ez = 0;
      wz = 0;
      if (routine === "floss") {
        // Both hands sweep together; the torso counter-swings.
        angle = side * 0.16 + danceStep * 1.1;
        sx = -(0.8 + Math.cos(beat * Math.PI) * side * 0.65) * envelope;
        sy_ = danceStep * 0.35;
        elbow = -0.12 * envelope;
      } else if (routine === "robot") {
        angle = side * (0.9 + robotBeat * side * 0.5) * envelope;
        sx = -0.45 * envelope;
        elbow = (-1.15 + robotBeat * side * 0.55) * envelope;
        ez = side * 0.65 * envelope;
        wz = -robotBeat * side * 0.65;
      } else {
        // Both hands pop out, then come in on the same beat.
        const open = (0.5 + 0.5 * Math.cos(beat * Math.PI)) * envelope;
        angle = side * (0.4 + open * 1.05);
        sx = -0.35 * envelope;
        elbow = (-0.35 - open * 0.6) * envelope;
        wz = side * open * 0.3;
      }
    }
    // Arms fly up for a celebration or a wave; everything else settles gently.
    const quick = celebrate || waving;
    const k = dancing ? 1 : ease(quick ? 0.3 : 0.14);
    arm.shoulder.rotation.set(
      lerp(arm.shoulder.rotation.x, sx, k),
      lerp(arm.shoulder.rotation.y, sy_, k),
      lerp(
        arm.shoulder.rotation.z,
        angle,
        dancing ? 1 : ease(quick ? 0.3 : 0.12),
      ),
    );
    arm.elbow.rotation.set(
      lerp(arm.elbow.rotation.x, checking && i === 0 ? -0.25 : elbow, k),
      0,
      lerp(arm.elbow.rotation.z, ez, k),
    );
    arm.wrist.rotation.z = lerp(arm.wrist.rotation.z, wz, k);
  });

  // Feet.
  rig.feet.forEach((f) => {
    const shuffle = dancing && routine === "shuffle";
    let fy = f.y;
    let fz = f.z;
    if (walking) {
      const ph = t * 0.0125 + f.phase;
      fy += Math.max(0, Math.sin(ph)) * 0.07;
      fz += Math.cos(ph) * 0.1;
    }
    if (poke && !still && rig.id === "rack")
      fy += Math.max(0, Math.sin(ae * 0.05 + f.phase)) * 0.05 * (1 - ap);
    f.mesh.position.set(
      f.x +
        (shuffle ? Math.cos(beat * Math.PI) * f.side * 0.045 * envelope : 0),
      fy,
      fz,
    );
    f.mesh.rotation.set(
      0,
      shuffle ? danceStep * 0.28 : -wrap(body.rotation.y) * 0.6,
      0,
    );
  });

  // Props.
  rig.clipboard.visible = checking;
  rig.wrench.visible = working;
  rig.card.visible = waiting && (still || p.moodElapsed >= 1500);

  applyExtras(rig, {
    t,
    ae,
    ap,
    still,
    ease,
    poke,
    checking,
    working,
    waiting,
    attention,
    resting,
    celebrate,
    dancing,
    walking,
    idle,
    envelope,
    beat,
    busy,
  });

  // Rotate around the character's centre, with a clean takeoff and landing.
  const acrobatics = dancing && danceActive && special;
  if (acrobatics) {
    const c = rig.center;
    const progress = ae / danceLength;
    const flight = clamp((progress - 0.16) / 0.57, 0, 1);
    const turn = smoothstep(flight, 0, 1) * TAU;
    const jump =
      Math.sin(flight * Math.PI) *
      (routine === "backflip" ? 1.05 : 0.65) *
      Math.sqrt(c / 1.05);
    const windup =
      progress < 0.16 ? Math.sin((progress / 0.16) * Math.PI) * 0.15 : 0;
    const landing =
      progress > 0.73 && progress < 0.9
        ? Math.sin(((progress - 0.73) / 0.17) * Math.PI) * 0.17
        : 0;
    const squash = windup + landing;
    body.scale.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.25);
    body.rotation.set(0, 0, 0);
    body.position.set(0, c + jump - Math.cos(turn) * c, 0);
    if (routine === "backflip") {
      body.rotation.x = -turn;
      body.position.z = Math.sin(turn) * c;
    } else {
      body.rotation.z = -turn;
      body.position.x = -0.6 * Math.sin(flight * Math.PI) - Math.sin(turn) * c;
    }
    const tuck = Math.sin(flight * Math.PI);
    rig.arms.forEach((arm) => {
      arm.shoulder.rotation.set(
        routine === "backflip" ? -tuck * 0.9 : 0,
        0,
        arm.side * (routine === "cartwheel" ? 1.8 * tuck : 0.3 + 0.5 * tuck),
      );
      arm.elbow.rotation.set(-tuck * 0.8, 0, 0);
    });
    rig.feet.forEach((f) => {
      f.mesh.position.set(f.x, f.y + tuck * 0.13, f.z);
      f.mesh.rotation.set(-tuck * 0.45, 0, 0);
    });
  }

  return { trick: acrobatics, face, nap: resting };
}

function applyFace(
  rig: Rig,
  face: Face,
  gx: number,
  gy: number,
  blinking: boolean,
) {
  const happy = face === "happy";
  const mouth: MouthShape = happy
    ? "joy"
    : face === "concern"
      ? "concern"
      : face === "focus" || face === "sleep"
        ? "flat"
        : face === "startled"
          ? "o"
          : "smile";
  rig.mouth.geometry = rig.mouths[mouth];
  rig.mouth.position.set(gx * 0.4, gy * 0.4, 0);
  rig.eyes.forEach((eye, i) => {
    const base = i === 0 ? -rig.eyeGap : rig.eyeGap;
    // Positive for the left eye and brow: rotation that lifts the inner end.
    const inner = i === 0 ? 1 : -1;
    eye.visible = !happy;
    const sy =
      face === "sleep"
        ? 0.1
        : blinking
          ? 0.12
          : face === "focus"
            ? 0.65
            : face === "squint" && i === 0
              ? 0.7
              : face === "startled"
                ? 1.16
                : face === "hopeful"
                  ? 1.05
                  : 1;
    eye.scale.set(face === "startled" ? 1.12 : 1, sy, 1);
    eye.position.set(base + (face === "squint" ? -0.025 : 0) + gx, gy, 0);
    eye.rotation.z = face === "concern" ? -inner * 0.12 : 0;
    rig.eyeMats[i].color.setHex(face === "concern" ? HW.attention : HW.eye);
    rig.happyEyes[i].visible = happy;
    rig.happyEyes[i].position.set(base + gx * 0.5, gy * 0.5, 0);
    const brow = rig.brows[i];
    brow.visible =
      face === "squint" ||
      face === "concern" ||
      face === "hopeful" ||
      face === "startled";
    brow.rotation.z =
      face === "squint"
        ? i === 0
          ? 0.15
          : -0.08
        : face === "concern"
          ? inner * 0.2
          : inner * 0.1;
    const lift =
      face === "startled"
        ? 0.05
        : face === "hopeful"
          ? 0.02
          : face === "concern"
            ? 0.01
            : 0;
    brow.position.set(base + gx * 0.6, 0.19 + lift + gy * 0.6, 0);
  });
}

type ExtraInput = {
  t: number;
  ae: number;
  ap: number;
  still: boolean;
  ease: (k: number) => number;
  poke: boolean;
  checking: boolean;
  working: boolean;
  waiting: boolean;
  attention: boolean;
  resting: boolean;
  celebrate: boolean;
  dancing: boolean;
  walking: boolean;
  idle: string | null;
  envelope: number;
  beat: number;
  busy: boolean;
};

/**
 * Each cousin's signature: hatch, status light, crate, dial and disk,
 * antenna ears and LEDs.
 */
function applyExtras(rig: Rig, s: ExtraInput) {
  const { t, ae, ap, still, ease } = s;
  const x = rig.extra;

  if (x.hatch) {
    let open = 0;
    if (s.poke && !still) {
      open = ae < 380 ? smoothstep(ae, 40, 200) : 1 - smoothstep(ae, 380, 700);
      if (ae > 620)
        open -=
          Math.sin((ae - 620) * 0.04) *
          0.08 *
          Math.max(0, 1 - (ae - 620) / 330);
    }
    x.hatch.rotation.x = -open * 1.2;
  }

  if (x.beacon) {
    let glow = 0.55;
    if (s.checking)
      glow = still ? 1 : 0.3 + 0.75 * (0.5 + 0.5 * Math.sin(t * 0.0065));
    else if (s.working) glow = 0.8 + (still ? 0 : 0.1 * Math.sin(t * 0.02));
    else if (s.waiting) glow = 0.5 + (still ? 0 : 0.2 * Math.sin(t * 0.0025));
    else if (s.attention) glow = 0.4;
    else if (s.resting) glow = 0.12;
    if (s.celebrate || s.dancing) glow = 1.1;
    if (s.idle === "look" && !still)
      glow = 0.75 + 0.35 * Math.sin(ap * TAU * 2);
    if (s.poke)
      glow = Math.max(glow, still ? 1.4 : 1.8 * (1 - smoothstep(ae, 80, 820)));
    x.beacon.glow.emissiveIntensity = glow;
    x.beacon.light.intensity = glow * 1.6;
    x.beacon.halo.opacity = clamp(glow * 0.5, 0, 0.75);
  }

  x.leds?.forEach((led, i, all) => {
    let v = 0.28;
    if (s.working)
      v = still ? 1 : Math.sin(t * 0.017 + i * 1.9) > 0.2 ? 1.1 : 0.25;
    else if (s.checking)
      v = still
        ? 0.9
        : Math.floor(t / 170) % (all.length + 1) === i
          ? 1.1
          : 0.25;
    else if (s.resting) v = 0.05;
    if (s.celebrate) v = 1;
    led.emissiveIntensity = v;
  });

  if (x.crate) {
    x.crate.visible = s.working;
    x.crate.position.y =
      1.19 + (s.working && !still ? Math.abs(Math.sin(t * 0.006)) * 0.02 : 0);
  }

  if (x.dial) {
    let r = x.dial.rotation.z;
    if (s.working) r = still ? 0.6 : -((t * 0.0045) % TAU);
    else if (s.checking)
      r = still ? -0.4 : lerp(r, Math.sin(t * 0.0016) * 1.1, ease(0.08));
    else r = lerp(wrap(r), 0, ease(0.05));
    x.dial.rotation.z = r;
    if (s.poke && !still)
      x.dial.rotation.z = r - smoothstep(ae, 0, 800) * Math.PI;
  }

  if (x.disk) {
    const floor = s.working || s.dancing;
    x.disk.floor.visible = floor;
    x.disk.held.visible = s.celebrate && !floor;
    x.disk.hug.visible = !floor && !s.celebrate && !s.walking;
    if (s.walking) x.disk.hug.visible = true;
  }

  if (x.ears) {
    let tilt = 0.28;
    let swivel = 0;
    let wob = 0;
    if (s.checking) {
      tilt = 0.08;
      swivel = still ? 0 : Math.sin(t * 0.004) * 0.25;
    } else if (s.working) {
      tilt = 0.2;
      wob = still ? 0 : Math.sin(t * 0.02) * 0.08;
    } else if (s.waiting) tilt = 0.06;
    else if (s.attention) tilt = 0.95;
    else if (s.resting) tilt = 1.3;
    if (s.celebrate) {
      tilt = 0.05;
      wob = still ? 0 : Math.sin(t * 0.03) * 0.2;
    }
    if (s.poke) {
      tilt = 0.02;
      wob = still ? 0 : Math.sin(ae * 0.045) * 0.4 * Math.exp(-ae / 260);
    }
    if (s.idle === "listen" && !still) tilt = 0.1;
    if (s.dancing) wob = Math.sin(s.beat * Math.PI) * 0.45 * s.envelope;
    if (s.walking) wob = Math.sin(t * 0.025) * 0.1;
    const k = s.poke || s.dancing ? 1 : ease(0.14);
    x.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      const listen =
        s.idle === "listen" && !still
          ? Math.sin(ap * TAU + (i ? Math.PI : 0)) * 0.5
          : 0;
      ear.rotation.z = lerp(ear.rotation.z, -side * (tilt + wob), k);
      ear.rotation.x = lerp(ear.rotation.x, swivel * side + listen, ease(0.14));
    });
    x.tips?.forEach((tip) => {
      tip.emissiveIntensity = s.resting
        ? 0.05
        : s.attention
          ? 0.12
          : tilt < 0.15
            ? 0.65
            : 0.3;
    });
  }
}

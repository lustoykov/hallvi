"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type MascotMood =
  | "ready"
  | "checking"
  | "working"
  | "attention"
  | "dancing"
  | "celebrating"
  | "waving"
  | "pointing"
  | "resting"
  | "carrying";
export type MascotDance =
  "shuffle" | "robot" | "floss" | "backflip" | "cartwheel";
import { mascotColors } from "./mascot-palette";

/** Little Server geometry. Native controls outside the canvas set its state. */
export function MascotScene({
  color = 0,
  mood = "ready",
  paused = false,
  gesture = 0,
  ambient = false,
  slot = 0,
  dance = "shuffle",
  danceRequest = 0,
}: {
  /** A palette index, or a hex colour of the caller's own. */
  color?: number | string;
  mood?: MascotMood;
  paused?: boolean;
  gesture?: number;
  ambient?: boolean;
  slot?: number;
  dance?: MascotDance;
  danceRequest?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const state = useRef({
    mood,
    paused,
    gesture,
    ambient,
    slot,
    dance,
    danceRequest,
  });
  useEffect(() => {
    state.current = {
      mood,
      paused,
      gesture,
      ambient,
      slot,
      dance,
      danceRequest,
    };
  }, [mood, paused, gesture, ambient, slot, dance, danceRequest]);
  useEffect(() => {
    const host = root.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.dataset.fallback = "true";
      return;
    }
    delete host.dataset.fallback;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0.8, 2.0, 6.45);
    camera.lookAt(0, 1.12, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x647089, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 3.3);
    light.position.set(-3, 6, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.normalBias = 0.03;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xddeaff, 1.4);
    fill.position.set(3, 3, -4);
    scene.add(fill);
    const body = new THREE.Group();
    scene.add(body);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const paint = new THREE.Color(
      typeof color === "string" ? color : mascotColors[color],
    );
    const mesh = (
      w: number,
      h: number,
      d: number,
      radius: number,
      tint: THREE.ColorRepresentation,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const geometry = new RoundedBoxGeometry(w, h, d, 5, radius);
      const material = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.44,
        metalness: 0.07,
      });
      geometries.push(geometry);
      materials.push(material);
      const object = new THREE.Mesh(geometry, material);
      object.position.set(x, y, z);
      object.castShadow = true;
      object.receiveShadow = true;
      body.add(object);
      return object;
    };
    const faceY = 1.45,
      faceZ = 0.795,
      eyeGap = 0.28;

    mesh(1.6, 1.8, 1.45, 0.19, paint, 0, 1.1);
    mesh(1.38, 0.72, 0.08, 0.12, 0x192338, 0, 1.4, 0.735);
    for (let i = 0; i < 6; i++)
      mesh(0.035, 0.28, 0.025, 0.013, 0x647089, -0.35 + i * 0.14, 0.61, 0.738);
    mesh(0.38, 0.035, 0.32, 0.045, 0xd6e0f0, 0, 2.01, 0.1);
    const feet = [-0.49, 0.49].map((x) =>
      mesh(0.32, 0.16, 0.82, 0.07, 0x3e4a60, x, 0.13, 0.02),
    );
    // Two antennas that act like ears: they sway, perk up, droop and wiggle
    // with the mood, and their tips glow.
    const antennaTips: THREE.MeshStandardMaterial[] = [];
    const antennas = [-1, 1].map((side) => {
      const antenna = new THREE.Group();
      antenna.position.set(side * 0.5, 2.0, -0.32);
      body.add(antenna);
      const base = mesh(0.2, 0.09, 0.2, 0.04, 0x3e4a60, 0, 0.03, 0);
      const stalk = mesh(0.075, 0.5, 0.075, 0.035, 0x3e4a60, 0, 0.3, 0);
      const tip = mesh(0.17, 0.17, 0.17, 0.075, 0xe4edff, 0, 0.6, 0);
      const glow = tip.material as THREE.MeshStandardMaterial;
      glow.emissive.set(0x9dbbff);
      glow.emissiveIntensity = 0.35;
      antennaTips.push(glow);
      antenna.add(base, stalk, tip);
      return antenna;
    });
    const eyes = [-eyeGap, eyeGap].map((x) =>
      mesh(0.115, 0.25, 0.035, 0.05, 0xedf3ff, x, faceY, faceZ),
    );
    const stroke = (points: number[][], radius = 0.018) => {
      const geo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.map(
            (p) => new THREE.Vector3(...(p as [number, number, number])),
          ),
        ),
        20,
        radius,
        8,
        false,
      );
      geometries.push(geo);
      return geo;
    };
    const mouths = {
      smile: stroke([
        [-0.15, -0.24, 0],
        [0, -0.285, 0.01],
        [0.15, -0.24, 0],
      ]),
      flat: stroke([
        [-0.1, -0.25, 0],
        [0, -0.25, 0.01],
        [0.1, -0.25, 0],
      ]),
      concern: stroke([
        [-0.12, -0.29, 0],
        [0, -0.245, 0.01],
        [0.12, -0.29, 0],
      ]),
      joy: stroke(
        [
          [-0.21, -0.2, 0],
          [0, -0.31, 0.01],
          [0.21, -0.2, 0],
        ],
        0.023,
      ),
    };
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0xd6e5ff,
    });
    materials.push(mouthMat);
    const mouth = new THREE.Mesh(mouths.smile, mouthMat);
    mouth.position.set(0, faceY, faceZ);
    body.add(mouth);
    const happyEyes = [-eyeGap, eyeGap].map((x) => {
      const eye = new THREE.Mesh(
        stroke(
          [
            [-0.09, 0, 0],
            [0, 0.075, 0.01],
            [0.09, 0, 0],
          ],
          0.025,
        ),
        mouthMat,
      );
      eye.position.set(x, faceY, faceZ);
      body.add(eye);
      return eye;
    });
    const brows = [-eyeGap, eyeGap].map((x) =>
      mesh(0.16, 0.025, 0.02, 0.01, 0xd6e5ff, x, faceY + 0.19, faceZ),
    );

    // Shoulder, elbow and mitten share a local rig; props move with the hand.
    const shoulderWidth = 0.84,
      shoulderY = 1.05;
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * shoulderWidth, shoulderY, 0.15);
      body.add(shoulder);
      const sleeve = mesh(0.22, 0.36, 0.24, 0.1, paint, side * 0.05, -0.14, 0);
      shoulder.add(sleeve);

      const elbow = new THREE.Group();
      elbow.position.set(side * 0.08, -0.29, 0.02);
      shoulder.add(elbow);
      const forearm = mesh(0.18, 0.27, 0.19, 0.08, 0xd6e0f0, 0, -0.1, 0.03);
      elbow.add(forearm);

      const wrist = new THREE.Group();
      wrist.position.set(0, -0.24, 0.05);
      elbow.add(wrist);
      const palm = mesh(0.25, 0.27, 0.21, 0.1, 0xedf3ff, 0, 0, 0);
      const thumb = mesh(
        0.11,
        0.15,
        0.15,
        0.05,
        0xedf3ff,
        -side * 0.115,
        0.04,
        0.045,
      );
      wrist.add(palm, thumb);
      return { shoulder, elbow, wrist };
    });
    // A finger stub turns a held-out mitten into a point.
    const finger = mesh(0.085, 0.2, 0.085, 0.04, 0xedf3ff, 0, -0.2, 0.02);
    arms[1].wrist.add(finger);
    const clipboard = new THREE.Group();
    arms[0].wrist.add(clipboard);
    clipboard.position.set(-0.06, 0.17, 0.16);
    clipboard.rotation.z = -0.1;
    clipboard.add(mesh(0.52, 0.7, 0.06, 0.035, 0x3e4a60));
    clipboard.add(mesh(0.43, 0.54, 0.018, 0.014, 0xf7f9fc, 0, -0.025, 0.041));
    clipboard.add(mesh(0.2, 0.09, 0.07, 0.025, 0x647089, 0, 0.335, 0.055));
    for (let i = 0; i < 3; i++) {
      clipboard.add(
        mesh(0.22, 0.018, 0.016, 0.007, 0x8c9fb9, 0.045, 0.14 - i * 0.12, 0.06),
      );
      clipboard.add(
        mesh(
          0.035,
          0.035,
          0.017,
          0.012,
          0x285ad8,
          -0.14,
          0.14 - i * 0.12,
          0.06,
        ),
      );
    }
    // The wrench is held out from the body, head up, so its silhouette reads
    // on its own: a steel shank and open jaw, a navy grip in the mitten.
    const wrench = new THREE.Group();
    arms[1].wrist.add(wrench);
    wrench.position.set(0.02, -0.02, 0.14);
    wrench.rotation.z = -1.25;
    const steel = 0x8a97ad;
    const shank = mesh(0.1, 0.66, 0.06, 0.03, steel, 0, 0.13);
    const shankMaterial = shank.material as THREE.MeshStandardMaterial;
    shankMaterial.metalness = 0.3;
    shankMaterial.roughness = 0.34;
    wrench.add(
      shank,
      mesh(0.13, 0.27, 0.085, 0.04, 0x192338, 0, -0.06),
      mesh(0.14, 0.035, 0.09, 0.015, 0x285ad8, 0, 0.15),
    );
    const jawGeo = new THREE.TorusGeometry(
      0.125,
      0.048,
      10,
      28,
      Math.PI * 1.45,
    );
    geometries.push(jawGeo);
    const jaw = new THREE.Mesh(jawGeo, shankMaterial);
    jaw.castShadow = true;
    jaw.position.y = 0.56;
    // The gap of the open end faces up.
    jaw.rotation.z = Math.PI * 0.775;
    wrench.add(jaw);
    // A mug for a quiet day, held in the left mitten.
    // Attached to the body and kept upright at the mitten each frame, so it
    // never tilts with the arm.
    const mug = new THREE.Group();
    body.add(mug);
    const mittenAt = new THREE.Vector3();
    const mugBodyGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.3, 20);
    geometries.push(mugBodyGeo);
    const mugMat = new THREE.MeshStandardMaterial({
      color: 0xf7f9fc,
      roughness: 0.5,
    });
    materials.push(mugMat);
    const mugBody = new THREE.Mesh(mugBodyGeo, mugMat);
    mugBody.castShadow = true;
    mug.add(mugBody);
    const coffeeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 20);
    geometries.push(coffeeGeo);
    const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1c });
    materials.push(coffeeMat);
    const coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
    coffee.position.y = 0.145;
    mug.add(coffee);
    const handleGeo = new THREE.TorusGeometry(0.09, 0.026, 8, 16, Math.PI);
    geometries.push(handleGeo);
    const handle = new THREE.Mesh(handleGeo, mugMat);
    handle.position.set(-0.17, 0, 0);
    handle.rotation.z = Math.PI / 2;
    mug.add(handle);
    mug.add(mesh(0.24, 0.035, 0.02, 0.01, 0x285ad8, 0, 0.02, 0.165));
    // A magnifier for when something was found, held up in the right mitten.
    const magnifier = new THREE.Group();
    arms[1].wrist.add(magnifier);
    magnifier.position.set(0.02, 0.06, 0.16);
    magnifier.rotation.z = -0.5;
    const rimGeo = new THREE.TorusGeometry(0.2, 0.036, 10, 28);
    geometries.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, shankMaterial);
    rim.castShadow = true;
    rim.position.y = 0.36;
    magnifier.add(rim);
    const glassGeo = new THREE.CircleGeometry(0.18, 28);
    geometries.push(glassGeo);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xcfe0ff,
      transparent: true,
      opacity: 0.45,
    });
    materials.push(glassMat);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = 0.36;
    magnifier.add(glass);
    magnifier.add(mesh(0.08, 0.36, 0.06, 0.03, 0x192338, 0, 0.02));
    // A box to carry in, for an application that is not deployed yet.
    const box = new THREE.Group();
    body.add(box);
    box.position.set(0, 0.86, 0.92);
    box.add(mesh(0.62, 0.46, 0.5, 0.03, 0xd9b98a));
    box.add(mesh(0.64, 0.08, 0.52, 0.01, 0xc4a06e, 0, 0.16));
    box.add(mesh(0.14, 0.47, 0.51, 0.01, 0xefe3cf, 0, 0));
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.14 });
    geometries.push(floorGeo);
    materials.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y = 0.015;
    scene.add(floor);
    let pointerX = 0,
      pointerY = 0;
    const move = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) / rect.width - 0.5;
      pointerY = (e.clientY - rect.top) / rect.height - 0.5;
    };
    const leave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let visible = true;
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibility.observe(host);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      previousMood = state.current.mood,
      previousGesture = state.current.gesture,
      moodStart = performance.now(),
      previousDanceRequest = 0,
      danceStart = -Infinity,
      reach = 0;
    const render = (t: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || !visible) return;
      const still = state.current.paused || reduced.matches;
      let current = state.current.mood;
      if (
        previousMood !== current ||
        previousGesture !== state.current.gesture
      ) {
        previousGesture = state.current.gesture;
        previousMood = current;
        moodStart = t;
      }
      if (previousDanceRequest !== state.current.danceRequest) {
        previousDanceRequest = state.current.danceRequest;
        if (previousDanceRequest > 0) danceStart = t;
      }
      const special =
        state.current.dance === "backflip" ||
        state.current.dance === "cartwheel";
      const requestedDance = t - danceStart < (special ? 2600 : 5200) && !still;
      const routine =
        special && state.current.ambient && !requestedDance
          ? "shuffle"
          : state.current.dance;
      let elapsed = t - moodStart;
      if (state.current.ambient) {
        // One short gesture per nine-second slot; the other caretakers rest.
        const phase = (t - state.current.slot * 9000 + 27000) % 27000;
        const greeting =
          state.current.mood === "waving" && elapsed < 2600 && !still;
        if (!greeting) {
          current =
            !still && phase < 2600
              ? Math.floor(t / 27000) % 2 === 0
                ? "waving"
                : "dancing"
              : "ready";
          elapsed = phase;
        }
      }
      if (requestedDance) {
        current = "dancing";
        elapsed = t - danceStart;
      }
      const danceDuration = special
        ? 2600
        : requestedDance || !state.current.ambient
          ? 5200
          : 2600;
      if (host.dataset.dance !== routine) host.dataset.dance = routine;
      if (host.dataset.expression !== current)
        host.dataset.expression = current;
      const working = current === "working",
        checking = current === "checking";
      const attention = current === "attention",
        resting = current === "resting";
      const carrying = current === "carrying";
      const dancing = current === "dancing";
      const happy =
        current === "celebrating" || current === "waving" || dancing;
      const celebrate = current === "celebrating";
      const waving = current === "waving";
      const pointing = current === "pointing";
      // One eased value carries the whole pose in and out, so the caller's
      // timer decides the hold.
      reach = still
        ? pointing
          ? 1
          : 0
        : THREE.MathUtils.lerp(reach, pointing ? 1 : 0, 0.14);
      // Out first, then one tap down toward what he means; held after it lands.
      const tap =
        pointing && !still ? THREE.MathUtils.smoothstep(elapsed, 560, 820) : 1;
      const animatedGreeting = !still && elapsed < 2600;
      const blink = !still && t % 5700 > 5500;
      // A point turns him toward what he means, below and to his right.
      body.rotation.y = still
        ? 0
        : THREE.MathUtils.lerp(
            body.rotation.y,
            pointerX * 0.16 * (1 - reach) +
              reach * 0.28 +
              (checking ? -0.08 : Math.sin(t * 0.00055) * 0.025),
            0.06,
          );
      body.rotation.z = still
        ? 0
        : attention
          ? -0.07
          : checking
            ? 0.055
            : happy && animatedGreeting
              ? Math.sin(elapsed * 0.008) * 0.045
              : Math.sin(t * 0.001) * 0.009;
      body.rotation.x = still
        ? 0
        : resting
          ? 0.05
          : checking
            ? 0.06
            : pointerY * 0.06;
      // He looks down and leans in toward what he points at.
      if (!still) {
        body.rotation.x += reach * 0.09;
        body.rotation.z -= reach * 0.05;
      }
      body.position.y =
        celebrate && animatedGreeting
          ? Math.abs(Math.sin(elapsed * 0.007)) * 0.16 * (1 - elapsed / 2600)
          : 0;
      const danceActive = dancing && !still && elapsed < danceDuration;
      const envelope = danceActive
        ? Math.min(1, elapsed / 220, (danceDuration - elapsed) / 350)
        : 0;
      const beat = elapsed / 460;
      const swing = Math.sin(beat * Math.PI);
      const danceStep = swing * envelope;
      // Brief sharp transitions followed by holds make the robot mechanical.
      const robotPoses = [-1, -1, 0, 1, 1, 0, -1, 0];
      const poseIndex = Math.floor(beat) % robotPoses.length;
      const poseMix = THREE.MathUtils.smoothstep(beat % 1, 0, 0.22);
      const robotBeat =
        THREE.MathUtils.lerp(
          robotPoses[poseIndex],
          robotPoses[(poseIndex + 1) % robotPoses.length],
          poseMix,
        ) * envelope;
      body.position.x = danceStep * (routine === "floss" ? -0.12 : 0.065);
      if (dancing) {
        // Keep the downbeat and pivots grounded.
        body.position.y = (1 - Math.cos(beat * Math.PI * 2)) * 0.012 * envelope;
        body.rotation.y =
          routine === "robot" ? robotBeat * 0.3 : danceStep * 0.2;
        body.rotation.z =
          routine === "robot" ? robotBeat * 0.04 : -danceStep * 0.065;
      }
      feet.forEach((foot, i) => {
        const side = i === 0 ? -1 : 1;
        const shuffle = routine === "shuffle";
        foot.position.y = 0.13;
        foot.position.x =
          side * 0.49 +
          (shuffle ? Math.cos(beat * Math.PI) * side * 0.045 * envelope : 0);
        foot.position.z = 0.02;
        foot.rotation.x = 0;
        foot.rotation.z = 0;
        foot.rotation.y = shuffle ? danceStep * 0.28 : -body.rotation.y * 0.6;
      });
      mouth.geometry = happy
        ? mouths.joy
        : attention
          ? mouths.concern
          : working || resting
            ? mouths.flat
            : mouths.smile;
      eyes.forEach((eye, i) => {
        eye.visible = !happy;
        eye.scale.y = resting
          ? 0.1
          : blink
            ? 0.12
            : working
              ? 0.65
              : checking && i === 0
                ? 0.7
                : 1;
        // When he points he glances down toward it, brows raised and level.
        eye.position.x =
          (i === 0 ? -eyeGap : eyeGap) + (checking ? -0.025 : 0) + reach * 0.06;
        eye.position.y = faceY - reach * 0.04;
        eye.rotation.z = attention ? (i === 0 ? 0.1 : -0.1) : 0;
        (eye.material as THREE.MeshStandardMaterial).color.set(0xedf3ff);
        happyEyes[i].visible = happy;
        brows[i].visible = checking || attention || reach > 0.3;
        brows[i].position.y =
          faceY + 0.19 + reach * 0.035 + (attention ? 0.05 : 0);
        brows[i].rotation.z = attention
          ? i === 0
            ? 0.28
            : -0.28
          : (i === 0 ? 0.15 : -0.08) * (1 - reach);
      });
      clipboard.visible = checking;
      wrench.visible = working;
      magnifier.visible = attention;
      box.visible = carrying;
      // The mug is for quiet moments, not for dancing or acrobatics.
      mug.visible =
        (current === "ready" || waving || resting) && !dancing && reach < 0.05;
      if (mug.visible) {
        arms[0].wrist.getWorldPosition(mittenAt);
        body.worldToLocal(mittenAt);
        mug.position.set(
          mittenAt.x - 0.02,
          mittenAt.y + 0.05,
          mittenAt.z + 0.16,
        );
        mug.rotation.set(0, 0, 0);
      }
      finger.visible = reach > 0.05;
      antennas.forEach((antenna, i) => {
        const side = i === 0 ? -1 : 1;
        let outward = resting ? 0.62 : attention ? 0.02 : 0.12;
        let lean = working ? 0.3 : checking ? 0.18 : 0;
        if (checking && i === 1) outward = 0.3;
        if (!still) {
          if (dancing && danceActive) outward += danceStep * side * 0.3;
          else if (happy && animatedGreeting)
            outward += Math.sin(elapsed * 0.02 + i * 1.3) * 0.25;
          else if (checking) outward += Math.sin(t * 0.006 + i) * 0.05;
          else if (!resting && !attention)
            outward += Math.sin(t * 0.0021 + i * 1.7) * 0.035;
          if (working) lean += Math.sin(t * 0.007) * 0.06;
        }
        // When he points, both lean forward and toward what he means.
        lean += reach * 0.15;
        const tilt = -side * outward - reach * 0.22;
        antenna.rotation.z = still
          ? tilt
          : THREE.MathUtils.lerp(antenna.rotation.z, tilt, 0.15);
        antenna.rotation.x = still
          ? lean
          : THREE.MathUtils.lerp(antenna.rotation.x, lean, 0.12);
        const glow = antennaTips[i];
        glow.color.set(attention ? 0xf6d9a8 : 0xe4edff);
        glow.emissive.set(attention ? 0xf0a64b : 0x9dbbff);
        glow.emissiveIntensity = resting
          ? 0.06
          : (checking || working) && !still
            ? 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.008 + i * Math.PI))
            : 0.35;
      });
      arms.forEach((arm, i) => {
        const side = i === 0 ? -1 : 1;
        let angle = side * 0.13,
          elbow = 0;
        if (checking && i === 0) {
          angle = -0.65;
          elbow = -0.2;
        }
        if (working && i === 1) {
          angle = 0.95 + (!still ? Math.sin(t * 0.004) * 0.12 : 0);
          elbow = 0.22;
        }
        if (celebrate)
          angle =
            side *
            (animatedGreeting ? 2.2 + Math.sin(elapsed * 0.012) * 0.15 : 0.65);
        if (waving && i === 1)
          angle = animatedGreeting
            ? 2.4 + Math.sin(elapsed * 0.009) * 0.22
            : 0.5;
        arm.shoulder.rotation.x = 0;
        arm.shoulder.rotation.y = 0;
        arm.elbow.rotation.z = 0;
        arm.wrist.rotation.z =
          working && i === 1 && !still ? Math.sin(t * 0.007) * 0.2 : 0;
        if (dancing) {
          if (routine === "floss") {
            // Both hands sweep together; the torso counter-swings.
            angle = side * 0.16 + danceStep * 1.1;
            arm.shoulder.rotation.x =
              -(0.8 + Math.cos(beat * Math.PI) * side * 0.65) * envelope;
            arm.shoulder.rotation.y = danceStep * 0.35;
            elbow = -0.12 * envelope;
          } else if (routine === "robot") {
            angle = side * (0.9 + robotBeat * side * 0.5) * envelope;
            arm.shoulder.rotation.x = -0.45 * envelope;
            elbow = (-1.15 + robotBeat * side * 0.55) * envelope;
            arm.elbow.rotation.z = side * 0.65 * envelope;
            arm.wrist.rotation.z = -robotBeat * side * 0.65;
          } else {
            // Both hands pop out, then come in on the same beat.
            const open = (0.5 + 0.5 * Math.cos(beat * Math.PI)) * envelope;
            angle = side * (0.4 + open * 1.05);
            arm.shoulder.rotation.x = -0.35 * envelope;
            elbow = (-0.35 - open * 0.6) * envelope;
            arm.wrist.rotation.z = side * open * 0.3;
          }
        }
        // Worried: the free hand comes up, the magnifier is held out and up.
        if (attention && i === 0) angle = -0.7;
        if (attention && i === 1) {
          angle = 1.0 + (!still ? Math.sin(t * 0.003) * 0.05 : 0);
          elbow = 0.15;
        }
        // The box is carried in both arms, in front.
        if (carrying) {
          angle = side * 0.2;
          arm.shoulder.rotation.x = -1.15;
          elbow = -0.35;
        }
        // A mug is held a little forward and level.
        if (mug.visible && i === 0 && !waving) {
          angle = -0.65;
          elbow = -0.25;
        }
        // The right arm reaches out, then taps down toward the log below
        // him, set directly so the tap lands at 820 ms, with the label.
        const reaching = i === 1 && reach > 0.001;
        if (reaching) {
          angle = THREE.MathUtils.lerp(
            angle,
            THREE.MathUtils.lerp(1.15, 0.7, tap),
            reach,
          );
          elbow = THREE.MathUtils.lerp(elbow, 0, reach);
          arm.shoulder.rotation.x =
            THREE.MathUtils.lerp(-0.4, -0.85, tap) * reach;
          arm.wrist.rotation.z = THREE.MathUtils.lerp(0.1, 0.2, tap) * reach;
        }
        arm.shoulder.rotation.z =
          still || reaching
            ? angle
            : THREE.MathUtils.lerp(arm.shoulder.rotation.z, angle, 0.12);
        arm.elbow.rotation.x = checking && i === 0 ? -0.25 : elbow;
      });
      // Rotate around the character's center, with a clean takeoff and landing.
      const acrobatics =
        dancing &&
        danceActive &&
        (routine === "backflip" || routine === "cartwheel");
      body.position.z = 0;
      body.scale.set(1, 1, 1);
      if (acrobatics) {
        const progress = elapsed / 2600;
        const flight = THREE.MathUtils.clamp((progress - 0.16) / 0.57, 0, 1);
        const turn = THREE.MathUtils.smoothstep(flight, 0, 1) * Math.PI * 2;
        const jump =
          Math.sin(flight * Math.PI) * (routine === "backflip" ? 1.05 : 0.65);
        const windup =
          progress < 0.16 ? Math.sin((progress / 0.16) * Math.PI) * 0.15 : 0;
        const landing =
          progress > 0.73 && progress < 0.9
            ? Math.sin(((progress - 0.73) / 0.17) * Math.PI) * 0.17
            : 0;
        const squash = windup + landing;
        body.scale.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.25);
        body.rotation.set(0, 0, 0);
        body.position.set(0, 1.05 + jump - Math.cos(turn) * 1.05, 0);
        if (routine === "backflip") {
          body.rotation.x = -turn;
          body.position.z = Math.sin(turn) * 1.05;
        } else {
          body.rotation.z = -turn;
          body.position.x =
            -0.6 * Math.sin(flight * Math.PI) - Math.sin(turn) * 1.05;
        }
        const tuck = Math.sin(flight * Math.PI);
        arms.forEach((arm, i) => {
          const side = i === 0 ? -1 : 1;
          arm.shoulder.rotation.set(
            routine === "backflip" ? -tuck * 0.9 : 0,
            0,
            side * (routine === "cartwheel" ? 1.8 * tuck : 0.3 + 0.5 * tuck),
          );
          arm.elbow.rotation.set(-tuck * 0.8, 0, 0);
        });
        feet.forEach((foot, i) => {
          foot.position.set(
            (i === 0 ? -1 : 1) * 0.49,
            0.13 + tuck * 0.13,
            0.02,
          );
          foot.rotation.set(-tuck * 0.45, 0, 0);
        });
      }
      const targetFov = acrobatics ? 43 : 32;
      camera.fov = still
        ? targetFov
        : THREE.MathUtils.lerp(camera.fov, targetFov, 0.12);
      camera.updateProjectionMatrix();
      if (host.dataset.trick !== (acrobatics ? routine : "none"))
        host.dataset.trick = acrobatics ? routine : "none";
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [color]);
  return (
    <div className="mascot-scene" ref={root} aria-hidden="true">
      <span className="mascot-fallback">
        ▰<br />• •<br />⌣
      </span>
    </div>
  );
}

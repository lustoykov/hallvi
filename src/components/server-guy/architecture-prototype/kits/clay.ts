/**
 * Clay: Little Server's toy diorama. Molded blue plastic, navy instrument
 * faces, softly rounded storage tins and a removable clear lid. The trays
 * retain the anatomy coordinates; the detail explains each object's job.
 * Only the controller borrows the mascot's two-pill expression.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mascotColors } from "../../home/mascot-palette";
import type {
  BuiltPart,
  Kit,
  KitContext,
  KitLayer,
  KitPart,
} from "../anatomy-kit";

const [steel, chalk, lilac, blue] = mascotColors;
const navy = "#192338",
  ice = "#edf3ff",
  slate = "#3e4a60";
const APP_X = -1.45;
type Point = [number, number, number];
type Glyph = "chart" | "flame" | "database" | "git" | "eyes";

function serviceX(id: string | undefined, ctx: KitContext) {
  const services = ctx.parts.filter((p) => p.kind === "private");
  const i = Math.max(
    0,
    services.findIndex((p) => p.id === id),
  );
  return services.length < 2 ? 1.7 : 0.95 + (1.5 * i) / (services.length - 1);
}

// Reuse geometry within a mounted kit, without retaining GPU resources between mounts.
const workshops = new WeakMap<KitContext, ReturnType<typeof workshop>>();
function atelier(ctx: KitContext) {
  let result = workshops.get(ctx);
  if (!result) {
    result = workshop(ctx);
    workshops.set(ctx, result);
  }
  return result;
}
function workshop(ctx: KitContext) {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const geometry = (key: string, create: () => THREE.BufferGeometry) => {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key)!;
  };
  function mesh(
    parent: THREE.Group,
    geo: THREE.BufferGeometry,
    color: string,
    at: Point,
    opacity = 1,
  ) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.44,
      metalness: 0.07,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
    const object = new THREE.Mesh(geo, material);
    object.position.set(...at);
    object.castShadow = opacity === 1;
    object.receiveShadow = opacity === 1;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Group,
    size: Point,
    radius: number,
    color: string,
    at: Point,
    opacity = 1,
  ) {
    // Flatten a generously rounded solid for thin plates and screen surrounds;
    // rounding is not limited to half their tiny physical thickness.
    const molded = size.map((v) => Math.max(v, radius * 2)) as Point;
    const object = mesh(
      parent,
      geometry(
        `box:${molded}:${radius}`,
        () => new RoundedBoxGeometry(...molded, 4, radius),
      ),
      color,
      at,
      opacity,
    );
    object.scale.set(
      size[0] / molded[0],
      size[1] / molded[1],
      size[2] / molded[2],
    );
    return object;
  }
  function tube(
    parent: THREE.Group,
    points: Point[],
    radius: number,
    color: string,
    opacity = 1,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
    );
    return mesh(
      parent,
      new THREE.TubeGeometry(curve, 48, radius, 8, false),
      color,
      [0, 0, 0],
      opacity,
    );
  }
  function print(
    parent: THREE.Group,
    text: string,
    w: number,
    h: number,
    at: Point,
    color = navy,
    background = ice,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const c = canvas.getContext("2d")!;
    c.fillStyle = background;
    c.fillRect(0, 0, canvas.width, canvas.height);
    const px = canvas.height * 0.61;
    const font = ctx.font;
    c.font = `600 ${px}px ${font}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = color;
    c.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.9);
    return decal(parent, canvas, w, h, at);
  }
  function decal(
    parent: THREE.Group,
    canvas: HTMLCanvasElement,
    w: number,
    h: number,
    at: Point,
  ) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.62,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    material.addEventListener("dispose", () => texture.dispose());
    const object = new THREE.Mesh(
      geometry(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
      material,
    );
    object.position.set(...at);
    parent.add(object);
    return object;
  }
  function screen(
    parent: THREE.Group,
    kind: Glyph,
    w: number,
    h: number,
    at: Point,
  ) {
    const bezel = box(parent, [w + 0.12, h + 0.12, 0.1], 0.08, slate, at);
    box(parent, [w, h, 0.06], 0.065, navy, [at[0], at[1], at[2] + 0.057]);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.strokeStyle = ice;
    c.fillStyle = ice;
    c.lineWidth = 10;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (kind === "chart") {
      c.globalAlpha = 0.2;
      c.lineWidth = 3;
      for (const y of [62, 125, 188]) {
        c.beginPath();
        c.moveTo(52, y);
        c.lineTo(460, y);
        c.stroke();
      }
      c.globalAlpha = 0.5;
      [52, 83, 112, 155, 124, 175].forEach((height, i) => {
        c.beginPath();
        c.roundRect(63 + i * 64, 218 - height, 26, height, 8);
        c.fill();
      });
      c.globalAlpha = 1;
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(60, 158);
      c.lineTo(132, 130);
      c.lineTo(200, 148);
      c.lineTo(274, 69);
      c.lineTo(347, 92);
      c.lineTo(444, 35);
      c.stroke();
    } else if (kind === "database") {
      c.beginPath();
      c.ellipse(256, 60, 85, 29, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(171, 60);
      c.lineTo(171, 190);
      c.ellipse(256, 190, 85, 29, 0, Math.PI, 0, true);
      c.lineTo(341, 60);
      c.stroke();
      c.beginPath();
      c.ellipse(256, 126, 85, 29, 0, 0, Math.PI);
      c.stroke();
    } else if (kind === "flame") {
      c.beginPath();
      c.moveTo(241, 28);
      c.bezierCurveTo(271, 92, 306, 65, 291, 118);
      c.bezierCurveTo(319, 107, 325, 87, 320, 73);
      c.bezierCurveTo(387, 157, 326, 202, 262, 202);
      c.bezierCurveTo(197, 202, 168, 154, 206, 113);
      c.bezierCurveTo(195, 152, 234, 160, 222, 118);
      c.bezierCurveTo(206, 82, 252, 64, 241, 28);
      c.fill();
      c.beginPath();
      c.roundRect(217, 219, 90, 9, 4);
      c.fill();
    } else if (kind === "git") {
      c.lineWidth = 11;
      c.beginPath();
      c.moveTo(216, 57);
      c.lineTo(216, 196);
      c.moveTo(216, 157);
      c.bezierCurveTo(216, 112, 310, 157, 310, 99);
      c.stroke();
      for (const [x, y] of [
        [216, 50],
        [216, 206],
        [310, 70],
      ]) {
        c.beginPath();
        c.arc(x, y, 19, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      for (const x of [177, 291]) {
        c.beginPath();
        c.roundRect(x, 72, 36, 109, 18);
        c.fill();
      }
    }
    decal(parent, canvas, w * 0.86, h * 0.82, [at[0], at[1], at[2] + 0.089]);
    return bezel;
  }
  // Repeated vents are a single mesh, with pill-shaped rather than sharp slots.
  function vents(
    parent: THREE.Group,
    count: number,
    at: Point,
    spacing = 0.14,
  ) {
    const bits = Array.from({ length: count }, (_, i) => {
      const g = new RoundedBoxGeometry(0.035, 0.15, 0.026, 2, 0.017);
      g.translate((i - (count - 1) / 2) * spacing, 0, 0);
      return g;
    });
    const merged = mergeGeometries(bits)!;
    bits.forEach((g) => g.dispose());
    return mesh(parent, merged, slate, at);
  }
  // A revolved rounded profile gives the storage tins a true circular silhouette.
  function tin(
    parent: THREE.Group,
    r: number,
    h: number,
    color: string,
    at: Point,
  ) {
    const edge = Math.min(0.075, h * 0.35);
    return mesh(
      parent,
      geometry(`tin:${r}:${h}`, () => {
        const profile = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(r - edge, 0),
        ];
        for (let i = 0; i <= 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 12;
          profile.push(
            new THREE.Vector2(
              r - edge + edge * Math.cos(a),
              edge + edge * Math.sin(a),
            ),
          );
        }
        for (let i = 0; i <= 6; i++) {
          const a = (i * Math.PI) / 12;
          profile.push(
            new THREE.Vector2(
              r - edge + edge * Math.cos(a),
              h - edge + edge * Math.sin(a),
            ),
          );
        }
        profile.push(new THREE.Vector2(0, h));
        return new THREE.LatheGeometry(profile, 48);
      }),
      color,
      at,
    );
  }
  return { box, mesh, tube, print, screen, vents, tin };
}

function built(
  layer: KitLayer,
  object: THREE.Group,
  tintable: THREE.Mesh[],
  anchor: Point,
): BuiltPart {
  return { layer, object, tintable, anchor: new THREE.Vector3(...anchor) };
}

const kit: Kit = {
  name: "Clay",
  stage(scene, renderer) {
    const previous = {
      environment: scene.environment,
      intensity: scene.environmentIntensity,
      tone: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      shadows: renderer.shadowMap.enabled,
      shadowType: renderer.shadowMap.type,
    };
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.06);
    room.dispose();
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.45;
    const ambient = new THREE.HemisphereLight(0xffffff, 0x8c9fb9, 1.25);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 5;
    key.shadow.blurSamples = 8;
    Object.assign(key.shadow.camera, {
      left: -9,
      right: 9,
      top: 10,
      bottom: -8,
      near: 0.5,
      far: 35,
    });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    const fill = new THREE.DirectionalLight(0xddeaff, 1.25);
    fill.position.set(6, 5, -6);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ color: 0x687183, opacity: 0.17 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.015;
    ground.receiveShadow = true;
    scene.add(ambient, key, fill, ground);
    return () => {
      scene.remove(ambient, key, fill, ground);
      key.shadow.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      environment.dispose();
      scene.environment = previous.environment;
      scene.environmentIntensity = previous.intensity;
      renderer.toneMapping = previous.tone;
      renderer.toneMappingExposure = previous.exposure;
      renderer.shadowMap.enabled = previous.shadows;
      renderer.shadowMap.type = previous.shadowType;
    };
  },
  decor(ctx) {
    const a = atelier(ctx),
      disk = new THREE.Group(),
      net = new THREE.Group(),
      shell = new THREE.Group();
    a.box(disk, [6, 0.1, 3.85], 0.22, chalk, [0, 0.05, 0]);
    a.box(disk, [5.68, 0.025, 3.53], 0.2, ice, [0, 0.109, 0]);
    a.box(net, [5.85, 0.065, 3.65], 0.2, lilac, [0, 0.0325, 0], 0.32);
    // Fine toy lead stays on the plate; its ends terminate beneath the appliances.
    const xs = ctx.parts
      .filter((p) => p.kind === "private")
      .map((p) => serviceX(p.id, ctx));
    for (const x of xs) {
      a.tube(
        net,
        [
          [APP_X, 0.09, 0.25],
          [APP_X, 0.09, 1.28],
          [-1.1, 0.09, 1.45],
          [x - 0.25, 0.09, 1.45],
          [x, 0.09, 1.22],
          [x, 0.09, 0.25],
        ],
        0.032,
        blue,
      );
      for (const end of [APP_X, x])
        a.box(net, [0.2, 0.08, 0.24], 0.035, ice, [end, 0.105, 0.3]);
    }
    // The lid is hollow: separate rounded walls and a front with true openings.
    a.box(shell, [6.45, 0.18, 4.42], 0.26, chalk, [0, 1.99, 0], 0.24);
    a.box(shell, [6.35, 1.82, 0.1], 0.049, chalk, [0, 1, -2.16], 0.12);
    for (const x of [-3.17, 3.17])
      a.box(shell, [0.1, 1.82, 4.3], 0.049, chalk, [x, 1, 0], 0.12);
    const facade = new THREE.Shape();
    facade.moveTo(-3, 0.04);
    facade.lineTo(3, 0.04);
    facade.quadraticCurveTo(3.2, 0.04, 3.2, 0.24);
    facade.lineTo(3.2, 1.71);
    facade.quadraticCurveTo(3.2, 1.91, 3, 1.91);
    facade.lineTo(-3, 1.91);
    facade.quadraticCurveTo(-3.2, 1.91, -3.2, 1.71);
    facade.lineTo(-3.2, 0.24);
    facade.quadraticCurveTo(-3.2, 0.04, -3, 0.04);
    facade.closePath();
    for (const [x, y, w, h, r] of [
      [APP_X, 0.53, 0.74, 1.0, 0.15],
      [-2.8, 0.42, 0.48, 0.65, 0.09],
    ]) {
      const hole = new THREE.Path();
      const l = x - w / 2,
        b = y - h / 2;
      hole.moveTo(l + r, b);
      hole.lineTo(l + w - r, b);
      hole.quadraticCurveTo(l + w, b, l + w, b + r);
      hole.lineTo(l + w, b + h - r);
      hole.quadraticCurveTo(l + w, b + h, l + w - r, b + h);
      hole.lineTo(l + r, b + h);
      hole.quadraticCurveTo(l, b + h, l, b + h - r);
      hole.lineTo(l, b + r);
      hole.quadraticCurveTo(l, b, l + r, b);
      facade.holes.push(hole);
    }
    a.mesh(
      shell,
      new THREE.ExtrudeGeometry(facade, {
        depth: 0.06,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        curveSegments: 12,
      }),
      chalk,
      [0, 0, 2.14],
      0.14,
    );
    // Molded rim highlights establish the transparent silhouette without heavy rails.
    for (const y of [0.075, 1.9]) {
      for (const z of [-2.13, 2.13])
        a.box(shell, [6.28, 0.055, 0.055], 0.027, chalk, [0, y, z], 0.72);
      for (const x of [-3.14, 3.14])
        a.box(shell, [0.055, 0.055, 4.23], 0.027, chalk, [x, y, 0], 0.72);
    }
    for (const x of [-3.14, 3.14])
      for (const z of [-2.13, 2.13])
        a.box(shell, [0.055, 1.78, 0.055], 0.027, chalk, [x, 0.99, z], 0.45);
    return { disk: [disk], net: [net], shell: [shell] };
  },
  part(part: KitPart, ctx: KitContext): BuiltPart {
    const a = atelier(ctx),
      g = new THREE.Group();
    switch (part.kind) {
      case "host": {
        const body = a.box(g, [6.4, 0.37, 4.2], 0.18, steel, [0, 0.315, 0]);
        for (const x of [-2.55, 2.55])
          for (const z of [-1.5, 1.5])
            a.box(g, [0.6, 0.18, 0.65], 0.08, slate, [x, 0.09, z]);
        a.box(g, [3.15, 0.21, 0.035], 0.017, chalk, [-0.65, 0.31, 2.105]);
        a.print(g, ctx.hostLabel, 2.99, 0.155, [-0.65, 0.31, 2.127]);
        a.vents(g, 5, [2.15, 0.31, 2.105], 0.1);
        return built("base", g, [body], [-2.6, 0.49, 2.08]);
      }
      case "volume": {
        const sameOwner = ctx.parts.filter(
          (p) => p.kind === "volume" && p.owner === part.owner,
        );
        const index = sameOwner.findIndex((p) => p.id === part.id);
        g.position.set(
          part.owner === "app" ? APP_X : serviceX(part.owner, ctx),
          0.12,
          sameOwner.length > 1
            ? -0.85 + (1.7 * index) / (sameOwner.length - 1)
            : 0.35,
        );
        const privateCount = ctx.parts.filter(
          (p) => p.kind === "private",
        ).length;
        const ownerScale =
          part.owner === "app" || privateCount < 3
            ? 1
            : 1.5 / (privateCount - 1) / 1.3;
        const rowScale =
          sameOwner.length < 3 ? 1 : 1.6 / (sameOwner.length - 1) / 1.25;
        const footprintScale = Math.min(ownerScale, rowScale);
        g.scale.set(footprintScale, 1, footprintScale);
        const body = a.tin(
          g,
          0.57,
          0.34,
          part.owner === "app" ? lilac : chalk,
          [0, 0, 0],
        );
        const lid = a.tin(g, 0.59, 0.1, steel, [0, 0.34, 0]);
        a.box(g, [0.23, 0.045, 0.18], 0.02, ice, [0, 0.453, -0.04]);
        a.screen(g, "database", 0.4, 0.25, [0, 0.205, 0.535]);
        return built("disk", g, [body, lid], [0.4, 0.44, 0.4]);
      }
      case "web":
      case "private": {
        const app = part.kind === "web";
        const privateCount = ctx.parts.filter(
          (p) => p.kind === "private",
        ).length;
        const width = app
          ? 1.94
          : privateCount > 1
            ? Math.min(1.25, (1.5 / (privateCount - 1)) * 0.85)
            : 1.62;
        const h = app ? 1.1 : 0.98,
          depth = app ? 1.5 : 1.34;
        g.position.set(app ? APP_X : serviceX(part.id, ctx), 0, 0.15);
        for (const x of [-width * 0.3, width * 0.3])
          a.box(g, [0.28, 0.1, 0.75], 0.045, slate, [x, 0.05, 0]);
        const body = a.box(g, [width, h, depth], 0.18, app ? blue : chalk, [
          0,
          h / 2 + 0.08,
          0,
        ]);
        a.screen(g, app ? "chart" : "flame", width * 0.72, h * 0.47, [
          0,
          h * 0.64,
          depth / 2 + 0.012,
        ]);
        a.vents(g, app ? 6 : 4, [-width * 0.18, 0.26, depth / 2 + 0.017], 0.1);
        a.print(
          g,
          part.label,
          width * 0.34,
          0.13,
          [width * 0.255, 0.265, depth / 2 + 0.026],
          navy,
          app ? blue : chalk,
        );
        a.box(g, [width * 0.26, 0.027, 0.28], 0.013, ice, [
          width * 0.22,
          h + 0.09,
          -0.15,
        ]);
        return built("service", g, [body], [width * 0.3, h + 0.08, depth / 2]);
      }
      case "gate": {
        const http = part.id === "gate:http",
          w = http ? 0.64 : 0.4,
          h = http ? 0.9 : 0.57;
        g.position.set(http ? APP_X : -2.8, http ? 0.53 : 0.42, 2.22);
        const door = a.box(
          g,
          [w, h, 0.1],
          http ? 0.13 : 0.08,
          http ? lilac : steel,
          [0, 0, 0],
        );
        a.box(g, [w - 0.15, h * 0.4, 0.04], 0.02, navy, [0, 0.07, 0.06]);
        a.print(
          g,
          http ? "80" : "22",
          w - 0.19,
          h * 0.31,
          [0, 0.07, 0.083],
          ice,
          navy,
        );
        a.box(g, [0.065, 0.16, 0.05], 0.024, ice, [w * 0.28, -h * 0.25, 0.07]);
        return built("shell", g, [door], [0, h / 2, 0.06]);
      }
      case "tls": {
        g.position.set(APP_X, 0.55, 2.62);
        const bits: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 18; i++) {
          const arc = new THREE.TorusGeometry(
            0.67,
            0.017,
            6,
            5,
            (Math.PI * 2) / 26,
          );
          arc.rotateZ((i * Math.PI * 2) / 18);
          bits.push(arc);
        }
        const geo = mergeGeometries(bits)!;
        bits.forEach((b) => b.dispose());
        const ring = a.mesh(g, geo, steel, [0, 0, 0], 0.4);
        return built("shell", g, [ring], [0.5, 0.5, 0]);
      }
      case "gap": {
        g.position.set(2.4, 2.08, -1.3);
        const base = a.box(
          g,
          [0.33, 0.07, 0.33],
          0.034,
          steel,
          [0, 0.035, 0],
          0.24,
        );
        for (const y of [0.15, 0.31, 0.47])
          a.box(g, [0.055, 0.09, 0.055], 0.026, steel, [0, y, 0], 0.32);
        const top = a.box(
          g,
          [0.17, 0.13, 0.17],
          0.06,
          steel,
          [0, 0.61, 0],
          0.3,
        );
        for (const side of [-1, 1])
          a.tube(
            g,
            [
              [side * 0.18, 0.49, 0],
              [side * 0.25, 0.61, 0],
              [side * 0.18, 0.73, 0],
            ],
            0.014,
            steel,
            0.27,
          );
        return built("shell", g, [base, top], [0.1, 0.62, 0]);
      }
      case "offsite": {
        g.position.set(4.9, 0.03, -0.4);
        g.rotation.y = 0.14;
        for (const x of [-0.4, 0.4])
          a.box(g, [0.23, 0.09, 0.7], 0.04, slate, [x, 0.045, 0]);
        const body = a.box(g, [1.27, 1.03, 1.08], 0.18, lilac, [0, 0.59, 0]);
        const door = a.box(g, [1.05, 0.83, 0.09], 0.13, chalk, [0, 0.6, 0.545]);
        const dial = a.tin(g, 0.19, 0.08, slate, [0.06, 0.66, 0.61]);
        dial.rotation.x = Math.PI / 2;
        a.box(g, [0.027, 0.115, 0.03], 0.013, ice, [0.06, 0.69, 0.7]);
        for (const y of [0.38, 0.8])
          a.box(g, [0.1, 0.17, 0.1], 0.04, steel, [-0.43, y, 0.59]);
        a.print(g, "R2", 0.31, 0.15, [0.05, 0.32, 0.598]);
        return built("disk", g, [body, door], [0.4, 1.1, 0.54]);
      }
      case "source": {
        g.position.set(-4.75, 1.25, -0.6);
        g.rotation.y = 0.62;
        a.box(g, [0.09, 0.87, 0.1], 0.044, steel, [-0.55, -0.79, -0.03]);
        a.box(g, [0.55, 0.09, 0.4], 0.044, chalk, [-0.55, -1.21, -0.03]);
        const card = a.box(g, [1.66, 1.09, 0.16], 0.14, chalk, [0, 0, 0]);
        a.screen(g, "git", 0.75, 0.6, [0, 0.12, 0.09]);
        a.print(g, part.label, 1.45, 0.17, [0, -0.36, 0.091]);
        return built("service", g, [card], [-0.5, 0.54, 0.08]);
      }
      case "controller": {
        g.position.set(-4.4, 0, 2.55);
        g.rotation.y = 0.36;
        a.box(g, [0.73, 0.12, 0.68], 0.059, slate, [0, 0.06, 0]);
        const body = a.box(g, [0.66, 1.05, 0.62], 0.16, steel, [0, 0.64, 0]);
        a.screen(g, "eyes", 0.46, 0.32, [0, 0.83, 0.31]);
        a.vents(g, 3, [0, 0.35, 0.315], 0.11);
        return built("base", g, [body], [0, 1.17, 0]);
      }
    }
  },
  layerY(layer, e) {
    switch (layer) {
      case "base":
        return 0;
      case "disk":
        return 0.5 + e * 0.95;
      case "net":
        return 1.1 + e * 1.95;
      case "service":
        return 1.19 + e * 1.95;
      case "shell":
        return 0.5 + e * 4.1;
    }
  },
  frame: { target: [0.1, 3.0, 0], halfHeight: 5.1 },
};
export default kit;

// Chassis: a small, machined instrument on a light photographic stage.
// Satin aluminium, dark solder mask, inset displays and real port apertures.
// The assembled enclosure opens into a legible stack of replaceable hardware.
// Geometry stays within the sketch's attachment coordinates; only this kit
// owns these resources. Procedural textures need no external assets.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { BuiltPart, Kit, KitContext, KitLayer } from "../anatomy-kit";

const C = {
  metal: 0xd8dee8,
  bright: 0xf7f8fa,
  ink: 0x202838,
  slate: 0x3e4a60,
  blue: 0x285ad8,
  ice: 0xedf3ff,
  navy: 0x192338,
};
const APP_X = -1.45;
const geometries = new Map<string, THREE.BufferGeometry>();
const textures = new Set<THREE.Texture>();
let brushed: THREE.CanvasTexture | undefined;

function geometry(w: number, h: number, d: number, r = 0.04) {
  const key = `${w}/${h}/${d}/${r}`;
  let value = geometries.get(key);
  if (!value) {
    value = new RoundedBoxGeometry(
      w,
      h,
      d,
      3,
      Math.min(r, w / 2, h / 2, d / 2),
    );
    geometries.set(key, value);
  }
  return value;
}

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  color = true,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.add(texture);
  return texture;
}

function metal(color = C.metal) {
  if (!brushed) {
    brushed = canvasTexture(
      512,
      512,
      (ctx) => {
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(0, 0, 512, 512);
        for (let y = 0; y < 512; y++) {
          const v = 222 + ((y * 37) % 28);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(0, y, 512, 1);
        }
      },
      false,
    );
  }
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.85,
    roughness: 0.32,
    roughnessMap: brushed,
    clearcoat: 0.16,
    clearcoatRoughness: 0.4,
  });
}

const matte = (color: number) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.43 });
const luminous = (color = C.ice, intensity = 0.65) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
  });

function block(
  w: number,
  h: number,
  d: number,
  material: THREE.MeshStandardMaterial,
  x = 0,
  y = h / 2,
  z = 0,
  r = 0.04,
) {
  const mesh = new THREE.Mesh(geometry(w, h, d, r), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function label(
  text: string,
  ctx: KitContext,
  w: number,
  h: number,
  color = "#202838",
  background?: string,
) {
  const texture = canvasTexture(1024, 192, (c) => {
    if (background) {
      c.fillStyle = background;
      c.fillRect(0, 0, 1024, 192);
    }
    c.fillStyle = color;
    const px = Math.min(90, 1500 / Math.max(text.length, 1));
    c.font = `600 ${px}px ${ctx.font}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 512, 100, 970);
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.65,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
}

function topLabel(
  group: THREE.Group,
  text: string,
  ctx: KitContext,
  x: number,
  y: number,
  z: number,
  w: number,
  h = 0.24,
  color?: string,
) {
  const mesh = label(text, ctx, w, h, color);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function instances(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  positions: [number, number, number][],
  rotation?: THREE.Euler,
) {
  const mesh = new THREE.InstancedMesh(geo, material, positions.length);
  const dummy = new THREE.Object3D();
  if (rotation) dummy.rotation.copy(rotation);
  positions.forEach((p, i) => {
    dummy.position.set(...p);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function screws(group: THREE.Group, w: number, d: number, y: number) {
  instances(
    group,
    new THREE.CylinderGeometry(0.049, 0.049, 0.018, 12),
    metal(0x8994a4),
    [
      [-w / 2, y, -d / 2],
      [w / 2, y, -d / 2],
      [-w / 2, y, d / 2],
      [w / 2, y, d / 2],
    ],
  );
  instances(group, geometry(0.055, 0.005, 0.009, 0.002), matte(C.ink), [
    [-w / 2, y + 0.012, -d / 2],
    [w / 2, y + 0.012, -d / 2],
    [-w / 2, y + 0.012, d / 2],
    [w / 2, y + 0.012, d / 2],
  ]);
}

function serviceX(id: string | undefined, ctx: KitContext) {
  if (id === "app") return APP_X;
  const services = ctx.parts.filter((p) => p.kind === "private");
  const i = Math.max(
    0,
    services.findIndex((p) => p.id === id),
  );
  return services.length <= 1 ? 1.7 : 0.95 + (1.5 * i) / (services.length - 1);
}

function built(
  layer: KitLayer,
  object: THREE.Group,
  tintable: THREE.Mesh[],
  anchor: [number, number, number],
): BuiltPart {
  return { layer, object, tintable, anchor: new THREE.Vector3(...anchor) };
}

function path(
  points: [number, number, number][],
  radius: number,
  material: THREE.MeshStandardMaterial,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    "catmullrom",
    0.1,
  );
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, radius, 6, false),
    material,
  );
}

// A machined face, with holes through the metal instead of black decals.
function apertureFace(
  w: number,
  h: number,
  holes: { x: number; y: number; w: number; h: number }[],
  depth: number,
) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  for (const hole of holes) {
    const p = new THREE.Path();
    p.moveTo(hole.x - hole.w / 2, hole.y - hole.h / 2);
    p.lineTo(hole.x - hole.w / 2, hole.y + hole.h / 2);
    p.lineTo(hole.x + hole.w / 2, hole.y + hole.h / 2);
    p.lineTo(hole.x + hole.w / 2, hole.y - hole.h / 2);
    p.closePath();
    shape.holes.push(p);
  }
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 2,
  });
}

function ghostFrame(w: number, h: number) {
  const pieces: THREE.BufferGeometry[] = [];
  const add = (x: number, y: number, a: number, b: number) => {
    const g = new THREE.BoxGeometry(a, b, 0.018);
    g.translate(x, y, 0);
    pieces.push(g);
  };
  for (let x = -w / 2; x < w / 2; x += 0.16) {
    add(x + 0.045, -h / 2, 0.085, 0.022);
    add(x + 0.045, h / 2, 0.085, 0.022);
  }
  for (let y = -h / 2; y < h / 2; y += 0.16) {
    add(-w / 2, y + 0.045, 0.022, 0.085);
    add(w / 2, y + 0.045, 0.022, 0.085);
  }
  const merged = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  return new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({
      color: 0x8996aa,
      roughness: 0.6,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
}

const kit: Kit = {
  name: "Chassis",

  stage(scene, renderer) {
    const previous = {
      environment: scene.environment,
      background: scene.background,
      mapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      shadows: renderer.shadowMap.enabled,
      shadowType: renderer.shadowMap.type,
    };
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.06);
    room.dispose();
    scene.environment = environment.texture;
    scene.background = new THREE.Color(0xfbfcfe);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-5, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -10,
      right: 10,
      top: 11,
      bottom: -9,
      near: 0.5,
      far: 35,
    });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.00015;
    key.shadow.radius = 5;
    const fill = new THREE.DirectionalLight(0xedf3ff, 1.1);
    fill.position.set(7, 5, -6);
    const ambient = new THREE.HemisphereLight(0xffffff, 0xd8dee8, 0.65);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ color: 0x3e4a60, opacity: 0.085 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.015;
    ground.receiveShadow = true;
    // A broad contact penumbra keeps the assembled instrument grounded.
    const contactMap = canvasTexture(256, 256, (c) => {
      const gradient = c.createRadialGradient(128, 128, 25, 128, 128, 124);
      gradient.addColorStop(0, "rgba(32,40,56,0.18)");
      gradient.addColorStop(0.65, "rgba(32,40,56,0.08)");
      gradient.addColorStop(1, "rgba(32,40,56,0)");
      c.fillStyle = gradient;
      c.fillRect(0, 0, 256, 256);
    });
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6.6),
      new THREE.MeshBasicMaterial({
        map: contactMap,
        transparent: true,
        depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.009;
    scene.add(key, fill, ambient, ground, contact);
    return () => {
      scene.remove(key, fill, ambient, ground, contact);
      scene.environment = previous.environment;
      scene.background = previous.background;
      renderer.toneMapping = previous.mapping;
      renderer.toneMappingExposure = previous.exposure;
      renderer.shadowMap.enabled = previous.shadows;
      renderer.shadowMap.type = previous.shadowType;
      key.shadow.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      environment.dispose();
      pmrem.dispose();
      textures.forEach((texture) => texture.dispose());
      textures.clear();
      geometries.forEach((g) => g.dispose());
      geometries.clear();
      brushed = undefined;
    };
  },

  decor(ctx) {
    const disk = new THREE.Group();
    disk.add(block(5.96, 0.065, 3.8, metal(), 0, 0.033, 0, 0.03));
    disk.add(block(5.65, 0.012, 3.45, matte(0xb9c3d1), 0, 0.073));
    screws(disk, 5.55, 3.4, 0.085);
    topLabel(
      disk,
      "PERSISTENT STORAGE",
      ctx,
      0,
      0.087,
      1.52,
      2.0,
      0.15,
      "#3e4a60",
    );

    const net = new THREE.Group();
    net.add(block(5.85, 0.068, 3.65, matte(C.navy), 0, 0.034));
    const traces = canvasTexture(1024, 640, (c) => {
      c.fillStyle = "#293449";
      c.fillRect(0, 0, 1024, 640);
      c.lineWidth = 1.3;
      for (let i = 0; i < 32; i++) {
        const y = 34 + i * 18;
        c.strokeStyle = i % 3 ? "#47566d" : "#66758b";
        c.beginPath();
        c.moveTo(26, y);
        c.lineTo(110 + i * 9, y);
        c.lineTo(170 + i * 9, y + 45);
        c.lineTo(680 + i * 6, y + 45);
        c.lineTo(740 + i * 6, y);
        c.lineTo(995, y);
        c.stroke();
        c.fillStyle = "#8d9bb0";
        c.beginPath();
        c.arc(995, y, 2.8, 0, Math.PI * 2);
        c.fill();
      }
    });
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(5.7, 3.5),
      new THREE.MeshStandardMaterial({
        map: traces,
        roughness: 0.6,
        metalness: 0.35,
      }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.071;
    net.add(face);
    screws(net, 5.5, 3.3, 0.08);
    for (const service of ctx.parts.filter((p) => p.kind === "private")) {
      const x = serviceX(service.id, ctx);
      const points: [number, number, number][] = [
        [APP_X, 0.09, 0.15],
        [APP_X, 0.09, 1.13],
        [APP_X + 0.2, 0.09, 1.35],
        [x - 0.2, 0.09, 1.35],
        [x, 0.09, 1.12],
        [x, 0.09, 0.15],
      ];
      net.add(path(points, 0.027, luminous(C.ice, 0.85)));
    }
    topLabel(
      net,
      "PRIVATE NETWORK",
      ctx,
      0,
      0.081,
      -1.46,
      2.2,
      0.17,
      "#d8dee8",
    );

    const shell = new THREE.Group();
    shell.add(block(6.4, 0.15, 4.3, metal(0xe1e5ec), 0, 1.91, 0, 0.075));
    shell.add(block(6.16, 0.035, 4.08, matte(C.slate), 0, 1.814));
    shell.add(block(0.13, 0.64, 4.12, metal(), -3.13, 1.5, 0, 0.055));
    shell.add(block(0.13, 0.64, 4.12, metal(), 3.13, 1.5, 0, 0.055));
    shell.add(block(6.15, 0.64, 0.1, metal(), 0, 1.5, -2.05));
    // Smoked lower skirts enclose the assembled components without masking
    // their silhouettes as the cover lifts. No transmission render pass.
    for (const [w, d, x, z] of [
      [0.055, 4.08, -3.13, 0],
      [0.055, 4.08, 3.13, 0],
      [6.18, 0.055, 0, -2.05],
      [6.18, 0.055, 0, 2.075],
    ]) {
      const skirt = block(
        w,
        1.13,
        d,
        new THREE.MeshPhysicalMaterial({
          color: C.slate,
          metalness: 0.08,
          roughness: 0.18,
          transparent: true,
          opacity: 0.065,
          depthWrite: false,
          clearcoat: 0.7,
        }),
        x,
        0.615,
        z,
        0.025,
      );
      skirt.castShadow = false;
      shell.add(skirt);
    }
    const front = new THREE.Mesh(
      apertureFace(
        6.17,
        0.64,
        [
          { x: APP_X, y: 0.3, w: 0.82, h: 0.36 },
          { x: -2.8, y: 0.3, w: 0.36, h: 0.22 },
        ],
        0.1,
      ),
      metal(),
    );
    front.position.set(0, 1.18, 2.04);
    front.castShadow = true;
    front.receiveShadow = true;
    shell.add(front);
    const vents: [number, number, number][] = [];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 37; col++)
        vents.push([-0.46 + col * 0.089, 1.34 + row * 0.1, 2.155]);
    instances(shell, new THREE.CircleGeometry(0.023, 8), matte(C.ink), vents);
    topLabel(
      shell,
      "SERVER GUY",
      ctx,
      -1.72,
      1.988,
      1.13,
      1.38,
      0.22,
      "#687183",
    );
    // Top exhaust: fine slots in one draw call, with a quiet serviceable seam.
    const slots: [number, number, number][] = [];
    for (let i = 0; i < 28; i++) slots.push([0.45 + i * 0.073, 1.987, -1.18]);
    instances(
      shell,
      geometry(0.024, 0.007, 0.8, 0.003),
      matte(0x687183),
      slots,
    );
    screws(shell, 5.83, 3.68, 1.99);
    return { disk: [disk], net: [net], shell: [shell] };
  },

  part(part, ctx) {
    const group = new THREE.Group();
    switch (part.kind) {
      case "host": {
        const tray = block(6.4, 0.31, 4.2, metal(), 0, 0.315, 0, 0.12);
        group.add(tray, block(6.13, 0.025, 3.94, matte(C.slate), 0, 0.48, 0));
        instances(group, geometry(0.65, 0.17, 0.56, 0.07), matte(C.ink), [
          [-2.5, 0.085, -1.48],
          [2.5, 0.085, -1.48],
          [-2.5, 0.085, 1.48],
          [2.5, 0.085, 1.48],
        ]);
        const engraving = label(ctx.hostLabel, ctx, 2.85, 0.15, "#3e4a60");
        engraving.position.set(-1.22, 0.325, 2.107);
        group.add(engraving);
        group.add(
          block(1.12, 0.038, 0.014, matte(C.slate), 1.78, 0.325, 2.103, 0.007),
        );
        group.add(
          block(1.01, 0.014, 0.018, luminous(), 1.78, 0.326, 2.116, 0.006),
        );
        return built("base", group, [tray], [-2.6, 0.42, 2.1]);
      }
      case "volume": {
        const sameOwner = ctx.parts.filter(
          (p) => p.kind === "volume" && p.owner === part.owner,
        );
        const index = sameOwner.findIndex((p) => p.id === part.id);
        group.position.set(
          serviceX(part.owner, ctx),
          0.08,
          sameOwner.length > 1 ? -0.95 + index * 1.2 : 0.1,
        );
        const sled = block(
          1.65,
          0.23,
          sameOwner.length > 1 ? 0.94 : 2.08,
          metal(0xaab6c7),
          0,
          0.15,
        );
        group.add(sled);
        const drive = block(1.39, 0.13, 1.68, matte(C.navy), 0, 0.295);
        if (sameOwner.length > 1) drive.scale.z = 0.43;
        group.add(drive);
        const plate = block(1.2, 0.018, 0.54, metal(C.bright), 0, 0.369, 0.15);
        group.add(plate);
        topLabel(group, part.label, ctx, 0, 0.38, 0.15, 1.12, 0.24);
        group.add(block(0.1, 0.013, 0.11, luminous(), 0.49, 0.374, -0.2));
        const ribbon = block(0.34, 0.023, 0.66, matte(0x687183), 0, 0.2, -1.02);
        ribbon.rotation.x = -0.45;
        group.add(ribbon);
        instances(group, geometry(0.022, 0.009, 0.51, 0.003), metal(), [
          [-0.1, 0.06, -1.19],
          [-0.033, 0.06, -1.19],
          [0.033, 0.06, -1.19],
          [0.1, 0.06, -1.19],
        ]);
        return built("disk", group, [sled, drive], [0.5, 0.39, 0.68]);
      }
      case "web":
      case "private": {
        const web = part.kind === "web";
        const n = ctx.parts.filter((p) => p.kind === "private").length;
        const w = web ? 2.22 : n > 1 ? 1.22 : 1.78;
        const h = web ? 0.91 : 0.79;
        group.position.set(web ? APP_X : serviceX(part.id, ctx), 0.035, 0.15);
        group.add(block(w + 0.1, 0.1, 1.9, metal(0x8995a7), 0, 0.05));
        const body = block(
          w,
          h,
          1.76,
          metal(web ? 0xc5cedd : 0xb8c2d0),
          0,
          h / 2 + 0.08,
          0,
          0.105,
        );
        group.add(body);
        const face = block(
          w - 0.16,
          0.38,
          0.026,
          matte(web ? C.navy : C.slate),
          0,
          0.35,
          0.885,
        );
        group.add(face);
        if (web)
          group.add(
            block(
              w - 0.33,
              0.043,
              0.03,
              luminous(C.blue, 0.6),
              0,
              0.53,
              0.907,
              0.01,
            ),
          );
        const name = label(part.label, ctx, w - 0.34, 0.24, "#edf3ff");
        name.position.set(0, 0.33, 0.907);
        group.add(name);
        const fins: [number, number, number][] = [];
        for (let i = 0; i < 15; i++)
          fins.push([-w / 2 + 0.17 + (i * (w - 0.34)) / 14, h + 0.095, -0.2]);
        instances(
          group,
          geometry(0.035, 0.055, 0.97, 0.012),
          metal(0x8a98ac),
          fins,
        );
        topLabel(
          group,
          web ? "APPLICATION" : "PRIVATE SERVICE",
          ctx,
          0,
          h + 0.083,
          0.59,
          w - 0.25,
          0.17,
          "#3e4a60",
        );
        return built("service", group, [body, face], [w * 0.3, h + 0.13, 0.83]);
      }
      case "gate": {
        const http = part.id === "gate:http";
        const w = http ? 0.78 : 0.32;
        const h = http ? 0.32 : 0.18;
        group.position.set(http ? APP_X : -2.8, 1.48, 2.2);
        const surround = new THREE.Mesh(
          apertureFace(
            w + 0.085,
            h + 0.08,
            [{ x: 0, y: (h + 0.08) / 2, w, h }],
            0.065,
          ),
          metal(0x8292a9),
        );
        surround.position.set(0, -(h + 0.08) / 2, -0.065);
        const recess = block(w, h, 0.025, matte(C.navy), 0, 0, -0.135, 0.01);
        group.add(surround, recess);
        group.add(
          block(
            w - 0.08,
            0.025,
            0.11,
            luminous(C.ice, http ? 1.1 : 0.5),
            0,
            -h / 2 + 0.03,
            -0.08,
            0.004,
          ),
        );
        const text = label(
          http ? "80" : "22",
          ctx,
          http ? 0.28 : 0.21,
          0.13,
          "#3e4a60",
        );
        text.position.set(0, h / 2 + 0.18, -0.043);
        group.add(text);
        return built("shell", group, [surround, recess], [0, h / 2, 0.025]);
      }
      case "tls": {
        group.position.set(APP_X, 1.48, 2.64);
        const frame = ghostFrame(1.1, 0.67);
        group.add(frame);
        return built("shell", group, [frame], [0.53, 0.34, 0]);
      }
      case "gap": {
        group.position.set(2.4, 2.0, -1.3);
        const frame = ghostFrame(0.16, 0.63);
        frame.position.y = 0.34;
        group.add(frame);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.012, 5, 40, Math.PI * 1.55),
          new THREE.MeshStandardMaterial({
            color: 0x8996aa,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          }),
        );
        ring.position.y = 0.65;
        ring.rotation.z = -0.85;
        group.add(ring);
        return built("shell", group, [frame, ring], [0.1, 0.72, 0]);
      }
      case "offsite": {
        group.position.set(4.9, 0.03, -0.4);
        group.add(block(1.31, 0.09, 1.45, matte(C.ink), 0, 0.055));
        const body = block(1.3, 0.86, 1.4, metal(0x93a0b5), 0, 0.52, 0, 0.13);
        group.add(body);
        const face = block(1.1, 0.47, 0.035, matte(C.navy), 0, 0.5, 0.711);
        group.add(face);
        const text = label(part.label, ctx, 1.02, 0.21, "#edf3ff");
        text.position.set(0, 0.53, 0.734);
        group.add(text);
        group.add(block(0.35, 0.019, 0.019, luminous(), 0, 0.35, 0.735, 0.005));
        topLabel(group, "OFFSITE", ctx, 0, 0.956, 0, 0.85, 0.23, "#202838");
        return built("disk", group, [body, face], [0.42, 0.94, 0.6]);
      }
      case "source": {
        group.position.set(-5.0, 1.25, 0.05);
        group.rotation.y = 0.62;
        const body = block(1.95, 1.24, 0.095, metal(), 0, 0, 0, 0.045);
        group.add(body);
        const screen = block(1.8, 1.09, 0.012, matte(C.navy), 0, 0, 0.051);
        group.add(screen);
        const icon = canvasTexture(256, 256, (c) => {
          c.strokeStyle = "#edf3ff";
          c.lineWidth = 11;
          c.lineCap = "round";
          c.lineJoin = "round";
          c.beginPath();
          c.moveTo(85, 49);
          c.lineTo(85, 204);
          c.moveTo(85, 80);
          c.lineTo(173, 145);
          c.lineTo(173, 195);
          c.stroke();
          for (const [x, y] of [
            [85, 49],
            [85, 204],
            [173, 195],
          ]) {
            c.fillStyle = "#192338";
            c.beginPath();
            c.arc(x, y, 16, 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        });
        const glyph = new THREE.Mesh(
          new THREE.PlaneGeometry(0.47, 0.47),
          new THREE.MeshBasicMaterial({ map: icon, transparent: true }),
        );
        glyph.position.set(0, 0.19, 0.061);
        group.add(glyph);
        const text = label(part.label, ctx, 1.7, 0.2, "#edf3ff");
        text.position.set(0, -0.29, 0.065);
        group.add(text);
        return built("service", group, [body, screen], [-0.58, 0.6, 0.07]);
      }
      case "controller": {
        group.position.set(-4.4, 0, 2.55);
        group.rotation.y = 0.38;
        const base = block(1.04, 0.08, 0.8, metal(), 0, 0.065, 0.12);
        group.add(base);
        const screen = block(1.04, 0.7, 0.065, metal(), 0, 0.42, -0.25);
        screen.rotation.x = -0.12;
        group.add(screen);
        const display = block(0.93, 0.59, 0.014, matte(C.navy), 0, 0.42, -0.21);
        display.rotation.x = -0.12;
        group.add(display);
        const text = label(part.label, ctx, 0.8, 0.18, "#edf3ff");
        text.position.set(0, 0.42, -0.16);
        text.rotation.x = -0.12;
        group.add(text);
        group.add(
          block(0.61, 0.012, 0.17, matte(0x687183), 0, 0.112, 0.02, 0.015),
        );
        group.add(
          block(0.26, 0.009, 0.18, metal(0x9ba8ba), 0, 0.112, 0.28, 0.014),
        );
        return built("base", group, [base, screen, display], [0, 0.78, -0.22]);
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
        return 1.18 + e * 1.95;
      case "shell":
        return 0.5 + e * 4.1;
    }
  },
  frame: { target: [0.1, 3.0, 0], halfHeight: 5.15 },
};

export default kit;

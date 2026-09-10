// Glass: an instrument in frosted crystal, with luminous working parts.
// Broad bevelled trays establish the silhouette; white/blue cores stay legible
// through the cover. Pulling it apart reveals storage and the private bus.
// The brief fixes the palette, layout and bench. Only the kit is changed.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type {
  BuiltPart,
  Kit,
  KitContext,
  KitLayer,
  KitPart,
} from "../anatomy-kit";

const APP_X = -1.45;
const ICE = 0xedf3ff;
const NAVY = 0x192338;
const geometries = new Map<string, THREE.BufferGeometry>();

function rounded(w: number, h: number, d: number, r = 0.08) {
  const key = [w, h, d, r].join(":");
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(
      w,
      h,
      d,
      3,
      Math.min(r, h / 2, d / 2, w / 2),
    );
    geometries.set(key, geometry);
  }
  return geometry;
}

function satin(color = 0xf7f8fa, glow = 0) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0.12,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    emissive: glow ? ICE : 0x000000,
    emissiveIntensity: glow,
  });
}

function glass(thickness: number, clear = false) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf7faff,
    transmission: clear ? 0.98 : 0.93,
    roughness: clear ? 0.25 : 0.32,
    thickness,
    ior: 1.45,
    attenuationColor: new THREE.Color(0xc5d9f4),
    attenuationDistance: 7,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.8,
  });
}

function block(
  w: number,
  h: number,
  d: number,
  material: THREE.MeshStandardMaterial,
  y = h / 2,
  r = 0.08,
) {
  const mesh = new THREE.Mesh(rounded(w, h, d, r), material);
  mesh.position.y = y;
  mesh.castShadow =
    material instanceof THREE.MeshPhysicalMaterial &&
    material.transmission === 0;
  mesh.receiveShadow = true;
  return mesh;
}

function path(points: [number, number, number][], radius = 0.018, color = ICE) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    "centripetal",
  );
  const material = satin(color);
  material.emissive.setHex(color);
  material.emissiveIntensity = 0.25;
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, radius, 6, false),
    material,
  );
}

/** A continuous polished edge with rounded corners. */
function rim(w: number, d: number, y: number, radius = 0.22) {
  const points: THREE.Vector3[] = [];
  for (const [cx, cz, start] of [
    [w / 2 - radius, d / 2 - radius, 0],
    [-w / 2 + radius, d / 2 - radius, Math.PI / 2],
    [-w / 2 + radius, -d / 2 + radius, Math.PI],
    [w / 2 - radius, -d / 2 + radius, Math.PI * 1.5],
  ]) {
    for (let i = 0; i <= 8; i++) {
      const a = start + ((i / 8) * Math.PI) / 2;
      points.push(
        new THREE.Vector3(
          cx + Math.cos(a) * radius,
          y,
          cz + Math.sin(a) * radius,
        ),
      );
    }
  }
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.014, 6, true),
    satin(0xe7eef9, 0.12),
  );
}

function label(
  text: string,
  font: string,
  width: number,
  height: number,
  color = "#3e4a60",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(96, Math.round((1024 * height) / width));
  const ctx = canvas.getContext("2d")!;
  const px = Math.round(canvas.height * 0.58);
  ctx.font = `600 ${px}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.65,
    emissive: 0x687183,
    emissiveMap: texture,
    emissiveIntensity: 0.16,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  material.addEventListener("dispose", () => texture.dispose());
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function serviceX(id: string | undefined, ctx: KitContext) {
  if (id === "app") return APP_X;
  const services = ctx.parts.filter((part) => part.kind === "private");
  const i = Math.max(
    0,
    services.findIndex((part) => part.id === id),
  );
  return services.length <= 1 ? 1.7 : 0.95 + (1.5 * i) / (services.length - 1);
}

function built(
  layer: KitLayer,
  object: THREE.Object3D,
  tintable: THREE.Mesh[],
  anchor: [number, number, number],
): BuiltPart {
  return { layer, object, tintable, anchor: new THREE.Vector3(...anchor) };
}

function ghostRing(radius: number, segments: number) {
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segments; i++) {
    const geometry = new THREE.TorusGeometry(
      radius,
      0.016,
      6,
      6,
      ((Math.PI * 2) / segments) * 0.53,
    );
    geometry.rotateZ((i * Math.PI * 2) / segments);
    pieces.push(geometry);
  }
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x687183,
      transparent: true,
      opacity: 0.36,
      roughness: 0.55,
      depthWrite: false,
    }),
  );
}

const kit: Kit = {
  name: "Glass",
  stage(scene, renderer) {
    const previous = {
      environment: scene.environment,
      background: scene.background,
      toneMapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      shadows: renderer.shadowMap.enabled,
      shadowType: renderer.shadowMap.type,
    };
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = new THREE.Color(0xfbfcfe);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.06);
    room.dispose();
    scene.environment = environment.texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -9,
      right: 9,
      top: 10,
      bottom: -8,
      near: 0.5,
      far: 35,
    });
    key.shadow.normalBias = 0.04;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 4;
    const fill = new THREE.HemisphereLight(0xedf3ff, 0xd8dee8, 0.75);
    const edge = new THREE.DirectionalLight(0xd6e5ff, 1.25);
    edge.position.set(5, 6, -6);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ color: 0x65758f, opacity: 0.13 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    // A broad feathered contact patch grounds the transparent host as well.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, "rgba(69,89,124,0.18)");
    gradient.addColorStop(0.6, "rgba(69,89,124,0.09)");
    gradient.addColorStop(1, "rgba(69,89,124,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6.6),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(0.25, -0.02, 0.1);
    scene.add(key, fill, edge, ground, contact);
    return () => {
      scene.remove(key, fill, edge, ground, contact);
      scene.environment = previous.environment;
      scene.background = previous.background;
      renderer.toneMapping = previous.toneMapping;
      renderer.toneMappingExposure = previous.exposure;
      renderer.shadowMap.enabled = previous.shadows;
      renderer.shadowMap.type = previous.shadowType;
      key.shadow.map?.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      texture.dispose();
      environment.dispose();
      pmrem.dispose();
    };
  },

  decor(ctx) {
    const disk = new THREE.Group();
    disk.add(block(6.05, 0.12, 3.85, glass(0.18), 0.06), rim(6, 3.8, 0.115));
    const net = new THREE.Group();
    net.add(
      block(5.88, 0.055, 3.68, glass(0.09), 0.025),
      rim(5.83, 3.63, 0.052),
    );
    for (const service of ctx.parts.filter((part) => part.kind === "private")) {
      const x = serviceX(service.id, ctx);
      net.add(
        path(
          [
            [APP_X, 0.068, 0.2],
            [APP_X, 0.068, 1.18],
            [-0.8, 0.068, 1.36],
            [x - 0.3, 0.068, 1.36],
            [x, 0.068, 1.05],
            [x, 0.068, 0.2],
          ],
          0.032,
          0x6596d6,
        ),
      );
    }
    const shell = new THREE.Group();
    // One transmissive shell: joined roof and walls, hollow below, so the
    // assembled services fit inside rather than intersecting a solid block.
    const panels = [
      rounded(6.4, 0.16, 4.3, 0.075).clone().translate(0, 1.86, 0),
      rounded(0.11, 0.32, 4.22, 0.05).clone().translate(-3.145, 1.64, 0),
      rounded(0.11, 0.32, 4.22, 0.05).clone().translate(3.145, 1.64, 0),
      rounded(6.2, 0.32, 0.1, 0.045).clone().translate(0, 1.64, -2.1),
      rounded(6.2, 0.22, 0.1, 0.045).clone().translate(0, 0.13, 2.1),
      ...[-3.1, 3.1].flatMap((x) =>
        [-2.06, 2.06].map((z) =>
          rounded(0.12, 1.8, 0.12, 0.05).clone().translate(x, 0.9, z),
        ),
      ),
    ];
    const cover = new THREE.Mesh(mergeGeometries(panels)!, glass(0.12, true));
    panels.forEach((panel) => panel.dispose());
    shell.add(cover, rim(6.36, 4.26, 1.93), rim(6.36, 4.26, 0.05));
    return { disk: [disk], net: [net], shell: [shell] };
  },

  part(part: KitPart, ctx: KitContext): BuiltPart {
    const group = new THREE.Group();
    switch (part.kind) {
      case "host": {
        const slab = block(6.4, 0.5, 4.2, glass(0.6), 0.25, 0.18);
        const inset = block(5.98, 0.11, 3.78, satin(0xd8dee8), 0.16);
        const engraving = label(ctx.hostLabel, ctx.font, 3.6, 0.2);
        engraving.position.set(-0.6, 0.27, 2.104);
        group.add(slab, inset, rim(6.28, 4.08, 0.43), engraving);
        return built("base", group, [slab, inset], [-2.6, 0.5, 2.1]);
      }
      case "volume": {
        const siblings = ctx.parts.filter(
          (p) => p.kind === "volume" && p.owner === part.owner,
        );
        const i = siblings.findIndex((p) => p.id === part.id);
        group.position.set(
          serviceX(part.owner, ctx),
          0.12,
          siblings.length > 1 ? -0.8 + i * 1.3 : 0.35,
        );
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.46, 0.46, 0.29, 48),
          satin(0x73a2e0, 0.08),
        );
        core.position.y = 0.22;
        const casing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.59, 0.59, 0.45, 48),
          glass(0.25),
        );
        casing.position.y = 0.225;
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.52, 0.035, 48),
          satin(0x9cbeef, 0.04),
        );
        cap.position.y = 0.457;
        const caption = label(part.label, ctx.font, 0.86, 0.13);
        caption.rotation.x = -Math.PI / 2;
        caption.position.set(0, 0.477, 0.06);
        group.add(core, casing, cap, caption);
        return built("disk", group, [core, casing, cap], [0.4, 0.48, 0.4]);
      }
      case "web":
      case "private": {
        const app = part.kind === "web";
        const count = ctx.parts.filter((p) => p.kind === "private").length;
        const w = app ? 2 : count > 1 ? 1.22 : 1.6;
        const h = app ? 1.06 : 0.94;
        group.position.set(app ? APP_X : serviceX(part.id, ctx), 0.01, 0.15);
        const body = block(
          w,
          h,
          app ? 1.6 : 1.4,
          satin(app ? 0xf7f8fa : 0xc6d5ea, app ? 0.08 : 0),
          h / 2,
          0.15,
        );
        const face = block(
          w - 0.18,
          h - 0.2,
          0.045,
          satin(app ? 0xedf3ff : NAVY),
          h / 2,
          0.07,
        );
        face.position.z = app ? 0.8 : 0.7;
        const caption = label(
          part.label,
          ctx.font,
          w - 0.35,
          0.19,
          app ? "#3e4a60" : "#edf3ff",
        );
        caption.position.set(0, h * 0.49, app ? 0.828 : 0.728);
        group.add(body, face, caption);
        if (app) {
          const light = block(
            1.46,
            0.026,
            0.055,
            satin(0x285ad8, 0.25),
            h + 0.014,
            0.013,
          );
          light.position.z = 0.5;
          group.add(light);
        } else {
          const seam = block(
            0.35,
            0.024,
            0.014,
            satin(0x687183),
            h * 0.24,
            0.007,
          );
          seam.position.z = 0.729;
          group.add(seam);
        }
        return built(
          "service",
          group,
          [body, face],
          [app ? 0.6 : 0.45, h, app ? 0.8 : 0.7],
        );
      }
      case "gate": {
        const http = part.id === "gate:http";
        group.position.set(http ? APP_X : -2.8, http ? 0.5 : 0.42, 2.2);
        const bezel = block(
          http ? 0.62 : 0.36,
          http ? 0.9 : 0.59,
          0.1,
          satin(ICE, 0.35),
          0,
          0.065,
        );
        const aperture = block(
          http ? 0.46 : 0.23,
          http ? 0.72 : 0.42,
          0.025,
          satin(0xbad5ff, 0.45),
          0,
          0.035,
        );
        aperture.position.z = 0.058;
        const caption = label(
          http ? "80" : "22",
          ctx.font,
          http ? 0.31 : 0.21,
          0.15,
        );
        caption.position.set(0, -0.06, 0.074);
        group.add(bezel, aperture, caption);
        return built(
          "shell",
          group,
          [bezel, aperture],
          [0, http ? 0.4 : 0.28, 0.06],
        );
      }
      case "tls": {
        group.position.set(APP_X, 0.5, 2.62);
        const ring = ghostRing(0.65, 20);
        group.add(ring);
        return built("shell", group, [ring], [0.46, 0.46, 0]);
      }
      case "gap": {
        group.position.set(2.4, 1.95, -1.3);
        const beacon = ghostRing(0.19, 12);
        beacon.position.y = 0.57;
        const stem = block(
          0.04,
          0.36,
          0.04,
          new THREE.MeshStandardMaterial({
            color: 0x687183,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
          }),
          0.22,
          0.015,
        );
        group.add(stem, beacon);
        return built("shell", group, [stem, beacon], [0.1, 0.62, 0]);
      }
      case "offsite": {
        group.position.set(4.9, 0.03, -0.4);
        const casing = block(1.25, 1.08, 1.12, glass(0.4), 0.54, 0.16);
        const core = block(0.73, 0.69, 0.68, satin(0xa8c9f5, 0.16), 0.5, 0.15);
        const caption = label("R2", ctx.font, 0.49, 0.2);
        caption.position.set(0, 0.58, 0.568);
        group.add(casing, core, rim(1.17, 1.04, 0.99, 0.15), caption);
        return built("disk", group, [casing, core], [0.4, 1.05, 0.52]);
      }
      case "source": {
        group.position.set(-4.95, 1.25, 0.8);
        group.rotation.y = 0.62;
        const card = block(1.7, 1.08, 0.095, glass(0.16), 0, 0.045);
        const caption = label(part.label, ctx.font, 1.47, 0.13);
        caption.position.set(0, -0.28, 0.055);
        const left = path(
          [
            [-0.25, 0.23, 0.06],
            [-0.42, 0.09, 0.06],
            [-0.25, -0.05, 0.06],
          ],
          0.018,
          0x687183,
        );
        const right = path(
          [
            [0.25, 0.23, 0.06],
            [0.42, 0.09, 0.06],
            [0.25, -0.05, 0.06],
          ],
          0.018,
          0x687183,
        );
        const slash = path(
          [
            [0.07, 0.28, 0.06],
            [-0.07, -0.1, 0.06],
          ],
          0.018,
          0x687183,
        );
        group.add(card, caption, left, right, slash);
        return built("service", group, [card], [-0.5, 0.52, 0]);
      }
      case "controller": {
        group.position.set(-4.4, 0, 2.55);
        const casing = block(0.43, 1.02, 0.43, glass(0.3), 0.57, 0.18);
        const core = block(0.22, 0.66, 0.22, satin(NAVY), 0.61, 0.1);
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.34, 0.08, 40),
          satin(0xd8dee8),
        );
        foot.position.y = 0.04;
        const light = block(0.15, 0.035, 0.025, satin(ICE, 0.5), 0.78, 0.015);
        light.position.z = 0.13;
        group.add(casing, core, foot, light);
        return built("base", group, [casing, core, foot], [0, 1.08, 0]);
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
        return 1.16 + e * 1.95;
      case "shell":
        return 0.5 + e * 4.1;
    }
  },
  frame: { target: [0.1, 3, 0], halfHeight: 5 },
};

export default kit;

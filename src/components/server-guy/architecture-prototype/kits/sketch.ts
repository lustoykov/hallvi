// PROTOTYPE · claude/architecture-directions · throwaway.
// A deliberately plain reference kit: it shows the contract and the layout,
// not a look. Real styles live beside it (chassis, clay, glass).

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import type { BuiltPart, Kit, KitLayer, KitPart } from "../anatomy-kit";

/** Where the application sits; private services sit to its right. */
const APP_X = -1.45;
const SERVICE_X = 1.7;

const standard = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });

function box(w: number, h: number, d: number, color: number, y = h / 2) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standard(color));
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(r: number, h: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 40),
    standard(color),
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  return mesh;
}

function built(
  layer: KitLayer,
  object: THREE.Object3D,
  tintable: THREE.Mesh[],
  anchor: [number, number, number],
): BuiltPart {
  return { layer, object, tintable, anchor: new THREE.Vector3(...anchor) };
}

const kit: Kit = {
  name: "Sketch",

  stage(scene, renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-6, 12, 8);
    key.castShadow = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(key, ground);
    return () => {
      scene.remove(key, ground);
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  },

  decor() {
    return {
      disk: [box(6.0, 0.05, 3.8, 0xedf1f7, 0.025)],
      net: [box(5.8, 0.05, 3.6, 0xd8e4ff, 0.025)],
    };
  },

  part(part: KitPart): BuiltPart {
    const group = new THREE.Group();
    switch (part.kind) {
      case "host": {
        const mesh = box(6.4, 0.5, 4.2, 0xe4e9f1);
        group.add(mesh);
        return built("base", group, [mesh], [-2.6, 0.5, 2.1]);
      }
      case "volume": {
        const x = part.owner === "app" ? APP_X : SERVICE_X;
        group.position.set(x, 0.03, 0.35);
        const mesh = cylinder(0.55, 0.6, 0xd7dfeb);
        group.add(mesh);
        return built("disk", group, [mesh], [0.4, 0.6, 0.4]);
      }
      case "web": {
        group.position.set(APP_X, 0, 0.15);
        const mesh = box(2.0, 1.1, 1.6, 0xdce6fb);
        group.add(mesh);
        return built("service", group, [mesh], [0.6, 1.1, 0.8]);
      }
      case "private": {
        group.position.set(SERVICE_X, 0, 0.15);
        const mesh = box(1.6, 0.95, 1.4, 0xeef1f6);
        group.add(mesh);
        return built("service", group, [mesh], [0.5, 0.95, 0.7]);
      }
      case "gate": {
        const http = part.id === "gate:http";
        group.position.set(http ? APP_X : -2.8, http ? 0.5 : 0.42, 2.2);
        const mesh = box(http ? 0.58 : 0.42, http ? 0.86 : 0.6, 0.12, 0x3e4a60, 0);
        group.add(mesh);
        return built("shell", group, [mesh], [0, 0.4, 0.06]);
      }
      case "tls": {
        group.position.set(APP_X, 0.5, 2.62);
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.66, 0.02, 8, 64),
          new THREE.MeshStandardMaterial({
            color: 0x8b95a5,
            transparent: true,
            opacity: 0.5,
          }),
        );
        group.add(mesh);
        return built("shell", group, [mesh], [0.5, 0.5, 0]);
      }
      case "gap": {
        group.position.set(2.4, 1.95, -1.3);
        const mesh = box(0.12, 0.62, 0.12, 0x8b95a5);
        group.add(mesh);
        return built("shell", group, [mesh], [0.1, 0.62, 0]);
      }
      case "offsite": {
        group.position.set(4.9, 0.03, -0.4);
        const mesh = box(1.25, 1.05, 1.05, 0xe7ecf3);
        group.add(mesh);
        return built("disk", group, [mesh], [0.4, 1.05, 0.52]);
      }
      case "source": {
        group.position.set(-4.75, 1.25, -0.6);
        group.rotation.y = 0.62;
        const mesh = box(1.7, 1.05, 0.08, 0xffffff, 0);
        group.add(mesh);
        return built("service", group, [mesh], [-0.5, 0.52, 0]);
      }
      case "controller": {
        group.position.set(-4.4, 0, 2.55);
        const mesh = box(0.4, 1.0, 0.4, 0x2a3550);
        group.add(mesh);
        return built("base", group, [mesh], [0, 1.0, 0]);
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

  frame: { target: [0.1, 2.7, 0], halfHeight: 4.6 },
};

export default kit;

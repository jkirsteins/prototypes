import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WALK_SPEED_M_S } from "./movement";
import type { Movement } from "./movement";

const FADE_S = 0.2;
/** Every model is normalized to this height so the camera framing and the
 *  walk speed read the same regardless of the source file's units. */
const TARGET_HEIGHT_M = 1.8;

export interface ModelSpec {
  file: string;
  idleClip: string;
  walkClip: string;
  /** Ground speed the walk clip is authored for at timeScale 1, measured
   *  as planted-foot world drift over a stance phase (the __character e2e
   *  hook samples a foot bone's world x while walking): natural speed =
   *  walk speed - drift. Per model because each rig's stride differs. */
  clipNaturalSpeedMS: number;
  /** Optional per-material fixup applied at load. */
  recolor?: (mat: THREE.MeshStandardMaterial) => void;
}

export const MODELS: Record<string, ModelSpec> = {
  // Quaternius knight (CC0), converted from the pack's FBX with FBX2glTF.
  knight: {
    file: "Knight.glb",
    idleClip: "HumanArmature|Idle",
    walkClip: "HumanArmature|Walking",
    clipNaturalSpeedMS: 0.98,
  },
  // The three.js examples mannequin. Ships with salmon-colored materials;
  // recolored to the neutral grays a practice dummy should have.
  xbot: {
    file: "Xbot.glb",
    idleClip: "idle",
    walkClip: "walk",
    clipNaturalSpeedMS: 1.55,
    recolor: (mat) => {
      mat.color.set(mat.name.includes("Joints") ? 0x3a404c : 0xb8bec8);
    },
  },
};

/** URL-param model selection; unknown names fall back to the default so a
 *  typo cannot break the page. */
export function pickModel(search: string): ModelSpec {
  const name = new URLSearchParams(search).get("model") ?? "knight";
  return MODELS[name] ?? MODELS.knight;
}

export interface Character {
  root: THREE.Group;
  update(m: Movement, dtSeconds: number): void;
}

/**
 * Loads a model and drives it from Movement: position along x, an instant
 * yaw flip for facing, walk while moving with the clip's timeScale tied to
 * ground speed, idle otherwise.
 */
export async function loadCharacter(baseUrl: string, spec: ModelSpec): Promise<Character> {
  const gltf = await new GLTFLoader().loadAsync(baseUrl + spec.file);
  const inner = gltf.scene;
  inner.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (spec.recolor && mat instanceof THREE.MeshStandardMaterial) spec.recolor(mat);
  });

  // Normalize source units: scale to a human height and rest the feet on
  // y = 0. The bounding box is taken in bind pose, close enough for both.
  const box = new THREE.Box3().setFromObject(inner);
  const scale = TARGET_HEIGHT_M / (box.max.y - box.min.y);
  inner.scale.setScalar(scale);
  inner.position.y = -box.min.y * scale;
  const root = new THREE.Group();
  root.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  const clip = (name: string): THREE.AnimationClip => {
    const found = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!found) throw new Error(`${spec.file} is missing the "${name}" clip`);
    return found;
  };
  const idle = mixer.clipAction(clip(spec.idleClip));
  const walk = mixer.clipAction(clip(spec.walkClip));
  walk.timeScale = WALK_SPEED_M_S / spec.clipNaturalSpeedMS;
  idle.play();

  let wasMoving = false;
  return {
    root,
    update(m: Movement, dtSeconds: number): void {
      root.position.x = m.x;
      // Both models face +z (toward the camera) at rest; yaw a quarter
      // turn to walk along the piste. The flip is instant by design - no
      // turn animation.
      root.rotation.y = (m.facing * Math.PI) / 2;
      if (m.moving !== wasMoving) {
        wasMoving = m.moving;
        const from = m.moving ? idle : walk;
        const to = m.moving ? walk : idle;
        from.fadeOut(FADE_S);
        to.reset().fadeIn(FADE_S).play();
      }
      mixer.update(dtSeconds);
    },
  };
}

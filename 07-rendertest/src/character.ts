import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WALK_SPEED_M_S } from "./movement";
import type { Movement } from "./movement";

/** Ground speed the walk clip was authored for at timeScale 1, measured by
 *  eye against the Xbot walk cycle: the feet plant without sliding when
 *  1.4 m/s of travel maps to timeScale 1. Tune here if the model changes. */
const CLIP_NATURAL_SPEED_M_S = 1.4;
const FADE_S = 0.2;

export interface Character {
  root: THREE.Group;
  update(m: Movement, dtSeconds: number): void;
}

/**
 * Loads the Xbot mannequin and drives it from Movement: position along x,
 * an instant yaw flip for facing, walk while moving with the clip's
 * timeScale tied to ground speed, idle otherwise.
 */
export async function loadCharacter(url: string): Promise<Character> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  // The file ships with salmon-colored materials; recolor to the neutral
  // grays a practice dummy should have (dark joints, light shell).
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.color.set(mat.name.includes("Joints") ? 0x3a404c : 0xb8bec8);
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const clip = (name: string): THREE.AnimationClip => {
    const found = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!found) throw new Error(`Xbot.glb is missing the "${name}" clip`);
    return found;
  };
  const idle = mixer.clipAction(clip("idle"));
  const walk = mixer.clipAction(clip("walk"));
  walk.timeScale = WALK_SPEED_M_S / CLIP_NATURAL_SPEED_M_S;
  idle.play();

  let wasMoving = false;
  return {
    root,
    update(m: Movement, dtSeconds: number): void {
      root.position.x = m.x;
      // The glTF faces +z (toward the camera); yaw a quarter turn to walk
      // along the piste. The flip is instant by design - no turn animation.
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

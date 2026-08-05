import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalizeToHeight } from "../character";
import { CLIPS } from "./poses";
import type { ClipName, PosePick } from "./poses";

/** 06's fighter is a ~175 cm person; duel mode normalizes to match. */
const FIGHTER_HEIGHT_M = 1.75;

// Calibration constants - Task 8 solves the real values; these are the
// starting guesses. The sword's blade axis, read from Sword.glb's mesh
// bounds after FBX2glTF's baked node transform (Step 1): local mesh-space
// combined min (-0.00386, -0.00120, -0.00494) max (0.00386, 0.00108,
// 0.03859), which after the "Sword" node's own rotation (-90 deg about x)
// and scale (100) becomes world-space min (-0.386, -0.494, -0.108) max
// (0.386, 3.859, 0.120) - dims x=0.771 y=4.353 z=0.229. The long axis is
// y, tip toward +y, matching this file's defaults below.
export const SWORD_SOCKET_POS = new THREE.Vector3(0, 0.05, 0.02);
export const SWORD_SOCKET_EULER = new THREE.Euler(Math.PI / 2, 0, 0);
export const BLADE_LENGTH_SCALE = 1.0;
/** Wrist-origin to palm-center offset, meters, in hand-bone local space. */
export const PALM_OFFSET = new THREE.Vector3(0, 0.08, 0.01);
/** Grip segment ends and blade tip, sword-local, BEFORE blade scaling. */
export const GRIP_A = new THREE.Vector3(0, 0.02, 0);
export const GRIP_B = new THREE.Vector3(0, 0.22, 0);
export const TIP_LOCAL = new THREE.Vector3(0, 1.0, 0);

export interface RigSample {
  activeClip: string | null;
  clipTime: number;
  paused: boolean;
  weights: Record<string, number>;
  boneLocal: Record<string, number[]>;
  rootWorldX: number;
  tipWorldX: number;
  leftPalmToGripCm: number;
  lowestFootY: number;
}

export interface DuelRig {
  root: THREE.Group;
  applyPose(p: PosePick): void;
  setSwordVisible(v: boolean): void;
  sample(): RigSample;
}

/** Zeroes x/z of the root translation track so the engine alone moves
 *  the fighter (the spec's in-place rule), keeping y (crouch/jump). */
function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position")) continue;
    if (!/Hips/.test(track.name)) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
  }
}

export async function loadDuelRig(baseUrl: string): Promise<DuelRig> {
  const loader = new GLTFLoader();
  const xbot = await loader.loadAsync(`${baseUrl}models/Xbot.glb`);
  const inner = xbot.scene;
  inner.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      o.material.color.set(o.material.name.includes("Joints") ? 0x3a404c : 0xb8bec8);
    }
  });
  normalizeToHeight(inner, FIGHTER_HEIGHT_M);
  const root = new THREE.Group();
  root.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<ClipName, THREE.AnimationAction>();
  for (const [name, meta] of Object.entries(CLIPS) as [ClipName, { file: string }][]) {
    const gltf = await loader.loadAsync(`${baseUrl}models/clips/${meta.file}`);
    const clip = gltf.animations[0];
    if (!clip) throw new Error(`${meta.file} has no animation`);
    stripRootMotion(clip);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
    actions.set(name, action);
  }

  // Sword prop + markers on the right hand.
  const swordGltf = await loader.loadAsync(`${baseUrl}models/Sword.glb`);
  const swordGroup = new THREE.Group();
  swordGroup.add(swordGltf.scene);
  swordGltf.scene.scale.y *= BLADE_LENGTH_SCALE; // blade axis per Step 1
  const tip = new THREE.Object3D(); tip.position.copy(TIP_LOCAL).multiplyScalar(BLADE_LENGTH_SCALE); swordGroup.add(tip);
  const gripA = new THREE.Object3D(); gripA.position.copy(GRIP_A); swordGroup.add(gripA);
  const gripB = new THREE.Object3D(); gripB.position.copy(GRIP_B); swordGroup.add(gripB);
  swordGroup.position.copy(SWORD_SOCKET_POS);
  swordGroup.setRotationFromEuler(SWORD_SOCKET_EULER);

  let rightHand: THREE.Object3D | null = null;
  let leftHand: THREE.Object3D | null = null;
  const bones: THREE.Bone[] = [];
  const feet: THREE.Object3D[] = [];
  inner.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    if (/RightHand$/.test(o.name)) rightHand = o;
    if (/LeftHand$/.test(o.name)) leftHand = o;
    if (/Foot$|ToeBase$/.test(o.name)) feet.push(o);
  });
  if (!rightHand || !leftHand) throw new Error("hand bones not found");
  // Rebind to new consts: TS's control-flow narrowing does not see through
  // the traverse() closure that assigned rightHand/leftHand above, so the
  // guard alone leaves their type as `never` at the call sites below.
  const rightHandBone: THREE.Object3D = rightHand;
  const leftHandBone: THREE.Object3D = leftHand;
  rightHandBone.add(swordGroup);
  const leftPalm = new THREE.Object3D();
  leftPalm.position.copy(PALM_OFFSET);
  leftHandBone.add(leftPalm);

  let current: { pick: PosePick } | null = null;

  return {
    root,
    applyPose(p: PosePick): void {
      // The hard-reset rule: exactly one action at weight 1, every
      // action paused, time set explicitly, advanced with update(0) so
      // frame dt can never move a pose.
      for (const [name, action] of actions) {
        action.paused = true;
        action.setEffectiveWeight(name === p.clip ? 1 : 0);
        if (name === p.clip) action.time = p.clipTime;
      }
      mixer.update(0);
      current = { pick: p };
    },
    setSwordVisible(v: boolean): void { swordGroup.visible = v; },
    sample(): RigSample {
      root.updateWorldMatrix(true, true);
      const world = new THREE.Vector3();
      const tipW = tip.getWorldPosition(new THREE.Vector3());
      const palmW = leftPalm.getWorldPosition(new THREE.Vector3());
      const a = gripA.getWorldPosition(new THREE.Vector3());
      const b = gripB.getWorldPosition(new THREE.Vector3());
      const seg = b.clone().sub(a);
      const t = Math.min(1, Math.max(0, palmW.clone().sub(a).dot(seg) / seg.lengthSq()));
      const nearest = a.clone().addScaledVector(seg, t);
      const boneLocal: Record<string, number[]> = {};
      for (const bone of bones) {
        boneLocal[bone.name] = [
          bone.position.x, bone.position.y, bone.position.z,
          bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w,
          bone.scale.x, bone.scale.y, bone.scale.z,
        ];
      }
      const weights: Record<string, number> = {};
      for (const [name, action] of actions) weights[name] = action.getEffectiveWeight();
      return {
        activeClip: current?.pick.clip ?? null,
        clipTime: current?.pick.clipTime ?? 0,
        paused: [...actions.values()].every((x) => x.paused),
        weights,
        boneLocal,
        rootWorldX: root.getWorldPosition(world).x,
        tipWorldX: tipW.x,
        leftPalmToGripCm: palmW.distanceTo(nearest) * 100,
        lowestFootY: Math.min(...feet.map((f) => f.getWorldPosition(new THREE.Vector3()).y)),
      };
    },
  };
}

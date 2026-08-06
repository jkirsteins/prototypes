import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalizeToHeight } from "../character";
import { CLIPS } from "./poses";
import type { ClipName, PosePick } from "./poses";

/** 06's fighter is a ~175 cm person; duel mode normalizes to match. */
const FIGHTER_HEIGHT_M = 1.75;

// Sword.glb's own units, read from its mesh bounds after FBX2glTF's baked
// node transform (a -90 deg turn about x and a x100 scale): the model runs
// along +y from the pommel at y = -0.494 to the tip at y = 3.859, i.e.
// 4.353 units of sword, x spanning +/-0.386 at the crossguard. Its four
// primitives separate cleanly: Metal blade y 0.689 .. 3.859, Brown
// crossguard y 0.583 .. 0.689, Red grip y -0.162 .. 0.583, Gold pommel and
// fittings down to y -0.494. Everything below in sword units is expressed
// against that model and multiplied by BLADE_LENGTH_SCALE to reach meters.

// Both hands are read from the rig itself rather than guessed. The finger
// bones' own bind offsets put the right hand's knuckle row along z (Index1
// z +0.022, Pinky1 z -0.037), the fingers along -x (Middle1 x -0.092) and
// the thumb below the palm plane, so the palm centre - where a grip lies -
// is half way to the knuckles, one grip radius into the palm side:
// (-0.043, -0.020, -0.008) right, mirrored in x for the left.

/** Uniform meters-per-sword-unit: 4.353 sword units x this is the whole
 *  weapon, pommel to tip, so 0.32 is a 1.39 m great sword against the
 *  1.75 m fighter - the top of the 1.0-1.4 m band, chosen there because
 *  reach is the scarce quantity (see the reach note below). */
export const BLADE_LENGTH_SCALE = 0.32;
/** Wrist-origin to palm-centre offset, meters, in the left palm group; the
 *  right is the same point mirrored in x, and the socket is seated on it. */
export const PALM_OFFSET = new THREE.Vector3(0.043, -0.020, -0.008);
const PALM_OFFSET_RIGHT = new THREE.Vector3(-0.043, -0.020, -0.008);
/** Grip segment ends and blade tip, sword units, BEFORE blade scaling.
 *  GRIP_A is the pommel end of the Red grip, GRIP_B the crossguard end;
 *  at 0.32 that is a 23.8 cm grip, two-handed. */
export const GRIP_A = new THREE.Vector3(0, -0.162, 0);
export const GRIP_B = new THREE.Vector3(0, 0.583, 0);
export const TIP_LOCAL = new THREE.Vector3(0, 3.859, 0);

// The socket is solved from the clips, not guessed, and it is solved
// against the retarget below: the hilt line lives in the right hand's local
// frame, and that frame is exactly what a wrong retarget gets wrong. These
// numbers only mean anything with the parent-frame conjugation in
// retargetRotationsToRestPose.
//
// GRIP_AXIS is the direction from the right palm to the left palm in
// right-hand-local axes, averaged over the great-sword family under that
// retarget: idle 0.54 (0.574, -0.099, -0.813), slash 0.84 (0.496, -0.134,
// -0.858), block 0.70 (0.275, 0.272, -0.922). The three sit within 18
// degrees of the mean - one hilt held by two hands, which is what a
// two-handed weapon should look like and what the axis is fitted to.
// upward-thrust is left out of the fit on purpose: its own skeleton holds
// the hands 46 cm apart, so it has no hilt line to contribute.
// (Refitting on the delivered cut's final 0.88 rather than 0.84 turns the
// axis by 2.4 degrees, well inside the family spread, so it is not worth
// re-baking.)
const GRIP_AXIS = new THREE.Vector3(0.460, 0.014, -0.888).normalize();
/** Sword +y is the tip, so the blade points away from the off-hand: the
 *  left hand rides the pommel end of the grip, the right hand the guard
 *  end, the ordinary great-sword hold. */
const BLADE_DIR = GRIP_AXIS.clone().negate();
/** Turn about the blade so the flat faces this side-view stage rather than
 *  going edge-on and reading as a one-pixel line. Swept at 5 degrees:
 *  pi/2 holds the flat 0.85 (idle) / 0.99 (cut) / 0.60 (parry) toward the
 *  camera, the best all-round value; more favours the idle at the parry's
 *  expense, less the other way. */
const BLADE_ROLL = Math.PI / 2;
/** Where the right palm rides on the blade, in sword units: just under the
 *  crossguard (Red grip runs -0.162 .. 0.583). The off-hand then lands at
 *  sword y 0.02 (idle) .. 0.33 (parry), inside the grip with the pommel
 *  behind it. */
const GRIP_SEAT = 0.5;

const SWORD_UP = new THREE.Vector3(0, 1, 0);
/** Sword origin (its own y = 0) in the right palm group, meters: the palm
 *  centre walked back down the blade by the seat. */
export const SWORD_SOCKET_POS = PALM_OFFSET_RIGHT.clone()
  .addScaledVector(BLADE_DIR, -GRIP_SEAT * BLADE_LENGTH_SCALE);
/** Sword-local to right-palm-group rotation. Derived rather than written
 *  as an Euler triple: the hilt line is oblique in the hand's frame, so
 *  the triple would be three opaque numbers (XYZ -0.838, 0.904, 2.304). */
export const SWORD_SOCKET_QUAT = new THREE.Quaternion()
  .setFromUnitVectors(SWORD_UP, BLADE_DIR)
  .multiply(new THREE.Quaternion().setFromAxisAngle(SWORD_UP, BLADE_ROLL));

// Measured with these values (paused, KeyJ then step 1000 / KeyK then step
// 700, forward reach = (tipWorldX - rootWorldX) x facing):
//   cut delivered    reach 1.464 m, left palm 1.3 cm off the grip
//   thrust delivered reach 1.560 m, left palm 78.5 cm off the grip
//   parry formed     reach 0.911 m, left palm 1.7 cm off the grip
//   idle             reach 1.117 m, left palm 2.8 cm off the grip
// The spec's 2.00 m (LONGSWORD.reachCm) is NOT reachable and no scale can
// make it so. At their most extended frame these clips carry the sword
// hand 0.41 m (cut) and 0.67 m (thrust) ahead of the hips, and the blade
// leaves that hand 0.97 (cut) / 0.66 (thrust) aligned with the line, so a
// tip 2.00 m out needs about 2.1 m of weapon for the cut and 2.6 m for the
// thrust - a lance, and two different lances. Closing that gap is a
// question for reachCm or for the poses, not for a scale here.
//
// The off-hand rides the hilt everywhere the source clips hold it there:
// the two hands are 15.1 cm apart through great-sword-idle and 6.5 cm
// through great-sword-blocking, matching the source to within 3% (its own
// 15.7 and 6.7 cm at a 0.97 size ratio). The thrust is the exception, and
// it is choreography rather than a rig defect: stabbing-3.glb (Mixamo's
// "Stabbing" variant 3) is a one-handed extended thrust whose own skeleton
// throws the off-hand 78.5 cm from the grip at full extension, so no
// socket setting closes it. The e2e asserts that value as EXPECTED rather
// than gating it to 10 cm.

/** `?markers` on the duel URL draws the calibration points (tip, both grip
 *  ends, left palm) as small unlit spheres that read through the mesh. */
const DEBUG_MARKERS = typeof location !== "undefined" && new URLSearchParams(location.search).has("markers");

/** A calibration point: an empty in the release build, a sphere under
 *  `?markers`. Radius is in meters because every marker hangs off a
 *  scale-compensated group. */
function marker(color: number): THREE.Object3D {
  const o = new THREE.Object3D();
  if (!DEBUG_MARKERS) return o;
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  dot.renderOrder = 10;
  o.add(dot);
  return o;
}

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

/** Xbot.glb's Hips bone sits under an "Armature" node with a baked 0.01
 *  scale (its own bind pose and native idle/walk clips carry Hips.y in
 *  raw centimeters, e.g. ~103, corrected to ~1.03 m by that scale). The
 *  Task 4 mocap clips (great-sword-*, dodge-backward, stabbing,
 *  unarmed-idle) are separately-converted glTF files whose Hips.y is
 *  already in meters (e.g. ~0.95-1.0) - applied raw onto Xbot's Hips
 *  bone, the same 0.01 Armature scale crushes it another 100x, collapsing
 *  the whole skeleton onto the floor. Scaling by 100 here re-expresses it
 *  in the centimeters Xbot's Armature scale expects, cancelling out. */
const HIPS_Y_UNIT_SCALE = 100;

/** Zeroes x/z of the root translation track so the engine alone moves
 *  the fighter (the spec's in-place rule), keeping y (crouch/jump). */
function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position")) continue;
    if (!/Hips/.test(track.name)) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = 0;
      v[i + 1] *= HIPS_Y_UNIT_SCALE;
      v[i + 2] = 0;
    }
  }
}

/**
 * Re-expresses every rotation keyframe against Xbot's own rest pose.
 *
 * Xbot.glb's bind pose has every bone's local quaternion at identity
 * (verified across the whole rig) and, because the parents are identity
 * too, every bone's rest WORLD rotation is identity as well. Its native
 * idle/walk clips therefore store each frame's absolute local rotation
 * directly, with "identity" meaning "T-pose". The Task 4 mocap clips came
 * from Mixamo's raw FBX export, whose skeleton keeps Mixamo's own per-bone
 * axis convention: most bones' rest quaternion is not identity (LeftUpLeg
 * is close to a 180 degree turn, LeftShoulder is [0.484, 0.571, -0.526,
 * 0.403]). Played straight onto Xbot the skeleton curls up.
 *
 * The retarget must reproduce, on the target, the same WORLD rotation
 * *change* each source bone undergoes. For source bone b with rest local
 * `r_b`, animated local `q_b` and source rest world rotation of its PARENT
 * `W_p`, the bone's world rotation goes from `W_p * r_b` to `W_p * q_b`,
 * so the world-space delta is `W_p * (q_b * r_b^-1) * W_p^-1`. On a target
 * whose rest world rotations are all identity, that delta IS the local
 * quaternion to write:
 *
 *     q'_b = W_p * (q_b * r_b^-1) * W_p^-1
 *
 * `q_b * r_b^-1` is the delta taken in the PARENT's frame, not the bone's
 * own; conjugating by `W_p` carries it from the source parent's frame into
 * the world frame the target's identity rest shares. Writing the bone-local
 * form `r_b^-1 * q_b` instead is only equal where the source rest frames
 * are already world-aligned, which Mixamo's are not: big joints land close
 * enough to look plausible, wrists accumulate the whole chain's error, and
 * a two-handed grip is judged at the wrists.
 *
 * `r_b` and `W_p` both come from the clip file's own scene graph, which the
 * loader leaves in its rest pose; nothing here reads Xbot.
 */
function retargetRotationsToRestPose(clip: THREE.AnimationClip, restScene: THREE.Object3D): void {
  restScene.updateWorldMatrix(true, true);
  const restLocal = new Map<string, THREE.Quaternion>();
  const parentRestWorld = new Map<string, THREE.Quaternion>();
  restScene.traverse((o) => {
    restLocal.set(o.name, o.quaternion.clone());
    parentRestWorld.set(o.name, o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
  });
  for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
    const boneName = track.name.slice(0, track.name.lastIndexOf(".quaternion"));
    const rest = restLocal.get(boneName);
    const wp = parentRestWorld.get(boneName);
    if (!rest || !wp) continue;
    const restInv = rest.clone().invert();
    const wpInv = wp.clone().invert();
    const v = track.values;
    const q = new THREE.Quaternion();
    for (let i = 0; i < v.length; i += 4) {
      q.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
      q.multiply(restInv);
      q.premultiply(wp);
      q.multiply(wpInv);
      v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
    }
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
    retargetRotationsToRestPose(clip, gltf.scene);
    stripRootMotion(clip);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
    actions.set(name, action);
  }

  const swordGltf = await loader.loadAsync(`${baseUrl}models/Sword.glb`);

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

  // Both hand bones inherit Xbot's Armature scale (0.01) times
  // normalizeToHeight's fit factor, so anything parented straight onto
  // them is drawn about a hundredth of its stated size - a 1.4 m sword
  // arrives a centimeter long. Each attachment therefore hangs off a group
  // whose scale cancels that inherited factor, which is what lets
  // SWORD_SOCKET_POS, PALM_OFFSET and the marker radii all be plain
  // meters. The factor is read once in bind pose; no clip animates bone
  // scale, so it stays true for every pose.
  root.updateWorldMatrix(true, true);
  const metersOn = (bone: THREE.Object3D): THREE.Group => {
    const g = new THREE.Group();
    g.scale.setScalar(1 / bone.getWorldScale(new THREE.Vector3()).x);
    bone.add(g);
    return g;
  };

  // Sword prop + markers on the right hand.
  const swordGroup = new THREE.Group();
  swordGroup.position.copy(SWORD_SOCKET_POS);
  swordGroup.quaternion.copy(SWORD_SOCKET_QUAT);
  metersOn(rightHandBone).add(swordGroup);
  swordGltf.scene.scale.setScalar(BLADE_LENGTH_SCALE);
  swordGroup.add(swordGltf.scene);
  const tip = marker(0xff4444); tip.position.copy(TIP_LOCAL).multiplyScalar(BLADE_LENGTH_SCALE); swordGroup.add(tip);
  const gripA = marker(0x44ff66); gripA.position.copy(GRIP_A).multiplyScalar(BLADE_LENGTH_SCALE); swordGroup.add(gripA);
  const gripB = marker(0x4488ff); gripB.position.copy(GRIP_B).multiplyScalar(BLADE_LENGTH_SCALE); swordGroup.add(gripB);

  const leftPalm = marker(0xff44ff);
  leftPalm.position.copy(PALM_OFFSET);
  metersOn(leftHandBone).add(leftPalm);

  let current: { pick: PosePick } | null = null;

  return {
    root,
    applyPose(p: PosePick): void {
      // The hard-reset rule: every action paused, weights set explicitly
      // each call, times set explicitly, advanced with update(0) so frame
      // dt can never move a pose. Normally exactly one action carries
      // weight 1; during a settle wind-down the pick names a second pose
      // and the two weights sum to 1 - still a pure function of state.
      const blendWeight = p.blend?.weight ?? 0;
      for (const [name, action] of actions) {
        action.paused = true;
        const w = name === p.clip ? 1 - blendWeight : name === p.blend?.clip ? blendWeight : 0;
        action.setEffectiveWeight(w);
        if (name === p.clip) action.time = p.clipTime;
        else if (name === p.blend?.clip) action.time = p.blend.clipTime;
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

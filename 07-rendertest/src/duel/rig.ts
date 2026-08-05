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
//
// The blade runs along the hand's -y and the pommel along +y. That comes
// from the clips, not from anatomy: at the delivered cut the off-hand sits
// 19.3 cm from the right hand along hand-local (0.065, 0.971, -0.229),
// i.e. up the grip toward the pommel, and pointing the blade the other way
// down that same line drives the point forward (0.96 of a unit of world +x
// per unit of blade). The roll is 0 so the blade's flat faces the camera;
// rolled 90 degrees it disappears edge-on in this side-view stage.

/** Sword origin (its own y = 0) in the right palm group, meters. The y is
 *  the palm centre plus the seat: the right palm rides at sword y = 0.50,
 *  just under the crossguard, so y = -0.020 + 0.50 x BLADE_LENGTH_SCALE. */
export const SWORD_SOCKET_POS = new THREE.Vector3(-0.043, 0.140, -0.008);
export const SWORD_SOCKET_EULER = new THREE.Euler(Math.PI, 0, 0);
/** Uniform meters-per-sword-unit: 4.353 sword units x this is the whole
 *  weapon, pommel to tip, so 0.32 is a 1.39 m great sword against the
 *  1.75 m fighter - the top of the 1.0-1.4 m band, chosen there because
 *  reach is the scarce quantity (see the reach note below). */
export const BLADE_LENGTH_SCALE = 0.32;
/** Wrist-origin to palm-centre offset, meters, in the left palm group. */
export const PALM_OFFSET = new THREE.Vector3(0.043, -0.020, -0.008);
/** Grip segment ends and blade tip, sword units, BEFORE blade scaling.
 *  GRIP_A is the pommel end of the Red grip, GRIP_B the crossguard end;
 *  at 0.32 that is a 23.8 cm grip, two-handed. */
export const GRIP_A = new THREE.Vector3(0, -0.162, 0);
export const GRIP_B = new THREE.Vector3(0, 0.583, 0);
export const TIP_LOCAL = new THREE.Vector3(0, 3.859, 0);

// Measured with these values (paused, KeyJ then step 1000 / KeyK then step
// 700, forward reach = (tipWorldX - rootWorldX) x facing):
//   cut delivered    reach 1.57 m, left palm 9.1 cm off the grip
//   thrust delivered reach 1.40 m, left palm 27.6 cm off the grip
//   parry formed     left palm 38.5 cm off the grip
//   idle             left palm 44.3 cm off the grip
// The spec's 2.00 m (LONGSWORD.reachCm) is NOT reachable and no scale can
// make it so. At their most extended frame these clips carry the sword
// hand 0.50 m (cut) and 0.63 m (thrust) ahead of the root, and the blade
// leaves that hand only 0.97 (cut) / 0.69 (thrust) aligned with the line,
// so a tip 2.00 m out needs 1.99 m of weapon for the cut and 2.57 m for
// the thrust - a lance, and two different lances. Closing that gap is a
// question for reachCm or for the poses, not for a scale here.
//
// The off-hand distances above are likewise not a socket the calibration
// missed. In the source clips the two hands are 15.7 cm apart through the
// whole of great-sword-idle and 6.7 cm through great-sword-blocking, and
// the hand-local direction from the sword hand to the off-hand holds to
// within 15 degrees across that family - one hilt, two hands. On this rig
// the same measurements come out 57.4 cm, 38.2 cm and 70 degrees of
// spread, so the retarget, not the choreography, is what lets the
// off-hand go. upward-thrust is the exception that is real: its own
// skeleton holds the hands 50 cm apart at the thrust.

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
 * Re-expresses every rotation keyframe relative to Xbot's own rest pose.
 *
 * Xbot.glb's own bind pose has every bone's local quaternion at identity
 * (verified across the whole rig) - its native idle/walk clips store each
 * frame's ABSOLUTE local rotation directly, with "identity" meaning
 * "T-pose". The Task 4 mocap clips were converted straight from Mixamo's
 * raw FBX export, whose skeleton keeps Mixamo's own per-bone local axis
 * convention: many bones' bind pose is NOT identity (e.g. LeftUpLeg's own
 * rest quaternion is close to a 180-degree turn). Applying those clips'
 * absolute local quaternions directly onto Xbot's identity-rest bones
 * therefore lands each bone ~180 degrees from where it belongs - the
 * source of the collapsed/curled pose this function fixes.
 *
 * Since Xbot's target rest is identity everywhere, the correction reduces
 * to: for each keyframe quaternion As, replace it with restQuat^-1 * As -
 * "the clip's pose expressed relative to the clip's OWN rest", which is
 * exactly what Xbot's identity-rest convention expects as an absolute
 * local quaternion. restQuat comes from the same clip file's own scene
 * graph (its bind pose), not Xbot's.
 */
function retargetRotationsToRestPose(clip: THREE.AnimationClip, restScene: THREE.Object3D): void {
  const restQuats = new Map<string, THREE.Quaternion>();
  restScene.traverse((o) => restQuats.set(o.name, o.quaternion.clone()));
  for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
    const boneName = track.name.slice(0, track.name.lastIndexOf(".quaternion"));
    const rest = restQuats.get(boneName);
    if (!rest) continue;
    const restInv = rest.clone().invert();
    const v = track.values;
    const q = new THREE.Quaternion();
    for (let i = 0; i < v.length; i += 4) {
      q.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
      q.premultiply(restInv);
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
  swordGroup.setRotationFromEuler(SWORD_SOCKET_EULER);
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

import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/toon-head.json";
import { Rng } from "../rng";
import type { Person } from "../sim/types";

const toonHead = new Style(definition);
const CACHE_LIMIT = 256;
const frameCache = new Map<string, string>();

const HAIR = ["bun", "sideComed", "spiky", "undercut"] as const;
const REAR_HAIR = [null, "longStraight", "longWavy", "neckHigh", "shoulderHigh"] as const;
const BEARDS = [null, null, null, "chin", "chinMoustache", "fullBeard", "longBeard", "moustacheTwirl"] as const;
const CLOTHES = ["shirt", "openJacket", "turtleNeck"] as const;
const SKIN = ["5c3829", "f1c3a5", "a36b4f", "c68e7a", "b98e6a"] as const;
const HAIR_COLOURS = ["2c1b18", "d6b370", "724133", "a55728", "b58143"] as const;
const CLOTHES_COLOURS = ["151613", "0b3286", "545454", "147f3c", "f97316", "ec4899", "731ac3", "b11f1f", "e8e9e6", "eab308"] as const;
const BACKGROUNDS = ["3b4652", "2f4a3d", "232b4a"] as const;

type Hair = (typeof HAIR)[number];
type RearHair = Exclude<(typeof REAR_HAIR)[number], null>;
type Beard = Exclude<(typeof BEARDS)[number], null>;
type Clothes = (typeof CLOTHES)[number];

export interface FaceIdentity {
  seed: string;
  hair: Hair;
  rearHair: RearHair | null;
  beard: Beard | null;
  clothes: Clothes;
  skin: string;
  hairColor: string;
  clothesColor: string;
  backgroundColor: string;
}

export interface FaceExpression {
  eyes: "bow" | "happy" | "humble" | "wide" | "wink";
  eyebrows: "angry" | "happy" | "neutral" | "raised" | "sad";
  mouth: "agape" | "angry" | "laugh" | "sad" | "smile";
}

export const STATIC_FACE: FaceExpression = { eyes: "happy", eyebrows: "happy", mouth: "smile" };
export const FOCUSED_FACE: FaceExpression = { eyes: "wide", eyebrows: "angry", mouth: "smile" };

/** Stable appearance choices. Gameplay axes deliberately do not alter identity. */
export function faceIdentity(person: Person): FaceIdentity {
  const rng = new Rng(person.face);
  const hair = rng.pick(HAIR);
  const rearHair = rng.pick(REAR_HAIR);
  const clothes = rng.pick(CLOTHES);
  const skin = rng.pick(SKIN);
  const hairColor = rng.pick(HAIR_COLOURS);
  const clothesColor = rng.pick(CLOTHES_COLOURS);
  const backgroundColor = rng.pick(BACKGROUNDS);
  const beard = person.sex === "m" ? rng.pick(BEARDS) : null;
  return { seed: String(person.face), hair, rearHair, beard, clothes, skin, hairColor, clothesColor, backgroundColor };
}

function cached(key: string, create: () => string): string {
  const hit = frameCache.get(key);
  if (hit !== undefined) {
    frameCache.delete(key);
    frameCache.set(key, hit);
    return hit;
  }
  const value = create();
  frameCache.set(key, value);
  if (frameCache.size > CACHE_LIMIT) {
    const oldest = frameCache.keys().next().value;
    if (oldest !== undefined) frameCache.delete(oldest);
  }
  return value;
}

function renderFace(person: Person, px: number, expression: FaceExpression): string {
  const identity = faceIdentity(person);
  try {
    const avatar = new Avatar(toonHead, {
      seed: identity.seed,
      size: px,
      hairVariant: identity.hair,
      hairColor: identity.hairColor,
      rearHairVariant: identity.rearHair ?? "longStraight",
      rearHairProbability: identity.rearHair === null ? 0 : 100,
      beardVariant: identity.beard ?? "chin",
      beardProbability: identity.beard === null ? 0 : 100,
      clothesVariant: identity.clothes,
      clothesColor: identity.clothesColor,
      skinColor: identity.skin,
      backgroundColor: identity.backgroundColor,
      eyesVariant: expression.eyes,
      eyebrowsVariant: expression.eyebrows,
      mouthVariant: expression.mouth,
    }).toString();
    return avatar.replace("<svg ", '<svg class="face" aria-hidden="true" ');
  } catch {
    return fallbackFace(px, identity);
  }
}

function fallbackFace(px: number, identity: FaceIdentity): string {
  return `<svg class="face" viewBox="0 0 8 8" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true"><rect width="8" height="8" fill="#${identity.backgroundColor}"/><rect x="2" y="1" width="4" height="6" fill="#${identity.skin}"/><rect x="2" y="1" width="4" height="2" fill="#${identity.hairColor}"/><rect x="3" y="3" width="1" height="1" fill="#151613"/><rect x="5" y="3" width="1" height="1" fill="#151613"/><rect x="3" y="5" width="3" height="1" fill="#151613"/></svg>`;
}

/** Render one identity with an explicit expression. */
export function faceFrame(person: Person, px: number, expression: FaceExpression): string {
  const key = JSON.stringify([person.face, person.sex, px, expression]);
  return cached(key, () => renderFace(person, px, expression));
}

/** Static portrait used outside the live player header. */
export function faceSvg(person: Person, px: number): string {
  return faceFrame(person, px, STATIC_FACE);
}

export function clearFaceCache(): void {
  frameCache.clear();
}

export function faceCacheSize(): number {
  return frameCache.size;
}

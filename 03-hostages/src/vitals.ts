import type { GameState, Range, Zone } from "./types";

/** The fields worth reporting to the player when they change. Deliberately
 *  excludes pile sizes and hand contents: those are drawn, not narrated. */
export interface Vitals {
  playerWill: number;
  playerVigor: number;
  wifeVigor: number;
  convictWill: number;
  convictVigor: number;
  distracted: number;
  secretsLeft: number;
  bound: boolean;
  toppled: boolean;
  weaponDown: boolean;
  offBalance: boolean;
  incapacitated: boolean;
  zone: Zone;
  range: Range;
}

type NumericField =
  | "playerWill"
  | "playerVigor"
  | "wifeVigor"
  | "convictWill"
  | "convictVigor"
  | "distracted"
  | "secretsLeft";

type BooleanField = "bound" | "toppled" | "weaponDown" | "offBalance" | "incapacitated";

export type VitalsChange =
  | { field: NumericField; from: number; to: number }
  | { field: BooleanField; from: boolean; to: boolean }
  | { field: "zone"; from: Zone; to: Zone }
  | { field: "range"; from: Range; to: Range };

export function snapshot(state: GameState): Vitals {
  return {
    playerWill: state.player.willpower,
    playerVigor: state.player.vigor,
    wifeVigor: state.wife.vigor,
    convictWill: state.convict.willpower,
    convictVigor: state.convict.vigor,
    distracted: state.convict.distracted,
    secretsLeft: state.secretsRemaining.length,
    bound: state.player.bound,
    toppled: state.player.toppled,
    weaponDown: state.convict.weaponDown,
    offBalance: state.convict.offBalance,
    incapacitated: state.convict.incapacitated,
    zone: state.scene.zone,
    range: state.scene.range,
  };
}

/** Reading order for the modal: your body, her body, his body, his conditions,
 *  your conditions, the room. Fixed here so output never depends on key order. */
const ORDER: Array<VitalsChange["field"]> = [
  "playerWill",
  "playerVigor",
  "wifeVigor",
  "convictWill",
  "convictVigor",
  "secretsLeft",
  "bound",
  "toppled",
  "incapacitated",
  "weaponDown",
  "offBalance",
  "distracted",
  "zone",
  "range",
];

export function diff(before: Vitals, after: Vitals): VitalsChange[] {
  const changes: VitalsChange[] = [];
  for (const field of ORDER) {
    if (before[field] === after[field]) continue;
    changes.push({ field, from: before[field], to: after[field] } as VitalsChange);
  }
  return changes;
}

function numericLine(field: NumericField, from: number, to: number): string {
  switch (field) {
    case "playerWill":
      return `Your willpower ${from} -> ${to}`;
    case "playerVigor":
      return `Your vigor ${from} -> ${to}`;
    case "wifeVigor":
      return `Her vigor ${from} -> ${to}`;
    case "convictWill":
      return `His willpower ${from} -> ${to}`;
    case "convictVigor":
      return `His vigor ${from} -> ${to}`;
    case "secretsLeft":
      return `Secrets left ${from} -> ${to}`;
    case "distracted":
      return to === 0 ? "He shakes it off" : `He is distracted (${to})`;
  }
}

function booleanLine(field: BooleanField, to: boolean): string {
  switch (field) {
    case "bound":
      return to ? "You are bound" : "Your hands are free";
    case "toppled":
      return to ? "You are on the floor" : "You are upright";
    case "weaponDown":
      return to ? "His knife is on the floor" : "He is armed again";
    case "offBalance":
      return to ? "He is off-balance" : "He is steady";
    case "incapacitated":
      return to ? "He is down" : "He is back on his feet";
  }
}

export function lines(changes: VitalsChange[]): string[] {
  return changes.map((c) => {
    switch (c.field) {
      case "zone":
        return c.to === "bedroom" ? "You are in the bedroom" : "You are in the living room";
      case "range":
        return c.to === "near" ? "He is close" : "He moves away";
      case "bound":
      case "toppled":
      case "weaponDown":
      case "offBalance":
      case "incapacitated":
        return booleanLine(c.field, c.to);
      default:
        return numericLine(c.field, c.from, c.to);
    }
  });
}

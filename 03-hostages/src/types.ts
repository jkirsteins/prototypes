export type Side = "player" | "convict";
export type Target = "player" | "convict" | "wife";
export type Range = "near" | "away";
export type Zone = "livingRoom" | "bedroom";

export type CardKind = "offensive" | "defensive";
export type CardTag = "deception" | "threatensWife" | "secret" | "fixture" | "physical";

export interface PlayerState {
  willpower: number;
  vigor: number;
  bound: boolean;
  toppled: boolean;
}

export interface WifeState {
  vigor: number;
  bond: number;
}

export interface ConvictState {
  willpower: number;
  vigor: number;
  distracted: number;
  offBalance: boolean;
  weaponDown: boolean;
  incapacitated: boolean;
}

export interface Scene {
  zone: Zone;
  range: Range;
}

export type Effect =
  | { kind: "damage"; target: Target; amount: number; offBalanceBonus?: number }
  | { kind: "willpower"; target: "player" | "convict"; amount: number }
  | { kind: "restoreWillpowerTo"; target: "player"; value: number }
  | { kind: "setBound"; value: boolean }
  | { kind: "setToppled"; value: boolean }
  | { kind: "setDistracted"; turns: number }
  | { kind: "setOffBalance"; value: boolean }
  | { kind: "setWeaponDown"; value: boolean }
  | { kind: "setRange"; value: Range }
  | { kind: "setZone"; value: Zone }
  | { kind: "bindOrHurt"; amount: number }
  | { kind: "reviveConvict"; vigor: number }
  | { kind: "negateLead" }
  | { kind: "halveIncomingDamage" }
  | { kind: "interposeForWife"; selfDamage: number }
  | { kind: "stripCoercion" }
  | { kind: "loseRun" };

export interface CardRequirement {
  bound?: boolean;
  toppled?: boolean;
  range?: Range;
  zone?: Zone;
  convictDistracted?: boolean;
  convictOffBalance?: boolean;
  convictWeaponDown?: boolean;
  convictIncapacitated?: boolean;
  convictDistractedOrOffBalance?: boolean;
  coercionDefused?: boolean;
  answersCardId?: string;
  answersTag?: CardTag;
  answersCoercion?: boolean;
  answersDamageToOwner?: boolean;
  answersDamageToConvictAtLeast?: number;
}

export interface CardDef {
  id: string;
  name: string;
  side: Side;
  kind: CardKind;
  tags: CardTag[];
  requires: CardRequirement;
  effects: Effect[];
  coercion?: true;
  rules: string;
  flavor: string;
  narration: string;
}

export type Phase =
  | "title"
  | "openingEvent"
  | "playerLead"
  | "playerAnswer"
  | "forcedSurrender"
  | "discardDown"
  | "gameOver";

export type Outcome = "victory" | "lossSecrets" | "lossVigor" | "lossWife";

export type LogKind =
  | "scene"
  | "lead"
  | "answer"
  | "decline"
  | "effect"
  | "coercion"
  | "surrender"
  | "recover"
  | "haulUp"
  | "pass"
  | "discard"
  | "outcome";

export interface LogEntry {
  turn: number;
  side: Side | "system";
  kind: LogKind;
  cardId?: string;
  text: string;
  deltas: string[];
}

export interface Pile {
  deck: string[];
  discard: string[];
  hand: string[];
}

export interface PendingLead {
  cardId: string;
  by: Side;
  coercion: boolean;
}

export interface RunStats {
  wifeLowestVigor: number;
  secretsGiven: Array<{ cardId: string; coerced: boolean }>;
  largestWillpowerSwing: { amount: number; cause: string } | null;
  notYetForced: boolean;
  turningPoint: string | null;
}

export interface RngState {
  seed: number;
}

export interface GameState {
  phase: Phase;
  turn: number;
  player: PlayerState;
  wife: WifeState;
  convict: ConvictState;
  scene: Scene;
  playerPile: Pile;
  convictPile: Pile;
  secretsRemaining: string[];
  notYetSpent: boolean;
  coercionDefused: boolean;
  pendingLead: PendingLead | null;
  log: LogEntry[];
  outcome: Outcome | null;
  stats: RunStats;
  rng: RngState;
}

export const HAND_CAP = 5;
export const STARTING_HAND = 3;
export const SECRET_WILLPOWER_RESTORE = 3;
export const INCAPACITATED_RECOVERY = 2;
export const INCAPACITATED_CLEAR_AT = 4;

import type { GameEvent, GameEventType } from "./game";

/** What each event type is worth to the human who caused it.
 *
 *  This Record is exhaustive on purpose: adding a GameEventType without
 *  deciding its XP will not compile. That is the same enforcement NOTICE_RULES
 *  uses for notices, and it exists for the same reason - prose asking people to
 *  remember did not work.
 *
 *  Zero means "not a choice the player made": a draw, a reshuffle, a forced
 *  discard or tribute payment, a garrison tick that every large realm gets
 *  every turn regardless. Endings other than victory pay nothing because the
 *  run is over and the postmortem is the reward. */
export const XP_TABLE: Record<GameEventType, number> = {
  play: 1,
  subjugated: 4,
  incorporated: 4,
  reclaimed: 4, // Revolt: breaking free is as big as taking someone
  settled: 3,
  seeded: 2,
  released: 1, // your own Subjugate freeing the target's vassals
  "subjugate-failed": 1, // the card was spent and the turn is gone
  "incorporate-failed": 1,
  "hostage-taken": 2, // locking an escape is a positional play, like seeding one
  "seat-moved": 3, // a positional build, like settling: a bar raised and a raid edge
  // The clock noticing the seat is gone, not a choice - and never a reward.
  "seat-lost": 0,
  // Fires off the vassal's FORCED tribute - when the human is that vassal it
  // was not a choice, and when the human is the lord it is not their event.
  "hostage-returned": 0,
  victory: 15,
  draw: 0,
  reshuffle: 0,
  discard: 0,
  tribute: 0,
  garrisoned: 0,
  // A clock running out, not a choice: the pact was already paid for by the
  // Alliance that sealed it, which scored as a `play`.
  "pact-lapsed": 0,
  defeat: 0,
  unified: 0,
  surrendered: 0,
  stranded: 0,
};

/** Base value plus how far the event moved the Might counter. A four-point
 *  Raid is worth more than a one-point one, so reaching for a good play beats
 *  spamming a cheap one.
 *
 *  This scaling is a second, unenforced decision sitting next to the
 *  `XP_TABLE` base value: the exhaustive `Record<GameEventType, number>`
 *  forces someone to pick a base for every new event type, but nothing forces
 *  a matching decision about whether `amount` is safe to scale by, or which
 *  direction counts as "more". A play that records `amount` gets scaled
 *  silently; a non-play event's `amount` is silently ignored.
 *  `assassinate-ruler` below is the first event that actually collided with
 *  that gap. */
export function xpForEvent(e: GameEvent): number {
  const base = XP_TABLE[e.type];
  if (base === 0) return 0;
  // assassinate-ruler is a special case of the scaling above, not the base
  // value: src/game.ts writes `amount: preMightLead`, the actor's visible
  // Might lead captured BEFORE assassinate() levels it away.
  // That amount is a deficit being erased, not a gain being made - the
  // bigger-is-better scaling every other tracked event uses would pay most
  // for assassinating from a lead (throwing the lead away) and least for
  // assassinating from behind (the card's actual purpose). Score the
  // deficit it erased instead.
  if (e.type === "play" && e.cardId === "assassinate-ruler") {
    return base + Math.max(0, -(e.amount ?? 0));
  }
  // Only plays scale: the surviving amount-carrying non-play events either
  // have base 0 (tribute, garrisoned, pact-lapsed - the gate above already
  // dropped them) or deliberately pay base alone (reclaimed - the escape is
  // the reward, not the parting blow's size). This reproduces the old
  // track-gated payouts exactly; tests/xp.test.ts pins it.
  const scaled = e.type === "play" ? Math.max(0, e.amount ?? 0) : 0;
  return base + scaled;
}

/** Total XP a run earned the human.
 *
 *  Derived from the log rather than accumulated into a counter, because the log
 *  is already the complete append-only history of the run and a derivation
 *  cannot be forgotten at a new call site. See the 2026-07-31 design doc. */
export function runXp(log: GameEvent[]): number {
  return log.reduce((sum, e) => sum + (e.playerId === 1 ? xpForEvent(e) : 0), 0);
}

/** Turnips the human grew this run - the hidden milestone counter's input. */
export function runTurnips(log: GameEvent[]): number {
  return log.filter(
    (e) => e.type === "play" && e.playerId === 1 && e.cardId === "grow-crops",
  ).length;
}

/** The early-progression window: the first EARLY_PACKS completed games each
 *  pay a pack (the pity floor in src/meta.ts), and the first EARLY_PACKS
 *  packs opened each guarantee a new card (src/packs.ts). */
export const EARLY_PACKS = 5;
export const XP_EARLY_STEP = 20;
export const XP_LATE_STEP = 25;

/** Two-piece curve: a flat 20 per level through level EARLY_PACKS, so XP
 *  keeps pace with the first-five-games pity floor and there is no cliff
 *  when it ends, then triangular growth (increments 50, 75, 100, ...) so
 *  packs thin out as the collection fills. Thresholds: 20, 40, 60, 80, 100,
 *  150, 225, 325, 450, 600, ... */
export function xpThresholdForLevel(level: number): number {
  if (level <= EARLY_PACKS) return XP_EARLY_STEP * level;
  const n = level - EARLY_PACKS;
  return XP_EARLY_STEP * EARLY_PACKS + (XP_LATE_STEP * n * (n + 3)) / 2;
}

/** Highest level fully paid for by `xp`. Walks the curve rather than solving
 *  the quadratic: exact at every boundary, and the loop is a few dozen steps
 *  for any total `xp` can actually reach through play. `src/meta.ts`'s
 *  `isCount` is what keeps "actually reach" true - it caps a loaded counter
 *  at 1e9, so a corrupted or hand-edited record cannot hand this a total
 *  large enough to spin for a very long time. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < XP_EARLY_STEP) return 0;
  let level = 0;
  while (xpThresholdForLevel(level + 1) <= xp) level++;
  return level;
}

/** The turnip-farming easter egg. Deliberately undocumented in the UI: no
 *  progress counter anywhere, or it stops being a secret. */
export const TURNIP_MILESTONES_BASE: number[] = [10, 100, 1000, 5000, 10000];

/** The 0-indexed nth milestone. Past the explicit list it doubles forever, so
 *  the joke keeps paying out but never becomes a grind worth farming. */
export function turnipMilestone(index: number): number {
  const base = TURNIP_MILESTONES_BASE[index];
  if (base !== undefined) return base;
  const last = TURNIP_MILESTONES_BASE[TURNIP_MILESTONES_BASE.length - 1];
  return last * 2 ** (index - TURNIP_MILESTONES_BASE.length + 1);
}

/** Bonus packs earned from lifetime turnips: one per milestone crossed. */
export function turnipPacksEarned(turnipsGrown: number): number {
  if (!Number.isFinite(turnipsGrown) || turnipsGrown < TURNIP_MILESTONES_BASE[0]) {
    return 0;
  }
  let count = 0;
  while (turnipMilestone(count) <= turnipsGrown) count++;
  return count;
}

/** Where a lifetime XP total sits inside its level's band. `into + toNext`
 *  always equals `span`, so a progress bar and the "how much is left" line
 *  can never disagree. */
export interface LevelWindow {
  /** Levels fully paid for - the same number `levelForXp` returns. */
  level: number;
  /** XP earned past this level's threshold. */
  into: number;
  /** XP this whole band is worth, threshold to threshold. */
  span: number;
  /** XP still owed before the next level, and so the next pack. */
  toNext: number;
}

/** The band `xp` currently sits in. Exists because "+17 XP earned" told a
 *  first-time player nothing: it neither leveled them up nor said how close
 *  17 had come. See the postmortem bar in src/hud.ts. */
export function levelWindow(xp: number): LevelWindow {
  const level = levelForXp(xp);
  const base = level === 0 ? 0 : xpThresholdForLevel(level);
  const span = xpThresholdForLevel(level + 1) - base;
  const into = Math.max(0, Math.min(span, xp - base));
  return { level, into, span, toNext: span - into };
}

/** Victory milestones: standing goals every faction is racing for at once,
 *  each worth points to whoever reaches it.
 *
 *  A table, like `PASSIVES` and `CARDS`, and for the same reason: a milestone
 *  is a row plus the one question it asks of the state, and the drawer renders
 *  whatever the table holds. Nothing here decides who wins - the milestones
 *  are a second scoreboard beside the land count, and what points buy is a
 *  later decision.
 *
 *  Progress is read off the state, never accumulated into a store. Some of
 *  these questions are about the board now ("how many lands do you hold") and
 *  some are about the whole run ("how many DIFFERENT lands have you ever
 *  taken"), and the log already carries the run. A store would be a third copy
 *  of facts the log and the board already hold, and the first one to drift. */

import { fullRealmOf } from "./relations";
import { armyCapFor } from "./defense";
import type { GameEvent, GameState } from "./game";

export interface Milestone {
  id: string;
  name: string;
  /** What it asks, in one line - shown under the name in the drawer. */
  text: string;
  /** Victory points to every faction that reaches it. */
  points: number;
  /** What counts as done. */
  goal: number;
  /** How far this faction has come. May exceed `goal`; readers clamp. */
  progress(state: GameState, factionId: string): number;
}

/** The faction that played an event, or undefined for one nobody played. */
function actorOf(state: GameState, e: GameEvent): string | undefined {
  return state.players.find((p) => p.id === e.playerId)?.factionId;
}

/** Distinct `targetFactionId`s across the events this faction caused that
 *  match `type` (and, when given, `cardId`). The shape every "how many
 *  different lands have you ever..." milestone needs. */
function distinctTargets(
  state: GameState,
  factionId: string,
  type: GameEvent["type"],
  cardId?: string,
): number {
  const seen = new Set<string>();
  for (const e of state.log) {
    if (e.type !== type) continue;
    if (cardId !== undefined && e.cardId !== cardId) continue;
    if (e.targetFactionId === undefined) continue;
    if (actorOf(state, e) !== factionId) continue;
    seen.add(e.targetFactionId);
  }
  return seen.size;
}

/** How many times this faction played `cardId`. */
function playsOf(state: GameState, factionId: string, cardId: string): number {
  return state.log.filter(
    (e) =>
      e.type === "play" && e.cardId === cardId && actorOf(state, e) === factionId,
  ).length;
}

export const MILESTONES: readonly Milestone[] = [
  {
    id: "overlord",
    name: "Overlord",
    text: "Subjugate 5 different lands.",
    points: 3,
    goal: 5,
    // DIFFERENT lands, so taking one land back twice is not two thirds of a
    // milestone - the goal is a realm that grew, not a border that moved.
    progress: (state, f) => distinctTargets(state, f, "subjugated"),
  },
  {
    id: "host",
    name: "The great host",
    text: "Muster 8 armies across your realm.",
    points: 2,
    goal: 8,
    // Armies come off the ceilings now, so this asks for a realm big enough to
    // field a host rather than for a card that no longer exists.
    progress: (state, f) =>
      [...fullRealmOf(f, state.overlords, state.incorporated)].reduce(
        (sum, land) => sum + armyCapFor(state.defenseMax[land] ?? 0),
        0,
      ),
  },
  {
    id: "wide-realm",
    name: "A wide realm",
    text: "Hold 5 lands at once.",
    points: 3,
    goal: 5,
    // The only one that can go DOWN. That is the point: a realm is held, not
    // banked, and the badge below says who has managed it at some point.
    progress: (state, f) =>
      fullRealmOf(f, state.overlords, state.incorporated).size,
  },
  {
    id: "settled",
    name: "Founders",
    text: "Found 3 settlements.",
    points: 2,
    goal: 3,
    progress: (state, f) => state.log.filter(
      (e) => e.type === "settled" && actorOf(state, e) === f,
    ).length,
  },
  {
    id: "grown",
    name: "Fruitful lands",
    text: "Grow your lands 3 times.",
    points: 2,
    goal: 3,
    progress: (state, f) => playsOf(state, f, "prosperous-proliferation"),
  },
  {
    id: "pestilent",
    name: "The black season",
    text: "Cash a plague on 5 different lands.",
    points: 2,
    goal: 5,
    progress: (state, f) => distinctTargets(state, f, "plagued"),
  },
];

export interface MilestoneStanding {
  milestone: Milestone;
  /** Progress for the faction the drawer is focused on, clamped to the goal. */
  progress: number;
  done: boolean;
  /** Every faction that has reached it, in seat order. */
  achievedBy: string[];
}

/** One row per milestone, for `focusFactionId` and with the badges. `acting`
 *  is the seat order the badges follow - a land that takes no turns races for
 *  nothing. */
export function milestoneStandings(
  state: GameState,
  acting: readonly string[],
  focusFactionId: string | undefined,
): MilestoneStanding[] {
  return MILESTONES.map((milestone) => {
    const raw =
      focusFactionId === undefined ? 0 : milestone.progress(state, focusFactionId);
    return {
      milestone,
      progress: Math.min(milestone.goal, raw),
      done: raw >= milestone.goal,
      achievedBy: acting.filter(
        (f) => milestone.progress(state, f) >= milestone.goal,
      ),
    };
  });
}

/** Points a faction has banked across every milestone it has reached. */
export function milestonePoints(state: GameState, factionId: string): number {
  return MILESTONES.reduce(
    (sum, m) => sum + (m.progress(state, factionId) >= m.goal ? m.points : 0),
    0,
  );
}

import type { GameEvent } from "./game";

/** One score a batch's event moved, immediately before and after it: a
 *  polygon's defense, or one owner's disease stacks on a polygon. The modal
 *  and the log both render these, from the same walk, so they cannot quote
 *  different numbers for the same event. */
export interface StandingChange {
  /** The polygon whose score moved - a land's own faction id. */
  polygon: string;
  track: "defense" | "disease";
  /** disease only: whose stacks. Defense belongs to the polygon alone. */
  owner?: string;
  before: number;
  after: number;
}

export interface WalkCtx {
  factionOf(playerId: number): string | undefined;
  /** The polygon's defense NOW, i.e. after every event handed to
   *  `walkStandings` has already applied. The walk runs backwards from here -
   *  it is the only truth available, since summaries are built after the
   *  fact. */
  defense(polygon: string): number;
  /** `owner`'s disease stacks on `polygon` NOW - same convention. */
  diseaseOf(polygon: string, owner: string): number;
}

type ScoreMove =
  | { track: "defense"; polygon: string; delta: number }
  | { track: "disease"; polygon: string; owner: string; delta: number };

/** Every way one event moved a score, read off the event's `amount` - the
 *  rule in AGENTS.md: a site that moves a score records how far, or the
 *  before -> after suffixes drift silently. `tests/standings.test.ts`
 *  replays seeded games and checks the walk against the real stores.
 *
 *  Plagued moves BOTH tracks: the defense damage (`amount`) and, via
 *  `stacksSpent`, the actor's own disease clearing on that same polygon -
 *  `clearDiseaseOf` empties it silently, and without this second move an
 *  earlier `disease-spread` in the same batch would walk back through a
 *  store the clear had already zeroed, landing on a negative "before".
 *
 *  Winds-shifted is the same shape from the other side: the actor's gain
 *  (`amount`) plus, via `losses`, every OTHER owner's stack on that polygon
 *  going to 0 - `transferAllDiseaseTo` empties them all silently, and any
 *  of them who spread a stack earlier in the same batch needs a move here
 *  or the walk hits the identical negative-"before" bug. */
export function scoreMovesOf(e: GameEvent, ctx: WalkCtx): ScoreMove[] {
  const A = ctx.factionOf(e.playerId);
  const polygon = e.targetFactionId;
  if (polygon === undefined) return [];
  switch (e.type) {
    // Every attack lands as a march now, a turn after the card that sent it,
    // so this is the one defense-loss event left. `amount` is the defense
    // actually moved on the polygon it names - which on a won counter is the
    // ATTACKER's own land.
    case "march-resolved":
      return e.amount === undefined || e.amount === 0
        ? []
        : [{ track: "defense", polygon, delta: -e.amount }];
    // The other defense loss, and the only one an actor does to its own land:
    // what a raid tore out of the land it set out from. `targetFactionId` is
    // that source - the levy names the land that PAID, not the land the arrow
    // is aimed at, which is `march-declared`'s business one line below.
    case "levied":
      return e.amount === undefined || e.amount === 0
        ? []
        : [{ track: "defense", polygon, delta: -e.amount }];
    case "plagued": {
      const moves: ScoreMove[] = [];
      if (e.amount !== undefined && e.amount !== 0) {
        moves.push({ track: "defense", polygon, delta: -e.amount });
      }
      if (A !== undefined && e.stacksSpent !== undefined && e.stacksSpent !== 0) {
        moves.push({ track: "disease", polygon, owner: A, delta: -e.stacksSpent });
      }
      return moves;
    }
    case "healed":
      return e.amount === undefined
        ? []
        : [{ track: "defense", polygon, delta: e.amount }];
    // A duel's spoils, on the two rewards of the three that move defense: the
    // fortifying one, and the growth that lifts the ceiling and the score
    // together. The wealth reward carries `wealth` instead and moves nothing
    // here - a treasury is not a score this walks.
    case "duel-won":
      return e.amount === undefined || e.amount === 0
        ? []
        : [{ track: "defense", polygon, delta: e.amount }];
    // Both ends off one event: the land that gained is `targetFactionId` and
    // the land that gave is `sourceFactionId`. Walking only the gain would
    // leave the giving land's badge and the log disagreeing by the amount.
    case "transferred": {
      if (e.amount === undefined || e.amount === 0) return [];
      const moves: ScoreMove[] = [
        { track: "defense", polygon, delta: e.amount },
      ];
      if (e.sourceFactionId !== undefined) {
        moves.push({
          track: "defense", polygon: e.sourceFactionId, delta: -e.amount,
        });
      }
      return moves;
    }
    case "disease-spread": {
      if (A === undefined || e.amount === undefined) return [];
      return [{ track: "disease", polygon, owner: A, delta: e.amount }];
    }
    case "winds-shifted": {
      const moves: ScoreMove[] = [];
      if (A !== undefined && e.amount !== undefined) {
        moves.push({ track: "disease", polygon, owner: A, delta: e.amount });
      }
      for (const [loser, lost] of Object.entries(e.losses ?? {})) {
        if (lost === 0) continue;
        moves.push({ track: "disease", polygon, owner: loser, delta: -lost });
      }
      return moves;
    }
    default:
      return [];
  }
}

/** Per-event before -> after, index-parallel to `events`. Runs BACKWARDS from
 *  the post-batch scores (`ctx.defense` / `ctx.diseaseOf`), because that is
 *  the only truth available: a round summary is built after every event in it
 *  has already applied.
 *
 *  Walks ALL of `events`, not just the notice-worthy subset a summary line
 *  renders: a rival's heal is never shown, but it moves a score the next
 *  shown line's before must account for. */
export function walkStandings(
  events: GameEvent[],
  ctx: WalkCtx,
): StandingChange[][] {
  const keyOf = (m: ScoreMove): string =>
    m.track === "defense"
      ? `defense|${m.polygon}`
      : `disease|${m.polygon}|${m.owner}`;

  const movesPerEvent = events.map((e) => scoreMovesOf(e, ctx));

  const current: Record<string, number> = {};
  for (const moves of movesPerEvent) {
    for (const m of moves) {
      const key = keyOf(m);
      if (!(key in current)) {
        current[key] =
          m.track === "defense"
            ? ctx.defense(m.polygon)
            : ctx.diseaseOf(m.polygon, m.owner);
      }
    }
  }

  const out: StandingChange[][] = new Array(events.length);
  for (let i = events.length - 1; i >= 0; i--) {
    const lines: StandingChange[] = [];
    for (const m of movesPerEvent[i]) {
      const key = keyOf(m);
      const after = current[key];
      const before = after - m.delta;
      lines.push({
        polygon: m.polygon,
        track: m.track,
        ...(m.track === "disease" ? { owner: m.owner } : {}),
        before,
        after,
      });
      current[key] = before;
    }
    out[i] = lines;
  }
  return out;
}

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
 *  Foul winds is one event per polygon carrying the stacks the actor GAINED
 *  there; the losers' counts are not walked - the log line is about the
 *  claim, and every loser's count is 0 after by construction. */
export function scoreMovesOf(e: GameEvent, ctx: WalkCtx): ScoreMove[] {
  const A = ctx.factionOf(e.playerId);
  const polygon = e.targetFactionId;
  if (e.amount === undefined || polygon === undefined) return [];
  switch (e.type) {
    case "damaged":
    case "plagued":
      return e.amount === 0
        ? []
        : [{ track: "defense", polygon, delta: -e.amount }];
    case "healed":
      return [{ track: "defense", polygon, delta: e.amount }];
    case "disease-spread":
    case "winds-shifted":
      if (A === undefined) return [];
      return [{ track: "disease", polygon, owner: A, delta: e.amount }];
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

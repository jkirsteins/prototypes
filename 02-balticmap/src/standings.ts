import { FAN_OUT_CARDS } from "./cards";
import type { GameEvent } from "./game";

/** The human's Might lead over `factionId`, immediately before and after one
 *  event. Always the human's SIGNED lead: positive = you lead. Same
 *  convention as the map badges, the scoreboard and `formatLead`. */
export interface StandingChange {
  factionId: string;
  before: number;
  after: number;
}

/** How one event moved the human's lead over one faction. `set` is
 *  Assassinate ruler, the one card that levels instead of adding. */
type LeadMove =
  | { kind: "add"; factionId: string; delta: number }
  | { kind: "set"; factionId: string; from: number };

export interface WalkCtx {
  humanFactionId: string;
  factionOf(playerId: number): string | undefined;
  /** The human's lead over this faction NOW, i.e. after every event handed to
   *  `walkStandings` has already applied. The walk runs backwards from here -
   *  it is the only truth available, since notices are built after the fact. */
  leads(factionId: string): number;
}

/** A pact's Might bonus arriving (`sign` 1, the Alliance that sealed it) or
 *  leaving (`sign` -1, the lapse), in the human's view.
 *
 *  The only fan-out this walk can resolve in BOTH directions, and the reason is
 *  `pactAgainst`: the event says exactly who was affected, so the human's own
 *  half needs no guess about who was alive at the time. Fortify's cannot, and
 *  its doc comment above explains what that costs.
 *
 *  Both allies gain against every faction in the list, so:
 *  - the human in the list loses `amount` against EACH ally;
 *  - the human as an ally gains `amount` against each faction in the list.
 *  The human can never be both - `sharedNeighboursOf` excludes both realms. */
function pactMoves(
  e: GameEvent,
  allyA: string | undefined,
  allyB: string | undefined,
  humanFactionId: string,
  sign: 1 | -1 = 1,
): LeadMove[] {
  const against = e.pactAgainst;
  if (e.amount === undefined || against === undefined) return [];
  if (allyA === undefined || allyB === undefined) return [];
  const delta = sign * e.amount;
  if (against.includes(humanFactionId)) {
    return [allyA, allyB].map((ally) => (
      { kind: "add", factionId: ally, delta: -delta }
    ));
  }
  if (allyA === humanFactionId || allyB === humanFactionId) {
    return against.map((f) => ({ kind: "add", factionId: f, delta }));
  }
  return [];
}

/** Every way the human's lead over somebody moves, translated into the human's
 *  view. That is the bump sites in game.ts (raid, the fan-out, assassinate,
 *  the subjugate/revolt poach penalty, tribute and the passive garrison) PLUS
 *  the one term that is not a bump at all: the Might a live pact adds through
 *  `leadsIn`, which arrives with the Alliance and leaves with the
 *  `pact-lapsed`. See the doc comment on `GameEvent.amount` and the rule in
 *  AGENTS.md. `tests/standings.test.ts` replays real seeded games and checks
 *  this against the actual leads, so a site that forgets to record its amount
 *  fails there rather than drifting silently in the round summary.
 *
 *  A fan-out card's "every other living faction" cannot be reconstructed from
 *  one event alone (which faction was already incorporated, at that instant, is
 *  state this function is not given) - so a THIRD PARTY's Fortify or A feast
 *  still resolves correctly (it is exactly one pair: the actor against the
 *  human), but a HUMAN-authored one returns no move here. That is not a gap in
 *  production use: the human's own play is never part of the same batch as the
 *  AI round this walk is built for (see `notices.ts`), so this branch never
 *  actually needs to fire outside a synthetic test. The human's own trailing
 *  `garrisoned` has the identical fan-out problem and DOES need to fire in
 *  production - `walkStandings` handles that one directly, rather than here,
 *  because the fix needs the whole batch's faction list, which a single event
 *  does not carry.
 *
 *  The pact fan-out has neither problem, because `pactAgainst` carries the
 *  affected list on the event itself. That is what `pactMoves` above exploits,
 *  and it is why a pact was worth freezing at seal time. */
export function leadMovesOf(e: GameEvent, ctx: WalkCtx): LeadMove[] {
  const H = ctx.humanFactionId;
  const A = ctx.factionOf(e.playerId);
  if (A === undefined) return [];

  switch (e.type) {
    case "play": {
      if (e.cardId === "raid") {
        if (e.amount === undefined) return [];
        const T = e.targetFactionId;
        if (T === undefined) return [];
        if (A === H) return [{ kind: "add", factionId: T, delta: e.amount }];
        if (T === H) return [{ kind: "add", factionId: A, delta: -e.amount }];
        return [];
      }
      if (FAN_OUT_CARDS.has(e.cardId ?? "")) {
        if (e.amount === undefined || A === H) return [];
        // The fan-out skipped the actor's direct overlord (frozen on the
        // event, since the walk runs after the batch): a human lord's lead
        // over its fortifying vassal did not move.
        if (e.overlordFactionId === H) return [];
        return [{ kind: "add", factionId: A, delta: -e.amount }];
      }
      if (e.cardId === "alliance") return pactMoves(e, A, e.targetFactionId, H);
      if (e.cardId === "assassinate-ruler") {
        if (e.amount === undefined || e.prevented) return [];
        const T = e.targetFactionId;
        if (T === undefined) return [];
        if (A === H) return [{ kind: "set", factionId: T, from: e.amount }];
        if (T === H) return [{ kind: "set", factionId: A, from: -e.amount }];
        return [];
      }
      return [];
    }
    // The lord's incorporated lands gain alongside it, but leads against dead
    // factions are never displayed, so the walk ignores them. A tribute paid
    // fully in wealth carries no `track`/`amount` - the coins moved no
    // counter - and the guard below drops it, which is exactly right.
    case "tribute": {
      if (e.amount === undefined) return [];
      const payer = e.targetFactionId;
      const lord = e.overlordFactionId;
      if (payer === undefined || lord === undefined) return [];
      if (payer === H) return [{ kind: "add", factionId: lord, delta: -e.amount }];
      if (lord === H) return [{ kind: "add", factionId: payer, delta: e.amount }];
      return [];
    }
    case "subjugated": {
      const T = e.targetFactionId;
      const L = e.overlordFactionId; // the new lord
      const F = e.formerOverlordFactionId;
      if (T === undefined) return [];
      const moves: LeadMove[] = [];
      // The reset: the vassal's counter against its new lord was cleared, and
      // `amount` is the cleared value - a pure store move, so the raw delta is
      // exactly the lead delta (pact terms are untouched by the reset).
      if (e.amount !== undefined && L !== undefined) {
        if (T === H) moves.push({ kind: "add", factionId: L, delta: -e.amount });
        if (L === H) moves.push({ kind: "add", factionId: T, delta: e.amount });
      }
      // The poach penalty stays a constant +1 Might (game.ts), not carried on
      // the event - see the comment above `GameEvent.amount`.
      if (F !== undefined) {
        if (T === H) moves.push({ kind: "add", factionId: F, delta: 1 });
        if (F === H) moves.push({ kind: "add", factionId: T, delta: -1 });
      }
      return moves;
    }
    case "reclaimed": {
      if (e.amount === undefined) return [];
      const T = e.targetFactionId; // the rebel
      const L = e.overlordFactionId; // the ex-lord
      if (T === undefined || L === undefined) return [];
      if (T === H) return [{ kind: "add", factionId: L, delta: e.amount }];
      if (L === H) return [{ kind: "add", factionId: T, delta: -e.amount }];
      return [];
    }
    case "garrisoned": {
      // self === H is handled by walkStandings, not here - see the doc
      // comment above this function.
      if (e.amount === undefined || A === H) return [];
      // The tick skipped the actor's direct overlord, same as the Fortify
      // fan-out above.
      if (e.overlordFactionId === H) return [];
      return [{ kind: "add", factionId: A, delta: -e.amount }];
    }
    case "pact-lapsed":
      // The seal, run backwards. `playerId` here is only whose clock tick
      // noticed the expiry, so the allies come off the two id fields instead.
      return pactMoves(
        e, e.targetFactionId, e.overlordFactionId, H, -1,
      );
    default:
      return [];
  }
}

/** Per-event before -> after, index-parallel to `events`. Runs BACKWARDS from
 *  the post-batch leads (`ctx.leads`), because that is the only truth
 *  available: a round summary is built after every event in it has already
 *  applied.
 *
 *  Walks ALL of `events`, not just the notice-worthy subset a summary line
 *  renders. A rival's Fortify is never shown and a garrisoned is filtered out
 *  of the activity log (see `isObservable` in hud.ts), but both move the
 *  human's Might lead, and the human's own garrisoned is the LAST event of
 *  every AI batch. Skipping either would put every Might line in the summary
 *  out by their sum. */
export function walkStandings(
  events: GameEvent[],
  ctx: WalkCtx,
): StandingChange[][] {
  const H = ctx.humanFactionId;

  // Gathered independent of leadMovesOf, from the raw event fields: this is
  // what lets the human's own trailing garrisoned (Might over every living
  // faction - not reconstructable from that one event) apply to every
  // faction this batch turns out to care about, without needing to know who
  // was alive at that instant. A faction incorporated earlier in this same
  // batch would be included too and so get a stray line; accepted as a rare,
  // cosmetically harmless edge case rather than threading incorporation
  // state through this walk.
  const mentioned = new Set<string>();
  for (const e of events) {
    const ids = [
      ctx.factionOf(e.playerId),
      e.targetFactionId, e.overlordFactionId, e.formerOverlordFactionId,
    ];
    for (const id of ids) if (id !== undefined && id !== H) mentioned.add(id);
  }

  const movesPerEvent: LeadMove[][] = events.map((e) => {
    if (e.type === "garrisoned" && e.amount !== undefined && ctx.factionOf(e.playerId) === H) {
      return [...mentioned]
        // The human's own tick skipped the human's own direct lord - the one
        // faction this batch may mention that the fan-out did not touch.
        .filter((factionId) => factionId !== e.overlordFactionId)
        .map((factionId): LeadMove => (
          { kind: "add", factionId, delta: e.amount! }
        ));
    }
    return leadMovesOf(e, ctx);
  });

  const tracked = new Set<string>();
  for (const moves of movesPerEvent) for (const m of moves) tracked.add(m.factionId);

  const current: Record<string, number> = {};
  for (const factionId of tracked) current[factionId] = ctx.leads(factionId);

  const out: StandingChange[][] = new Array(events.length);
  for (let i = events.length - 1; i >= 0; i--) {
    const lines: StandingChange[] = [];
    for (const move of movesPerEvent[i]) {
      const after = current[move.factionId];
      const before = move.kind === "set" ? move.from : after - move.delta;
      lines.push({ factionId: move.factionId, before, after });
      current[move.factionId] = before;
    }
    out[i] = lines;
  }
  return out;
}

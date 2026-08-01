import { buildDeck, CARDS, DECK_SIZE, type Rng } from "./cards";
import {
  advance, chooseDeck, isHumanTurn, pickFaction, startGame, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { buildPlayerDeck } from "./meta";
import { bumpMightBy, bumpStatusBy, leadsOf, type Relations } from "./relations";

/** Query params that boot the game straight into a chosen state, so a browser
 *  pass is one navigation instead of a menu click, ten card clicks, a land
 *  click and a dozen turns of play. See the AGENTS.md section for the contract
 *  this owes the reader; the rules below are the ones that bite.
 *
 *  Nothing here invents state. Every param drives the transitions the player's
 *  own clicks drive - `startGame`, `chooseDeck`, `pickFaction`, then the same
 *  `aiTakeTurn`/`advance` pair `afterHumanAction` runs - so a booted run is a
 *  run the game could have reached, and a rule change cannot leave this file
 *  behind describing a world that no longer exists. */
export interface RelOverride {
  factionId: string;
  /** The human's signed lead on that track, positive = you lead. */
  status: number | null;
  might: number | null;
}

export interface BootParams {
  seed: number | null;
  /** Cards picked at the deck screen, or null to take the standard deck. */
  deck: string[] | null;
  faction: string | null;
  hand: string[] | null;
  rel: RelOverride[];
  turns: number;
  /** False mutes the AI round summary, via the log pref the player can toggle
   *  themselves. Null leaves the pref alone. */
  popups: boolean | null;
}

/** A booted run knows every card it could ever deck-build. It runs on memory
 *  storage, so this neither reads nor writes real progress - it exists so that
 *  `?deck=` means the same thing on every machine rather than depending on
 *  which cards that browser profile happens to have unlocked. */
export const BOOT_KNOWN_CARDS: string[] = Object.values(CARDS)
  .filter((c) => c.deckBuildable)
  .map((c) => c.id);

/** Rounds a `turns=` fast-forward will run. Above the 150-turn cap the baseline
 *  simulation uses, so it bounds a typo rather than a legitimate value. */
const MAX_FAST_FORWARD = 200;

/** Seats stepped before the fast-forward gives up. Generous: a round is one
 *  step per faction, and the shipped map has 26. */
const MAX_STEPS = 20000;

const HAND_LIMIT = DECK_SIZE;

const ids = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

function intOr(raw: string | null, fallback: number | null): number | null {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** `rel=selonians:might=3,status=-2;curonians:might=1` - one clause per
 *  faction, the tracks within a clause comma-separated. Anything unparseable is
 *  dropped rather than thrown: a boot param must never be able to blank the
 *  page, and this runs before the HUD exists to report an error on. */
function parseRel(raw: string): RelOverride[] {
  const out: RelOverride[] = [];
  for (const clause of raw.split(";")) {
    const [factionId, ...rest] = clause.split(":");
    if (factionId === undefined || factionId.trim().length === 0) continue;
    if (rest.length === 0) continue;
    let status: number | null = null;
    let might: number | null = null;
    for (const pair of rest.join(":").split(",")) {
      const [track, value] = pair.split("=");
      const n = intOr(value ?? null, null);
      if (n === null) continue;
      if (track?.trim() === "status") status = n;
      if (track?.trim() === "might") might = n;
    }
    if (status === null && might === null) continue;
    out.push({ factionId: factionId.trim(), status, might });
  }
  return out;
}

const BOOT_KEYS = ["seed", "deck", "faction", "hand", "rel", "turns", "popups"];

/** Null when the URL names no boot param at all, which is the ordinary case:
 *  the caller then leaves every boot line on its normal path, so a player's
 *  bare URL cannot behave differently because this file exists. */
export function parseBootParams(search: string): BootParams | null {
  const q = new URLSearchParams(search);
  if (!BOOT_KEYS.some((k) => q.has(k))) return null;
  const deck = q.get("deck");
  const hand = q.get("hand");
  const rel = q.get("rel");
  const popups = q.get("popups");
  const turns = intOr(q.get("turns"), 0) ?? 0;
  return {
    seed: intOr(q.get("seed"), null),
    deck: deck === null ? null : ids(deck),
    faction: q.get("faction"),
    hand: hand === null ? null : ids(hand).slice(0, HAND_LIMIT),
    rel: rel === null ? [] : parseRel(rel),
    turns: Math.max(0, Math.min(MAX_FAST_FORWARD, turns)),
    popups:
      popups === null ? null : !["off", "false", "0"].includes(popups.trim()),
  };
}

/** Plays whole rounds with the AI policy driving every seat, the human's
 *  included, then keeps stepping until the human is on turn again.
 *
 *  That second part is not belt and braces. `afterHumanAction` is the only
 *  thing that ever runs an AI turn, and it only runs after the human commits
 *  an action - so a state handed to the player mid-round, or with
 *  `playedThisTurn` still set, renders every card disabled and nothing can ever
 *  advance the game again. */
function fastForward(state: GameState, rounds: number, rng: Rng): GameState {
  let g = state;
  let steps = 0;
  const until = g.turn + rounds;
  while (g.phase === "playing" && g.turn < until && ++steps < MAX_STEPS) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  while (g.phase === "playing" && !isHumanTurn(g) && ++steps < MAX_STEPS) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  return g;
}

function withHand(state: GameState, hand: string[]): GameState {
  const cards = hand.filter((id) => CARDS[id] !== undefined);
  if (cards.length === 0) return state;
  return {
    ...state,
    players: state.players.map((p, i) => (i === 0 ? { ...p, hand: cards } : p)),
  };
}

/** Moves each named standing to the asked-for lead by bumping whichever
 *  direction of the pair is short. Relation counters only ever grow, and the
 *  number the player reads anywhere in the game is the signed lead
 *  (`formatLead`), so a lead is the only form this param could sanely take. */
function withRel(state: GameState, overrides: RelOverride[]): GameState {
  const me = state.players[0]?.factionId;
  if (me === undefined) return state;
  let rel: Relations = state.relations;
  for (const o of overrides) {
    if (o.factionId === me) continue;
    if (!state.factionIds.includes(o.factionId)) continue;
    const now = leadsOf(rel, me, o.factionId);
    if (o.might !== null) {
      const d = o.might - now.might;
      if (d > 0) rel = bumpMightBy(rel, me, o.factionId, d);
      else if (d < 0) rel = bumpMightBy(rel, o.factionId, me, -d);
    }
    if (o.status !== null) {
      const d = o.status - now.status;
      if (d > 0) rel = bumpStatusBy(rel, me, o.factionId, d);
      else if (d < 0) rel = bumpStatusBy(rel, o.factionId, me, -d);
    }
  }
  return { ...state, relations: rel };
}

/** Deck, then faction, then the fast-forward, then hand and standings.
 *
 *  The order is load-bearing at both ends. `hand` has to come after the
 *  fast-forward or the policy plays the cards that were staged for the player
 *  to play; `rel` has to come after it so the number means the standing as it
 *  stands now, which is what a test is aiming at. The cost of that second
 *  choice, worth knowing before reading a booted log: `walkStandings` anchors
 *  the log's `(Might +1 -> 2)` suffixes to the current leads and walks
 *  backwards, so `rel` combined with `turns` offsets every historical suffix by
 *  the override.
 *
 *  Each transition guards its own phase, so a bad `deck=` or `faction=` stops
 *  the chain early and returns a state that is still coherent - the deck screen
 *  or the faction prompt - rather than a half-built run. */
export function applyBootParams(
  state: GameState, params: BootParams, rng: Rng,
): GameState {
  let g = startGame(state);
  g = chooseDeck(
    g,
    params.deck === null
      ? buildDeck()
      : buildPlayerDeck(BOOT_KNOWN_CARDS, params.deck),
  );
  if (params.faction === null) return g;
  g = pickFaction(g, params.faction, rng);
  if (g.phase !== "playing") return g;
  g = fastForward(g, params.turns, rng);
  if (g.phase !== "playing") return g;
  if (params.hand !== null) g = withHand(g, params.hand);
  return withRel(g, params.rel);
}

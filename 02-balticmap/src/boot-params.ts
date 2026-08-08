import { buildDeck, CARDS, DECK_SIZE, type Rng } from "./cards";
import {
  advance, chooseDeck, chooseRules, isHumanTurn, pickFaction, startGame,
  type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { buildPlayerDeck, initialMeta, type MetaRecord } from "./meta";
import { bumpMightBy, leadOf, type Relations } from "./relations";
import { mergeRules, type RuleSelections } from "./rules";

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
  /** The human's signed Might lead, positive = you lead. */
  might: number;
}

export interface BootParams {
  seed: number | null;
  /** Cards picked at the deck screen, or null to take the standard deck. */
  deck: string[] | null;
  /** Where to stop the chain short, or null to run it as far as the other
   *  params reach. Every other screen is where the chain runs out of params -
   *  omitting `faction` lands on the faction prompt - but `chooseDeck` runs
   *  whether or not `deck=` was named, and `buildPlayerDeck` always returns a
   *  legal deck, so the deck screen is the one stop that has to be asked for.
   *  A union rather than a string: adding another screen is then a change the
   *  compiler checks rather than a literal to grep for. */
  screen: "deck" | null;
  faction: string | null;
  hand: string[] | null;
  rel: RelOverride[];
  turns: number;
  /** The collection the deck screen offers, or null for every deck-buildable
   *  card. Named ids are added to what every player starts with rather than
   *  replacing it, the same union `loadMeta` applies to a stored record, so a
   *  booted collection is one a real player could actually hold. */
  known: string[] | null;
  /** Lifetime XP, which is what `pendingPacks` derives the pack-opening
   *  overlay from. Null starts at zero. */
  xp: number | null;
  /** The human faction's treasury, own faction only - rivals' treasuries are
   *  hidden, so there is nothing a URL could sanely say about them. Null
   *  leaves the boot-time income untouched. The two checks it exists for:
   *  `?hand=found-settlement&wealth=0` (greyed out with a readable reason) and a
   *  vassalage at `wealth=0` (the tribute line quotes a standing change where
   *  a solvent vassal's quotes coins). */
  wealth: number | null;
  /** False mutes the AI round summary, via the log pref the player can toggle
   *  themselves. Null leaves the pref alone. */
  popups: boolean | null;
  /** Rule picks for the booted game, or null to leave the defaults. Unknown
   *  axes and options are dropped by `mergeRules`, the same rule that drops
   *  an unknown `rel=` track, so a URL from before an axis existed - or
   *  after one is removed - still boots. */
  rules: RuleSelections | null;
}

const isDeckBuildable = (id: string): boolean =>
  CARDS[id]?.deckBuildable === true;

/** A booted run knows every card it could ever deck-build. It runs on memory
 *  storage, so this neither reads nor writes real progress - it exists so that
 *  `?deck=` means the same thing on every machine rather than depending on
 *  which cards that browser profile happens to have unlocked. */
export const BOOT_KNOWN_CARDS: string[] = Object.values(CARDS)
  .map((c) => c.id)
  .filter(isDeckBuildable);

/** Rounds a `turns=` fast-forward will run. Above the 150-turn cap the baseline
 *  simulation uses, so it bounds a typo rather than a legitimate value. */
const MAX_FAST_FORWARD = 200;

/** Seats stepped before the fast-forward gives up. Generous: a round is one
 *  step per faction, and the shipped map has 26. */
const MAX_STEPS = 20000;

/** Ceiling on `xp=`, matching the one `isCount` puts on a stored record in
 *  src/meta.ts. That ceiling is not tidiness: `levelForXp` counts levels in a
 *  `while` loop, and an unclamped value froze the tab. A URL is the same
 *  attack surface as a hand-edited record, so it gets the same bound. */
const MAX_BOOT_XP = 1e9;

const HAND_LIMIT = DECK_SIZE;

const ids = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

function intOr(raw: string | null, fallback: number | null): number | null {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** `rel=selonians:might=3;curonians:might=1` - one clause per faction, the
 *  pairs within a clause comma-separated. Anything unparseable is dropped
 *  rather than thrown: a boot param must never be able to blank the page, and
 *  this runs before the HUD exists to report an error on. An unknown track
 *  name is dropped by the same rule, so a pre-removal URL naming `status=`
 *  still boots - the clause just loses that pair. */
function parseRel(raw: string): RelOverride[] {
  const out: RelOverride[] = [];
  for (const clause of raw.split(";")) {
    const [factionId, ...rest] = clause.split(":");
    if (factionId === undefined || factionId.trim().length === 0) continue;
    if (rest.length === 0) continue;
    let might: number | null = null;
    for (const pair of rest.join(":").split(",")) {
      const [track, value] = pair.split("=");
      const n = intOr(value ?? null, null);
      if (n === null) continue;
      if (track?.trim() === "might") might = n;
    }
    if (might === null) continue;
    out.push({ factionId: factionId.trim(), might });
  }
  return out;
}

/** `rules=turn:unlimited;other:pick` - axis:option pairs, `;`-separated, the
 *  `rel=` clause convention. Unparseable or unknown pairs are dropped, never
 *  thrown, for the same reason parseRel drops them. */
function parseRules(raw: string): RuleSelections {
  const picks: Record<string, unknown> = {};
  for (const clause of raw.split(";")) {
    const [axis, option] = clause.split(":");
    if (axis === undefined || option === undefined) continue;
    picks[axis.trim()] = option.trim();
  }
  return mergeRules(picks);
}

const BOOT_KEYS = [
  "seed", "deck", "screen", "faction", "hand", "rel", "turns", "known", "xp",
  "wealth", "popups", "rules",
];

/** Null when the URL names no boot param at all, which is the ordinary case:
 *  the caller then leaves every boot line on its normal path, so a player's
 *  bare URL cannot behave differently because this file exists. */
export function parseBootParams(search: string): BootParams | null {
  const q = new URLSearchParams(search);
  if (!BOOT_KEYS.some((k) => q.has(k))) return null;
  const deck = q.get("deck");
  const hand = q.get("hand");
  const known = q.get("known");
  const rel = q.get("rel");
  const popups = q.get("popups");
  const rules = q.get("rules");
  const turns = intOr(q.get("turns"), 0) ?? 0;
  const xp = intOr(q.get("xp"), null);
  const wealth = intOr(q.get("wealth"), null);
  return {
    seed: intOr(q.get("seed"), null),
    deck: deck === null ? null : ids(deck),
    // Normalised here rather than compared downstream, so an unrecognised
    // value is dropped the way an unparseable `rel` clause is: a boot param
    // must never be able to blank the page, and a typo landing in the ordinary
    // run is a better failure than no page at all.
    screen: q.get("screen") === "deck" ? "deck" : null,
    faction: q.get("faction"),
    hand: hand === null ? null : ids(hand).slice(0, HAND_LIMIT),
    rel: rel === null ? [] : parseRel(rel),
    turns: Math.max(0, Math.min(MAX_FAST_FORWARD, turns)),
    // `known=` with nothing after it is a value, not an absence: it means the
    // collection every player starts with, which is the sparse deck screen.
    known: known === null ? null : ids(known),
    xp: xp === null ? null : Math.max(0, Math.min(MAX_BOOT_XP, xp)),
    // The same bound as `xp=`, for the same reason a URL gets any bound at
    // all: a treasury is only ever displayed and compared, so this one is
    // hygiene rather than a frozen tab.
    wealth: wealth === null ? null : Math.max(0, Math.min(MAX_BOOT_XP, wealth)),
    popups:
      popups === null ? null : !["off", "false", "0"].includes(popups.trim()),
    rules: rules === null ? null : parseRules(rules),
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
    const d = o.might - leadOf(rel, me, o.factionId);
    if (d > 0) rel = bumpMightBy(rel, me, o.factionId, d);
    else if (d < 0) rel = bumpMightBy(rel, o.factionId, me, -d);
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
  if (params.rules !== null) g = chooseRules(g, params.rules);
  // Withholding the click, not inventing a screen: the phase startGame leaves
  // behind is the one the player sees before they choose, and "Choose your
  // lands" runs the same chooseDeck from there, so a booted picker continues
  // into a run rather than dead-ending.
  if (params.screen === "deck") return g;
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
  // After the fast-forward, like `hand` and `rel` and for the same reason:
  // the number means the treasury as it stands now, not before the income the
  // forwarded rounds banked.
  if (params.wealth !== null) {
    const me = g.players[0]?.factionId;
    if (me !== undefined) {
      g = { ...g, wealth: { ...g.wealth, [me]: params.wealth } };
    }
  }
  return withRel(g, params.rel);
}

/** The progress record a booted page runs on. The counterpart to
 *  `applyBootParams` for the state that is not in `GameState`: what the deck
 *  screen offers and what the pack overlay owes.
 *
 *  It lives here rather than inline in main.ts so this file keeps owning the
 *  whole boot contract - a param whose effect is written somewhere else is a
 *  param the next reader of this file will not find.
 *
 *  Both fields go through the ordinary derivations rather than around them.
 *  `known=` is unioned onto `initialMeta`'s collection, so a booted player
 *  always holds at least what every player starts with, and `xp` is a lifetime
 *  counter that `pendingPacks` reads - there is no way to spell "grant me a
 *  pack" here, only "have earned one". */
export function applyBootMeta(params: BootParams): MetaRecord {
  const base = initialMeta();
  return {
    ...base,
    knownCards:
      params.known === null
        ? BOOT_KNOWN_CARDS
        : [...new Set([...base.knownCards, ...params.known.filter(isDeckBuildable)])],
    xp: params.xp ?? base.xp,
  };
}

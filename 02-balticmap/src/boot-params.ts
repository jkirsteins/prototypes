import { CARDS, type Rng, type Strategy } from "./cards";
import {
  advance, chooseBuild, chooseRules, isHumanTurn, pickFaction, startGame,
  TURNIP_HARVEST_THRESHOLD, viewOf,
  type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { defenseMaxOf } from "./defense";
import { addMarch } from "./marches";
import { attackDamageFor, marchSourcesAgainst } from "./playability";
import { realmRootOf } from "./relations";
import { rulerOf } from "./rulers";
import { mergeRules, type RuleSelections } from "./rules";

/** Query params that boot the game straight into a chosen state, so a browser
 *  pass is one navigation instead of a menu click, a build click, a land
 *  click and a dozen turns of play. See the AGENTS.md section for the
 *  contract this owes the reader.
 *
 *  Nothing here invents state - every param drives the transitions the
 *  player's own clicks drive - with one deliberate exception: the `defense=`,
 *  `disease=`, `leadership=` and `turnips=` overrides write the stores
 *  directly, clamped by the same rules the game keeps (a defense override is
 *  clamped into [0, max]), because "a world where Selija stands at 100" is a
 *  STATE to examine, not a history to replay. They apply after the
 *  fast-forward, like `hand=`, so the number means the store as it stands. */
export interface BootParams {
  seed: number | null;
  /** The build screen's pick, or null for the warpath default. */
  build: Strategy | null;
  /** Where to stop the chain short, or null to run it as far as the other
   *  params reach. `chooseBuild` runs whether or not `build=` was named, so
   *  the build screen is the one stop that has to be asked for. */
  screen: "deck" | null;
  faction: string | null;
  hand: string[] | null;
  turns: number;
  /** Polygon id -> defense override, clamped into [0, max]. */
  defense: Record<string, number>;
  /** Polygon id -> owner faction id -> stacks. */
  disease: Record<string, Record<string, number>>;
  /** Faction id -> ruler leadership override. */
  leadership: Record<string, number>;
  /** Polygon id -> armies stationed there. */
  armies: Record<string, number>;
  /** Marches to declare, source before target. Damage is not settable: it is
   *  whatever a Raid out of that land would actually deal, so a booted arrow
   *  promises the same number a played one would. */
  marches: { from: string; to: string }[];
  /** The human faction's turnip counter, clamped under the threshold. */
  turnips: number | null;
  /** The human faction's treasury, own faction only - rivals' treasuries are
   *  hidden, so there is nothing a URL could sanely say about them. */
  wealth: number | null;
  /** False mutes the AI round summary, via the log pref the player can
   *  toggle themselves. Null leaves the pref alone. */
  popups: boolean | null;
  /** Rule picks for the booted game, or null to leave the defaults. Unknown
   *  axes and options are dropped by `mergeRules`, so a URL from before an
   *  axis existed - or after one is removed - still boots. */
  rules: RuleSelections | null;
}

/** Rounds a `turns=` fast-forward will run. Above the 150-turn cap the baseline
 *  simulation uses, so it bounds a typo rather than a legitimate value. */
const MAX_FAST_FORWARD = 200;

/** Seats stepped before the fast-forward gives up. Generous: a round is one
 *  step per faction, and the shipped map has 26. */
const MAX_STEPS = 20000;

/** Ceiling on numeric overrides. Hygiene: these stores are displayed and
 *  compared, never looped over, but a URL is the same attack surface as a
 *  hand-edited record and gets the same kind of bound. */
const MAX_BOOT_NUMBER = 1e9;

const HAND_LIMIT = 10;

const ids = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

function intOr(raw: string | null, fallback: number | null): number | null {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const clampCount = (n: number): number =>
  Math.max(0, Math.min(MAX_BOOT_NUMBER, n));

/** `defense=selija:100;talava:0` - one `polygon:value` clause per polygon.
 *  Anything unparseable is dropped rather than thrown: a boot param must
 *  never be able to blank the page, and this runs before the HUD exists to
 *  report an error on. The same rule every parser below keeps. */
function parseDefense(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const clause of raw.split(";")) {
    const [polygon, value] = clause.split(":");
    const n = intOr(value ?? null, null);
    if (polygon === undefined || polygon.trim().length === 0 || n === null) continue;
    out[polygon.trim()] = clampCount(n);
  }
  return out;
}

/** `armies=selija:3;talava:0` - one `polygon:count` clause per polygon. */
function parseArmies(raw: string): Record<string, number> {
  return parseDefense(raw); // same shape, same clamp
}

/** `march=talava>selija;zemgale>selija` - one `from>to` clause per arrow, so
 *  a browser check can boot straight into an incoming attack or a live clash
 *  rather than playing four turns to reach one. */
function parseMarches(raw: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const clause of raw.split(";")) {
    const [from, to] = clause.split(">");
    if (from === undefined || to === undefined) continue;
    if (from.trim().length === 0 || to.trim().length === 0) continue;
    out.push({ from: from.trim(), to: to.trim() });
  }
  return out;
}

/** `disease=talava:selonians:3;selija:lietuva:1` - polygon:owner:count. */
function parseDisease(raw: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const clause of raw.split(";")) {
    const [polygon, owner, value] = clause.split(":");
    const n = intOr(value ?? null, null);
    if (
      polygon === undefined || polygon.trim().length === 0 ||
      owner === undefined || owner.trim().length === 0 ||
      n === null || n <= 0
    ) continue;
    const p = polygon.trim();
    out[p] = { ...out[p], [owner.trim()]: clampCount(n) };
  }
  return out;
}

/** `leadership=selonians:100` - faction:levels. */
function parseLeadership(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const clause of raw.split(";")) {
    const [factionId, value] = clause.split(":");
    const n = intOr(value ?? null, null);
    if (factionId === undefined || factionId.trim().length === 0 || n === null) continue;
    out[factionId.trim()] = clampCount(n);
  }
  return out;
}

/** `rules=turn:unlimited` - axis:option pairs, `;`-separated. Unparseable or
 *  unknown pairs are dropped, never thrown. */
function parseRules(raw: string): RuleSelections {
  const picks: Record<string, unknown> = {};
  for (const clause of raw.split(";")) {
    const parts = clause.split(":").filter((s) => s.trim().length > 0);
    if (parts.length !== 2) continue;
    const [axis, option] = parts;
    picks[axis.trim()] = option.trim();
  }
  return mergeRules(picks);
}

const BOOT_KEYS = [
  "seed", "build", "screen", "faction", "hand", "turns", "defense", "disease",
  "leadership", "armies", "march", "turnips", "wealth", "popups", "rules",
];

/** Null when the URL names no boot param at all, which is the ordinary case:
 *  the caller then leaves every boot line on its normal path, so a player's
 *  bare URL cannot behave differently because this file exists. */
export function parseBootParams(search: string): BootParams | null {
  const q = new URLSearchParams(search);
  if (!BOOT_KEYS.some((k) => q.has(k))) return null;
  const hand = q.get("hand");
  const popups = q.get("popups");
  const rules = q.get("rules");
  const defense = q.get("defense");
  const disease = q.get("disease");
  const leadership = q.get("leadership");
  const armies = q.get("armies");
  const march = q.get("march");
  const turns = intOr(q.get("turns"), 0) ?? 0;
  const turnips = intOr(q.get("turnips"), null);
  const wealth = intOr(q.get("wealth"), null);
  const build = q.get("build");
  return {
    seed: intOr(q.get("seed"), null),
    // Normalised here rather than compared downstream, so an unrecognised
    // value is dropped the way an unparseable clause is.
    build: build === "warpath" || build === "pestilence" ? build : null,
    screen: q.get("screen") === "deck" ? "deck" : null,
    faction: q.get("faction"),
    hand: hand === null ? null : ids(hand).slice(0, HAND_LIMIT),
    turns: Math.max(0, Math.min(MAX_FAST_FORWARD, turns)),
    defense: defense === null ? {} : parseDefense(defense),
    disease: disease === null ? {} : parseDisease(disease),
    leadership: leadership === null ? {} : parseLeadership(leadership),
    armies: armies === null ? {} : parseArmies(armies),
    marches: march === null ? [] : parseMarches(march),
    // Clamped UNDER the threshold: a counter at or past it is a state the
    // game never holds - the crossing play resets it and injects.
    turnips:
      turnips === null
        ? null
        : Math.max(0, Math.min(TURNIP_HARVEST_THRESHOLD - 1, turnips)),
    wealth: wealth === null ? null : clampCount(wealth),
    popups:
      popups === null ? null : !["off", "false", "0"].includes(popups.trim()),
    rules: rules === null ? null : parseRules(rules),
  };
}

/** Plays whole rounds with the AI policy driving every seat, the human's
 *  included, then keeps stepping until the human is on turn again - a state
 *  handed to the player mid-round would render every card disabled with
 *  nothing to ever advance the game. */
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

/** Build, then faction, then the fast-forward, then the store overrides.
 *
 *  The order is load-bearing at both ends. `hand` has to come after the
 *  fast-forward or the policy plays the cards that were staged for the
 *  player; the overrides come after it so each number means the store as it
 *  stands now, which is what a test is aiming at.
 *
 *  Each transition guards its own phase, so a bad `faction=` stops the chain
 *  early and returns a state that is still coherent - the faction prompt -
 *  rather than a half-built run. */
export function applyBootParams(
  state: GameState, params: BootParams, rng: Rng,
): GameState {
  let g = startGame(state);
  if (params.rules !== null) g = chooseRules(g, params.rules);
  // Withholding the click, not inventing a screen: the phase startGame
  // leaves behind is the one the player sees before they choose, and
  // "Choose your lands" runs the same chooseBuild from there.
  if (params.screen === "deck") return g;
  g = chooseBuild(g, params.build ?? "warpath");
  if (params.faction === null) return g;
  g = pickFaction(g, params.faction, rng);
  if (g.phase !== "playing") return g;
  g = fastForward(g, params.turns, rng);
  if (g.phase !== "playing") return g;
  if (params.hand !== null) g = withHand(g, params.hand);
  const me = g.players[0]?.factionId;
  if (params.wealth !== null && me !== undefined) {
    g = { ...g, wealth: { ...g.wealth, [me]: params.wealth } };
  }
  // Defense overrides, clamped by each polygon's own max - the same clamp
  // `defenseOf` reads with, applied at write time so the store never holds
  // an impossible number. An unknown polygon is dropped.
  for (const [polygon, value] of Object.entries(params.defense)) {
    if (!g.factionIds.includes(polygon)) continue;
    const max = defenseMaxOf(g, polygon);
    const clamped = Math.max(0, Math.min(max, value));
    g = {
      ...g,
      defense:
        clamped >= max
          ? Object.fromEntries(
              Object.entries(g.defense).filter(([p]) => p !== polygon),
            )
          : { ...g.defense, [polygon]: clamped },
    };
  }
  for (const [polygon, owners] of Object.entries(params.disease)) {
    if (!g.factionIds.includes(polygon)) continue;
    const kept = Object.fromEntries(
      Object.entries(owners).filter(([owner]) => g.factionIds.includes(owner)),
    );
    if (Object.keys(kept).length === 0) continue;
    g = { ...g, disease: { ...g.disease, [polygon]: kept } };
  }
  for (const [factionId, value] of Object.entries(params.leadership)) {
    if (!g.factionIds.includes(factionId)) continue;
    const ruler = rulerOf(g.rulers, factionId);
    g = {
      ...g,
      rulers: { ...g.rulers, [factionId]: { ...ruler, leadership: value } },
    };
  }
  if (params.turnips !== null && me !== undefined) {
    g = { ...g, turnips: { ...g.turnips, [me]: params.turnips } };
  }
  // Armies before marches: a march declared below spends one, and a URL that
  // asks for three armies and two arrows out of the same land must get both.
  for (const [polygon, value] of Object.entries(params.armies)) {
    if (!g.factionIds.includes(polygon)) continue;
    g = { ...g, armies: { ...g.armies, [polygon]: value } };
  }
  // A booted march is declared through the same rules a played one is: the
  // source must be in the actor's realm with an army free and the target must
  // be something that actor may attack, or the clause is dropped. A URL that
  // could conjure an impossible arrow would be checking a state the game
  // cannot reach.
  for (const { from, to } of params.marches) {
    if (!g.factionIds.includes(from) || !g.factionIds.includes(to)) continue;
    const actor = realmRootOf(from, g.overlords, g.incorporated);
    const v = viewOf(g);
    if (!marchSourcesAgainst(v, actor, to).includes(from)) continue;
    g = {
      ...g,
      marches: addMarch(g.marches, {
        actor, from, to, cardId: "raid",
        damage: attackDamageFor(v, actor, "raid").damage,
        holdsArmy: true,
        expiry: g.turn + 1,
      }),
    };
  }
  return g;
}

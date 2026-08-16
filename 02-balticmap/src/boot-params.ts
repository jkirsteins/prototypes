import { CARDS, type Rng, type Strategy } from "./cards";
import { REGIONS, type RegionId } from "./regions";
import {
  advance, chooseBuild, chooseRules, isHumanTurn, pickFaction, startGame,
  TURNIP_HARVEST_THRESHOLD, viewOf,
  type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { applyDamage, defenseMaxOf, MIN_RAID_SPEND } from "./defense";
import { addMarch } from "./marches";
import {
  attackDamageFor, marchHopsTo, marchSourcesAgainst, marchTargetsFrom,
  spendCeilingOn,
} from "./playability";
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
  /** Polygon id -> settlements FOUNDED there, clamped to what the map still
   *  authors for that land. Not the standing count: the one every land begins
   *  with is not in the store, so `settlements=x:1` is a land holding two. */
  settlements: Record<string, number>;
  /** Marches to declare, source before target. Damage is not settable: it is
   *  whatever a Raid out of that land would actually deal, so a booted arrow
   *  promises the same number a played one would. */
  marches: { from: string; to: string; spend: number | null }[];
  /** How many lands the human's realm holds, or null to leave the deal
   *  alone. The one boot param that names no ids: the states it exists to
   *  reach are "half the map" and "all of it", and a twenty-five-id URL is
   *  not a check anybody writes. */
  realm: number | null;
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
  /** `region=iberia` - which map the booted page plays on; seeds the booted
   *  page's region preference the way `rules=` seeds the rules. An unknown
   *  value drops to null rather than a default, since main.ts must tell "no
   *  region named" apart from "the player's own preference" to know whether
   *  to seed the boot storage at all. */
  region: RegionId | null;
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

/** `settlements=selonians:1` - one `polygon:founded` clause per polygon. The
 *  count is settlements FOUNDED, matching the store, so 1 is a land standing
 *  on two. Clamped again against the map's own site cap below. */
function parseSettlements(raw: string): Record<string, number> {
  return parseDefense(raw); // same shape, same clamp
}

/** `march=talava>selija;zemgale>selija:3` - one `from>to` clause per arrow,
 *  with an optional `:N` for how much defense the raid tears out of its
 *  source, so a browser check can boot straight into an incoming attack or a
 *  live clash rather than playing four turns to reach one.
 *
 *  The amount DEFAULTS to `MIN_RAID_SPEND`, so every URL written before a
 *  raid's strength was a choice still means what it always meant: one point
 *  spent, one point on the arrow. */
function parseMarches(
  raw: string,
): { from: string; to: string; spend: number | null }[] {
  const out: { from: string; to: string; spend: number | null }[] = [];
  for (const clause of raw.split(";")) {
    const [from, rest] = clause.split(">");
    if (from === undefined || rest === undefined) continue;
    const [to, amount] = rest.split(":");
    if (to === undefined) continue;
    if (from.trim().length === 0 || to.trim().length === 0) continue;
    out.push({
      from: from.trim(), to: to.trim(), spend: intOr(amount ?? null, null),
    });
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
  "leadership", "armies", "settlements", "march", "realm", "turnips", "wealth",
  "popups", "rules", "region",
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
  const settlements = q.get("settlements");
  const march = q.get("march");
  const turns = intOr(q.get("turns"), 0) ?? 0;
  const realm = intOr(q.get("realm"), null);
  const turnips = intOr(q.get("turnips"), null);
  const wealth = intOr(q.get("wealth"), null);
  const build = q.get("build");
  const region = q.get("region");
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
    settlements: settlements === null ? {} : parseSettlements(settlements),
    marches: march === null ? [] : parseMarches(march),
    // Floored at 1 - the land the player already stands on - and ceilinged
    // against the roster where it is applied, since the roster is the region's
    // and this file does not have one yet.
    realm: realm === null ? null : Math.max(1, Math.min(MAX_BOOT_NUMBER, realm)),
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
    region: region !== null && region in REGIONS ? (region as RegionId) : null,
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
  g = chooseBuild(g, params.build ?? "warpath", rng);
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
  // Clamped against the map's own site cap rather than the play-time
  // allowance: the cap is what the map authors dots for, and a settlement with
  // no dot to stand on would be a count the map could not draw. Nothing is
  // spent here - `settlementsSpent` stays empty, so a booted land begins its
  // turn with every settlement free.
  for (const [polygon, value] of Object.entries(params.settlements)) {
    if (!g.factionIds.includes(polygon)) continue;
    const cap = g.siteCaps[polygon] ?? 0;
    g = {
      ...g,
      settlements: { ...g.settlements, [polygon]: Math.min(value, cap) },
    };
  }
  // The realm, before the marches for the same reason the armies are: an
  // arrow declared below may set out from a land this just took.
  //
  // ANNEXED and not sworn. Vassals would read the same on the scoreboard and
  // then come apart while you watched - a booted vassal can win its
  // independence at its own turn start, and the count the param exists to
  // reach would be gone by the second round. Incorporation is permanent, and
  // it also takes those seats out of the turn order (`takesNoTurn`), so
  // `realm=25` is a check that runs rather than twenty-four AI turns a round.
  //
  // Each land is taken OUT of wherever it answered before. `seedRealms` deals
  // pre-existing realms from region data, so a land left under its old lord as
  // well would be counted under two roots by `fullRealmOf` - and a rival
  // crossing the bar would end the booted run with `unified` before the state
  // under test was ever on screen.
  if (params.realm !== null && me !== undefined) {
    const want = Math.min(params.realm, g.factionIds.length);
    // In map order, skipping the human's own land: it is already the realm's
    // first member, which is why the count starts at 1 rather than 0.
    const take = g.factionIds.filter((f) => f !== me).slice(0, want - 1);
    const overlords = new Map(g.overlords);
    let incorporated = { ...g.incorporated };
    for (const land of take) {
      overlords.delete(land);
      incorporated = { ...incorporated, [land]: me };
    }
    // And nothing may answer to a land the human just swallowed, or that
    // land's own former vassals would still be counted under it.
    for (const [vassal, lord] of [...overlords]) {
      if (take.includes(lord)) overlords.delete(vassal);
    }
    for (const [land, owner] of Object.entries(incorporated)) {
      if (take.includes(owner)) incorporated[land] = me;
    }
    g = { ...g, overlords, incorporated };
  }
  // A booted march is declared through the same rules a played one is: the
  // source must be in the actor's realm with an army free and within marching
  // distance, and the target must be something that actor may attack, or the
  // clause is dropped. A URL that could conjure an impossible arrow would be
  // checking a state the game cannot reach.
  //
  // Both halves are asked, because neither answers the other's question:
  // `marchSourcesAgainst` says the army can walk that far and has the legs,
  // and `marchTargetsFrom` says the land is one this actor may attack at all.
  // A played card gets the second from `validTargetsFor` at the top of
  // `playCard`; a URL has no such gate above it.
  for (const { from, to, spend } of params.marches) {
    if (!g.factionIds.includes(from) || !g.factionIds.includes(to)) continue;
    const actor = realmRootOf(from, g.overlords, g.incorporated);
    const v = viewOf(g);
    if (!marchSourcesAgainst(v, actor, to).includes(from)) continue;
    if (!marchTargetsFrom(v, actor, from).includes(to)) continue;
    // Never null: the two lines above have both already asked the same
    // question through `marchHopsTo`. Read rather than assumed, because the
    // turns the arrow spends in the air are exactly the distance it was let
    // through for.
    const hops = marchHopsTo(v, from, to);
    if (hops === null) continue;
    // Clamped into [minimum, ceiling] like every other numeric override, and
    // against the source AS IT STANDS - which is after the defense override,
    // since marches are declared last. The two compose the way the sentence
    // reads: `defense=` names the land before its army set out.
    const paid = Math.max(
      MIN_RAID_SPEND,
      Math.min(
        spendCeilingOn(v, "raid", from),
        spend ?? MIN_RAID_SPEND,
      ),
    );
    g = {
      ...g,
      // The defense goes with it. A booted arrow that cost its land nothing
      // would be an arrow the game cannot reach, which is the one thing this
      // whole surface exists not to be.
      defense: applyDamage(v, from, paid),
      marches: addMarch(g.marches, {
        id: g.nextMarchId,
        actor, from, to, cardId: "raid",
        damage: attackDamageFor(v, actor, "raid", paid).damage,
        holdsArmy: true,
        declared: g.turn, expiry: g.turn + hops,
      }),
      nextMarchId: g.nextMarchId + 1,
    };
  }
  return g;
}

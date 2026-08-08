# Defense Score Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pairwise Might system with per-polygon defense scores, rebuild the
card roster into Warpath/Pestilence builds plus neutrals, move card acquisition in-run
through the turnip harvest, and retire the meta progression - per
`docs/superpowers/specs/2026-08-08-defense-score-rules-design.md`.

**Architecture:** Bottom-up in three green commits. Task 1 adds the new engine core
(defense/disease stores, leadership rename) additively, so nothing old breaks. Task 2 is
the flip: roster, rules, AI, surfaces, meta retirement, net protocol and every test land
together, because the old tests pin the old world (tests/packs.test.ts refuses an
all-common roster, so meta cannot outlive the flip commit). Task 3 re-expresses the
simulation and re-captures baselines. Every commit passes `npm test` and `npm run build`.

**Tech Stack:** Plain TypeScript + Vite, no framework, vitest. No new dependencies.

## Global Constraints

- `npm test` and `npm run build` must both pass before every commit (repo CLAUDE.md).
- Work on a worktree branch; never merge to main without the user's confirmation.
- Card/faction names in player-facing prose are `card()`/`faction()` segments, never
  interpolated strings (naming-convention test enforces).
- Every card: a `POLICY_COVERAGE` branch + a discovery route (the harvest pool IS the
  route for this roster). Every `GameEventType`: a `NOTICE_RULES` entry and a
  `nestsUnderItsPlay` classification.
- No em dashes or non-typable unicode anywhere in output.
- Never `git add -A`; stage explicit paths under `02-balticmap/` and this docs file.
- Animations report their own end; never re-derive a duration.
- All spec constants (verbatim from the spec's Numbers table):
  defenseMax = population/50; subjugation gate <= 25% of home max; independence gate
  >= 75% of home max at own turn start; Raid 150 + leadership; Great raid 75 +
  leadership per bordering polygon; War council +50 leadership, dies with ruler;
  omens x2 next attack, stacks multiplicatively; disease +1 stack per polygon touched;
  Plague 100 x own stacks per polygon, own stacks reset; Miasma x2 next Plague,
  stacks; Hillfort +150 one polygon capped; Harvest feast +50 whole realm capped;
  harvest threshold every 5 Grow turnips plays, static; offer 3 pick 1 or skip;
  starting deck 5x Raid + 1x Grow turnips, every seat.

## Decisions the spec left open (resolved here)

- **Id spaces**: polygons are 1:1 with factions (26 regions), so a "polygon id" IS a
  faction id - the land's own id, stable through vassalage and incorporation. The home
  polygon of faction F is F's own id.
- **Sparse defense store**: `defense[polygon]` is present only while damaged; an absent
  key means "at defenseMax". Same convention as the old Relations store's missing-key-
  means-0.
- **Attack reach** = polygons adjacent to any member of the actor's full realm (the
  polygon itself, NOT resolved to its annexer - attacks hit polygons) UNION the actor's
  own vassal polygons: `fullRealmOf(actor) minus incorporatedRealmOf(actor)`. The
  second half is the spec's lord-may-raid-its-vassals exception; a vassal's own annexed
  polygons ride along (uniform, harmless).
- **Great raid targets** = only the polygons adjacent to the full realm and outside it
  (spec: "every polygon bordering the actor's full realm" - vassals are not hit).
- **Faction reach** (Subjugate, Assassinate ruler) = the existing `reachOf` semantics.
  The liege rule (no Subjugate up your own overlord chain) stays - it is the acyclicity
  guarantee. `overlord-prohibited` (Raid/Assassinate vs own lord) is dropped: attacks
  aim at polygons now and the vassal-suppression exception cuts both ways.
- **Pay tribute becomes coins-only.** The shortfall arm was denominated in Might and
  Might is gone; what the treasury cannot cover is forgiven. Owed stays 1 per land of
  `incorporatedRealmOf(payer)`. The event carries `wealth` only, no `amount`.
- **Turnip counter is stored state** (`turnips: Record<factionId, number>` on
  GameState), not log-derived: every seat counts now, and a per-play log walk per seat
  is O(log) x seats for nothing. Threshold flat 5 for every rule set (spec: "static
  threshold, no ramp"; `harvestMultiplier` retires - the pacing knob is explicit and
  deferred).
- **Harvest offer draws**: exactly 3 rng draws per offer whatever the pool holds
  (constant-draw contract, same as rollHarvestOptions today). If the pool has fewer
  than 3 uncapped cards, slots repeat nothing - the offer is just shorter.
- **Skip is explicit**: `HarvestChoice = { cardId: string } | { skip: true }`.
- **AI strategy roll**: one rng draw per AI seat at `pickFaction`, in seat order
  (`rng() < 0.5 ? "warpath" : "pestilence"`), before decks are dealt.
- **Events for area effects are per-polygon**: a Great raid or Plague pushes one
  `damaged` event per polygon hit, nested under the play. The defense walk needs
  per-polygon amounts and the log gets one line per polygon, which is the spec's
  "(Defense -150 -> 450) on the damaged polygon's line".
- **`respites` and `timed.ts` stay** (independence and lord-fell escapes both stamp the
  2-turn respite; Subjugate legality still honours it).
- **`settlements`/`siteCaps`/wealth stay**; `booms` goes with Population boom, so the
  settlement allowance is the flat `SETTLEMENT_BASE_CAP` (2).
- **RARITY_TIERS stays in cards.ts** unused-by-gameplay (spec: tiers stay for a later
  pass). `rarity-band.ts`, `packs.ts`, `xp.ts` and the MetaRecord retire. `meta.ts`
  keeps `MetaStorage`/`memoryStorage` (rules prefs, log prefs, net display name all use
  it) and gains a saved build preference.
- **PROTOCOL_VERSION bumps to 2.** `lobby-guest` carries `build` instead of `deck`;
  `NetAction`'s play arm gains `harvest?: HarvestChoice`; the host recomputes the
  guest's offer pool to validate. `cardSetHash()` diverges automatically with CARDS.

---

### Task 1: Additive engine core - defense module, state fields, leadership rename

**Files:**
- Create: `src/defense.ts`
- Modify: `src/game.ts` (GameState fields, newGame, viewOf), `src/playability.ts`
  (RulesView fields), `src/rulers.ts` (prowess -> leadership), `src/main.ts` (pass
  defenseMax from map populations), `src/sim.ts` + `src/scenarios.ts` +
  `src/target-explanations.ts` + `src/hud.ts` + `src/ai.ts` (mechanical rename only)
- Create: `tests/defense.test.ts`
- Modify: `tests/rulers.test.ts`, `tests/helpers.ts` (rename fallout)

**Interfaces (produces):**

```ts
// src/defense.ts
export const DEFENSE_PER_POPULATION = 50;
export const DEFAULT_DEFENSE_MAX = 600;      // map-less test worlds
export const SUBJUGATION_GATE = 0.25;
export const INDEPENDENCE_GATE = 0.75;
export const RAID_DAMAGE = 150;
export const GREAT_RAID_DAMAGE = 75;
export const WAR_COUNCIL_LEADERSHIP = 50;
export const PLAGUE_DAMAGE_PER_STACK = 100;
export const HILLFORT_HEAL = 150;
export const HARVEST_FEAST_HEAL = 50;

/** polygon id -> current defense. Present ONLY while damaged; absent = at max. */
export type Defense = Readonly<Record<string, number>>;
/** polygon id -> owner faction id -> stacks. Owners with 0 stacks are absent. */
export type Disease = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface DefenseView {
  defense: Defense;
  defenseMax: Record<string, number>;
}
export function defenseMaxOf(view: DefenseView, polygon: string): number;    // ?? DEFAULT_DEFENSE_MAX
export function defenseOf(view: DefenseView, polygon: string): number;       // absent = max, clamped [0, max]
export function applyDamage(view: DefenseView, polygon: string, amount: number): Defense;
export function applyHeal(view: DefenseView, polygon: string, amount: number): Defense;  // deletes key at max
export function subjugationGateOpen(view: DefenseView, factionId: string): boolean; // <= 25% of max
export function independenceGateOpen(view: DefenseView, factionId: string): boolean; // >= 75% of max
export type GateBand = "high" | "middle" | "open"; // >=75% / between / <=25%
export function gateBandOf(view: DefenseView, polygon: string): GateBand;
export function diseaseOn(disease: Disease, polygon: string, owner: string): number;
export function addDisease(disease: Disease, polygon: string, owner: string, n: number): Disease;
export function clearDiseaseOf(disease: Disease, owner: string): Disease;    // Plague's reset
export function transferAllDiseaseTo(disease: Disease, owner: string): Disease; // Foul winds
export function defenseMaxFromPopulations(populations: Record<string, number>): Record<string, number>;
```

GameState gains `defense: Defense`, `defenseMax: Record<string, number>`,
`disease: Disease`, `miasma: Readonly<Record<string, number>>` (the Plague reserve,
`Omens` shape), `turnips: Record<string, number>`. `newGame` gains an optional
`defenseMax?: Record<string, number>` param (defaults every faction to
`DEFAULT_DEFENSE_MAX`, the `siteCaps` pattern). `viewOf` projects all five.
`RulesView` gains the same five plus `leadership: Record<string, number>` (rename of
`prowess`, still projected by the renamed `leadershipByFaction`). `Ruler.prowess`
renames to `leadership` everywhere (same lifecycle: `replaceRuler` seats successors at
0). PlayerState gains `strategy: "warpath" | "pestilence"` (default `"warpath"` in
`makePlayer` for now; Task 2 wires the choice). main.ts builds
`defenseMaxFromPopulations` from `region.population` when constructing the game.

- [ ] **Step 1:** Write `tests/defense.test.ts` covering: defenseMaxOf default and map
  values; defenseOf absent-key-means-max and clamping; applyDamage floors at 0 and
  materialises the key; applyHeal caps at max and DELETES the key at max; gate
  legality at exactly 25% and exactly 75% (600-max polygon: open at 150, closed at
  151; independence at 450, not 449); disease ownership (two owners on one polygon,
  clearDiseaseOf burns only the actor's); transferAllDiseaseTo merges counts;
  defenseMaxFromPopulations divides by 50.
- [ ] **Step 2:** Run it, verify it fails (module missing).
- [ ] **Step 3:** Implement `src/defense.ts`.
- [ ] **Step 4:** Add the GameState/RulesView/PlayerState fields and newGame defaults;
  rename prowess -> leadership across src/ and tests/ (grep `prowess`); wire
  `defenseMaxFromPopulations` in main.ts.
- [ ] **Step 5:** `npm test` and `npm run build` green.
- [ ] **Step 6:** Commit: `feat(defense-score): defense/disease core and leadership rename`

### Task 2: The flip - roster, rules, AI, surfaces, meta retirement, net, boot params

One commit, staged internally in the order below so type errors guide the sweep.
Everything Might-denominated dies here; every consumer is rebuilt against the new core.

**Files:**
- Rewrite: `src/cards.ts`, `src/playability.ts`, `src/game.ts` (playCard/beginTurn/
  chooseBuild), `src/harvest.ts`, `src/ai.ts`, `src/standings.ts`,
  `src/deck-screen.ts` (build picker), `src/boot-params.ts`,
  `src/target-explanations.ts`
- Slim: `src/relations.ts` (realm walks + types only), `src/rules.ts` (drop `copies`
  axis), `src/meta.ts` (MetaStorage + build pref only)
- Delete: `src/xp.ts`, `src/packs.ts`, `src/rarity-band.ts` (tiers stay in cards.ts)
- Update: `src/notices.ts`, `src/hud.ts`, `src/main.ts`, `src/view.ts`,
  `src/map-render.ts`, `src/panel.ts`, `src/net-protocol.ts`, `src/net-host.ts`,
  `src/net-guest.ts`, `src/net-ui.ts`, `src/sim.ts`, `src/scenarios.ts` (compile-level
  re-expression; baselines are Task 3), `src/style.css`
- Tests: every file in `tests/` touches; delete `tests/xp.test.ts`,
  `tests/packs.test.ts`, `tests/meta.test.ts` (fold survivors into others); create
  `tests/harvest.test.ts` coverage for the new offer flow

**Sub-step A - cards.ts roster.** Every card `rarity: "common"`, hand-tagged; the
conformance test relaxes to accept exactly that for this roster. Roster (id, name,
targeted, secret, maxPerDeck, deckBuildable, forced):

```
grow-crops        Grow turnips        untargeted  -  null  yes  no   (filler + harvest counter)
raid              Raid                targeted    -  null  yes  no   150 + leadership to one polygon in reach
great-raid        Great raid          untargeted  -  null  yes  no   75 + leadership to EVERY bordering polygon
favourable-omens  Favourable omens    untargeted  -  null  yes  no   next attack x2, stacks
war-council       War council         untargeted  -  null  yes  no   +50 leadership, dies with ruler
spread-disease    Spread disease      targeted    -  null  yes  no   +1 own stack on one polygon in reach
localized-outbreak Localized outbreak targeted    -  null  yes  no   +1 own stack on every neighbour of target, except own full realm
miasma            Miasma              untargeted  -  null  yes  no   next Plague counts stacks x2, stacks
plague            Plague              untargeted  -  null  yes  no   100 x own stacks per polygon, own stacks reset
foul-winds        Foul winds          untargeted  -  1     yes  no   every stack everywhere becomes yours
hillfort          Hillfort            targeted    -  null  yes  no   +150 defense, one polygon of own full realm, capped
harvest-feast     Harvest feast       untargeted  -  null  yes  no   +50 defense, whole full realm, capped
subjugate         Subjugate           targeted    -  1     yes  no   gate: target home <= 25%; certain
incorporate       Incorporate         targeted    -  1     yes  no   own vassal; realm >= 4; certain
assassinate-ruler Assassinate ruler   targeted    -  1     yes  no   kills ruler; successor at 0 leadership
bodyguard         Bodyguard           untargeted  S  1     yes  no   unchanged, secret, only guard
found-settlement  Found a settlement  targeted    -  1     yes  no   cost 1 wealth; income only (bar rider deleted)
pay-military-tribute Pay tribute      untargeted  -  null  no   yes  coins only, forgiven shortfall
turnip-harvest    Turnip harvest      untargeted  -  null  no   no   offer 3 from harvest pool, pick 1 or skip
```

Dropped: fortify, alliance, extended-diplomacy, distrustful-neighbour, seeds-of-revolt,
revolt, take-hostage, mighty-ruler, seat-of-power, population-boom. New exports:
`BUILDS: Record<"warpath" | "pestilence", readonly string[]>` (warpath: raid,
great-raid, favourable-omens, war-council; pestilence: spread-disease,
localized-outbreak, miasma, plague, foul-winds), `NEUTRAL_POOL: readonly string[]`
(hillfort, harvest-feast, subjugate, incorporate, assassinate-ruler, bodyguard,
found-settlement), `ATTACK_CARDS: ReadonlySet<string>` (raid, great-raid - what omens
double), `startingDeck(): string[]` returning
`["raid","raid","raid","raid","raid","grow-crops"]`. GUARDS shrinks to
`{ bodyguard: "assassinate-ruler" }`. DOUBLABLE_CARDS, FAN_OUT_CARDS, DEFAULT_DECK,
buildDeck, buildAiDeck, DECK_SIZE, STARTING_KNOWN_CARDS, ACQUIRABLE_CARDS all retire.
TRIBUTE_CARDS stays. Card text: lowercase common nouns, `textSegments` wherever text
names another card (favourable-omens names Raid/Great raid; miasma names Plague; etc.).

**Sub-step B - playability.ts.** Keep: RulesView (new shape), Guards/holdsGuard,
Omens type, omensHeld, settlement trio (allowance = flat SETTLEMENT_BASE_CAP),
wealthOf/wealthIncomeFor, reachOf, ESCAPE_RESPITE_TURNS, respiteExpiry, FailureRisk/
failureRiskOf (guards-only, unchanged), playableSet/cardBlockReason/handBlockReason/
isCardPlayable/validTargetsFor/targetEligibilityFor (rebuilt), incorporateRealmGate
(constant becomes local `INCORPORATE_REALM_GATE = 4`). Delete: SUBJUGATE_THRESHOLD,
REVOLT_BASE_THRESHOLD, PACT_MIGHT_BONUS, pact*/leadsIn/overlordGrip/poachSurchargeOn/
raidYield/raidGainFor/borderStrength(as Might)/gripPartsOn/subjugationGripOn/
subjugationRequirement/revoltRequirement/threatsTo/subjugationRaceFor/
prowessReductionFor/PROWESS_PER_REDUCTION/passiveFortifyFor/PASSIVE_PER_LANDS/
seatOf/SEAT_*/HOSTAGE_RETURN_TRIBUTES/omenMultiplier(is rebuilt). New:

```ts
export function attackReach(view: RulesView, actor: string): Set<string>;
export function borderPolygonsOf(view: RulesView, actor: string): Set<string>;
export function attackMultiplier(view: { omens: Omens }, actor: string): number;   // 2 ** omens
export function plagueMultiplier(view: { miasma: Omens }, actor: string): number;  // 2 ** miasma
export function attackDamageFor(view: RulesView, actor: string, cardId: string):
  { damage: number; multiplier: number };  // (base + leadership) * multiplier
export function plagueDamageOn(view: RulesView, actor: string, polygon: string): number;
export function outbreakPolygons(view: RulesView, actor: string, target: string): string[];
```

TargetBlockReason union becomes: `{ code: "gate-closed"; defense: number; required:
number }` (Subjugate; required = floor(0.25 * max)) | `{ code: "respite"; expiresTurn }`
| `{ code: "liege" }` | `{ code: "already-vassal" }` | `{ code: "not-your-vassal" }` |
`{ code: "self" }` | `{ code: "incorporated" }` | `{ code: "own-realm" }` (attack/
disease card aimed into own annexed lands) | `{ code: "needs-population"; have;
allowance }` | `{ code: "no-free-site" }`. CardBlockReason keeps forced-first /
needs-overlord / already-held / cannot-afford / realm-too-small / no-target /
unavailable; drops revolt-*/hostage-held/vassal-no-seat/already-seat. Target sets:
raid + spread-disease target `attackReach`; hillfort targets own full realm;
localized-outbreak targets `attackReach` (its splash resolves at play);
found-settlement keeps its inward full-realm logic; subjugate/assassinate-ruler/
incorporate keep faction-level relevance (reachOf / own-vassal).

**Sub-step C - game.ts.** GameEventType becomes:
`draw | play | reshuffle | discard | subjugated | released | incorporated |
independence | tribute | settled | damaged | healed | disease-spread | plagued |
winds-shifted | harvest-earned | harvest-picked | victory | defeat | unified |
surrendered`. GameEvent: keep turn/playerId/type/cardId/targetFactionId/
overlordFactionId/formerOverlordFactionId/wealth/prevented/consequence/actorRuler/
targetRuler/successorRuler/readings; `amount` now means "how far this event moved the
named polygon's defense (damaged/healed/plagued) or the actor's stacks on it
(disease-spread/winds-shifted), or the leadership gained (war-council play)"; drop
pactAgainst/affected/empowered. `nestsUnderItsPlay`: damaged/healed/disease-spread/
plagued/winds-shifted/subjugated/released/incorporated/tribute/settled/
harvest-earned/harvest-picked true; independence false when clock-driven (it is logged
from beginTurn, which never opens with a play - same reasoning as pact-lapsed);
endings false. `beginTurn`: FIRST the independence check - if the current seat has an
overlord and `independenceGateOpen`, delete the overlord edge, strip tribute cards,
stamp the respite, push `independence` - then reshuffle/draw as today, then wealth
income (garrison tick, pact and seat sweeps deleted; respite sweep stays).
`chooseDeck` becomes `chooseBuild(state, build)` stamping `humanStrategy`;
`pickFaction` deals `startingDeck()` to every seat, rolls one rng draw per AI seat for
its strategy, stamps `strategy` on each PlayerState. `playCard` branch table:

- `raid`: `attackDamageFor` on the target polygon; spend omens stack; `damaged` event
  (amount = damage dealt, i.e. min(damage, defense before)).
- `great-raid`: same damage to every `borderPolygonsOf` polygon; one `damaged` per
  polygon actually damaged; spends omens.
- `favourable-omens` / `miasma`: +1 to the respective reserve.
- `war-council`: ruler.leadership += 50; `amount: 50` on the play event.
- `spread-disease`: addDisease target +1; `disease-spread` event (amount 1).
- `localized-outbreak`: +1 own stack on every `outbreakPolygons` neighbour;
  one `disease-spread` per polygon.
- `plague`: for each polygon holding own stacks: damage = stacks x 100 x
  plagueMultiplier; `plagued` event per polygon (amount = damage); then
  clearDiseaseOf(actor); spends miasma.
- `foul-winds`: transferAllDiseaseTo(actor); one `winds-shifted` per polygon whose
  ownership moved (amount = stacks gained there).
- `hillfort` / `harvest-feast`: applyHeal; `healed` event per polygon that actually
  moved.
- `subjugate` / `incorporate`: landing halves as today minus hostages and the Might
  reset (no amount on `subjugated`).
- `assassinate-ruler`: guard branch as today; on landing, replaceRuler only - no
  levelling, no amount.
- `bodyguard`: guard posting, unchanged.
- `found-settlement`: settlements + settled event; boom spend deleted.
- `pay-military-tribute`: coins only (see decisions).
- `turnip-harvest`: resolve `opts.harvest` or `autoHarvestChoice`; on a pick, shuffle
  the card into the deck and push `harvest-picked` (cardId); on skip, nothing.
- `grow-crops`: for EVERY seat, `turnips[faction] + 1`; at 5, reset to 0, shuffle a
  turnip-harvest into the deck, push `harvest-earned`.

Endings block: keep incorporated-human defeat, victory via fullRealmOf >= 55%, rival
unification; `isStranded` and the stranded ending are deleted. Delete: assassinate
helper's levelMight, stripRevolt (stripVassalCards keeps only tribute), hostage
plumbing, alliances/diplomacyBoost/booms/hostages/seats/empoweredCardId state fields
and their sweeps. humanDeck field becomes `humanStrategy: "warpath" | "pestilence"`.

**Sub-step D - relations.ts** keeps: Overlords/Incorporated types, realmOf,
overlordChainOf, realmRootOf, fullRealmOf, incorporatedRealmOf. Everything else
(Relations, bump*, leadOf, resetMight, levelMight, allianceKey, Pact, Alliances,
pactBetween, allianceActive) is deleted.

**Sub-step E - harvest.ts** rebuilt:

```ts
export type Strategy = "warpath" | "pestilence";
export type HarvestChoice = { cardId: string } | { skip: true };
export function harvestPool(player: PlayerState): string[];
  // BUILDS[player.strategy] + NEUTRAL_POOL, minus cards whose copies across
  // deck+hand+discard have reached maxPerDeck (null = uncapped).
export function rollHarvestOffer(player: PlayerState, rng: Rng): string[];
  // 3 distinct cards, uniform without replacement, EXACTLY 3 rng draws always.
export function autoHarvestChoice(player: PlayerState, rng: Rng): HarvestChoice;
  // rolls the same 3 draws, picks by HARVEST_PRIORITY[strategy] order
  // (subjugate first while none held), skip only when the offer is empty.
export const HARVEST_PRIORITY: Record<Strategy, readonly string[]>;
  // warpath: war-council, raid, favourable-omens, great-raid, then neutrals;
  // pestilence: spread-disease, plague, localized-outbreak, miasma, foul-winds,
  // then neutrals. Neutrals ordered by the heal-need test: hillfort/harvest-feast
  // first while any own polygon sits under 50%, else last.
```

**Sub-step F - ai.ts.** `chooseAction` rebuilt on the spec's shared spine 1-11 with
strategy branch 6 (warpath / pestilence sub-policies as specced, both preceded by
vassal suppression: an own vassal within one heal of its 75% gate is raided/plagued
before any outward move). POLICY_COVERAGE rewritten naming a branch for all 19 cards.
Helper shape: `gateGapOf(view, faction) = defenseOf(home) - floor(0.25 * max)`,
"within N attacks" = gap <= N * attackDamageFor. aiTakeTurn unchanged.

**Sub-step G - standings.ts** rebuilt as the defense/disease walk. `WalkCtx` becomes
`{ defense(polygon): number; diseaseOf(polygon, owner): number;
factionOf(playerId): string | undefined }`. `walkStandings(events, ctx)` returns
per-event `{ polygon: string; track: "defense" | "disease"; before: number; after:
number }[]`, walking backwards from current values off each event's `amount`
(damaged/plagued subtract, healed adds, disease-spread/winds-shifted add stacks).
view.ts: `standingChangeText` becomes `impactSuffix` rendering
`Defense -150 -> 450` / `Disease +1 -> 3`; formatLead retires with the badges.

**Sub-step H - rules/meta/xp/packs.** rules.ts: RULE_AXES loses the `copies` axis,
`RuleSelections` becomes `{ turn: "standard" | "unlimited" }`, copiesAllowed deleted
(mergeRules silently drops stored `copies` picks - the unknown-axis rule). meta.ts
keeps MetaStorage/memoryStorage/load-save pattern and gains
`loadBuildPref/saveBuildPref` (a `Strategy`, defaulting warpath). xp.ts and packs.ts
deleted; the XP/pack/postmortem-bar surfaces in hud.ts/main.ts go with them.

**Sub-step I - deck-screen.ts** becomes the build picker: two tiles, each naming its
build and listing its four/five cards with full rules text (segments), the rules
button + modal (turn axis only), and Choose your lands. `onStart(build: Strategy)`.
No packs, no collection line, no counter.

**Sub-step J - surfaces.** notices.ts: NOTICE_RULES rewritten over the new
GameEventType set - modal-worthy: subjugated/released/incorporated/independence (both
sides), damaged/plagued when the human's realm is hit, harvest-earned (own),
disease-spread onto the human's realm; silent: draw/reshuffle/discard/healed/
winds-shifted elsewhere/settled(other)/tribute(other)/harvest-picked(other) - each
entry writes down why, as today. hud.ts: impactText renders the walk's suffixes; the
own-faction readout adds leadership and the turnip counter (n of 5); the reverse-
subjugation bar, threat lines, pact lines, XP bar go. main.ts: map badges become
`defense/max` coloured by gateBandOf (style.css: three band colours; the open band
pops), disease pips one per stack in owner's colour; hover breakdown rebuilt (defense,
bands, disease owners); log filter/pin logic unchanged structurally. panel.ts and
target-explanations.ts: rebuilt over the new block reasons (out of reach, gate not
open with both numbers, own realm, at cap, cannot afford). view.ts: StandingRow loses
passivePerTurn; restiveVassalOf/seatHolderOf deleted.

**Sub-step K - net.** PROTOCOL_VERSION = 2; `lobby-guest` = `{ type: "lobby-guest";
build: Strategy; factionId: string }`; host builds the guest's starting deck and
stamps its strategy; NetAction play arm gains `harvest?: HarvestChoice`;
`validateAction` additionally refuses a harvest payload naming a card outside the
host-recomputed offer pool... trust model stays races-not-malice, so the check is
`harvestPool` membership only. net-host applies `opts.harvest` when relaying;
net-guest UI rolls its offer locally from the broadcast state. `guestPhaseView` drops
the stranded comment. net-codec untouched (new stores are plain Records).

**Sub-step L - boot-params.** BOOT_KEYS = seed, screen, faction, hand, turns, wealth,
popups, rules, build, defense, disease, leadership, turnips. New parsers:
`build=warpath|pestilence` (unknown -> default), `defense=polygonId:value;...`,
`disease=polygonId:factionId:count;...`, `leadership=factionId:N`, `turnips=N`
(0..4 clamp). rel=/deck=/known=/xp= deleted; applyBootMeta deleted; the deck screen
boot stop (`screen=deck`) now lands on the build picker. Overrides apply after the
fast-forward, clamped by defenseMax. Update the AGENTS.md boot-params section to
match (same commit).

**Sub-step M - sim.ts/scenarios.ts compile-level rework.** Deck arms become build
arms (all-warpath, all-pestilence, mixed); metrics re-expressed over defense damage
(targeting bias = damage per polygon, stalemate unchanged conceptually); scenario
expectations marked stale (bands re-captured in Task 3; scenarios.test and sim.test
are excluded from `npm test`, so Task 2 only needs them to COMPILE).

**Sub-step N - tests.** Rewrite/delete per file: cards.test (new roster literals,
secret==GUARDS identity holds, costed set = {found-settlement: 1}, all-common rarity
conformance, BUILDS/NEUTRAL_POOL cover every deck-buildable card exactly once);
game.test (gates at boundaries via defense overrides, damage formula with leadership
and omens stacking x2/x4, plague ownership, foul winds, turnip counter at 5, harvest
pick shuffles in, independence at own turn start + respite, tribute coins-only,
starting decks); playability.test (attackReach incl. vassal exception, gate legality,
block reasons); ai.test (spine order, both strategy branches, POLICY_COVERAGE
completeness); standings.test (walk vs replayed defense values over seeded games);
notices.test (registry completeness over new set); naming-convention.test (drives new
event set); harvest.test (pool gating by maxPerDeck, 3-draw contract, skip, priority
auto-pick); boot-params.test (new params); net-*.test (build handshake, harvest over
the wire, version refuse); deck-screen.test (build picker); rules.test (single axis,
copies pick dropped); hud/panel/target-explanations/view tests updated; delete
xp/packs/meta tests (fold MetaStorage round-trip into rules.test's prefs coverage);
rng-isolation re-pinned (new draw contract: strategy rolls + shuffles + harvest
draws).

- [ ] **Step 1:** Sub-steps A-D (cards, playability, game, relations) with their tests
  rewritten alongside; run the engine-side suites until green.
- [ ] **Step 2:** Sub-steps E-G (harvest, ai, standings) + tests green.
- [ ] **Step 3:** Sub-steps H-I (rules/meta/xp/packs retirement, build picker) + tests.
- [ ] **Step 4:** Sub-steps J-L (notices/hud/main/panel/target-explanations/view/
  map-render/style, net, boot-params) + tests.
- [ ] **Step 5:** Sub-step M-N sweep; `npm test` fully green; `npm run build` green;
  `npm run lint` clean.
- [ ] **Step 6:** Commit: `feat(defense-score): the flip - defense scores, two builds,
  harvest acquisition, meta retired`

### Task 3: Simulation baselines and balance metrics re-captured

**Files:**
- Modify: `src/sim.ts`, `src/scenarios.ts`, `scripts/balance.ts`,
  `scripts/capture-sim-baseline.ts`, `tests/fixtures/*`, `tests/sim.test.ts`,
  `tests/scenarios.test.ts`, `tests/baseline-config.ts`
- Delete: `scripts/rarity.ts` reference from the workflow docs if it no longer runs
  (script itself may stay; it is not run for this roster)

- [ ] **Step 1:** Re-capture the sim baseline fixtures (`npm run capture:baseline`)
  and commit the new numbers as-is - no tuning against the old bands (they measured a
  different game).
- [ ] **Step 2:** Re-express scenario expectations: keep the scenario NAMES and the
  shape of the checks, set bands from the captured runs, and record in the scenario
  comments that these are post-flip baselines, not targets.
- [ ] **Step 3:** `npm run test:all` and `npm run balance` complete; read the report
  for red flags (a never-played card, a 100%-dominant card) and report them as
  playtest notes rather than tuning.
- [ ] **Step 4:** Commit: `test(defense-score): re-captured sim and scenario baselines`

### Task 4: Browser verification and handoff

- [ ] **Step 1:** `npm run dev` from the prototype; boot URLs:
  `?screen=deck` (build picker), `?seed=7&faction=selonians&build=warpath&turns=5`,
  `?build=pestilence&hand=plague&disease=talava:selonians:3`,
  `?faction=selonians&defense=selija:100&turns=1` (watch a rival subjugate through the
  open gate), a two-tab multiplayer lobby. Read every screenshot's text.
- [ ] **Step 2:** Update `02-balticmap/CLAUDE.md`: boot-params section (new params),
  the card-rule section (rarity pass suspended, harvest is the discovery route), and
  the "AI's round" section's suffix example to the Defense form.
- [ ] **Step 3:** Report to the user: what to play, what would look wrong (per the
  repo card rule: the playtest judgement is theirs), and ask about merging.

## Self-Review Notes

- Spec coverage: removal list (sec "What is removed") -> sub-steps B/C/D/H; defense
  table -> Task 1; builds -> A/E/F; neutrals -> A/C; decks -> C (startingDeck)/I;
  AI -> F; UI -> J; boot params -> L; multiplayer -> K; tests -> N; sim -> M/Task 3.
- Deliberate deviations from the skill's letter: Task 2 is one commit because the
  test suite pins the old world end-to-end (packs.test refuses an all-common roster);
  intermediate green commits would need throwaway dual-world shims.
- Deviations from the spec's letter, all named in "Decisions": tribute coins-only,
  turnip counter stored, harvestMultiplier retired, overlord-prohibited dropped.

# Defense score rules - removing Might (2026-08-08)

Might goes away entirely. In its place every polygon carries a defense score,
sized from its population, and every hostile card either damages that score or
sets up damage to it. Subjugation and independence become thresholds on the
score. The card roster is rebuilt into two named builds plus neutrals, decks
start minimal and grow through the turnip harvest, and the AI plays one of the
two builds knowingly.

No balance pass ships with this. Every new and changed card is `common`, the
constants below are ballpark, and `npm run balance` / scenario baselines are
re-captured after implementation, not tuned. Feasibility is checked by
arithmetic only (see "Numbers" at the end).

## What is removed

- The pairwise Might store (`relations.ts`): `bumpMight*`, `leadOf`,
  `leadsIn`, `resetMight`, `levelMight`. `relations.ts` keeps only the realm
  walks (`realmOf`, `fullRealmOf`, `overlordChainOf`, `realmRootOf`,
  `incorporatedRealmOf`) and the vassal/incorporation types.
- The grip / subjugation bar in `playability.ts`: `SUBJUGATE_THRESHOLD`,
  `gripPartsOn`, `subjugationRequirement`, `revoltRequirement`, the poach
  surcharge, prowess reduction, the settlement and seat riders.
- Alliances and pacts: the whole `Alliances` store, pact bonuses,
  `allianceActive`. Alliance, Extended diplomacy and Distrustful neighbour
  leave the roster (Distrustful neighbour guards a card that no longer
  exists).
- The revolt loop: Seeds of revolt, Revolt, Take hostage, `hostages`.
  Independence is a threshold now (below).
- Cards denominated in the Might bar: Raid (rebuilt, see below), Fortify,
  Mighty ruler, Seat of power, Population boom.
- The meta progression: XP, levels, packs, `knownCards`, the deck-building
  screen's card picker. Card acquisition moves in-run (turnip harvest,
  below). The deck screen becomes a build picker.
- Surfaces denominated in Might: the `(Might +1 -> 2)` log/modal suffixes and
  the `standings.ts` backwards walk, the map lead badges, the `rel=` boot
  param, the reverse-subjugation bar.

Untouched: the wealth economy (income per settlement, tribute, costed cards),
the Incorporate loyalty clock, rulers and succession, the win condition (map
share via `fullRealmOf`), the turn structure axes, the activity log / notices
architecture, timed statuses (`timed.ts`).

## Defense score

Each polygon has `defenseMax`, static, and `defense`, current, floored at 0
and capped at `defenseMax`. `defenseMax = population / 50` from the map data's
existing `population` field (the 1184 estimates):

| defenseMax | Polygons |
|---|---|
| 1800 | Eastern Aukstaitija |
| 1400 | Zemaitija |
| 1200 | Lietuva |
| 900 | Kursa |
| 700 | Dainava, Jersika, Semba, Suduva, Virumaa |
| 600 | Notanga, Pamede, Talava, Ugandi, Warmi, Zemgale |
| 500 | Jarvamaa, Laanemaa, Livzeme, Nadrawa |
| 400 | Sakala |
| 300 | Galinda, Harjumaa, Ravala, Saaremaa, Selija |
| 200 | Pilsotas |

Scores are per polygon, not per faction. A realm with vassals or incorporated
lands has one score per member polygon, and attacks pick a polygon in reach,
not a faction. Reach is: polygons bordering the attacker's full realm, PLUS
the polygons of the attacker's own vassals - a lord may raid or sicken its
vassals to hold them under the independence gate, and without that exception
vassalage could never be kept. Nothing special happens at 0; low defense only
opens the gates below.

There is no passive regeneration in this pass. Recovery comes from the
neutral heal cards. A later pass may add regeneration.

### Subjugation gate

Subjugate targets a faction and is legal when the target's HOME polygon is at
or below 25% of its `defenseMax`. No lead requirement, no grip bar, and no
failure roll: main has since removed the poach coin flip (Subjugate and
Incorporate never fail), and this design keeps both certain. An open gate is
the whole requirement, poach or not.

### Independence gate

A vassal whose home polygon has climbed back to 75% of `defenseMax` or above
regains independence automatically at the start of its own turn. The existing
2-turn escape respite applies, exactly as a Revolt used to grant it. The
consequence is deliberate: an overlord must keep beating its vassals down or
lose them - vassalage is upkeep now, which is the role Take hostage used to
play.

`isStranded` retires with the revolt loop: every vassal's harvest pool holds
the heal cards, so a route to 75% always exists and a dead-end vassalage is
no longer possible.

## Build A - Warpath

Leadership lives on the `Ruler` record where `prowess` lives today (rename,
same lifecycle): `replaceRuler` builds the successor at 0, so an
assassination resets the stack for free. Attack damage is
`base + leadership * LEADERSHIP_MULT`.

- **Raid** (targeted, rebuilt): deal `150 + leadership` damage to one polygon
  in reach. Keeps its name because it keeps its verb; everything else about
  the old card is gone.
- **Great raid** (untargeted): deal `75 + leadership` damage to EVERY polygon
  bordering the actor's full realm.
- **Favourable omens** (untargeted, rebuilt): the next attack card you play -
  Raid or Great raid - deals double damage. Stacks (x4 with two readings),
  spent by the next attack, exactly the reserve shape `omens` has today.
- **War council** (untargeted, stacking): your ruler gains +50 leadership.
  Play it twice, +100. Dies with the ruler.

## Build B - Pestilence

Disease stacks are OWNED: the store is
`disease: Record<polygonId, Record<factionId, count>>`. Two rivals can sicken
the same polygon; each owns their own count. Stacks are public state, visible
on the map, and persist until cashed or stolen.

- **Spread disease** (targeted): +1 of your disease on one polygon in reach.
- **Localized outbreak** (targeted): +1 of your disease on every neighbor of
  the target polygon, EXCEPT polygons of your own full realm. Indiscriminate
  otherwise - third parties are hit.
- **Miasma** (untargeted): your next Plague counts each of your stacks
  double. Stacks like omens readings.
- **Plague** (untargeted): every polygon holding your disease takes
  `100 * your stacks there` damage, then your stacks reset to 0 everywhere.
  Other owners' stacks on the same polygons are untouched.
- **Foul winds** (untargeted): every disease stack on every polygon, whoever
  owns it, becomes yours.

## Neutral cards

Fit neither build; reachable by every deck through the harvest pool.

- **Hillfort** (targeted, new): +150 defense to one polygon of your full
  realm, capped at its max.
- **Harvest feast** (untargeted, new): +50 defense to every polygon of your
  full realm, capped at max.
- **Subjugate** (kept): new gate as above; certain.
- **Incorporate** (kept): certain, as main now has it - the loyalty clock is
  already gone. Its realm-size legality gate (playable once your full realm
  holds 4 lands) stays, but the 4 becomes Incorporate's own constant:
  `REVOLT_BASE_THRESHOLD`, which it borrowed, retires with Revolt.
- **Assassinate ruler** (kept, rebuilt): kills the target ruler; the
  successor starts at 0 leadership. This is the counter to Warpath and the
  reason enemies want assassins. Still guarded by Bodyguard.
- **Bodyguard** (kept): unchanged, still secret, still the only guard.
- **Found a settlement** (kept): wealth income only; its Might-bar rider is
  deleted. Marginal for now, kept knowingly.
- **Grow turnips** (kept): the filler and the harvest counter.
- **Pay tribute** (kept): injection-only, forced, unchanged.
- **Turnip harvest** (kept, rebuilt): see below.

Dropped outright: Fortify, Alliance, Extended diplomacy, Distrustful
neighbour, Seeds of revolt, Revolt, Take hostage, Mighty ruler, Seat of
power, Population boom.

Every card in the new roster is `rarity: "common"`, hand-tagged. The rarity
conformance test relaxes to accept that for this roster; `npm run rarity`
is not run. Rarity tiers and bands stay in the code for a later pass.

## Decks: start minimal, grow through turnips

- Every seat, human and AI, starts with the same deck: 5x Raid + 1x Grow
  turnips. No DECK_SIZE, no padding; the deck is exactly what you hold.
- Every seat picks a BUILD before the game: `warpath` or `pestilence`. The
  human picks on the deck screen, which becomes a two-tile build picker
  (plus the existing rules picker). AI seats roll theirs, seeded.
- Every 5th play of Grow turnips (static threshold, no ramp) shuffles one
  Turnip harvest card into that seat's deck. The counter resets and counts
  again; the loop repeats forever.
- Playing Turnip harvest offers 3 random cards drawn from the seat's harvest
  pool: the chosen build's cards plus the deck-buildable neutrals (Pay
  tribute and Turnip harvest itself are injection-only and never offered).
  Pick 1 - it is shuffled into your deck permanently - or skip and gain
  nothing. Skipping is a real choice: it keeps the deck lean.
- `maxPerDeck` still gates the offer: a card at its cap is not offered.
  Build cards and heals are uncapped (leadership wants repeat War councils;
  a growing deck wants repeat Raids); Subjugate, Incorporate, Assassinate
  ruler, Bodyguard, Foul winds and Found a settlement stay 1 per deck.

Discovery route (the repo card rule): the harvest pool IS the route. Every
deck-buildable card is reachable by every seat through its build choice plus
the neutrals; the two build sets are mutually exclusive by design, and the
build picker names both sets up front so the player knows what they chose
against. Witness-learning and packs retire with the meta system.

Pacing note, stated rather than hidden: a 6-card deck holding one turnip
reaches its 5th turnip play slowly if raids are always preferred. The AI
policy plays turnips on genuinely spare turns and the human is nudged the
same way by the harvest bar. If the first harvest lands too late in
playtesting, the knob is the threshold (5) or the starting turnip count -
one line each, and explicitly a later pass.

## AI: two known strategies

Each AI seat's build choice is stored on `PlayerState` as `strategy:
"warpath" | "pestilence"` (the human's too - it drives their harvest pool).
`chooseAction` branches on it, and `POLICY_COVERAGE` is rewritten so every
card in the new roster names its branch. Shared spine, in priority order:

1. Forced tribute (unchanged).
2. Subjugate any faction whose gate is open - the certain gain outranks
   everything voluntary.
3. Incorporate the best permanent gain net of freed vassals. The scoring
   loses its odds discount - the roll no longer exists - and keeps the
   kept-lands-minus-freed-subtrees arithmetic.
4. Assassinate the rival with the highest leadership, when that leadership
   makes them a threat in reach and no bodyguard risk is known. Both
   strategies share this branch; it is the check on Warpath.
5. Heal toward a gate: while a vassal, Hillfort / Harvest feast the home
   polygon toward 75%; while free and under 50%, heal the most-damaged
   polygon. Escape outranks aggression for a vassal, as Revolt used to.
6. Strategy branch (below).
7. Bodyguard while own leadership is the highest on the board (you are now
   the assassination target).
8. Found a settlement on a spare turn (income).
9. Grow turnips on a spare turn (feeds the harvest).
10. Turnip harvest whenever held (auto: pick by the strategy's pool
    priority, below).
11. First playable card as last resort, as today.

Warpath branch (6): War council while no target's gate is within 2 attacks
(build first); Favourable omens when the doubled attack would open a gate or
one-shot a small polygon; Raid the polygon nearest its subjugation gate;
Great raid when 2 or more bordering polygons would be pushed at or under
their gates, or when 3 or more rivals border the realm and leadership is
stacked.

Both branches place vassal suppression first within their step: a rival's
play is worth less than keeping a vassal, so a vassal of the actor's own
within one heal card of its 75% gate is raided (warpath) or plagued
(pestilence) before any outward move.

Pestilence branch (6): Foul winds when rivals' stacks exceed own; Spread
disease on the polygon nearest its gate; Localized outbreak on the junction
polygon whose non-own neighbor count is highest; Miasma when held stacks
would then push a gate open; Plague when it opens at least one gate or
total damage exceeds a Raid's worth.

Harvest pick priority (10): warpath prefers War council, Raid, Favourable
omens, Great raid, then neutrals by the heal-need test; pestilence prefers
Spread disease, Plague, Localized outbreak, Miasma, Foul winds, then
neutrals. Subjugate is taken first by either strategy while none is in the
deck. Skip only when every offer is at cap.

## UI and surfaces

- Map badges: each polygon shows `defense/max` (e.g. `450/700`), coloured by
  the band it sits in (above 75%, between gates, at or under 25% - the
  subjugation-open state is the one that must pop). Disease shows as one pip
  per stack in the owner's faction colour.
- Log and modal suffixes: `(Might +1 -> 2)` becomes `(Defense -150 -> 450)`
  on the damaged polygon's line, and `(Disease +1 -> 3)` for stacks. Same
  single-walk architecture: the batch walk in `standings.ts` is rebuilt over
  defense and disease deltas, and the modal and log still cannot disagree.
- Events: new `GameEventType`s for damage, heal, disease spread, plague,
  foul winds, harvest choice, independence-regained; each gets its
  `NOTICE_RULES` entry and a `nestsUnderItsPlay` classification. The
  `independence-regained` event replaces `reclaimed`-via-Revolt and is
  notice-worthy for the freed side and the lord.
- Target explanations: rebuilt over the new legality reasons (out of reach,
  gate not open, own realm, at cap, cannot afford).
- Boot params: `rel=` retires. New: `build=warpath|pestilence`,
  `defense=polygonId:value;...`, `disease=polygonId:factionId:count;...`,
  `leadership=factionId:N`, `turnips=N` (harvest counter). `deck=` retires
  with the picker; `hand=`, `seed=`, `faction=`, `turns=`, `rules=` stay.
- HUD own-faction readout: adds leadership and the turnip counter (n of 5).

## Multiplayer

The peerjs host-authoritative multiplayer is landed and this design must keep
working over it. The engine-side rule holds by construction - every rule
change lives in `game.ts`/`playability.ts`, which only the host runs, and
guests render broadcast state - but four contact points change:

- **Card set handshake**: `cardSetHash()` fingerprints the roster, so a deploy
  of this design and a pre-design deploy refuse each other politely at the
  lobby. Free; nothing to do beyond bumping `PROTOCOL_VERSION` for the
  message changes below.
- **Lobby**: `lobby-guest` carries `deck: string[]` from the guest's
  collection. Decks and collections retire, so it carries
  `build: "warpath" | "pestilence"` instead, and the host builds the guest's
  starting deck (5x Raid + 1x Grow turnips) itself. The DECK_SIZE legality
  check on the guest's deck retires with it.
- **The harvest choice crosses the wire**. Today it never does: the Turnip
  harvest injection is host-seat-only, so `NetAction` carries no choice and
  that is sound. This design gives every seat harvests, so a guest can hold
  and play one. The choice rides the play action - `NetAction`'s `play` arm
  gains the `HarvestChoice`-shaped payload, the same way the choice already
  rides `playCard`'s opts locally, offer included (the offer pool is the
  chooser's build plus neutrals, which the host can recompute to validate).
  Same trust model as the rest of the protocol: races and bugs, not malice.
- **State sync**: defense, disease, leadership (on rulers), per-seat
  strategy and the turnip counters are all plain records on `GameState`, so
  they serialize through `net-codec` unchanged; `overlords` stays the one
  Map the codec special-cases. `guestPhaseView` loses its `stranded`
  carve-out along with `isStranded`.

## Alignment with sibling work on main

Two rule changes landed beside this design and are folded in above rather
than contradicted: Subjugate and Incorporate never fail (the poach roll, the
loyalty clock and the `FailureRisk` roll arm are already gone; this design
keeps both cards certain), and the unlimited-turn auto-end and hoverable
card-reference segments, which are orthogonal and untouched. The deck-copies
rule axis (`copies: single | double`) retires with the deck picker: with a
growing deck there is no build-time copy count to cap, and `maxPerDeck`
gating harvest offers is the successor rule. Removing a rule axis follows
the `mergeRules` unknown-axis drop, so stored prefs naming it degrade
silently.

## Tests and simulation

- Roughly every test file touches. The pinned literals in `tests/cards.test.ts`
  (secret set, costed set, guard table), `POLICY_COVERAGE` completeness,
  `NOTICE_RULES` exhaustiveness and the naming-convention walk all keep their
  jobs against the new roster.
- New unit coverage: gate legality at exactly 25% / 75%, damage formula with
  leadership and omens stacking, disease ownership (two owners on one
  polygon, Plague burns only the actor's), Foul winds transfer, harvest
  threshold and offer filtering, independence trigger and respite.
- `scenarios.ts` pacing bands and the sim baselines are invalidated:
  re-capture after implementation and commit the new numbers as the
  baseline. No tuning against the old bands - they measured a different
  game.
- `npm run balance` keeps play-share, never-played and waste metrics;
  targeting-bias and stalemate metrics are re-expressed over defense damage.

## Numbers (all constants, one place)

| Constant | Value |
|---|---|
| defenseMax | population / 50 (200..1800) |
| Subjugation gate | defense <= 25% of max (home polygon) |
| Independence gate | defense >= 75% of max (home polygon, own turn start) |
| Raid damage | 150 + leadership |
| Great raid damage | 75 + leadership, per bordering polygon |
| War council | +50 leadership per play, resets on succession |
| LEADERSHIP_MULT | 1 (damage adds leadership x 1) |
| Favourable omens | next attack card x2, stacks multiplicatively |
| Spread disease / Outbreak | +1 stack per polygon touched |
| Plague | 100 damage per own stack, per polygon; own stacks reset |
| Miasma | next Plague counts own stacks x2, stacks multiplicatively |
| Hillfort | +150 defense, one polygon, capped |
| Harvest feast | +50 defense, whole realm, capped |
| Turnip harvest threshold | every 5 Grow turnips plays, static |
| Harvest offer | 3 cards, pick 1 or skip |
| Starting deck | 5x Raid + 1x Grow turnips, every seat |

Feasibility arithmetic (not balance): a 600 polygon falls to its 150 gate in
3 plain Raids; with two War councils (leadership 100) one Raid deals 250 and
two open the gate. Pestilence: 5 stacks on a 500 polygon is a 500 Plague, or
250 to the gate with 3 stacks and Miasma - comparable tempo. Great raid at
75 needs leadership or omens to matter against 600+ polygons, which is the
intended coupling. Pilsotas (200) is one doubled Raid from open; small lands
are meant to fall fast.

## Later passes, explicitly deferred

- Passive defense regeneration.
- Any balance tuning, rarity re-measurement, or threshold adjustment.

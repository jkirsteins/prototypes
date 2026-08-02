# Wealth: settlement income, tribute paid in coin, costed cards

Decided with the user on 2026-08-02. Every "Decided:" line below was an
explicit answer; the rest follows from the code as it stands.

## Goal

A per-faction treasury. Settlements generate wealth every round; a vassal's
tribute owes 1 per land of its realm, paid to its direct lord in wealth
before any shortfall falls back to the Might/Status bump; A feast and Found a
settlement cost wealth to play; the human's own treasury and income rate sit
beside the top status bar. Rivals' treasuries are hidden.

## What does not change

- Relations. Wealth never moves a relation counter, so `src/standings.ts`,
  the round-summary walk and `tests/standings.test.ts` are untouched - and
  staying untouched is itself the regression check.
- The tribute cards' injection lifecycle: injected on subjugation, stripped on
  every exit from vassalage, forced while in hand, hostage debt counted in
  plays. Only the resolution inside `playCard`'s tribute branch changes.
- `POLICY_COVERAGE`. Affordability is legality, so `chooseAction` never sees
  an unaffordable play and the existing branches for A feast and Found a
  settlement still name how they are chosen. Whether the AI should SAVE
  wealth is a playtest question, deliberately out of scope.

## 1. State (`src/game.ts`)

- `GameState.wealth: Record<string, number>` - faction id -> treasury.
  Absent = 0, never negative, uncapped. Shaped like `omens` and `booms`.
  Everyone starts at 0. Exposed through `viewOf` into `RulesView`.
- Boot: `newGame` starts it `{}`.

## 2. Income (`beginTurn`)

When a faction's turn begins it earns 1 wealth per settlement standing in its
own realm, beside the garrison tick and the loyalty clock that already live
there.

- Decided: ALL settlements count, via `settlementsIn` (the free starting one
  plus founded ones), so a one-land faction earns 1 per round baseline and
  Found a settlement raises the rate.
- "Own realm" is the faction's land plus lands incorporated into it (entries
  of `incorporated` owned by it). Deliberately NOT vassal lands: a vassal is a
  live seat earning into its own treasury, and tribute is the channel by which
  its wealth reaches the lord. Getting this wrong double-taxes vassal lands.
- Decided: silent, no `GameEvent` and no notice. Income moves no relation
  counter so no walk needs it, and one line per faction per round is exactly
  the noise the log filter exists to remove. The HUD rate readout (section 5)
  is where the number lives.

## 3. Tribute owes 1 per land, pays wealth first (`playCard` tribute branch)

Decided: a tribute play owes 1 PER LAND of the payer's own realm - itself plus
lands incorporated into it, the exact set section 2's income sums over, so you
pay 1 per land you earn from. A bare vassal owes 1, as today; a vassal holding
2 incorporated lands owes 3. Vassal lands are excluded here for the same
reason they are excluded from income: those vassals pay their own tribute.

Decided: mixed payment, wealth first. The play pays `min(owed, treasury)` in
wealth, transferred vassal -> direct lord, and only the uncovered remainder
lands as the track bump. A treasury of 2 against 3 owed pays 2 wealth and
+1 on the track; 0 wealth against 1 owed is exactly today's play.

- Decided: omens exempt on the wealth part. Readings are spent only when the
  remainder is above 0, and they multiply the REMAINDER bump only, never the
  coins. Consequence for the code: the generic readings-spend at the top of
  `playCard` becomes conditional on the tribute branch reporting a remainder.
- Only the direct lord receives the coin - a treasury is one pot. The track
  remainder keeps today's per-pair fan-out: the lord and the lands
  incorporated into the lord gain it over the payer.
- Decided: the tribute cascade (2026-08-02 vassal-chains design section 7,
  landed as `8f0cd5e`) is REMOVED, so the wealth and track paths stay
  consistent: tribute reaches the direct lord only, on both paths. Value
  still reaches a chain's root because each link's own tribute plays pay from
  the treasury the coins landed in. Removing it deletes the
  `tribute-forwarded` event type and its entries in `NOTICE_RULES`,
  `nestsUnderItsPlay`, `walkStandings`, xp weights and the hud, plus its
  tests. The chains spec carries the reversal note.
- Hostage debt decrements per play on both paths - the card promises "pay
  tribute twice" counted in plays, whatever was owed or paid.
- Event: type stays `tribute`. It carries a new optional `wealth: number`
  (the coins paid) and keeps `track`/`amount` ONLY when a remainder moved a
  counter - both mean "moved a relation counter", and on a fully-covered
  payment nothing did. `impactText` and the notice line render the wealth
  part as a suffix alongside any standing change, e.g. `(2 wealth)` or
  `(2 wealth, Might +1 -> 2)`, so the modal and the log keep agreeing with
  `walkStandings`, which reads only `track`/`amount`.
- Card texts change to state the rule: "Forced: while a vassal, pay 1 wealth
  per land of your realm to your overlord; what your treasury cannot cover,
  grant as Might instead." (Status likewise.) The two cards are identical
  while wealth holds out and differ only in their fallback; that is accepted.
- Stated out loud, twice over: paying in wealth keeps the lord's grip from
  growing, so a solvent vassal is structurally harder to hold - and a vassal
  that incorporates now pays MORE tribute, so growing while subjugated has a
  real tax. `npm run balance` is the check that neither is degenerate
  (section 7).

## 4. Card costs (`src/cards.ts`, `src/playability.ts`)

- `CardDef.wealthCost?: number`, absent = free. Decided which cards:
  - `a-feast`: 2 wealth.
  - `found-settlement`: 1 wealth.
- One legality rule reads it: `cardBlockReason` returns a new `cannot-afford`
  reason when the actor's treasury is below the cost. `playableSet` already
  derives forced discard from block reasons, so a hand of unaffordable cards
  forces a discard with no new plumbing. `target-explanations.ts` gains the
  wording ("Needs 2 wealth; you hold 1.").
- `playCard` deducts the cost at the moment of play, unconditionally: the
  card is spent, the turn is gone, the cost is gone. (No costed card is
  guarded today; if one ever is, a prevented play still pays.)
- Rules text on both cards gains a "Costs N wealth." sentence, so the deck
  picker and tooltips carry the price with no new UI. Re-measure the picker
  tile per the CLAUDE.md rule - Found a settlement is already the longest
  card and its text grows.

## 5. Display (`src/hud.ts`, `src/style.css`)

- Decided: own faction only. A wealth readout joins the top `.status-bar`:
  "Wealth 4 (+2/turn)", the rate recomputed from state each render with the
  same realm-and-settlements sum the income tick uses (one helper, two
  callers, so the promise and the tick cannot drift).
- Dark-box rule applies: the readout declares its own `color`.
- Rivals' treasuries appear nowhere. The one public signal is the tribute log
  line: a vassal falling back to a Might tribute has visibly run dry.

## 6. Boot params (`src/boot-params.ts`)

- `wealth=N`: sets the human faction's treasury at boot. Clamped to >= 0 (the
  same `isCount` caution as `xp=`). Absent = untouched. Own faction only.
- The two browser checks it exists for: `?hand=a-feast&wealth=1` (greyed out,
  readable reason) and a vassalage with `wealth=0` (fallback line quotes a
  standing change; solvent quotes wealth).

## 7. Tests and measured gates

- `tests/game.test.ts`: income on turn begin (baseline 1, founded settlements,
  incorporated lands, vassal lands excluded); tribute owes 1 per realm land
  and a fully-covered payment moves no counter and spends no readings; mixed
  payment (2 wealth against 3 owed pays 2 coins and bumps 1, omens multiplying
  the 1); a bare broke vassal plays exactly today's +1; hostage debt works off
  per play on every path; no `tribute-forwarded` event is emitted anywhere a
  chain exists; cost deducted on play.
- `tests/cards.test.ts`: the costed set pinned to a literal, like the secret
  set, so a cost cannot appear without somebody reading this design.
- Legality tests: `cannot-afford` blocks; all-unaffordable hand forces
  discard.
- `tests/boot-params.test.ts`: `wealth=N` parses, clamps, absent -> null.
- `npm run rarity` after the costs land: both costed cards' impact
  coefficients move, and the tiers may need a re-cut. The pack test refuses
  an empty epic tier; Incorporate holds epic today, so the tier survives even
  if A feast falls.
- `npm run balance` when the work settles. The pacing bands are the gate that
  killed the Raid status rider; wealth touches pacing twice (solvent vassals
  resist grip growth, costed cards play later). Read the stalemate number and
  the never-played share for A feast and Found a settlement.

## 8. Playtest script

Pick both costed cards in the deck screen. Confirm: they grey out at 0 wealth
with a readable reason; the readout climbs by the stated rate; founding a
settlement raises the rate; via `turns=N` into a vassalage, a fully-covered
tribute's modal line names wealth and quotes no standing change, a broke
vassal's quotes only the bump, and a part-covered one shows both. What would
look wrong: a fully-covered tribute line wearing a `(Might +1 -> 2)` suffix,
a `tribute-forwarded` line surviving anywhere, income lines spamming the log,
or a balance table where A feast is never played.

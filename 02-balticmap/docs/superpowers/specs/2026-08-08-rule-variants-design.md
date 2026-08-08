# Rule variants: axes of mutually exclusive options

Date: 2026-08-08

## Goal

A rules system that lets the player swap sets of game rules before a game
starts, chosen on the deck screen and remembered from game to game. Rules are
organized as **axes**: each axis is a group of mutually exclusive options, and
the player makes exactly one pick per axis. Picks on different axes combine
freely; picks on the same axis cannot.

The first axis is **turn structure**, with two options:

- `standard` (default): today's rules. Play or discard exactly one card per
  turn; draw one card at turn start.
- `unlimited`: play any number of cards per turn. At turn start, draw until
  the hand holds 4 cards (reshuffling the discard into the deck when it runs
  dry). No discards of any kind: a hand of unplayable cards stays until the
  board changes, and the turn ends only by the explicit End turn action.

No card recalibration ships with this. `npm run balance` and the simulations
keep running standard rules. If calibration against another rule set is ever
wanted, it will be asked for by name.

## The registry: src/rules.ts

A new module owns the axes, in the same registry shape as `CARDS`:

- `RULE_AXES`: the list of axes. Each axis carries an id, a display name, its
  options, and a default option id. Each option carries an id, a display name,
  and one line of rules text for the picker.
- `RuleSelections`: a typed record of axis id to chosen option id. Typed
  literally (today `{ turn: "standard" | "unlimited" }`), not as
  `Record<string, string>`, so a choke point reading `state.rules.turn` is
  checked by tsc and a future axis extends the type.
- `DEFAULT_RULES`: one pick per axis, all defaults.

Adding a future axis means: extend `RuleSelections` and `RULE_AXES`, then
implement its choke points. The picker UI renders from the registry, so it
grows a new group with no UI work.

## State and transitions: src/game.ts

`GameState` gains `rules: RuleSelections`, stamped with `DEFAULT_RULES` in
`newGame`. A new transition `chooseRules(state, rules)` is legal only in the
`deck-building` phase, the same guard style as `chooseDeck`. Rules are
therefore frozen before the faction pick and immutable for the run.

Choke points, each a read of one axis:

- `beginTurn`. Standard keeps today's exact code path and consumes the rng
  identically - the existing drift and golden tests must not notice this
  feature exists. Unlimited replaces the single draw with a refill loop:
  while the hand holds fewer than 4 cards and deck plus discard are not both
  empty, reshuffle if the deck is dry (existing `reshuffle` event) and draw
  one card (existing `draw` event). If deck plus discard hold fewer cards
  than the shortfall, the player gets what exists.
- `playCard`. Standard stamps `playedThisTurn: true` as today. Unlimited
  leaves it false. The doc comment on `playedThisTurn` changes to mean "turn
  complete"; `advance` is untouched.
- New `endTurn(state)`. Legal only in unlimited mode, in the `playing` phase,
  on the current player's turn. Sets `playedThisTurn: true` and nothing else:
  no event and no log line, because the log already shows every play.
- Discards. `discardCard` and the forced-discard path are never offered in
  unlimited mode. End turn is the only way out of a turn, including with a
  fully dead hand. This stagnation is accepted on purpose: it is the purest
  form of the rule.

The refill target 4 matches the hand a standard-rules player decides with
(opening hand of 3 plus the turn-start draw).

## The AI: src/ai.ts, src/sim.ts, src/main.ts

The rule is symmetric: AI seats play under the same turn structure.

In unlimited mode an AI turn is a loop: run the existing `chooseAction` on
the current state, play what it picks, repeat until nothing is playable or
the phase leaves `playing`, then `endTurn`. Each iteration is the same
one-card policy consulted again on the updated state, so `POLICY_COVERAGE`
is untouched: no new cards, no new branches. A hand capped at 4 bounds the
loop naturally; a belt-and-braces iteration cap guards against a future card
that adds cards mid-turn. An AI with a dead hand ends its turn without
discarding.

## The human turn: src/main.ts, src/hud.ts

In unlimited mode `onPlayCard` plays the card but does not call
`afterHumanAction`. Input stays locked for the card's flight exactly as
today (`hud.afterPlayAnimation` still owns that window); when the flight
lands, the hand unlocks for the next play instead of handing over to the AI.

A new **End turn** button in the HUD is visible only in unlimited mode on
the human's turn, and disabled while a card is in flight. It calls `endTurn`
and then `afterHumanAction`, which advances and runs the AI chain as today.
If a play ends the run mid-turn, the existing ending flow takes over.
Discard mode never triggers in unlimited mode.

## Log and notices

No new `GameEventType`, so `NOTICE_RULES` is untouched. Each play still
opens its own batch, so consequence indentation, `.log-mine`, and the
one-line-per-event modal work unchanged; the AI round modal simply lists
more lines, one per play. The invariant noted in `src/notices.ts` (a batch
can never hold two of the player's own plays) survives: a turn holds
multiple batches, each with one play.

## The picker: src/deck-screen.ts

The deck screen gains a compact **Rules** button with a summary label beside
it. The summary is generated from `RULE_AXES` and names the selected option
per axis (for example "Rules: Unlimited plays"); it does not list the
options themselves. Both sit with the other controls outside the `.ds-deck`
scroll region, near "Choose your lands", per the layout rule that everything
the player acts on stays out of the scroll area.

The button opens a modal, the only place the options appear: one radio group
per axis, rendered from the registry, each option showing its name and its
one line of rules text. A Done button closes the modal and the summary
updates. The modal is a dark box and states its own text colour.

On "Choose your lands", `main.ts` stamps the selections with `chooseRules`
before `chooseDeck`.

## Persistence

The last-used selections persist in localStorage alongside the existing log
prefs (the "Show popups" mechanism), because a rules pick is a preference,
not progression, so it does not belong in `MetaRecord`. The deck screen
initializes its radios from the stored value; a fresh profile gets
`DEFAULT_RULES`. A stored pick naming an axis or option that no longer
exists falls back to that axis's default. Booted runs use memory storage as
today, so a boot never overwrites the real preference.

## Boot params: src/boot-params.ts

A new `rules=` param takes `axis:option` pairs separated by `;`, the `rel=`
convention: `?rules=turn:unlimited`. An unknown axis or option drops that
pair, the same rule that drops an unknown track in `rel=`. An omitted axis
gets its default. `applyBootParams` stamps the result into the built state,
so checking a mode in the browser is one URL.

## Tests

- New `tests/rules.test.ts`: every axis's default is among its options;
  option ids are unique within an axis.
- `tests/game.test.ts` additions: the unlimited refill tops the hand to 4,
  reshuffles mid-refill, draws what exists from a short deck, and emits the
  existing draw and reshuffle events; `playCard` leaves `playedThisTurn`
  false in unlimited mode; `endTurn` is legal only in unlimited mode;
  discard paths are unreachable in unlimited mode; several plays resolve in
  one turn.
- AI: in unlimited mode a turn plays until nothing is playable and then
  ends; the loop terminates.
- The standard game is bit-identical to today: the existing drift and golden
  tests pass untouched. This is the guard that the default game did not
  move.
- `tests/boot-params.test.ts`: `rules=` parsing, unknown-pair dropping, and
  the no-params-parses-to-null property.
- The naming-convention test picks up any new player-facing prose
  automatically.

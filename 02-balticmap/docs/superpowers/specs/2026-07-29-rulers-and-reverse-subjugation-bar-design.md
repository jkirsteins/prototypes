# Balticmap: Rulers and the Reverse Subjugation Bar

Date: 2026-07-29
Status: approved

## Goal

Two changes that share no code but share a cause: the interface currently
tells the player less than the rules know.

1. **Reverse subjugation bar.** A map badge shows both tracks against a single
   bar - the bar the *player* must clear. A player reading `M-9/10 S-13/10`
   concludes the enemy leading by 13 can subjugate them, when in fact that
   enemy needs a lead of 20 against the player's ten-land realm. Each track
   will show the bar belonging to whichever side leads it.

2. **Rulers.** Factions are faceless. Assassinate ruler kills nobody in
   particular and replaces nobody. Every faction gains a named ruler in the
   data model, replaced when an assassination lands, surfaced in the tooltip,
   the notices, and the activity log.

## Part 1: the reverse subjugation bar

### The asymmetry

`subjugationRequirement(view, actor, target)` is `SUBJUGATE_THRESHOLD` times
the size of the *target's* realm. It is therefore not symmetric: the bar the
player must clear against a five-land Estonian realm is 10, while the bar that
same faction must clear against the player's ten-land realm is 20. Today
`renderThreatBadges` computes the number once, in the player's direction, and
prints it on both tracks (`src/main.ts`), so the badge quotes the wrong bar
whenever the enemy is the one leading.

### Rule

Each track chooses its bar by the sign of the player's lead on that track:

| Lead on the track | Bar shown | Reading |
| --- | --- | --- |
| `n > 0` | `subjugationRequirement(view, human, other)` | you are `n` of the way to taking them |
| `n === 0` | `subjugationRequirement(view, human, other)` | nobody leads; the player's bar, as today |
| `n < 0` | `subjugationRequirement(view, other, human)` | they are `-n` of the way to taking you |

The sign already carries direction, so no extra marker is needed:
`M-9/20` reads "they are 9 of the 20 they need". A badge may legitimately
show two different denominators, which is correct rather than confusing:
Subjugate needs only one track cleared, and the two tracks can be racing
toward different targets.

Where the chosen bar is `null` - `subjugationRequirement` returns `null` when
Subjugate can never apply to that ordered pair, for instance when the other
faction is somebody's vassal and so can subjugate no one - that track shows a
bare `M-9` with no denominator. `formatLead` already does this when passed
`null`.

### Consequences

- `renderThreatBadges` currently derives the red danger border from a
  hand-rolled `grip = SUBJUGATE_THRESHOLD * humanRealm.size`. The hand-rolled
  formula goes away and `danger` is computed from the reverse bar, so the
  border and the printed number cannot disagree.

  This is a deliberate behaviour change, not just a refactor. The bare formula
  has no eligibility guards, so today a faction that could not subjugate the
  player under any circumstance still earns the red `!` when it leads far
  enough - an enemy that is itself somebody's vassal, or the player's own
  overlord, who cannot subjugate a faction it already holds. Driving the
  border from `subjugationRequirement` in the reverse direction gives those
  cases a `null` bar, and they correctly stop being marked as dangerous.
- `hoverRelationLines` (`src/view.ts`) takes `requiredLead: number | null` and
  prints one sentence, always in the player's direction. It changes to take
  both bars and print the sentence for each direction that applies:

  ```
  Might: -9/20 (they lead)
  Status: -13/20 (they lead)
  Subjugate needs a lead of 10 - their realm has 5 lands.
  They need a lead of 20 to subjugate you - your realm has 10 lands.
  ```

  The player-direction sentence keeps its current wording. The reverse
  sentence appears only when the reverse bar is non-null and they lead at
  least one track.

- `NoticeCtx.subjugationGrip()` (`src/hud.ts`) is a third copy of the same
  formula, written inline. It takes no faction argument - it answers "what
  lead does anyone need against my realm" - so it cannot simply call
  `subjugationRequirement`, whose guards are per ordered pair. The shared
  arithmetic is extracted instead:

  ```ts
  // src/playability.ts
  export function subjugationGripOn(view: RulesView, factionId: string): number;
  ```

  `subjugationRequirement` returns `subjugationGripOn(view, target)` after its
  null guards, and `subjugationGrip()` calls it directly. One formula, two
  entry points, and `subjugationGrip()` keeps returning exactly what it
  returns today.

### Selection helper

The sign-to-bar choice is a pure function, tested directly:

```ts
export function barFor(
  lead: number,
  yourBar: number | null,
  theirBar: number | null,
): number | null;
```

It lives in `src/view.ts` beside `formatLead`, and both the badge and the
tooltip call it, so the two cannot diverge.

## Part 2: rulers

### Data model

New module `src/rulers.ts`:

```ts
export interface Ruler {
  name: string;   // display name: "Kaupo", or "Rameke, son of Talivaldis"
  since: number;  // turn this ruler took over; 1 at setup
}

export type Rulers = Record<string, Ruler>;  // total over factionIds
```

`GameState` gains `rulers: Rulers`, populated for every faction id at
`pickFaction`, alongside the players.

`since` carries no mechanics today. It is in the model because ruler-specific
properties are expected later and a succession date is the field they will
hang off.

### Enforcing totality

TypeScript cannot express "a record total over a runtime faction list", so
totality is enforced by construction and by loud failure:

- `initialRulers(factionIds, ethnicities)` is the only constructor. It fills
  every id it is given.
- `rulerOf(rulers, factionId): Ruler` throws on a miss. A gap fails a test or
  a simulation rather than leaking `undefined` into a tooltip.
- `replaceRuler(rulers, factionId, turn): Rulers` is the only writer. Nothing
  else in the codebase constructs a `Ruler`.
- An invariant test runs a full seeded game to its end and asserts that every
  faction id still resolves through `rulerOf`, and that no `since` exceeds the
  current turn.

The assassination path cannot forget the succession because the Status
levelling and the replacement are one step: `assassinate(state, targetId)`
returns the new relations, the new rulers, and the two names for the event.
`playCard` calls that one function; there is no path that levels Status for
`assassinate-ruler` without also replacing the ruler.

### Ethnicity

Name pools are per ethnicity, so `rulers.ts` needs faction id to ethnicity.
`newGame(factionIds, adjacency?)` already takes optional map-derived data and
defaults it when tests pass bare faction ids. Ethnicity follows the same
shape: `newGame(factionIds, adjacency?, ethnicities?)`, defaulting every
faction to a generic pool. No existing call site changes.

`src/main.ts` passes the real mapping built from `map.json`, which already
carries `ethnicity` on every faction.

### Name generation

`src/data/ruler-names.json` holds one given-name pool per ethnicity id present
in `map.json` - estonians, livs, curonians, semigallians, selonians,
latgalians, samogitians, aukstaitians, yotvingians, prussians - plus a
`generic` pool used by tests and by any faction with no ethnicity.

Names are drawn from 12th and 13th century record where the record exists
(Henry of Livonia's chronicle, the 1219 Lithuanian treaty, the Curonian and
Prussian treaty documents). Selonian and Curonian rulers are barely attested;
those pools are filled out with names formed from the same onomastic stock and
are explicitly plausible rather than attested. Keeping every pool in one data
file means a name judged wrong later is a data fix, not a code change.

Each pool holds around twenty names. The floor is enforced by a data test: a
pool must hold at least twice as many names as there are factions of that
ethnicity, so setup never starts near exhaustion. The Estonians, with eight
factions, are the binding case.

Selection rules:

- At setup, each faction takes a name from its ethnicity's pool.
- A name in use by a living ruler is never reused. Uniqueness is checked
  across all factions, not per ethnicity, so two pools sharing a form cannot
  collide.
- When a pool is exhausted, the next name takes a patronymic from the same
  pool: `Rameke, son of Talivaldis`. The patronymic is chosen so the full
  string is unique. This matches how the chronicles name a successor and gives
  a pool of twenty names hundreds of distinct rulers, which a turn-184 game
  needs.

### Naming stays off the shared rng

Name selection must not draw from the `Rng` threaded through `playCard` and
`beginTurn`. That stream drives deck shuffles; inserting draws into it would
shift every seeded simulation and invalidate the committed balance baseline
for reasons unrelated to balance.

Instead, naming is a pure function of the faction id, its ethnicity, and a
succession sequence number. The same game replayed with the same seed produces
the same rulers, the same decks, and the same results as before this change.

A test asserts this directly against a golden fixture. Before any ruler code
lands, a seeded game is run at the current commit and its event log is
committed as `tests/fixtures/seeded-log-baseline.json`. After the change, the
same seed must reproduce that log exactly once the new ruler fields are
stripped. Capturing the fixture first is what makes the test meaningful; a
fixture generated afterwards would only prove the code agrees with itself.

### Assassination

On a successful Assassinate ruler:

- The target's ruler is replaced; `since` becomes the current turn.
- The Status levelling is unchanged. Rulers have no mechanical effect.

On a Bodyguard-prevented Assassinate ruler, the ruler survives and is not
replaced, matching the existing rule that the card's effect is nullified.

No other event replaces a ruler. Subjugation, incorporation, release and
reclaim leave the ruler in place.

## Part 3: where names surface

### Activity log

The log is a record of what happened at the time, so ruler names are stamped
onto events when they are created. Resolving them from current state at render
time would show today's ruler performing his predecessor's actions.

`GameEvent` gains:

```ts
actorRuler?: string;      // ruler of the acting faction when the event happened
targetRuler?: string;     // assassinate: the ruler in the crosshairs
successorRuler?: string;  // assassinate: set only when the killing landed
```

`actorRuler` is stamped centrally. Events are pushed as object literals in
several places in `src/game.ts`; those pushes move behind a single
`pushEvent(log, state, event)` that fills `actorRuler` from the acting
player's faction. A new event type cannot be added without the stamp.

A player's faction never changes, so the HUD resolves faction from state and
only takes the ruler name from the event.

Rendered lines (`eventText` in `src/hud.ts`):

```
Meelis of the Ugandians drew a card
Meelis of the Ugandians played Raid on Livs
Kaupo of the Livs played Assassinate ruler on Ugandians - Meelis killed, Unnepewe succeeds
Kaupo of the Livs played Assassinate ruler on Ugandians - prevented, Meelis survives
You played Assassinate ruler on Ugandians - Meelis killed, Unnepewe succeeds
```

`Player 7` disappears from every line. The player's own lines keep saying
`You`. Lines about factions rather than actors - `Ugandians submits to Livs`,
`Ugandians pays tribute to Livs` - stay faction-level; only the actor side is
named.

### Notices

`buildAssassinateNotice` names both rulers:

> **A Ruler Falls**
> The Ugandians had Kaupo killed.
> Dabrelis now leads the Livs.

`buildAssassinatePreventedNotice` names the survivor:

> **Assassination Prevented**
> The Ugandians played Assassinate ruler against the Livs.
> Your bodyguard turned the blade - Kaupo lives and your Status lead is unchanged.

`NoticeCtx` gains `rulerName(factionId): string` so notice builders read the
name the same way every other consumer does.

### Tooltip

The region tooltip gains a `Ruled by X` line directly under the faction name,
for every faction including the player's own. An absorbed land's tooltip
already names the realm holding it now, so it shows that realm's ruler, and
its `Formerly ...` line stays as it is.

## Nothing changes for the player's own play

The player gains no new choice, resource, or card. Their faction has a ruler
for the same reason every other faction does - the model is total - and that
ruler appears only in prose: the tooltip, and the notices when their ruler is
assassinated and replaced.

## AI and balance

Per the repository rule that a change to a card revisits the AI and the
balance evidence:

- **Legal-action generation** is untouched. Assassinate ruler's legality,
  targeting, and effect on Status are all unchanged.
- **Strategic evaluation** needs no change. Rulers carry no mechanical
  property, so there is nothing for `chooseAction` to weigh; a ruler-aware AI
  would be evaluating a name. This is a deliberate conclusion, not an
  omission, and is revisited when rulers gain their first real property.
- **Simulation metrics** are unchanged for the same reason.
- **The seeded benchmark is re-run and must match the committed baseline
  exactly.** This is the check that the naming scheme really did stay off the
  rng stream. A non-identical result means the implementation drew from the
  shared generator and must be fixed, not re-baselined.

## Testing

| Area | Test |
| --- | --- |
| `barFor` | sign selection, including `0` taking the player's bar and a `null` bar producing no denominator |
| badge | mixed-track case renders two different denominators; danger border agrees with the reverse bar |
| tooltip | both direction sentences; reverse sentence absent when the reverse bar is null |
| `initialRulers` | every faction id present; names unique across factions |
| name pools | every ethnicity in `map.json` has a pool of at least twice its faction count |
| exhaustion | a pool driven past its size yields unique patronymic names |
| `rulerOf` | throws on a missing faction |
| assassination | successful play replaces the ruler and sets `since`; prevented play does not |
| invariant | after a full seeded game every faction still resolves through `rulerOf` |
| determinism | same seed produces the same rulers |
| rng isolation | a seeded game's log, ruler fields stripped, matches the committed pre-change fixture |
| `subjugationGripOn` | badge, tooltip and notice bar all resolve to the same number for the same pair |
| log | actor lines name ruler and faction; player lines still say `You`; assassinate lines name both rulers |
| notices | assassinate and prevented-assassinate notices name the rulers |

## Out of scope

- Ruler traits, bonuses, ages, deaths from any cause other than assassination.
- Rulers changing on subjugation, incorporation, release or reclaim.
- Naming the target side of faction-level log lines.
- Any change to what the player may do on their turn.

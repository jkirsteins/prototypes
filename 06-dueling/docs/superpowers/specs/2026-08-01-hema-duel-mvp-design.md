# HEMA Duel MVP - Design Spec (06-dueling)

Date: 2026-08-01
Status: approved by user, pre-implementation
Source material: `hema-2d-fencing-design-doc.md` (Downloads), the "2D Pixel Art
Character Template" sprite asset (Downloads), user requirements from the
brainstorming session.

## 1. What this is

A Chrome-playable 2D fencing prototype implementing Phase 1 of the HEMA design
doc plus a simple parry. Two fighters on a flat floor: a keyboard player and an
AI dummy with human-switchable modes. Before the duel, a select screen assigns
each fighter a weapon (longsword or rapier). Both fighters use the same
placeholder character sprites, mirrored to face each other; weapons differ in
numbers, animation speed and HUD annotation only, not in graphics.

The prototype's job is to let a single player validate that measure and tempo
behave like the design doc says: readable wind-ups, voids that beat committed
attacks, parries that are safer but less rewarding, and asymmetric reach.

Deployed like every other prototype: GitHub Pages under `/prototypes/06/`,
linked from `.github/pages-index.html` in the same change that adds it.

## 2. Scope

In scope (MVP):

- Discrete-step movement (advance/retreat), facing fixed (player left side,
  enemy right side; no turn-around).
- Full attack signaling cascade: pre-tempo, wind-up, transition beat, strike,
  recovery. Two attacks per weapon: cut and thrust.
- Void (back-hop off the line) and simple parry (resolves to neutral, no bind
  mini-game).
- Single-hit lethality, hurt/death animations, rematch and reselect.
- AI dummy modes: 0 passive, 1 parry-only, 2 attack-in-place.
- Debug overlay: measure bands, tempo-phase labels, HEMA event log. On by
  default, toggleable.
- HUD: weapon cards with reach/tempo annotation, AI mode indicator, controls
  reference.
- README.md with the HEMA feature matrix (possible vs implemented).

Out of scope (explicitly deferred, tracked in the README matrix): bind
mini-game and fuehlen, feints, multiple attack lines (high/low), offline void
directionality, grappling/half-swording/pommel, enemy movement AI, more
weapons, platforming, audio beyond a footstep/hit click if trivial.

## 3. Architecture

Vite + TypeScript, no runtime dependencies, canvas 2D. `vite.config.ts` sets
`base: "/prototypes/06/"`. Structure:

```
06-dueling/
  public/sprites/           copied PNG sheets from the character template
  src/combat/
    types.ts                states, phases, events, config types
    weapons.ts              WEAPONS: longsword + rapier profiles (all numbers)
    fighter.ts              fighter state machine, pure
    engine.ts               fixed-timestep sim: positions, measure, resolution
    ai.ts                   dummy controller, modes 0/1/2
    log.ts                  HEMA event log entries
  src/render/
    sheets.ts               animation metadata + loader (frame size, count,
                            feet anchor, per-state frame mapping)
    draw.ts                 canvas pass: arena, fighters, bands, labels, HUD
  src/ui/select.ts          weapon select screen (also sets AI weapon)
  src/main.ts               loop, input, wiring
  test/                     vitest suites (engine + sheet metadata)
  docs/superpowers/specs/   this file
  README.md                 how to run + HEMA feature matrix
```

The combat core (`src/combat/*`) never imports the renderer and never touches
the DOM: it steps at a fixed 60Hz tick (16.667ms) with all durations expressed
in ms, so vitest can walk a whole exchange tick by tick and assert the
resolution. `main.ts` runs the classic fixed-update/interpolated-render loop.

Data flow per frame: keyboard -> input intents -> engine tick(s) -> new state +
emitted events -> log + renderer.

## 4. Combat model

### 4.1 Space and measure

One horizontal axis, world units are pixels at sprite scale x3 (canvas
960x540, floor near y=430). Fighters are point positions with a facing.
Measure is classified per attacker from `gap = |x1 - x2|` (edge-to-edge is
unnecessary; reach constants absorb body width):

- narrow measure: `gap <= reach` (can hit by extending alone)
- wide measure: `gap <= reach + stepDistance` (step + strike reaches)
- out of measure: beyond that

Measure is computed per weapon, so it is asymmetric: the rapier's narrow band
is wider than the longsword's. The debug overlay draws both fighters' bands on
the floor so the asymmetry is visible.

### 4.2 Fighter state machine

States: `idle`, `step` (advance or retreat, committed until it completes),
`void`, `attack` (with internal phase: pretempo, windup, beat, strike,
recovery), `parry`, `hitstun`, `dead`.

Transitions worth stating:

- Steps are discrete: tap = one step, hold = chained steps with a short stance
  pause between them, release = finish current step, never stop mid-step.
  Input during a step is queued and fires on completion (one-slot buffer).
- An attack cannot be cancelled once wind-up begins (committed attacks only;
  feints are out of scope).
- Parry: press puts the fighter in parry for `parryWindow` ms, then a
  `parryCooldown` during which parry cannot be re-entered (not spam-safe).
- Void: a back-hop of `voidDistance` over `voidDuration` ms; the fighter is
  committed for the whole duration and cannot act during it.
- `hitstun` leads to `dead` in the MVP (single-hit lethality); hurt and death
  animations play back to back.

### 4.3 Attack resolution

At the moment the strike phase fires (start of strike, plus the strike's
travel time before the "lands" instant at strike end):

1. If `gap > attacker reach` at the lands-instant: whiff. Attacker enters an
   extended recovery (`recovery * whiffRecoveryFactor`). Log: "whiff ->
   Nachreisen window open".
2. Else if defender is in parry at the lands-instant: parried. Attacker is
   bounced into recovery (plus `parriedPenalty` ms), defender exits parry
   immediately and may act (dui tempi: their counter costs a second tempo).
   Log: "strike parried -> dui tempi counter available".
3. Else: hit. Defender to hitstun/dead. Log names the interaction, e.g.
   "strike lands (defender mid-step: primo tempo)".

Voiding is not invulnerability: it just moves the body. If the void opened
enough distance by the lands-instant, the attack whiffs by rule 1. This keeps
the model honest to the doc (measure is the defense) and makes void timing a
real read: voiding too early lets the attacker step-adjust before committing,
voiding too late eats the strike.

Counter windows are emergent, not scripted: the whiff recovery is simply long
enough that a well-timed advance + thrust lands before the attacker can parry.
Engine tests assert this arithmetic for both weapon pairings.

### 4.4 Weapon profiles (starting numbers, all in weapons.ts, tuning expected)

| Axis | Longsword | Rapier |
|---|---|---|
| Reach | 95 | 115 |
| Step distance / duration | 34px / 260ms | 28px / 200ms |
| Stance pause between chained steps | 90ms | 70ms |
| Cut: windup / beat / strike / recovery | 420/100/380/420ms | 320/80/300/400ms (weak, discouraged) |
| Thrust: windup / beat / strike / recovery | 260/60/260/300ms | 200/60/220/260ms |
| Pre-tempo (before windup, subtle lean) | 180ms | 140ms |
| Parry window / cooldown | 260/340ms | 200/400ms |
| Parried penalty (added to this weapon's recovery when its attack is parried) | +140ms | +200ms |
| Whiff recovery factor | 1.6 | 1.5 |
| Animation speed multiplier | 0.85 | 1.15 |
| Void distance / duration (same both) | 55px / 320ms | 55px / 320ms |

Feel targets (the user's requirement that the swords feel different):
longsword reads heavy - held wind-up, weighty strike, long recovery, slower
sprite playback; rapier reads needle-quick - short wind-up, fast lunge with
the Sword Stab sheet, brisk steps, but it is outmatched when parried (bad in
the bind) and its cut is a poor option. The rapier outranges the longsword;
the longsword wins exchanges at equal tempo if the rapier misses or is
parried.

### 4.5 AI dummy modes (keyboard 0/1/2, shown on the enemy HUD card)

- Mode 0 - passive: stands in guard. For movement/measure validation.
- Mode 1 - parry-only: never moves, never attacks. When the player's attack
  enters wind-up, reacts after `aiReaction` (180ms) by raising parry. Its
  parry respects the same window/cooldown as the player's, so a thrust timed
  right after baiting a parry (attack, let it whiff early, strike into the
  cooldown) can land. Validates: parry resolution, dui tempi, tempo baiting.
- Mode 2 - attack-in-place: never advances. When the player is inside its
  wide measure, starts an attack (alternates thrust/cut on a fixed pattern,
  1400ms cooldown between attempts). Validates: reading the cascade, void
  timing, Nachreisen counters, and the asymmetric-measure experience of
  standing just outside its reach.

All AI timers are deterministic (no rng), so exchanges are reproducible.

## 5. Controls (hardcoded, shown on screen)

- A / D: retreat / advance (discrete steps; player always on the left, facing
  right)
- S: void (back-hop)
- J: cut, K: thrust
- L: parry
- 1 / 2 / 0: AI mode
- R: rematch (same weapons), Esc: back to weapon select
- Backtick: toggle debug overlay (default on)

## 6. Presentation

### 6.1 Sprite import (the load-bearing detail)

Sheets are horizontal strips with per-animation frame sizes that do NOT match
their filenames in at least one case. Measured with sips, to be encoded in
`sheets.ts` and asserted by a vitest that reads the real PNG dimensions:

| Sheet | File dims | Frame size | Frames | Use |
|---|---|---|---|---|
| Sword Idle | 480x48 | 48x48 | 10 | guard idle |
| Sword Run | 384x48 | 48x48 | 8 | advance/retreat (played stepped, slowed) |
| Sword Attack | 384x64 | 64x64 | 6 | cut (0-1 windup, 2 held beat, 3-4 strike, 5 recovery) |
| Sword Stab | 672x48 | 96x48 | 7 | thrust/lunge (0-1 windup, 2 beat, 3-5 strike, 6 recovery) |
| Roll | 336x48 | 48x48 | 7 | void (played backward-moving) |
| Hurt | 192x48 | 48x48 | 4 | hit reaction |
| Death | 480x48 | 48x48 | 10 | death (file is NAMED 64x64 but is 48x48 - the reason metadata is asserted by test) |

Every animation entry: `{file, frameW, frameH, frames, feetY, originX}` where
`feetY`/`originX` anchor the character's feet to the floor line and its body
center to the fighter position, so switching between 48x48, 64x64 and 96x48
sheets cannot make the character jump. The 96x48 stab sheet extends forward:
its originX keeps the body planted and lets the blade extend toward the
opponent. Frame-to-phase mapping is explicit per attack so wind-up visibly
holds during the transition beat.

Enemy rendering: same sheets, mirrored with `ctx.scale(-1, 1)` around the
fighter position. Pixel art stays crisp: `imageSmoothingEnabled = false`,
integer scale x3.

Chrome verification (user requirement): step through each animation at
several intervals in the running game via devtools screenshots and confirm
feet stay planted, no frame bleed, coherent silhouettes, both facings.

### 6.2 HUD and debug overlay

- Weapon cards (top left player, top right enemy): weapon name, reach value
  with a small horizontal reach bar (drawn to the same scale ratio so the two
  cards are comparable), attack listing with tempo counts ("cut: 2 tempi,
  thrust: 1 tempo"), and on the enemy card the current AI mode.
- Phase label above each fighter: PRE / WINDUP / BEAT / STRIKE / RECOVER /
  VOID / PARRY / STEP, color-coded (windup yellow, strike red, recovery
  green - matching the doc's interruptible/committed/punishable grammar).
- Floor measure bands per fighter in their weapon's tint: narrow band solid,
  wide band hatched, so the rapier's longer bands visibly overlap the
  longsword fighter before the reverse is true.
- Event log (right edge, last ~8 entries): every resolution in HEMA terms
  with timestamps, e.g. "0:12.4 rapier thrust whiffs -> Nachreisen",
  "0:13.1 longsword thrust lands in recovery window: KILL".
- Controls reference along the bottom edge.

### 6.3 Select screen

Two columns (You / Opponent), each listing Longsword and Rapier with their
profile summary (reach bar, tempo counts, one-line identity from the design
doc). Keyboard: A/D or arrow keys move the cursor, 1/2 quick-pick per column,
Enter starts. The chosen matchup is also reachable by URL query
(`?p=rapier&e=longsword`) so a browser check can boot straight into a duel,
matching the repo convention that browser checks boot into the state they
check.

## 7. Testing

- `npm test` (vitest, fast):
  - measure classification for all four weapon pairings and gaps
  - full-cascade walkthrough: tick an attack from input to recovery, assert
    phase entry times against the profile numbers
  - resolution rules: whiff via void distance, parry inside/outside window,
    hit when neither, parried penalty applied, whiff recovery extended
  - counter-window arithmetic: after a whiffed rapier thrust, a longsword
    advance+thrust started at whiff-time completes before the rapier can
    parry (and the mirrored case)
  - AI determinism: same inputs, same event log
  - sheet metadata: every declared sheet exists in public/sprites, its real
    PNG dimensions are an exact multiple of the declared frame size, and
    frame count matches width/frameW
- Manual: Chrome devtools MCP pass over animations (6.1), full playthrough of
  each AI mode, then a production build served the way Pages serves it.

## 8. Error handling

Minimal by design: sprite load failure renders a plain-text error on the
canvas instead of a blank page; the engine clamps positions to the arena;
illegal state transitions are ignored (the state machine only acts on legal
edges); no network, no persistence beyond the URL query.

## 9. README feature matrix (user requirement)

`06-dueling/README.md` contains a table of every HEMA concept from the design
doc mapped to a status so future work is legible: rows for measure zones
(incl. grappling), tempo types (primo/mezzo/dui/contratempo), signaling
cascade, void (incl. offline directionality), parry/bind, bind mini-game +
fuehlen states, feints, committed attacks, recovery variance, attack lines,
footwork coupling, weapon roster (all 7 doc weapons), half-swording,
matchup asymmetry, enemy movement AI, personalities, terrain. Statuses:
"implemented", "partial (what's missing)", "not in MVP". The matrix is
updated whenever mechanics change.

## 10. Risks and tuning notes

- The void gate (design doc section 16): if reading + voiding is not fun with
  these numbers, tune step/windup durations before adding anything. The
  overlay exists to make that tuning session honest.
- Parry-only AI must not make parry look mandatory: verify voiding a mode-2
  enemy feels strictly better than parrying it (bigger, cleaner counter).
- The stab sheet's 96px frames are the most likely source of anchor bugs;
  it is the first animation to verify in Chrome.

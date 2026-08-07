# Arena scene: parkour up, duel on top

Date: 2026-08-07. Status: approved design, pre-implementation.

A third scene combining the movement test bed and the duel. A raised
platform stands in the middle of a flat arena. The player starts on the
floor, unarmed. Getting on top takes the parkour verbs: jump, catch the
lip, hang, pull up. On top waits an armed enemy that never leaves the
platform. A draw/sheathe action switches the player between parkour mode
and fencing mode; with the sword drawn on the platform, the full duel
engine runs.

This spec also covers an independent movement-engine change: the double
jump is removed and airborne steering is limited to a short window after
liftoff. That change applies to every scene using the movement engine.

## 1. Architecture: composite scene

Both engines already agree on units (centimeters, 60 Hz ticks) and are
pure and DOM-free. The arena scene composes them; neither engine learns
about the other.

- The **enemy is always a combat `Fighter`** (src/combat/fighter.ts). It
  never runs, jumps or climbs; it moves only by fencing steps through the
  same `applyIntent`/`tickFighter` machine the duel uses. Its windups,
  strikes and recoveries are therefore identical to a duel's at all
  times, satisfying the one-simulation rule.
- The **player is a movement-engine `Mover` while sheathed** and a
  **`Fighter` while drawn**. The scene converts between the two
  representations at explicit boundaries (draw completes; falling).
- When the player is armed and both fighters stand on the same surface,
  the scene assembles a real `Duel` from the two existing Fighter objects
  and `tickDuel` owns both bodies: parry, feint, bind, bullet time,
  disarm, and the duel AI (`aiDecide`) for the enemy.
- Rejected alternatives: teaching the combat engine gravity/floors (a
  rewrite of a deliberately 1D engine), and simulating the enemy as a
  Mover with bespoke attack logic (duplicates combat timing outside the
  fighter machine).

## 2. The level

A new arena map in movement-level terms (20x11 grid of 96 cm tiles):

- Flat floor along row 10, side walls as in the move level.
- One raised platform: cols 6-13 (8 tiles, 768 cm wide), 3 tiles tall
  (solid rows 7-9), top surface 288 cm above the floor.
- No ladder. No pushable block: the block spawn is parked at an
  off-world x (negative), so the engine's block collision never
  participates and the renderer never draws it.

Three tiles tall is load-bearing: a jump's apex is about 210 cm, so the
top cannot be reached by jumping directly; apex head height plus the
120 cm hand reach (HANG_REACH) spans the lip, so the only way up is
jump -> catch ledge -> hang -> pull up.

## 3. Player modes and the draw/sheathe action

- **Sheathed**: the player is a Mover with the full parkour verb set.
- **Drawn**: the player is a Fighter with the full duel verb set.
- **Draw/sheathe** is a committed action accepted only from grounded
  upright movement states (idle, walk, run) or, when armed, from the
  fighter's ready state outside a bind. It takes a few hundred ms
  (DRAW_MS, a named constant) and renders the duel's action-track
  progress bar. The player is attackable throughout; interrupting it is
  the enemy's strike landing, i.e. death.
- **Falling sheathes instantly.** Walking off an edge, backing off the
  platform mid-duel, any transition to airborne while armed converts the
  Fighter back to a Mover in fall state with the sword away. No progress
  bar: the bar is for the deliberate action only.
- Facing on draw: toward the enemy's x.
- **Armed outside a duel** (for example on the lower floor, where the
  enemy never goes): the player's Fighter ticks standalone. Footwork
  steps move relative to facing, attacks run their full timeline and
  resolve as whiffs (nothing in reach), guards form and drop normally.
  There is no special rule; it is a duel with nobody in measure.

## 4. Engagement, disengagement, the edge

- **Engagement**: player armed AND both fighters grounded on the same
  surface (in practice: the platform top, since the enemy never leaves
  it) -> assemble a Duel preserving both fighters' current positions and
  states. Engine seam: a small exported helper that builds a Duel from
  two existing Fighters, because `createDuel` hardcodes spawn positions.
- **The enemy never falls** purely by AI policy, never physics: a wrapper
  around its decision layer vetoes any advance/retreat whose travel would
  end within EDGE_MARGIN (about 60 cm) of a lip. This is the permitted
  kind of asymmetry (policy, not physics).
- **The player may back off the edge.** If any duel motion carries the
  player's feet past the platform span, the scene dissolves the duel,
  converts the player to a falling Mover (auto-sheathed), and the enemy
  Fighter persists and recovers on its own clock. Re-engagement follows
  the same rule as engagement.
- EDGE_MARGIN is tuned so a player hanging on the lip is still within
  the enemy's strike reach: the ledge is not a safe zone.

## 5. The unarmed threat

While the player is sheathed and within reach, the enemy attacks with
its real weapon timeline. The scene resolves these strikes itself:

- At strike end: if the horizontal gap is within the weapon's reach and
  the player's body box vertically overlaps the platform-surface band
  (which includes a body hanging at the lip), the strike kills. Single
  hit lethality, death banner, R restarts the scene.
- Pre-duel enemy policy is a small bespoke sentinel: hold near platform
  center when the player is elsewhere; approach with fencing steps when
  the player is on the platform; strike when in reach, with reaction
  delays. Decisions only; every physical consequence goes through the
  fighter machine.
- The enemy's FighterEvents (windup, swing, strike resolution) pass
  through the same fighter-event-to-DuelEvent translation the duel
  engine uses, extracted into a shared helper so the mapping cannot
  drift. Cues fire on the simulation tick the thing physically happens.
  No clash or bind can occur against an unarmed body.

## 6. Input

One new action joins the `ActionId` union: **`drawSheathe`** - keyboard
`E`, pad LT (button 6, previously unused). The typed label Records force
labels in every scheme table. It reads "draw" or "sheathe" from context.

The arena scene swaps its key tables when the weapon state flips
(main.ts reads `active.holdKeys` per event, so a live swap works):

- **Sheathed** (the move scene's table): A/D run, W/S climb and crouch,
  K jump, J dash, L grab, Shift walk, E draw.
- **Armed** (the duel's table): A/D footwork, S void, J cut, K thrust,
  L guard, F feint, I disarm, arrows/Caps stance and side shift,
  E sheathe.

Within one mode every key has one meaning; across modes reuse is
deliberate (K jump vs K thrust). Session keys (R, Esc, Space, backtick,
dot, brackets, M) stay owned by main.ts, unchanged.

Pad: `UiSnapshot` gains scene id "arena" and an `armed` flag;
`resolvePadEdge` picks the move or duel verb set accordingly, plus
`drawSheathe`. The contextual B-button feint extends to armed-arena.

Scene selector: a third column (SceneId "arena"), direct pick key `3`
via a new `selPickThird` action; left/right cycle through all three.

## 7. Movement-engine air rules (all scenes)

- **Double jump removed.** The `airSpin` state, the `spun` flag and both
  mid-air jump branches are deleted; frames, help text and tests go with
  them.
- **Steer window.** A Mover clock starts whenever the body becomes
  airborne - every liftoff (ground jump, dash-jump, wall jump, ledge
  leap, ladder jump) and every walk-off. While it runs
  (AIR_STEER_MS, about 120 ms), held direction sets horizontal velocity
  exactly as today, so the launch vector can be shaped just after the
  impulse. After it lapses the arc is ballistic: direction no longer
  changes velocity.
- **Hands still listen.** Held direction remains intent for the ledge
  probe, wall slide and ladder catch. Locked steering commits velocity,
  not the hands.

## 8. Rendering

New `src/render/arenadraw.ts` composes the existing renderers:

- Tiles and the sheathed player via helpers extracted from
  `movedraw.ts` (export level and mover drawing).
- Fencers via per-fighter sprite drawing extracted from `draw.ts`'s
  `drawFrame`, parameterized by floor y (the piste's hardcoded `floorY`
  does not hold on the platform). Both renderers already share
  0.5 px/cm, so world positions map 1:1.
- While a duel is live: per-fighter action-track bars and, during a
  bind, the shared control bar and prompts, drawn at the platform.
- Draw/sheathe progress uses the same action-track bar helper.

## 9. Audio

No new sounds, no new rules. Duel-phase events go through
`audio.frame`; movement events through `audio.moveFrame`; the standalone
enemy's events through the shared translation helper (section 5). Bullet
time reuses `src/ui/bullettime.ts` during duel-phase binds exactly like
the duel scene.

## 10. Help

New `src/ui/arenahelp.ts`: a concise mode-keyed panel - sheathed verbs,
armed verbs, the draw/sheathe action, the edge rules (falling sheathes;
the enemy will not follow you off). One sentence for what is happening,
one for what to do; durations derived from `WEAPONS` via callbacks; the
existing help tests bound length and token resolution.

## 11. Weapons and session flow

Fixed matchup, no picker: player longsword, enemy rapier, overridable by
the existing `?p=`/`?e=` URL params. `?scene=arena` boots straight in.
R restarts the scene fully (player on the floor, enemy re-spawned
mid-platform). Esc returns to the scene selector. Duel outcomes keep the
duel's banner semantics.

## 12. Testing

Fast vitest additions, extending existing suites:

- Movement: jump press mid-air does nothing; steering at 60 ms after
  liftoff changes vx and at 200 ms does not; walk-offs get the same
  window; ledge catch still works with steering locked.
- Arena: drawing on the platform assembles a live Duel; retreating past
  the lip dissolves it into a falling sheathed Mover; a property test
  runs varied long inputs and asserts the enemy's x never enters
  EDGE_MARGIN; unarmed strikes kill at reach and not beyond, including
  a body hanging at the lip; falling auto-sheathes; draw/sheathe
  duration and its progress bar; interruption by death.
- Input: within each arena mode no key resolves to two verbs; the pad
  resolver picks verb sets by the armed flag; labels for `drawSheathe`
  and `selPickThird` are build-enforced; help tokens resolve; the
  selector cycles three scenes.
- The combat engine's existing suites (timeline symmetry, presentation
  timing) continue to pin it; this design touches the combat engine only
  with the assemble-a-Duel helper and the event-translation extraction.

## 13. Files

New: `src/scenes/arena.ts`, arena map in `src/movement/level.ts`,
`src/render/arenadraw.ts`, `src/ui/arenahelp.ts`.

Edited: `src/movement/engine.ts` (air rules), `src/input/scheme.ts`,
`src/ui/scenes.ts` + `index.html` (third entry), `src/render/draw.ts`
and `src/render/movedraw.ts` (extractions), `src/combat/engine.ts`
(duel assembly + event translation exports), `src/main.ts` (wiring),
`src/render/moveframes.ts` (airSpin removal), tests.

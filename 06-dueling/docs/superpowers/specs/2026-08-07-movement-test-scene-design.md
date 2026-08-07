# Movement test scene + scene selector

Date: 2026-08-07. Status: implemented, with one post-playtest amendment.

Amendment (playtest ruling): there is no side climb. Crawling up a wall
face read as wrong on sight; the state, its sheet, the climbable tile
kind and the grab-to-climb input are removed. Walls are for wall slide,
wall land and wall jump; upward routes are the jump, the double jump,
the ledge grab at a lip, and the ladder. Grab (L / RB) exists for the
block only. Sections below describing side climb are superseded by this
note.

## 1. What and why

The prototype gains a second scene: a single-screen parkour area where every
non-combat animation the sprite pack provides can be exercised, one verb at a
time, with the same input conventions as the duel. The existing duel becomes
the "Dueling test" scene; a new scene selector screen precedes everything.

The purpose is an animation test bed: seeing each sheet play in context, with
consistent frame anchoring (no sinking or hopping when sheets swap) and
correct sizing, verified end to end in Chrome.

## 2. Scene flow

- A new DOM overlay (`src/ui/scenes.ts`, styled like `#select`) is the first
  screen: two options, "Dueling test" and "Movement test". It reuses the
  generic selector verbs (`selLeft`/`selRight`/`selToggle`/`selConfirm`,
  `selPickFirst`/`selPickSecond`), so keyboard and pad both drive it with no
  new bindings.
- "Dueling test" leads to the existing sword select, then the duel.
  "Movement test" boots the parkour scene directly.
- Esc walks back one level: duel -> sword select -> scene select;
  movement -> scene select.
- URL boot: `?scene=move` boots the parkour scene, `?scene=duel` the sword
  select. Existing `?p=`/`?e=` behavior is unchanged (boots straight into a
  duel; implies the duel scene).

## 3. main.ts becomes a shell

`main.ts` keeps only what both scenes share: the RAF loop and tick
accumulator, pause/step/timescale keys, audio unlock, pad polling, help
open/close, blur handling. Everything duel-specific moves behind a `Scene`
interface (roughly `handleAction`, `tick`, `draw`, plus which held levels the
scene consumes). The duel scene wraps today's logic unchanged; bullet time
stays inside the duel scene (it is bind-only presentation).

## 4. Input

New `ActionId`s in `src/input/scheme.ts`; the typed Records force a label per
scheme, as today.

| Action | Keyboard | Pad (xbox) | Notes |
|---|---|---|---|
| moveLeft / moveRight | A / D | stick or d-pad | held levels |
| jump | K | A | pressed again mid-air: air-spin double jump |
| dash | J | X | ground dash |
| crouchDown | S (held) | stick/d-pad down | pressed while running: slide |
| grab | L (held) | RB | ladders, climbable walls, pulling the block |
| climbUp / climbDown | W / S | stick/d-pad up/down | on a ladder or wall |
| resetScene | R | Y | respawn at start (Start stays pause) |

S is contextual: on the ground it crouches (or slides at speed); on a
ladder or climbable wall it climbs down. One key, one downward meaning.

- Walk vs run: keyboard holds Left Shift to walk; on pad, stick magnitude
  below a threshold walks.
- Roll is not an input. A hard landing (fall past a height threshold) with a
  direction held resolves into a roll - an outcome of the simulation,
  matching the house rule that contact is emergent from the simulation.
- Esc, R, space, `.`, `[`/`]`, backtick and `?` keep their existing meanings.

## 5. Movement engine (`src/movement/`)

Pure, DOM-free, fixed 60 Hz tick, deterministic, unit-tested - the same
discipline as `src/combat/`.

### 5.1 engine.ts

- World units are centimeters (PX_PER_CM = 0.5, SCALE = 3, as the duel), now
  with a y axis and gravity.
- Player FSM, one state per animation family: `idle`, `walk`, `run`, `dash`,
  `slide`, `roll`, `crouchIdle`, `crouchWalk`, `jump` (rising), `airSpin`
  (double jump), `fall`, `land`, `wallSlide`, `wallLand`, `sideClimb`,
  `ladderClimb`, `ledgeGrab` (grab and pull up), `push`, `pull`, `pushIdle`.
- Transitions are decided only by simulated facts: velocity sign, contact
  flags (floor / wall / ceiling / ladder overlap / ledge sensor), held levels
  and pressed edges.
- The engine emits `MoveEvent`s at physical transitions (footfall, liftoff,
  touchdown, grab, block shove) exactly like `FighterEvent`s. Presentation
  keys off those events, never off input.

### 5.2 level.ts

- The level is a small tile grid. Tiles are 16 px sprite units = 48 canvas px
  = 96 cm; the screen is 20 x 11 tiles (960x528).
- Tile kinds: solid, ladder, climbable wall (side-climb allowed), one-way
  platform lip (ledge-grabbable), empty.
- The pushable block is an entity, not a tile: one solid 1-tile body with its
  own x, pushed at walk speed, pullable while grabbed.

### 5.3 Collision

Plain AABB vs grid, resolved axis by axis per tick (horizontal then
vertical, clamp on hit, set contact flags). The player body is one tile wide,
about 1.8 tiles tall standing, about 1 tile crouched; the tunnel gates on
that. Standing up under a solid tile is refused (you stay crouched until
there is headroom).

### 5.4 Level layout (one fixed screen)

Left to right:

- A tall climbable wall at the far left: wall slide down it, wall-land onto
  it, side-climb up it with grab held, wall jump off it, ledge-grab its top
  lip.
- Stepped platforms mid-screen at 2-4 tile heights: jump, double-jump air
  spin, fall, land. One gap is wide enough that only a dash-jump clears it.
- A ladder up to a high right platform (climb-back sheet).
- A low tunnel (1-tile clearance) under a platform: crouch-walk through, or
  slide in at speed.
- A pushable block that must be pushed (or pulled out of a pocket) to reach
  one platform.
- Open floor for dash, slide, roll and the walk/run distinction.
- Falling off the high route back to the floor is the fall / hard-land / roll
  showcase.

### 5.5 Tuning targets

Exact numbers live in the implementation plan and get tuned in Chrome:

- Jump clears 2 tiles; double jump 3+.
- Dash is about 2x run speed for a fixed burst.
- Wall slide caps fall speed.
- The hard-landing threshold sits above the tallest platform hop but below
  the high-route drop: ordinary hops land clean, big drops roll.

## 6. Sprites and rendering

- New sheets copied to `public/sprites/` with kebab names: walk, run, dash,
  slide, jump, land, air-spin, wall-slide, wall-land, side-climb,
  climb-back, ledge-climb, crouch-idle, crouch-walk, push, pull, push-idle.
  They join the `SHEETS` record; the existing PNG dimension test extends
  automatically.
- Jump uses the "new jump" 6-frame sheet, not the 3-frame old one. The
  "(left)" wall variants are ignored; we flip in code like everywhere else.
- `feetY`/`originX` start at the pack's uniform 40/24 and are corrected from
  measured per-frame alpha bounds during Chrome verification; the comment in
  `sheets.ts` records the measured truth. `roll` and `idle` are reused as-is.
- `Basic Tilemap.png` (96x160) is the tile atlas for platforms/walls/floor.
  If it lacks a usable ladder tile, the ladder is drawn as a minimal
  flat-color rung pattern in canvas matching the pixel look.
- New `src/render/moveframes.ts`: pure state -> {sheet, frame, flip} picker,
  mirroring `frames.ts`. New `src/render/movedraw.ts` draws tiles, block,
  player and the debug overlay (state label, velocity, contact flags,
  collision boxes; backtick toggles, like the duel).

## 7. Audio

No new assets. Two cues, both keyed off `MoveEvent`s, never input:

- Footsteps on run/walk footfall events (the cycle's contact frames),
  reusing the existing footstep samples.
- A land thud on touchdown.

Everything else is deliberately silent for now. M mutes; the
unlock-on-gesture rule is unchanged.

## 8. Help

The "?" panel becomes scene-aware. A `MOVE_HELP` record typed over the
movement state union renders when the movement scene is active - an
undocumented state fails the build, the same trick as `HELP`. One sentence
for what is happening, one for what to do; length-bounded by test.

## 9. Testing

vitest, fast, alongside the existing suites:

- Engine: determinism; jump clears 2 tiles and double-jump 3; the tunnel
  refuses standing and admits crouch and slide; wall slide caps fall speed;
  ladder attach/detach; ledge grab at the lip; block push/pull; hard landing
  rolls above the threshold and lands clean below it.
- A "presentation events follow the simulation, not the input" describe
  block pinning footfall/touchdown ticks, mirroring `engine.test.ts`.
- Frame picker totality: every state maps to an in-bounds sheet + frame.
- Help token resolution and length bounds; scheme label completeness is
  enforced at the type level.

## 10. Chrome verification (definition of done)

- Boot `?scene=move` on the dev server; exercise every verb; screenshot each
  animation mid-play.
- Run the alpha-bounds measurement to fix `feetY`/`originX` so nothing sinks
  or hops when sheets swap; check tile seams at 3x.
- Confirm the selector flow (scene select -> sword select -> duel -> Esc all
  the way back) and that the duel is untouched; console clean.
- README gains the movement-scene controls and `?scene=` docs in the same
  change.

## 11. Out of scope

- No combat in the movement scene; no AI.
- No camera or scrolling; one fixed screen.
- No new audio assets; no cues beyond footsteps and land.
- No changes to the combat engine or duel behavior beyond the scene
  extraction in main.ts.

# Cell Room Exits Design (post-coffin wrap-up)

## Goal

Wrap up the puzzle room the player enters after escaping the coffin (the "cell").
Give the cell a real exit. The cell **door** is the single, universal goal: every
route ends by opening that door, which leads to a stubbed **corridor** room where
scene1 ends.

Three routes reach the means to open the door, one per playstyle established at the
coffin. Whichever build the player carries, at least one non-caution route works, and
the caution route is a universal fallback, so the room can never dead-end (per the
"never create unwinnable stuck situations" principle in AGENTS.md).

Also add two new tracked stats, `perception` and `sanity`, held at 0 for now.

## Context: state carried in from the coffin

The coffin (existing `start` / `coffin_loop`) sets the build one of two ways:

- **Strength build:** five pushes -> `build = "strength"`, `strength = 2`. May or may
  not carry the nail.
- **Ingenious build:** carry the nail, pry the hinge -> `build = "ingenious"`,
  `ingenuity = 2`. Always **keeps the nail** in inventory (the `use_hinge` knot does
  not remove it).

The cell already exists (`cell_room` / `cell_room_loop`): barred window with a tattered
curtain, a heavy iron-banded door with an eye-height grille, chains, a pallet, and a
cold candle in a sconce. `Look around` reveals a table -> drawer. Forcing the drawer
requires `strength >= 2` and yields a tinderbox; the tinderbox lights the candle; the
lit candle reveals flavor items (hanging, cage, bucket). The cell currently has **no
exit** - that is what this design adds.

## Map

```
                 [ COFFIN ]  --strength push-->  build=strength, strength=2
                             --nail + hinge  -->  build=ingenious, ingenuity=2 (keeps nail)
                        |
                     [ CELL ]  <-- the door is the universal goal
                    /   |    \
        candle route  window   caution
        (strength)   (ingenuity) (any build)
             |           |          |
        light reveals  pry bar     throw weight
        hinge pins;    -> NICHE     at door
        strength lifts  -> take key  -> caution -1
        door aside     -> back      -> door bursts
             \          -> unlock       /
              \            |           /
               ----->  [ CORRIDOR stub ]  (new room, one beat, then END)
```

## The three routes

### Candle route (strength build)

1. `use table` / `look table` reveals the drawer (existing).
2. `use drawer` forces it open **only if `strength >= 2`** (existing `force_drawer`),
   yielding the tinderbox.
3. `take tinderbox`, then `use candle` with the tinderbox carried -> `candle_lit = true`
   (existing).
4. With the candle lit, `look door` now reveals the door's **hinge pins** (visible only
   by candlelight): sets `pins_seen = true`.
5. `use door` with `pins_seen` **and** `strength >= 2` -> drive the pins out, lift the
   door aside -> door opens -> corridor.

This route deliberately uses **light and strength together** at the door.

### Ingenuity route (travel to the guard-niche)

1. `use window` while carrying the **nail** -> pry a corroded bar loose:
   `bars_pried = true`. A choice **[Squeeze through the gap]** appears in the cell loop.
2. Squeeze through -> the **guard-niche** room (`current_room = "niche"`,
   `# image:guard-niche`). The `key` is spotted on entry.
3. `take key` -> the heavy iron key enters inventory.
4. A choice **[Climb back into the cell]** returns to the cell (restores the cell's
   discovered items).
5. `use door` with the `key` carried -> unlock -> door opens -> corridor.

The door lock is **too warded for the nail** (unlike the crude coffin hinge), which is
what forces the trip to the niche instead of a trivial pick. The player can climb back
and forth freely, so entering the niche can never strand them.

### Caution route (any build, universal fallback)

1. The first `use door` while the door is still locked prints a locked-door response and
   sets `door_tried = true` (see "The locked-door interaction").
2. Once `door_tried`, a choice **[Throw your weight against the door]** appears in the
   cell loop.
3. Choosing it: `caution = caution - 1`, the rotten wood around the iron gives, the door
   bursts -> corridor.

Always reachable (trying the door has no prerequisite), so this guarantees an exit for
any build/state.

## The locked-door interaction (explicit requirement)

`use door` is a first-class interaction with these branches, in order:

1. If the door is already open -> go on to the corridor.
2. Candle route: `pins_seen` and `strength >= 2` -> lift the door aside -> open.
3. Ingenuity route: `inventory ? key` -> unlock with the key -> open.
4. Otherwise (still locked): print the locked response and set `door_tried = true`:
   > You try the door. It does not give a hair. The lock is a heavy warded thing, and
   > there is no key in it - whoever turned it last carried the key away.

`look door` describes the door and, once `candle_lit`, additionally reveals the hinge
pins (sets `pins_seen`).

Verbs stay `look` / `use` / `take`; `use door` reads as "try to open it" - consistent
with the existing item model (combinations resolve by "use X" checking inventory/flags,
exactly as `use_hinge` checks for the nail).

## Room travel

Movement stays choice-driven, matching the existing coffin -> cell transition. The item
strip is **room-scoped**: entering the niche shows only the niche's items; returning to
the cell restores the cell items the player had already discovered.

Because the discovered cell set depends on progress flags (`room_scanned`, `candle_lit`
+ `light_scanned`, `drawer_open`, `bars_pried`, plus the always-present door and window),
a `refresh_cell_spotted` helper rebuilds `spotted` from those flags whenever the player
re-enters the cell, rather than trying to remember the previous list. The niche has its
own small item set (`key`).

## New stats: perception and sanity

Add `VAR perception = 0` and `VAR sanity = 0`. Surface both in the snapshot's
`attributes` and in the debug panel alongside `strength` / `caution` / `ingenuity`.
**No route changes them yet** - they stay at 0. Natural future hooks (not implemented
now): perception for spotting things by candlelight, sanity for the loud/reckless routes.

## Stat changes on the routes

Only the **caution route** changes a stat: `caution = caution - 1`. The candle and
ingenuity routes are stat-neutral (the build was already set at the coffin). Easy to add
reinforcement bumps later if desired.

## Room prose

### Guard-niche - `# image:guard-niche`

On entry (the `key` is spotted immediately, being the catch-lit focal point of the art):

> You fold yourself through the gap and drop into a space barely wider than your
> shoulders. A blade of pale daylight falls from a slit high in the far wall, thick with
> drifting dust. The air is colder here, and older.
>
> Behind you, the barred gap gives back onto the dark of the cell. A three-legged stool
> waits under a plank shelf, where a dented tin cup keeps company with a candle-stub gone
> to a hard grey lump. And on the near wall, hung from an iron ring and catching what
> little light there is: a key. Big, black with rust, and cut for a lock that matters.

`take key`:

> You lift the key off its ring. It is heavier than it looks, and cold straight through.

### Corridor stub - `# image:corridor`

Shown the moment the cell door opens, whichever route did it. Ends scene1:

> The door gives, and the cold breath of a far larger place moves past you.
>
> You step out onto a gallery of grey stone. A staircase curls up toward a high window
> where real daylight - thin, but daylight - lies across the steps. Tall arched panes
> march down one wall, and beyond them: open sky, and the blue suggestion of hills a long
> way off. A strip of red carpet, worn to its threads, runs the length of the floor.
> Portraits watch from their frames, pale men in old collars, their painted eyes turned
> toward a door at the far end. A suit of armour stands sentinel beside it, and does not
> move.
>
> You are out of the cell. You are nowhere near out of the castle.

Single choice **[Start down the gallery.]** -> a last quiet line, then the scene ends:

> Your bare feet find the cold carpet, and the castle takes the sound without an echo.

## Engine / data changes

### `src/ink/scene1.ink`

- **LIST additions:** add `door`, `window`, `key` to `LIST items`.
- **New vars:** `door_tried = false`, `bars_pried = false`, `pins_seen = false`,
  `door_open = false`. `current_room` gains the values `"niche"` and `"corridor"`.
- **Spot the door and window** on entering the cell (they are visible from the start of
  the existing cell description).
- **New interact routes** in the `interact(verb, item)` dispatcher: `look`/`use` for
  `door` and `window`; `take` for `key`; `look` for `key`.
- **New knots:** `guard_niche` (+ loop), `corridor` stub (+ final beat -> END),
  `refresh_cell_spotted` helper, and the door/window/key interaction knots.
- **New cell-loop choices** (conditional): `[Squeeze through the gap]` when `bars_pried`
  and in the cell; `[Climb back into the cell]` when in the niche;
  `[Throw your weight against the door]` when `door_tried` and door not yet open.
- **Door-open transition:** any route sets `door_open = true` and routes to `corridor`.

### `src/ink/scene1.ts`

- Add `perception` and `sanity` to `Scene1Snapshot.attributes` and read them via
  `numberVariable`.

### `src/itemLabels.ts`

- Add labels: `door -> "door"`, `window -> "window"`, `key -> "iron key"`.

### `src/main.ts`

- Add to `BACKGROUNDS`: `"guard-niche"` -> `guard-niche.png`, `"corridor"` ->
  `corridor.png`.
- Add `perception` and `sanity` rows to the debug panel (`renderDebug`).

### Assets (already placed)

- `public/backgrounds/guard-niche.png` (1672x941) - the niche.
- `public/backgrounds/corridor.png` (1672x941) - the corridor stub.

## Testing strategy

Extend `src/ink/scene1.test.ts` to cover all three golden paths and the no-dead-end
guarantee:

1. **Candle/strength path:** push out of the coffin -> force drawer -> take tinderbox ->
   light candle -> look door (pins) -> use door -> reach corridor.
2. **Ingenuity path:** nail+hinge out of the coffin -> use window (nail) -> squeeze
   through -> take key -> climb back -> use door -> reach corridor.
3. **Caution path (from either build):** use door while locked -> caution choice appears
   -> throw weight -> caution decremented -> reach corridor.
4. **Locked-door interaction:** `use door` before any route is satisfied prints the
   locked response and sets `door_tried`.
5. **No dead-end:** for the ingenious build (strength 0, cannot force the drawer), assert
   both the ingenuity route and the caution route remain reachable.
6. **New stats:** assert `perception` and `sanity` are present and 0 throughout.

After the automated paths pass, verify end-to-end in a real browser with Playwright per
AGENTS.md: play each of the three routes, confirm the correct backgrounds render
(cell -> niche -> corridor; cell -> corridor), and confirm the debug panel shows the two
new stats at 0.

## Non-goals

- No content beyond the corridor stub (the corridor's onward door/stairs are a seam for a
  later scene).
- No changes to `perception` / `sanity` values yet.
- No new verbs; the existing `look` / `use` / `take` model carries every interaction.
- No stat reinforcement on the candle/ingenuity routes.

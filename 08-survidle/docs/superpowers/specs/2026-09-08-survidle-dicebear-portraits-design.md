# Survidle DiceBear portraits

## Purpose

Replace the hand-drawn 8x8 survivor faces with deterministic Toon Head
portraits from DiceBear. A portrait must keep one survivor recognisable from
the landing boat through the cemetery while the living header also shows what
that person is doing, how their body feels, and whether firelight falls on
them.

The portrait supports the existing body bars and status tags. It does not
replace them or become the only way a condition is communicated.

## Decisions

- Use DiceBear Toon Head, generated locally from `@dicebear/core` and the
  Toon Head definition in `@dicebear/styles`.
- Make no HTTP requests during play. The HTTP API was used only for design
  previews.
- Keep `Person.face` as the permanent identity seed. Existing saves need no
  data migration.
- Use the Toon Head `happy` eyes as the normal awake baseline.
- Let `Person.sex` control facial-hair availability only. All survivors share
  the hairstyle pool.
- Limit clothing to shirt, open jacket, and turtleneck so the portrait does
  not introduce modern T-shirts or dresses into the setting.
- Stop encoding the gameplay `eyes` and `build` grades in the portrait. The
  card text remains the authoritative statement of those traits.
- Animate only the living header portrait. Candidate cards, journal entries,
  away reports, tombstones, and cemetery entries stay static.
- Keep the current pixel portrait implementation as a runtime fallback.
- Credit ToonHead by Johan Melin under CC BY 4.0 in an in-game credits surface.

DiceBear documentation:

- Toon Head: https://www.dicebear.com/styles/toon-head/
- JavaScript library: https://www.dicebear.com/how-to-use/js-library
- Core options: https://www.dicebear.com/customize/options/
- Licenses: https://www.dicebear.com/licenses/

## Architecture

### Static generation

`src/ui/face.ts` becomes the Toon Head adapter while retaining the old pixel
renderer as a private fallback. Its public static entry point remains
`faceSvg(person, px)`, so cards and overlays keep their existing call sites.

The adapter converts the numeric `Person.face` value to a stable string seed.
Identity options are derived from that seed independently from expression:

- front hair: all four Toon Head variants;
- rear hair: none or one of four variants;
- facial hair: none for women; none or one of five variants for men;
- clothes: shirt, open jacket, or turtleneck;
- skin, hair, and clothing colours: Toon Head's supplied palettes.

Static portraits use happy eyebrows, happy eyes, and a smile. Passing explicit
identity and expression options to DiceBear ensures a different expression
never rerolls hair, clothing, colour, or facial hair.

Generated SVG strings are cached by identity, expression, size, and split
side. The cache is capped at 256 entries with least-recently-used eviction.
This holds the living survivor's small frame set and a useful run of cards
without growing forever with the cemetery.

If local generation throws, `faceSvg` returns the existing pixel portrait.
There is no network failure path.

### Live portrait state

New module `src/ui/portrait.ts` owns a pure reading:

```ts
interface LivePortraitState {
  expression: "happy" | "focused" | "cold" | "hot" | "unhappy" | "tired" | "hurt" | "sleep" | "dead";
  activity: "walk" | "work" | "rest" | "sleep" | "idle";
  firelit: boolean;
  motion: "awake" | "limited" | "none";
  signature: string;
}
```

`livePortraitState(state, world, cal, ambient)` reads existing authoritative
values only:

- `moodOf(state)` for activity;
- body water, food, warmth, energy, sleep, sickness, and injury readings for
  condition;
- `feltTemperature(...)` for heat;
- the survivor's current cell and that camp's fire for firelight.

It must not call a mutating body-need function. The portrait reacts directly
to readings, including while a forced once-order continues through a need.

`liveFaceHtml(...)` renders the state as stacked cached SVG frames inside one
stable `.stat-face` wrapper. It is used only by the stats header. The wrapper
has a stable DOM shape so the existing panel morph changes attributes and
frames without replacing the whole portrait.

### Ambient motion

New module `src/ui/portrait-motion.ts` owns real-time, UI-only motion. Its
controller advances after the ordinary render in the existing animation-frame
loop. It never reads the simulation RNG and is never saved.

The controller recognises the survivor and condition through the portrait
signature. A signature change cancels any transient frame immediately and
starts the new base state.

For an awake portrait:

- schedule the next blink from a fresh uniform 1 to 5 second interval;
- hold the closed-eye frame for 100 to 180 ms;
- occasionally move the head sideways by 1 to 3 CSS pixels, scaled to the
  rendered portrait, then return;
- occasionally show a state-compatible eye, brow, or mouth frame;
- never choose a cheerful frame for a distressed condition;
- never replace the focused face with an unrelated flavor expression.

The normal awake frame uses happy eyes. A blink uses the agreed closed-eye
variant and always returns to the current base expression.

The controller pauses while `document.visibilityState` is hidden. It resumes
with newly scheduled future events, not a burst of missed animation. Under
`prefers-reduced-motion: reduce`, it does not schedule blinks, glances, or
transient expressions.

## Presentation layers and priority

The portrait composes four independent layers:

1. Identity: seeded hair, skin, facial hair, clothes, and colours.
2. Expression: body condition first, then activity, then happy base.
3. Ambient life: blink, glance, and allowed micro-expression.
4. Environment: heat, cold, and firelight treatments.

Expression priority is:

1. dead;
2. sleeping;
3. urgent physical condition;
4. focused work;
5. walking;
6. resting or idle;
7. content happy base.

When several physical conditions apply, the most dangerous one owns the face.
The existing bars and tags continue to show all conditions. The condition
order is hypothermia or cold, sickness or injury, thirst, starvation or
hunger, exhaustion or sleepiness, then heat.

Condition treatments are:

| Condition | Expression and treatment |
| --- | --- |
| cold or hypothermia | distressed face, cool treatment, occasional shiver |
| hot | raised brow, open mouth, low warm flush |
| exhausted or sleepy | heavy face, limited ambient motion |
| hungry or thirsty | unhappy face |
| sick or injured | pained face |

Heat uses the existing high-felt-temperature boundary already used by water
loss: felt temperature above 20 C. It is presented only at warmth 80 or above,
so a cold body beside a new fire does not instantly look overheated.

### Focused work

Work uses the approved B expression: open attentive eyes, a composed mouth,
one concentrating eyebrow, and one raised eyebrow. Toon Head supplies both
eyebrows as a single component, so this is built from two otherwise identical
cached frames. CSS reveals one half of the raised-brow frame over the
concentrating frame. The survivor seed decides which side rises.

A slight forward posture reinforces work without replacing the existing quiet
activity animation.

### Firelight

Firelight is independent of expression. It appears when a lit camp fire is on
the survivor's current cell. Direction is not simulated, so the art always
places the fire below the portrait rather than inventing a left or right
position.

Two overlapping CSS layers create the effect:

- a radial amber light strongest at the chin and lower clothing;
- a blurred ember glow below the portrait.

Their opacity and vertical reach pulse on different short rhythms so the glow
does not breathe mechanically. Reduced-motion mode keeps a static low glow.

## Files

- `package.json` and lockfile: add DiceBear core and styles.
- `src/ui/face.ts`: local generation, identity picks, frame cache, fallback.
- `src/ui/portrait.ts`: pure live-state reading and live portrait markup.
- `src/ui/portrait-motion.ts`: ambient real-time controller.
- `src/ui/panels.ts`: render the live portrait in the stats header.
- `src/main.ts`: advance the controller after normal rendering.
- `src/style.css`: frame layers, crossfades, posture, shiver, heat, cold, and
  bottom firelight.
- `src/faces.ts`: identity, size, expression, state, and motion contact sheet.
- in-game manual or settings: ToonHead attribution.
- tests for face generation, state priority, motion, churn, and CSS coverage.

## Verification

Automated checks cover:

- stable identity for one seed and different identities across seeds;
- facial-hair and clothing curation;
- expression changes that preserve identity;
- a 256-entry cache bound and pixel fallback;
- state priority across cold, heat, hunger, thirst, exhaustion, injury,
  sickness, sleep, work, and death;
- immediate condition response during a forced once-order;
- blink intervals in the inclusive 1 to 5 second range;
- blink duration in the 100 to 180 ms range;
- hidden-tab pause and clean resume;
- cancellation when survivor or condition changes;
- reduced-motion coverage;
- firelight only on the current cell beside a lit camp fire;
- no regression in the existing panel churn budget.

Run `npm test`, `npm run build`, and the repository root lint. Then review the
contact sheet and the game in a browser at 1440 by 900 and at 390 pixels wide.
The browser pass checks:

- three landing candidates remain distinct and legible;
- static portraits agree across landing, journal, away report, tombstone, and
  cemetery;
- the 24px header remains legible in every state;
- blink, glance, focus posture, shiver, and firelight remain quiet;
- urgent conditions replace ambient flavor immediately;
- the fire glow rises from below and pulses without looking periodic;
- reduced motion remains static;
- no layout moves when a portrait frame changes.

## Playtest gate

Play from a fresh landing through ordinary work, a cold spell, recovery by a
fire, hunger or thirst during a forced once-order, sleep, and death. It is
wrong if the survivor appears cheerful while distressed, focused while asleep,
hot while their body is still cold, newly re-rolled after an expression
change, or animated in a historical record. It is also wrong if the portrait
becomes a more urgent signal than the body's bars and written tags.

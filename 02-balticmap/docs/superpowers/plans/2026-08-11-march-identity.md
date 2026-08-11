# March Identity and the Declaration Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every march a stable identity that survives the event explaining
its departure, and emit an event when one is declared, so the presentation
pipeline built on top of this can key arrows and correlate departures with
outcomes.

**Architecture:** `March` gains an `id` allocated from a counter on
`GameState`, and the `Marches` store is keyed by that id instead of by a
recycled `${from}>${to}#${slot}` slot. `march-resolved` and `march-lapsed`
carry `marchIds: number[]` - plural, because a clash retires two arrows and
emits one event. A new `march-declared` event type goes through every
exhaustive table and bumps the wire protocol.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

This is **step 1 of 5** in
`docs/superpowers/specs/2026-08-11-presentation-pipeline-design.md`. It is
self-contained and shippable: after it, the game plays exactly as before and
nothing consumes the new identity yet. Steps 2 to 5 each get their own plan,
written once its predecessor has landed.

## Global Constraints

- `npm test` and `npm run build` must both pass before any commit.
- Do not run `npm run balance`. Balance evidence is produced on demand only.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- No em dashes and no non-typable unicode in any source, comment or commit
  message. Use `-`, `->`, `"`, `...`.
- Comments explain a constraint the code cannot show. Never a date, never a
  before/after chronicle of the change.
- Every player-facing name of a card or faction is a `card()` / `faction()`
  segment from `src/rich-text.ts`, never interpolated into a string.
- Nothing may consume rng that did not before. `tests/rng-isolation.test.ts`
  catches nondeterminism but not an added draw, so keep the discipline
  structural.
- `cardRulesHash` must not change. This plan touches no card behaviour.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/marches.ts` | The `March` record and pure helpers over the two stores | `March.id`; `addMarch` keys by id; doc comment on `Marches` |
| `src/game.ts` | `GameState`, the reducer, `beginTurn`, `resolveMarches` | `nextMarchId`; id allocation at both `addMarch` sites; `marchIds` on three event kinds; `clash` split into `incoming`/`counter`; `march-declared`; `GameEventType`; `nestsUnderItsCause` |
| `src/notices.ts` (readers) | Round-summary lines for a landing | Three `clash` readers move to `counter`/`incoming` |
| `src/hud.ts` (reader) | Log line for a landing | One `clash` reader moves |
| `src/main.ts` (readers) | `flashMarchResolution`, deleted in step 4 | Five `clash` readers move; the `?? 1` width bug goes with them |
| `src/boot-params.ts` | `?march=` boot override | Allocate an id when declaring |
| `src/audio-manifest.ts` | `EVENT_SOUNDS`, exhaustive | Entry for `march-declared` |
| `src/notices.ts` | `NOTICE_RULES`, exhaustive | Entry for `march-declared` |
| `src/replay.ts` | `REPLAY_RULES`, exhaustive | Entry for `march-declared` (deleted wholesale in step 3) |
| `src/net-protocol.ts` | `PROTOCOL_VERSION` | 5 -> 6 |
| `tests/marches.test.ts` | Pure store helpers | Key-format assertions updated; id allocation |
| `tests/game.test.ts` | The reducer | Key-format assertion updated; the identity invariant |
| `tests/net-protocol.test.ts` | Wire | Version assertion updated |

---

### Task 1: Marches are keyed by a stable id

Today `addMarch` computes `${m.from}>${m.to}#${slot}` with `slot` the lowest
FREE index (`src/marches.ts:117`). When a march clears, its slot is handed to
the next march on that axis, so the same key means two different armies at two
different times. Anything that keys a DOM node or an event on it would silently
morph one arrow into another.

Nothing in `src/` parses the key - it is opaque at every call site - so the
key can simply become the id.

**Files:**
- Modify: `src/marches.ts:28-59` (the `March` interface), `src/marches.ts:61`
  (the `Marches` doc comment), `src/marches.ts:115-119` (`addMarch`)
- Test: `tests/marches.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `March.id: number`; `addMarch(marches: Marches, m: March): Marches`
  keying by `String(m.id)`. The caller supplies the id.

- [ ] **Step 1: Write the failing test**

Replace the two key-format assertions in `tests/marches.test.ts` (at the
`selija>talava#0` and the sorted-keys expectations, currently lines 68 and 77)
and add the recycling test. Find the existing `march(...)` helper in that file
and give it an `id`; if there is no helper, build the records inline as below.

```ts
const m = (id: number, over: Partial<March> = {}): March => ({
  id, actor: "selija", from: "selija", to: "talava",
  cardId: "raid", damage: 1, holdsArmy: true, expiry: 2, ...over,
});

it("keys a march by its own id", () => {
  const marches = addMarch(addMarch({}, m(7)), m(8));
  expect(Object.keys(marches).sort()).toEqual(["7", "8"]);
});

it("never hands a cleared march's key to a later one", () => {
  // The whole point of the id. The old scheme allocated the lowest FREE
  // slot, so this sequence produced the same key twice for two different
  // armies, and anything keyed on it followed the wrong arrow.
  const first = addMarch({}, m(1));
  const afterClear = clearMarches(first, ["1"]);
  const second = addMarch(afterClear, m(2));
  expect(Object.keys(second)).toEqual(["2"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/marches.test.ts`
Expected: FAIL. TypeScript rejects `id` as an unknown property of `March`, and
the key assertions read `selija>talava#0`.

- [ ] **Step 3: Add the field and key by it**

In `src/marches.ts`, add to the `March` interface, after `expiry`:

```ts
  /** This march's identity, for as long as it exists and never again.
   *
   *  Allocated from `GameState.nextMarchId` at declaration and never reused,
   *  which is the whole difference from the slot scheme this replaced: that
   *  handed a cleared march's key to the next one on the same axis, so a key
   *  meant two different armies at two different times. The arrow on the map
   *  is keyed on this, and the events that retire a march name it, so a
   *  departure can be matched to the thing that explains it. */
  id: number;
```

Replace `addMarch` (currently `src/marches.ts:115-119`):

```ts
export function addMarch(marches: Marches, m: March): Marches {
  return { ...marches, [String(m.id)]: m };
}
```

Update the `Marches` doc comment at `src/marches.ts:61` to say the key is the
march's own `id` as a string, and that nothing may parse it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/marches.test.ts`
Expected: PASS.

- [ ] **Step 5: Allocate the id at all three declaration sites**

`addMarch` is called from exactly three places. Add `nextMarchId` to
`GameState` first, in `src/game.ts` beside `marches` (currently
`src/game.ts:289-293`):

```ts
  /** The id the next declared march takes, then one more. Monotonic and
   *  never reused, so an id identifies one army for the length of the run.
   *  On the state rather than in a module because it must be deterministic
   *  and must cross the wire with everything else. */
  nextMarchId: number;
```

Initialise it to `1` wherever `marches: {}` is initialised in `newGame`.

At `src/game.ts:1369` (the restless raid) and `src/game.ts:2039`
(`declareMarch`), the enclosing functions already thread a local `marches`.
Thread an id counter the same way: read `state.nextMarchId`, keep a local
`nextMarchId` that increments on each declaration, add `id: nextMarchId++` to
the object literal handed to `addMarch`, and include `nextMarchId` in the state
each function returns.

At `src/boot-params.ts:409`, the override builds a state directly:

```ts
      marches: addMarch(g.marches, {
        id: g.nextMarchId,
        // ...the existing fields, unchanged
      }),
      nextMarchId: g.nextMarchId + 1,
```

Note `applyBootParams` may declare several marches from one `march=` clause
list; if it loops, carry the counter across iterations rather than reading
`g.nextMarchId` each time.

- [ ] **Step 6: Fix the one other key-format assertion**

`tests/game.test.ts:3043` builds expected keys as `` `beta>${t}#${i}` ``.
Marches there are declared through the reducer, so the ids are allocated in
declaration order from wherever the fixture's `nextMarchId` starts. Replace the
expectation with one that reads the ids off the store rather than predicting
the format:

```ts
        expect(Object.entries(g.marches).map(([key, m]) => [key, m.to]))
          .toEqual(targets.map((t, i) => [String(i + 1), t]));
```

Adjust `i + 1` to the fixture's actual starting `nextMarchId` if it is not 1;
run the test and read the failure to find out rather than guessing.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: PASS. The compile is the real check here - `net-codec.ts`'s
`_everyFieldSurvivesTheWire` assertion will confirm `nextMarchId` crosses the
wire, since a number is JSON-safe.

- [ ] **Step 8: Commit**

```bash
git add 02-balticmap/src/marches.ts 02-balticmap/src/game.ts \
        02-balticmap/src/boot-params.ts \
        02-balticmap/tests/marches.test.ts 02-balticmap/tests/game.test.ts
git commit -m "feat(balticmap): an army keeps its name until it is gone

The march store keyed on the lowest free slot, so a cleared march handed
its key to the next one on the same axis and a key meant two different
armies at two different times. Marches now carry an id from a counter on
the state, never reused, and the store is keyed by it."
```

---

### Task 2: The events name the marches they retire, and what was thrown

A clash retires two arrows and emits one `march-resolved`. Three arrows on one
axis can produce one event. There is no way to match a departure to its
explanation without the events saying so. And the resolution arrow the
presentation will draw is reconstructed from the event alone, so the event has
to state the force aimed at the loser even when nobody answered it.

**Files:**
- Modify: `src/game.ts:96-160` (the `GameEvent` interface),
  `src/game.ts:1064-1075` (`arrival`), `src/game.ts:1191-1196` and
  `src/game.ts:1544-1549` (`march-lapsed`), `src/game.ts:1573-1579` (the
  standoff), `src/game.ts:1644` (the ordinary landing), `src/game.ts:915`
  (`metNothing`), `src/game.ts:1610` (the `clash` arithmetic)
- Modify: `src/notices.ts:400,417,430`, `src/hud.ts:517`,
  `src/main.ts:1723,1737,1738,1740,1743`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `March.id` from Task 1.
- Produces: `GameEvent.marchIds?: number[]` on `march-resolved` and
  `march-lapsed`; `GameEvent.incoming?: number` (always present on
  `march-resolved`) and `GameEvent.counter?: number` (present iff contested),
  replacing `GameEvent.clash`.

- [ ] **Step 1: Write the failing invariant test**

Add to `tests/game.test.ts`. This is the test the whole task exists for: it
says every arrow that left is accounted for by something in the log.

It walks `advance` calls only, which are all non-settled transitions - the
spec scopes the invariant to those deliberately, because a snapshot replaces
`marches` wholesale and carries no departure events. There is no settled path
through the reducer, so nothing here has to exclude one.

```ts
it("every march that leaves the store is named by an event of the same batch", () => {
  // The correlation the presentation layer needs. A clash retires two
  // arrows and emits one event, so this cannot be checked one for one - it
  // is a set difference against the union of what the batch names.
  let g = /* a seeded mid-game fixture with marches in flight from several
             seats - reuse whatever helper this file already uses to reach a
             state with a populated `marches` */;
  for (let round = 0; round < 12; round++) {
    const before = new Set(Object.values(g.marches).map((m) => m.id));
    const logAt = g.log.length;
    g = advance(g, rng);
    const after = new Set(Object.values(g.marches).map((m) => m.id));
    const departed = [...before].filter((id) => !after.has(id));
    const named = new Set(
      g.log.slice(logAt).flatMap((e) => e.marchIds ?? []),
    );
    expect(departed.filter((id) => !named.has(id))).toEqual([]);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game.test.ts -t "leaves the store"`
Expected: FAIL. `marchIds` does not exist, so `named` is always empty and any
round that resolves a march reports departures.

- [ ] **Step 3: Add the field**

In `src/game.ts`, in the `GameEvent` interface beside `clash`:

```ts
  /** march-resolved, march-lapsed: which marches this event took off the
   *  board. Plural because a clash retires both sides and reports once, and
   *  because several arrows down one axis can resolve into a single landing.
   *  This is what lets a departed arrow be matched to the thing that explains
   *  it; without it, an arrow vanishing and an event arriving are two facts
   *  with nothing joining them. */
  marchIds?: number[];
```

- [ ] **Step 4: Populate it at every site that clears a march**

There are five. Each already has the march or marches in hand:

1. `src/game.ts:1191` (`callOffMarchesAgainstLord`) - add
   `marchIds: [march.id]`.
2. `src/game.ts:1544` (the lapsed-because-the-ground-moved arm of
   `resolveMarches`) - add `marchIds: [entry.march.id]`.
3. `src/game.ts:1573` (the standoff) - add
   `marchIds: [eng.fromA!.id, eng.fromB!.id]`.
4. `src/game.ts:1644` (the ordinary landing) - add the ids of both sides of
   the engagement, filtering the null one:
   `marchIds: [eng.fromA?.id, eng.fromB?.id].filter((id): id is number => id !== undefined)`.
5. The `arrival` helper at `src/game.ts:1064` - it is called from
   `applyArrival` for both the capture and the spent-arrow branch. Give
   `arrival` a `marchIds: number[]` parameter and thread it from `Capture`,
   which needs a `marchIds` field adding for the purpose. Both `onArrival`
   call sites (`src/game.ts:1595` and `src/game.ts:1631`) have the engagement
   in scope and pass the same filtered pair as case 4.

- [ ] **Step 5: Split `clash` into `incoming` and `counter`**

A resolution arrow is reconstructed from its event alone, so the event must
carry the force aimed at the loser whether or not anybody answered it. Today
`clash` is present only when contested (`src/game.ts:1650`), and `amount` is
the defense actually moved, floored at what the land had - so a 3-strength raid
onto a land holding 1 records `amount: 1` and nothing about the 3.

Adding a field beside `clash.incoming` would duplicate it. Replace `clash`
instead. In `GameEvent`, delete the `clash` field and add:

```ts
  /** march-resolved: the strength aimed AT the loser, whichever end of the
   *  axis that turned out to be. ALWAYS present on this type, including an
   *  uncontested landing and an arrival that moved nothing - the arrow the
   *  presentation draws is reconstructed from this event alone, and `amount`
   *  cannot stand in for it: `amount` is floored at what the land had
   *  standing, so a 3-strength blow on a 1-defense land reports 1. */
  incoming?: number;
  /** march-resolved: what the loser mustered against it. Present exactly when
   *  the landing was contested, which makes it the contested discriminant -
   *  the job `clash`'s presence used to do. */
  counter?: number;
```

Then move every reader and writer:

- `src/game.ts:915` (`metNothing`): `e.amount === undefined && e.counter === undefined`.
- `src/game.ts:1577` (the standoff): `incoming: strengthB, counter: strengthA`.
- `src/game.ts:1650` (the ordinary landing): `incoming: clash.incoming` always,
  and `...(contested ? { counter: clash.counter } : {})`. The local `clash`
  object computed at `src/game.ts:1610` stays - it is the right arithmetic, it
  just stops being stored as one field.
- `src/game.ts:1072` and `src/game.ts:1222`: thread `incoming` and `counter`
  through `arrival` and `Capture` in place of `clash`. **`incoming` must be
  passed even on the `metNothing` path**, where `amount` is absent - that is
  the whole point of the change.
- `src/notices.ts:400, 417, 430` and `src/hud.ts:517`: replace
  `e.clash !== undefined` with `e.counter !== undefined`, and
  `e.clash.incoming` / `e.clash.counter` with `e.incoming` / `e.counter`.
- `src/main.ts:1723, 1737, 1738, 1740, 1743`: these are inside
  `flashMarchResolution`, which a later step of this spec deletes. For now make
  them compile against the new fields and take the free bug fix: line 1723's
  `e.clash?.incoming ?? 1` becomes `e.incoming ?? 1`, which is why an
  uncontested landing has been drawn one unit wide whatever its strength.
- `tests/game.test.ts:637, 647`: update the two literals.

Add the test that pins the point:

```ts
it("a landing states the force aimed at it, not just what got through", () => {
  // A 3-strength raid onto a land holding 1. `amount` is floored at the
  // defense that was there; `incoming` is what was thrown.
  const g = /* declare a 3-damage march at a land at 1 defense, then advance
               to the actor's turn - this file's defense and march helpers */;
  const e = g.log.find((x) => x.type === "march-resolved")!;
  expect(e.amount).toBe(1);
  expect(e.incoming).toBe(3);
  expect(e.counter).toBeUndefined();
});
```

- [ ] **Step 6: Run the invariant test**

Run: `npx vitest run tests/game.test.ts -t "leaves the store"`
Expected: PASS.

If it still reports a departure, the likely culprit is the `if (moved <= 0)
continue;` at `src/game.ts:1643`: an engagement whose damage is reduced to
nothing by terrain clears its marches and pushes no event. That is a real hole
this invariant exists to find. Fix it by emitting the landing event with
`amount` absent rather than by `continue` - a blow that reached and did
nothing is exactly the `metNothing` shape the log already renders as
"reaches".

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: PASS. Watch `tests/standings.test.ts` in particular: it replays a
full game and checks the walk against the real stores, so if step 6's fix
added an event carrying an `amount` it will say so. `tests/notices.test.ts`
and `tests/hud.test.ts` cover the `clash` readers moved in step 5.

- [ ] **Step 8: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/src/notices.ts \
        02-balticmap/src/hud.ts 02-balticmap/src/main.ts \
        02-balticmap/tests/game.test.ts
git commit -m "feat(balticmap): an event says which arrows it took, and what was thrown

A clash retires two marches and reports once, so a departure and an event
could not be matched one for one - and a map that keys arrows on identity
needs them matched. march-resolved and march-lapsed now carry marchIds,
and a test walks a dozen rounds asserting nothing leaves unaccounted for.

clash splits into incoming and counter so a landing states the force aimed
at it even when nobody answered: amount is floored at the defense that was
standing, so a 3-strength blow on a 1-defense land reported 1 and nothing
about the 3. The ghost has been drawing every uncontested landing one unit
wide for exactly this reason."
```

---

### Task 3: A declared attack is an event

`declareMarch` (`src/game.ts:2036`) deliberately emits nothing: the `play`
event carries both ends of the arrow. That was fine while the arrow was only a
picture, but the presentation pipeline needs the moment - a rival aiming a raid
at your land is currently shown by nothing at all, and the arrow simply appears
on the next repaint.

**Files:**
- Modify: `src/game.ts:53-61` (`GameEventType`), `src/game.ts:845`
  (`nestsUnderItsCause`), `src/game.ts:2036-2042` (`declareMarch`),
  `src/game.ts:1369` (the restless raid)
- Modify: `src/audio-manifest.ts:55`, `src/notices.ts:471`, `src/replay.ts:95`
- Modify: `src/net-protocol.ts:13`
- Test: `tests/net-protocol.test.ts:71`, `tests/game.test.ts`

**Interfaces:**
- Consumes: `March.id` from Task 1, `GameEvent.marchIds` from Task 2.
- Produces: the `"march-declared"` member of `GameEventType`. The event carries
  `marchIds: [id]`, `sourceFactionId` (the land marched out of),
  `targetFactionId` (the land aimed at), `cardId`, and `amount` (the frozen
  damage).

- [ ] **Step 1: Write the failing test**

```ts
it("declaring a raid says so, naming the arrow it drew", () => {
  const g = /* play a Raid from the fixture's human seat at a bordering land,
               using this file's existing play helper */;
  const declared = g.log.filter((e) => e.type === "march-declared");
  expect(declared).toHaveLength(1);
  const id = Object.values(g.marches)[0].id;
  expect(declared[0].marchIds).toEqual([id]);
  expect(declared[0].sourceFactionId).toBe(/* the source land */);
  expect(declared[0].targetFactionId).toBe(/* the target land */);
  // The strength the arrow will print, frozen at declaration.
  expect(declared[0].amount).toBe(1);
});

it("a declaration is indented under the play that made it", () => {
  const g = /* the same */;
  const declared = g.log.find((e) => e.type === "march-declared")!;
  expect(declared.consequence).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game.test.ts -t "declaring a raid"`
Expected: FAIL. TypeScript rejects `"march-declared"` as a `GameEventType`.

- [ ] **Step 3: Add the type and classify it in every exhaustive table**

Four tables will refuse to compile until each is answered. Add
`| "march-declared"` to `GameEventType` beside `"march-resolved"`, then:

`src/audio-manifest.ts`, in `EVENT_SOUNDS`:

```ts
  // An army setting out, which is a different moment from one arriving.
  "march-declared": "march",
```

`src/notices.ts`, in `NOTICE_RULES`:

```ts
  "march-declared": {
    kind: "silent",
    reason: "the arrow is on the map for a whole turn and the play's own " +
      "line names both ends; a modal for a threat the player can see " +
      "coming and answer is the round summary shouting",
  },
```

`src/replay.ts`, in `REPLAY_RULES`. This entry is deliberately minimal - step 3
of the spec deletes this whole table, and giving the declaration a camera step
belongs there, with the audience gate that decides who it is for:

```ts
  "march-declared": {
    kind: "passed-over",
    reason: "the arrow appearing is its moment, and until the presentation " +
      "pipeline owns the arrow layer there is nothing here to show that the " +
      "map does not already draw",
  },
```

`src/game.ts`, in `nestsUnderItsCause` at line 845: return `true`. A
declaration is caused by the play above it and must indent under it.

- [ ] **Step 4: Push the event at both declaration sites**

In `declareMarch` (`src/game.ts:2036`), after the `addMarch` call, replacing
the "No event" clause of its doc comment with a sentence saying the event marks
the moment the arrow appears and carries the id the arrow is keyed on:

```ts
    events.push({
      turn: state.turn, playerId: p.id, type: "march-declared",
      cardId, targetFactionId: to, sourceFactionId: from,
      marchIds: [id], amount: damage,
    });
```

where `id` is the id this call allocated in Task 1.

Do the same at the restless-raid site (`src/game.ts:1369`), using that block's
`seat.id` for `playerId` and `"raid"` for `cardId`. Push it **after** the
existing `play` event at `src/game.ts:1382`, so the declaration reads as
something that play did rather than as a line standing before its own cause.

Note that `consequence` will not be stamped there and that is correct.
`appendEvents` reads it off the batch's shape - "not first in a batch that
starts with a play" - and the restless raid is pushed into `beginTurn`'s batch,
which starts with something else. The second test in step 1 therefore asserts
`consequence` only on the `playCard` path, which is the batch that does start
with a play.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/game.test.ts -t "declar"`
Expected: PASS.

- [ ] **Step 6: Bump the protocol**

A new event type changes the wire schema even though no card behaviour moves
and `cardRulesHash` is untouched. Two builds that disagree about what a log
entry can contain must decline to shake hands.

`src/net-protocol.ts:13`: `export const PROTOCOL_VERSION = 6;`

`tests/net-protocol.test.ts:71`: `expect(PROTOCOL_VERSION).toBe(6);`

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: PASS. `tests/naming-convention.test.ts` drives every event type
through the log and the round summary, so it will fail if the new type has no
renderable segments - if it does, give it a line in `eventSegments` built from
`card()` and `faction()` segments, never a template literal.

- [ ] **Step 8: Browser pass**

Run `npm run dev` from `02-balticmap` and open:

```
http://127.0.0.1:5173/prototypes/02/?seed=4&faction=selonians&build=warpath&armies=selonians:4&march=selonians>jersikans&rules=turn:unlimited
```

Click End turn and read the activity log. Expected: the game plays exactly as
before, and the log now carries a declaration line indented under each Raid
play. Nothing should look different on the map - this step ships identity, not
presentation. Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/src/audio-manifest.ts \
        02-balticmap/src/notices.ts 02-balticmap/src/replay.ts \
        02-balticmap/src/net-protocol.ts \
        02-balticmap/tests/game.test.ts 02-balticmap/tests/net-protocol.test.ts
git commit -m "feat(balticmap): an army setting out is a moment, not just a picture

declareMarch emitted nothing, so a rival aiming a raid at your land was
shown by an arrow appearing on the next repaint and nothing else. The
declaration is now an event carrying the id of the arrow it drew, through
every exhaustive table, and the protocol version moves with it."
```

---

## Self-Review

**Spec coverage.** This plan covers spec section 5 (march identity, the
declaration event, the protocol bump) and the invariant stated there. Spec
sections 1 to 4 and 6 to 8 are steps 2 to 5 of the order of work and are
explicitly out of scope, named at the top of this document.

**Placeholders.** Three steps contain a `/* ... */` describing a fixture rather
than literal code: Task 2 step 1, and Task 3 step 1 twice. This is deliberate
and is not a licence to improvise - `tests/game.test.ts` already has helpers
for reaching a mid-game state and for playing a card, and the implementer must
use the ones that are there rather than writing new ones. Everything else is
literal.

**Type consistency.** `March.id: number` (Task 1) is read as `m.id` and
`entry.march.id` and `eng.fromA!.id` (Task 2) and passed as `marchIds: [id]`
(Task 3). `GameState.nextMarchId: number` (Task 1) is read in
`src/boot-params.ts` as `g.nextMarchId` (Task 1) and allocated in
`declareMarch` (Tasks 1 and 3). `GameEvent.marchIds?: number[]` is written in
Task 2 and read in Task 2's invariant test and Task 3's assertions.
`GameEvent.clash` is deleted in Task 2 step 5 and replaced by `incoming` and
`counter`; no later task refers to `clash`.

**Spec sections covered.** Section 5 in full, including the reconstructibility
requirement and the invariant's non-settled scoping. Sections 1 to 4 and 6 to 8
are steps 2 to 5 of the order of work.

**Known risk.** Task 2 step 5 may find a real hole at `src/game.ts:1643`. The
step says what to do about it rather than leaving the implementer to decide,
but if the fix turns out to move a number that `tests/standings.test.ts`
walks, stop and report rather than adjusting that test to fit.

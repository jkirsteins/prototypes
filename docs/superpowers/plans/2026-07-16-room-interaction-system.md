# Room Interaction System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A point-and-click verb strip (look/use) over the ink story: look around spots room objects, look table reveals a stuck drawer, strength >= 2 yanks it open, the tin inside lights the cold candle, the background swaps to a lit room, and a later look around reveals more objects.

**Architecture:** Ink owns all state. `spotted` and `inventory` are ink LIST variables; the TS strip UI is a pure projection of them plus one piece of UI-only state (selected verb). Strip clicks call `story.ChoosePathString("interact", true, [verb, item])` into an ink dispatcher knot that diverts to authored handler stitches or a generic in-fiction fallback.

**Tech Stack:** inkjs 2.4 (Story, InkList), TypeScript, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-room-interaction-system-design.md`

## Global Constraints

- Player-facing text never contains: "coffin", "dungeon", "tutorial", "build set", "clue found", "item gained", "memory gained", "deduction", nor word-boundary "cell(s)"/"prison(s)". The test suite enforces this; every new prose line runs through it.
- No meta language in player-facing text; state changes happen silently in prose (show, don't tell).
- No em dashes or non-typable unicode anywhere (code, prose, docs). Use "-", "'", "...".
- Minimal UI: no boxes, borders, panels, or button-styled controls in player-facing UI. Plain text over the background image; at most a soft gradient scrim. (Unstyled `<button>` elements rendered as plain text, like the existing `.choice`, are fine.)
- Mechanics (stats, flags, item ids) never shown to the player. Debug panel is the only exception and stays labeled "DEBUG - not player-facing, remove before release".
- `npm test` runs `compile:ink` first; never hand-edit `src/ink/coffin.json`.
- Verified API facts (already probed, do not re-verify): `variablesState.$("spotted")` returns an `InkList`; item names via `list.orderedItems.map(e => e.Key.itemName)`; `ChoosePathString(path, true, [verb, item])` binds knot parameters; end-of-line `# image:x` tags fire only on their branch; `InkList` is exported from `"inkjs"`.

---

### Task 1: Ink spotting state + snapshot projection

**Files:**
- Modify: `src/ink/coffin.ink` (VAR block at top; `cell_room` and `cell_room_loop` knots at bottom)
- Modify: `src/ink/coffinScene.ts`
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Produces: `CoffinSnapshot.spotted: string[]` and `CoffinSnapshot.inventory: string[]` (ink item ids, e.g. `"table"`, `"candle"`); ink vars `spotted`, `inventory`, `drawer_open`, `candle_lit`, `room_scanned`, `light_scanned`; ink LIST `items = table, drawer, tinderbox, candle, hanging, cage, bucket`.
- Consumes: existing `CoffinScene` snapshot pattern and `choose()` test helper.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` block in `src/ink/coffinScene.test.ts`, and add this helper next to the existing `choose` helper:

```ts
function enterRoomByForce(scene: CoffinScene): void {
  for (let push = 0; push < 5; push += 1) {
    choose(scene, "Push against the wood above you.");
  }
  choose(scene, "Step into the room.");
}
```

New tests:

```ts
it("spots the cold candle on entering the room", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);

  expect(scene.snapshot.spotted).toContain("candle");
  expect(scene.snapshot.inventory).toEqual([]);
  expect(scene.snapshot.paragraphs.join(" ").toLowerCase()).not.toContain("burn");
});

it("spots the table on the first look around", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);

  choose(scene, "Look around.");
  expect(scene.snapshot.spotted).toContain("table");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("table");

  choose(scene, "Look around.");
  expect(scene.snapshot.paragraphs.join(" ")).toContain(
    "Nothing in particular catches your eye.",
  );
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});
```

Update the existing test `"keeps the room open after looking around finds nothing"`: the first "Look around." now spots the table, so move the nothing-line assertion to the second look:

```ts
it("keeps the room open after looking around finds nothing new", () => {
  const scene = new CoffinScene();

  choose(scene, "Feel along the velvet.");
  choose(scene, "Work the loose nail free.");
  choose(scene, "Trace where the wood resists.");
  choose(scene, "Force the hinge with the nail.");
  choose(scene, "Step into the room.");

  choose(scene, "Look around.");
  choose(scene, "Look around.");
  expect(scene.snapshot.paragraphs.join(" ")).toContain(
    "Nothing in particular catches your eye.",
  );
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: the two new tests FAIL (`spotted` is undefined on the snapshot); previously passing tests still pass except the updated one may fail until ink changes land.

- [ ] **Step 3: Ink changes**

In `src/ink/coffin.ink`, add below the existing VAR block (after `VAR escaped = false`):

```ink
LIST items = table, drawer, tinderbox, candle, hanging, cage, bucket
VAR spotted = ()
VAR inventory = ()
VAR drawer_open = false
VAR candle_lit = false
VAR room_scanned = false
VAR light_scanned = false
```

Replace the `cell_room` and `cell_room_loop` knots entirely:

```ink
=== cell_room ===
# image:cell-room
~ spotted += candle
Cold rises through the flagstones and finds your bare ankles at once.

Grey light leans in through a barred window, strained through the ribbons of a curtain long past its duty. A heavy door stands shut in the far wall, banded in iron, with a small grille set at eye height. Along the stone, chains hang slack and patient, and a low pallet holds a blanket someone left twisted, as if they got up in a hurry.

A single candle sits cold in a sconce by the door, its wick a black curl. Nobody has needed light here for a long time.

-> cell_room_loop

=== cell_room_loop ===
+ [Look around.]
    { not room_scanned:
        ~ room_scanned = true
        ~ spotted += table
        Under the window, half-lost in the curtain's shadow, stands a small wooden table. Something about its squat, stubborn shape says it was dragged here from a better room.
    - else:
        { candle_lit and not light_scanned:
            ~ light_scanned = true
            ~ spotted += (hanging, cage, bucket)
            The candlelight pushes the shadows back to the corners, and the room gives up more of itself: a faded hanging on the wall, its picture worn to a ghost; an iron cage hanging still from a beam; a wooden bucket waiting in the far corner.
        - else:
            You look, and look again. Nothing in particular catches your eye.
        }
    }
    -> cell_room_loop
```

(The `light_scanned` branch is exercised in Task 3; it is inert until `candle_lit` can become true.)

- [ ] **Step 4: Snapshot projection in `src/ink/coffinScene.ts`**

Change the import and add the fields:

```ts
import { InkList, Story } from "inkjs";
```

Add to `CoffinSnapshot`:

```ts
  spotted: string[];
  inventory: string[];
```

Add to the object returned by `get snapshot()`:

```ts
      spotted: this.listVariable("spotted"),
      inventory: this.listVariable("inventory"),
```

Add a private helper next to the other variable readers:

```ts
  private listVariable(name: string): string[] {
    const value = this.story.variablesState.$(name);

    if (!(value instanceof InkList)) {
      return [];
    }

    return value.orderedItems
      .map((entry) => entry.Key.itemName)
      .filter((itemName): itemName is string => itemName !== null);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffinScene.ts src/ink/coffinScene.test.ts src/ink/coffin.json
git commit -m "feat: ink-owned spotted/inventory lists and look-around spotting"
```

(Check `.gitignore` first: if `coffin.json` is ignored, drop it from the add.)

---

### Task 2: interact dispatcher + table/drawer handlers

**Files:**
- Modify: `src/ink/coffin.ink` (append knots at end of file)
- Modify: `src/ink/coffinScene.ts`
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: Task 1's `spotted` list, `enterRoomByForce` helper, `drawer_open`, `strength` VAR (2 for the strength build, 0 otherwise).
- Produces: `export type ItemVerb = "look" | "use";` and `CoffinScene.interact(verb: ItemVerb, item: string): CoffinSnapshot`; ink knot `interact(verb, item)` with stitches `look_table`, `look_drawer`, `use_drawer`; knot `interact_fallback(verb, item)`. Spotting `tinderbox` on drawer success.

- [ ] **Step 1: Write the failing tests**

Add a helper next to `choose` (imports gain `ItemVerb`):

```ts
import { CoffinScene, type ItemVerb } from "./coffinScene";

function interact(scene: CoffinScene, verb: ItemVerb, item: string): void {
  scene.interact(verb, item);
  expectNoFictionBreak(scene);
}
```

New tests:

```ts
it("reveals the drawer when looking at the table", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");

  interact(scene, "look", "table");

  expect(scene.snapshot.spotted).toContain("drawer");
  expect(scene.snapshot.spotted).not.toContain("table");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("drawer");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});

it("opens the drawer with enough strength and reveals the tin", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");
  interact(scene, "look", "table");

  expect(scene.snapshot.attributes.strength).toBe(2);
  interact(scene, "use", "drawer");

  expect(scene.snapshot.spotted).toContain("tinderbox");
  expect(scene.snapshot.spotted).toContain("drawer");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("tin");
});

it("keeps the drawer stuck without strength", () => {
  const scene = new CoffinScene();
  choose(scene, "Feel along the velvet.");
  choose(scene, "Work the loose nail free.");
  choose(scene, "Trace where the wood resists.");
  choose(scene, "Force the hinge with the nail.");
  choose(scene, "Step into the room.");
  choose(scene, "Look around.");
  interact(scene, "look", "table");

  expect(scene.snapshot.attributes.strength).toBe(0);
  interact(scene, "use", "drawer");

  expect(scene.snapshot.spotted).not.toContain("tinderbox");
  expect(scene.snapshot.spotted).toContain("drawer");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("jams");
});

it("answers unauthored combinations with quiet flavor", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");

  interact(scene, "use", "table");

  expect(scene.snapshot.spotted).toContain("table");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("nothing comes of it");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: new tests FAIL (`scene.interact` is not a function).

- [ ] **Step 3: Ink dispatcher and handlers**

Append at the end of `src/ink/coffin.ink`:

```ink
=== interact(verb, item) ===
{ verb == "look" and item == "table": -> look_table }
{ verb == "look" and item == "drawer": -> look_drawer }
{ verb == "use" and item == "drawer": -> use_drawer }
-> interact_fallback(verb, item)

= look_table
~ spotted -= table
~ spotted += drawer
The table has one drawer, set slightly proud of its frame, as if it started to open once and thought better of it. The rest is scarred wood and old candle grease.
-> cell_room_loop

= look_drawer
{ drawer_open:
    The drawer sags open on its runners, empty now but for dust and a smell of old iron.
- else:
    The drawer sits crooked in its housing. Swollen wood, or something jammed; either way, it does not mean to come out politely.
}
-> cell_room_loop

= use_drawer
{ drawer_open:
    You slide the drawer back and forth on its runners. It has given you everything it had.
- else:
    { strength >= 2:
        ~ drawer_open = true
        ~ spotted += tinderbox
        You set your feet, take the drawer's lip in both hands, and yank. The wood shrieks, surrenders, and the drawer jumps its runners into your grip.

        Inside, wrapped in a scrap of waxed cloth: a small tin, and in it flint, steel, and a pinch of char cloth that has kept itself dry all this time.
    - else:
        You pull at the drawer. It shifts a hair's breadth and jams, as if a hand inside were holding it shut. Whatever it wants from you, you do not have it yet.
    }
}
-> cell_room_loop

=== interact_fallback(verb, item) ===
{ verb == "look":
    You study it a while longer. It tells you nothing new.
- else:
    You try it this way and that, and nothing comes of it.
}
-> cell_room_loop
```

- [ ] **Step 4: `interact` method on `CoffinScene`**

Add to `src/ink/coffinScene.ts`:

```ts
export type ItemVerb = "look" | "use";
```

Add the method after `choose`:

```ts
  interact(verb: ItemVerb, item: string): CoffinSnapshot {
    this.story.ChoosePathString("interact", true, [verb, item]);
    this.continueStory();
    return this.snapshot;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffinScene.ts src/ink/coffinScene.test.ts src/ink/coffin.json
git commit -m "feat: interact dispatcher with table and strength-gated drawer"
```

---

### Task 3: tin pickup, candle lighting, lit-room reveal

**Files:**
- Modify: `src/ink/coffin.ink` (extend `interact` dispatcher and stitches)
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: Task 2's dispatcher, `interact` test helper, `enterRoomByForce`; Task 1's `inventory`, `candle_lit`, `light_scanned`, look-around conditional.
- Produces: `inventory` gains `tinderbox` on pickup; `use candle` with the tin sets `candle_lit` and emits `# image:cell-room-lit` (snapshot `imageId` becomes `"cell-room-lit"`); post-lit look around spots `hanging`, `cage`, `bucket`.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves the tin to hand when used in the drawer", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");
  interact(scene, "look", "table");
  interact(scene, "use", "drawer");

  interact(scene, "use", "tinderbox");

  expect(scene.snapshot.inventory).toContain("tinderbox");
  expect(scene.snapshot.spotted).not.toContain("tinderbox");
});

it("cannot light the candle empty-handed", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);

  interact(scene, "use", "candle");

  expect(scene.snapshot.imageId).toBe("cell-room");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("nothing to wake it with");
});

it("lights the candle with the tin and brightens the room", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");
  interact(scene, "look", "table");
  interact(scene, "use", "drawer");
  interact(scene, "use", "tinderbox");

  interact(scene, "use", "candle");

  expect(scene.snapshot.imageId).toBe("cell-room-lit");

  interact(scene, "use", "candle");
  expect(scene.snapshot.imageId).toBe("cell-room-lit");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("needs nothing more");
});

it("reveals more of the room to a second look once lit", () => {
  const scene = new CoffinScene();
  enterRoomByForce(scene);
  choose(scene, "Look around.");
  interact(scene, "look", "table");
  interact(scene, "use", "drawer");
  interact(scene, "use", "tinderbox");
  interact(scene, "use", "candle");

  choose(scene, "Look around.");

  expect(scene.snapshot.spotted).toContain("hanging");
  expect(scene.snapshot.spotted).toContain("cage");
  expect(scene.snapshot.spotted).toContain("bucket");

  interact(scene, "look", "hanging");
  interact(scene, "look", "cage");
  interact(scene, "look", "bucket");

  choose(scene, "Look around.");
  expect(scene.snapshot.paragraphs.join(" ")).toContain(
    "Nothing in particular catches your eye.",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the four new tests FAIL (fallback text instead of handlers; imageId stays `cell-room`).

- [ ] **Step 3: Extend the ink dispatcher and handlers**

In the `interact` knot, add dispatch lines before the `-> interact_fallback(verb, item)` line:

```ink
{ verb == "look" and item == "tinderbox": -> look_tinderbox }
{ verb == "use" and item == "tinderbox": -> use_tinderbox }
{ verb == "look" and item == "candle": -> look_candle }
{ verb == "use" and item == "candle": -> use_candle }
{ verb == "look" and item == "hanging": -> look_hanging }
{ verb == "look" and item == "cage": -> look_cage }
{ verb == "look" and item == "bucket": -> look_bucket }
```

Add stitches before `=== interact_fallback`:

```ink
= look_tinderbox
{ inventory ? tinderbox:
    Flint, steel, char cloth. Small, dry, and willing.
- else:
    The tin sits in the ruined drawer, dented but shut tight against the years.
}
-> cell_room_loop

= use_tinderbox
{ inventory ? tinderbox:
    You turn the tin over in your hand. It wants something worth lighting.
- else:
    ~ spotted -= tinderbox
    ~ inventory += tinderbox
    You lift the tin out of the drawer. It has a satisfying weight, like a promise kept.
}
-> cell_room_loop

= look_candle
{ candle_lit:
    The flame stands small and straight, minding its own business. Its light leans on the stone and stays there.
- else:
    A hand's length of tallow in an iron sconce. It has been waiting longer than you have.
}
-> cell_room_loop

= use_candle
{ candle_lit:
    The flame needs nothing more from you.
- else:
    { inventory ? tinderbox:
        ~ candle_lit = true
        You strike steel against flint until a spark takes in the char cloth, coax it aglow, and touch it to the wick. # image:cell-room-lit

        The flame climbs and steadies, and the room steps closer: stone and iron and old cloth, all leaning into the light.
    - else:
        You pinch the dead wick. Cold. You have nothing to wake it with.
    }
}
-> cell_room_loop

= look_hanging
Up close the hanging is all ghost: a garden, maybe, or a procession, worn down to brown breath on cloth.
-> cell_room_loop

= look_cage
The cage is bird-sized, its little door ajar. Whatever it held left long ago, one way or another.
-> cell_room_loop

= look_bucket
The bucket has been mended twice with wire, and is dry as bone at the bottom.
-> cell_room_loop
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffinScene.test.ts src/ink/coffin.json
git commit -m "feat: tin pickup, candle lighting, and lit-room look pass"
```

---

### Task 4: verb strip UI, lit background, debug additions

**Files:**
- Create: `public/backgrounds/cell-room-lit.png` (copy of `/Users/janis.kirsteins/Downloads/f0dfc347-a491-43a9-8157-fd32bf6b1d36.png`)
- Modify: `src/main.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `CoffinSnapshot.spotted` / `.inventory`, `ItemVerb`, `CoffinScene.interact` from Tasks 1-2.
- Produces: player-facing strip; `BACKGROUNDS["cell-room-lit"]`.

- [ ] **Step 1: Copy the asset**

```bash
cp "/Users/janis.kirsteins/Downloads/f0dfc347-a491-43a9-8157-fd32bf6b1d36.png" public/backgrounds/cell-room-lit.png
```

- [ ] **Step 2: main.ts changes**

Import `ItemVerb`:

```ts
import { CoffinScene, type CoffinSnapshot, type ItemVerb } from "./ink/coffinScene";
```

Module state and labels (after `let debugVisible = false;`):

```ts
let selectedVerb: ItemVerb = "look";

const ITEM_LABELS: Record<string, string> = {
  table: "table",
  drawer: "drawer",
  tinderbox: "small tin",
  candle: "candle",
  hanging: "wall hanging",
  cage: "iron cage",
  bucket: "bucket",
};
```

Register the background in `BACKGROUNDS`:

```ts
  "cell-room-lit": `${import.meta.env.BASE_URL}backgrounds/cell-room-lit.png`,
```

In `render()`, insert the strip as the first child of `.stage` (before the `.story` div):

```ts
      ${renderStrip(snapshot)}
```

Add the render function:

```ts
function renderStrip(snapshot: CoffinSnapshot): string {
  if (snapshot.spotted.length === 0 && snapshot.inventory.length === 0) {
    return "";
  }

  const verbs = (["look", "use"] as const)
    .map(
      (verb) => `
        <button type="button" class="verb${verb === selectedVerb ? " is-selected" : ""}" data-verb="${verb}">
          ${verb}
        </button>
      `,
    )
    .join("");

  const items = (ids: string[]) =>
    ids
      .map(
        (id) => `
          <button type="button" class="strip-item" data-item-id="${id}">
            ${escapeHtml(ITEM_LABELS[id] ?? id)}
          </button>
        `,
      )
      .join("");

  return `
    <div class="strip">
      <span class="strip-verbs">${verbs}</span>
      <span class="strip-items">${items(snapshot.spotted)}</span>
      <span class="strip-carried">${items(snapshot.inventory)}</span>
    </div>
  `;
}
```

In `bindEvents()`, add:

```ts
  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-verb]")) {
    button.addEventListener("click", () => {
      selectedVerb = button.dataset.verb === "use" ? "use" : "look";
      render();
    });
  }

  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-item-id]")) {
    button.addEventListener("click", () => {
      scene.interact(selectedVerb, button.dataset.itemId ?? "");
      render();
    });
  }
```

In the reset handler, also reset the verb:

```ts
    scene = new CoffinScene();
    selectedVerb = "look";
    render();
```

In `renderDebug()`, add rows to the `<dl>`:

```ts
        <div><dt>spotted</dt><dd>${escapeHtml(snapshot.spotted.join(", ") || "-")}</dd></div>
        <div><dt>inventory</dt><dd>${escapeHtml(snapshot.inventory.join(", ") || "-")}</dd></div>
        <div><dt>verb</dt><dd>${escapeHtml(selectedVerb)}</dd></div>
```

- [ ] **Step 3: styles.css changes**

Change `.stage` to column layout with a soft top scrim (replace the existing `.stage` rule):

```css
.stage {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  min-height: 100vh;
  background:
    linear-gradient(to bottom, rgba(5, 3, 2, 0.72) 0%, rgba(5, 3, 2, 0) 18%),
    linear-gradient(
      to top,
      rgba(5, 3, 2, 0.92) 0%,
      rgba(5, 3, 2, 0.6) 34%,
      rgba(5, 3, 2, 0) 68%
    );
}
```

Add strip rules (plain text, no boxes; mirrors `.choice` styling):

```css
.strip {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 26px;
  padding: 18px 44px 0;
}

.strip-verbs,
.strip-items,
.strip-carried {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}

.strip-carried {
  margin-left: auto;
}

.verb,
.strip-item {
  padding: 2px 0;
  border: 0;
  background: none;
  color: rgba(210, 191, 154, 0.55);
  font: inherit;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  cursor: pointer;
  transition: color 120ms ease;
}

.verb.is-selected {
  color: #f6edda;
}

.verb:hover,
.verb:focus-visible,
.strip-item:hover,
.strip-item:focus-visible {
  color: #f6edda;
}

.verb:focus-visible,
.strip-item:focus-visible {
  outline: none;
  text-decoration: underline;
  text-underline-offset: 4px;
}
```

In the `@media (max-width: 600px)` block, add:

```css
  .strip {
    padding: 16px 20px 0;
  }
```

- [ ] **Step 4: Verify build and tests**

Run: `npm test && npm run build`
Expected: tests PASS; tsc and vite build succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add public/backgrounds/cell-room-lit.png src/main.ts src/styles.css
git commit -m "feat: verb strip UI and lit cell-room background"
```

---

### Task 5: End-to-end browser verification

**Files:** none modified (verification only; screenshots go to the scratchpad or `.playwright-mcp/`).

**Interfaces:**
- Consumes: everything above; `npm run dev` serves on 127.0.0.1 (vite prints the port).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` in the background; note the printed local URL.

- [ ] **Step 2: Drive the full flow in a real browser**

Using the available browser automation (Playwright MCP or chrome-devtools MCP):

1. Open the app. Confirm the opening scene renders with no strip visible.
2. Click "Push against the wood above you." five times (strength build), then "Step into the room."
3. Confirm: cell-room background; strip shows "look" (brighter) and "use" verbs plus "candle".
4. Click "Look around." - strip gains "table".
5. With "look" selected, click "table" - strip swaps "table" for "drawer"; drawer prose appears.
6. Click "use", then "drawer" - drawer-opening prose plus "small tin" appears in the strip.
7. With "use" still selected, click "small tin" - it moves to the right-hand carried cluster.
8. With "use" selected, click "candle" - background swaps to the lit room image; prose describes the flame.
9. Click "Look around." - strip gains "wall hanging", "iron cage", "bucket".
10. Press backtick, confirm the debug panel lists spotted/inventory/verb, press backtick again.
11. Take a final screenshot.

Also verify the failure path in a fresh page load: escape via the nail/hinge route (Feel along the velvet, Work the loose nail free, Trace where the wood resists, Force the hinge with the nail, Step into the room), look around, look table, then use drawer - stuck flavor, no tin; use candle - "nothing to wake it with" and background stays unlit.

- [ ] **Step 3: Report**

Expected: every step above matches. If any step fails, fix before reporting completion (per AGENTS.md).

---

## Self-Review Notes

- Spec coverage: mental-model section is documentation only (no code); architecture -> Tasks 1-2; ink changes -> Tasks 1-3; TS scene layer -> Tasks 1-2; strip UI + asset + debug -> Task 4; tests -> Tasks 1-3; Playwright verification -> Task 5. Winnability: candle chain optional, gate strength-only, per spec.
- Type consistency: `ItemVerb`, `interact(verb, item)`, `spotted`/`inventory: string[]` used identically across tasks.
- No placeholders: every code step contains complete code.

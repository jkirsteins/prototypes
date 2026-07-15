# Escape Castle Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-playable parser-lite escape-room prototype for the vampire castle concept.

**Architecture:** Use a static Vite app with a pure TypeScript game engine and data-driven room content. The UI renders highlighted nouns, verb buttons, inventory nouns, command previews, and an output log from engine state.

**Tech Stack:** Vite, TypeScript, Vitest, plain CSS, vanilla DOM APIs.

---

## File Structure

- Create: `package.json` - npm scripts and dev dependencies.
- Create: `index.html` - Vite entry HTML.
- Create: `tsconfig.json` - strict TypeScript config.
- Create: `src/game/types.ts` - shared domain types for verbs, nouns, rooms, actions, and game state.
- Create: `src/game/content.ts` - room data, authored responses, and action rules.
- Create: `src/game/engine.ts` - pure game reducer for selections and actions.
- Create: `src/game/engine.test.ts` - golden path and locked basement tests.
- Create: `src/main.ts` - browser UI rendering and event wiring.
- Create: `src/styles.css` - TUI-inspired layout and responsive styling.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `src/main.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json`:

```json
{
  "name": "escape-castle",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create HTML shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Escape Castle</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create temporary app entry**

Create `src/main.ts`:

```ts
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <main class="shell">
    <h1>Escape Castle</h1>
    <p>Prototype scaffold ready.</p>
  </main>
`;
```

- [ ] **Step 5: Create temporary styles**

Create `src/styles.css`:

```css
:root {
  color: #e8dfc8;
  background: #111111;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button {
  font: inherit;
}

.shell {
  min-height: 100vh;
  padding: 24px;
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits successfully.

- [ ] **Step 7: Verify scaffold**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 8: Commit scaffold**

```bash
git add package.json package-lock.json index.html tsconfig.json src/main.ts src/styles.css
git commit -m "chore: scaffold Vite prototype"
```

---

### Task 2: Core Game Types and Failing Engine Tests

**Files:**
- Create: `src/game/types.ts`
- Create: `src/game/engine.test.ts`

- [ ] **Step 1: Create shared game types**

Create `src/game/types.ts`:

```ts
export const verbs = ["Look at", "Use", "Take", "Open", "Push", "Pull", "Turn"] as const;

export type Verb = (typeof verbs)[number];

export type ItemId =
  | "coffin-lid"
  | "velvet-lining"
  | "brass-plaque"
  | "loose-nail"
  | "hinge"
  | "rosary-bead"
  | "bed"
  | "nightstand"
  | "mirror"
  | "wardrobe"
  | "window"
  | "locked-door"
  | "bell-pull"
  | "loose-floorboard"
  | "small-iron-key"
  | "moth-eaten-cloak"
  | "servant-note"
  | "upstairs"
  | "downstairs"
  | "roof-hatch"
  | "rusted-crank"
  | "moon-dial"
  | "stained-glass"
  | "chain"
  | "basement-door"
  | "keyhole"
  | "iron-keyring"
  | "wine-rack"
  | "cold-draft";

export type RoomId = "coffin" | "bedroom" | "corridor" | "upstairs" | "downstairs";

export type Flag =
  | "coffinLidLoosened"
  | "plaqueRemoved"
  | "hingeWedged"
  | "floorboardRevealed"
  | "wardrobeOpen"
  | "doorUnlatched"
  | "moonLockSeen"
  | "crescentRevealed"
  | "moonDialCrescent"
  | "roofHatchUnlocked";

export type GameItem = {
  id: ItemId;
  label: string;
  portable?: boolean;
  visibleWhen?: Flag;
};

export type Room = {
  id: RoomId;
  title: string;
  description: string;
  itemIds: ItemId[];
};

export type GameState = {
  roomId: RoomId;
  inventory: ItemId[];
  flags: Record<Flag, boolean>;
  log: string[];
};

export type Command =
  | { verb: Exclude<Verb, "Use">; targetId: ItemId }
  | { verb: "Use"; targetId: ItemId; secondaryTargetId: ItemId };

export type ActionResult = {
  message: string;
  nextRoomId?: RoomId;
  addInventory?: ItemId[];
  removeInventory?: ItemId[];
  setFlags?: Partial<Record<Flag, boolean>>;
};
```

- [ ] **Step 2: Write failing golden path tests**

Create `src/game/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInitialState, getVisibleItems, runCommand } from "./engine";
import type { Command, GameState } from "./types";

function play(state: GameState, command: Command): GameState {
  return runCommand(state, command).state;
}

describe("escape castle game engine", () => {
  it("escapes the coffin tutorial", () => {
    let state = createInitialState();

    expect(state.roomId).toBe("coffin");
    expect(getVisibleItems(state).map((item) => item.id)).toContain("coffin-lid");

    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    expect(getVisibleItems(state).map((item) => item.id)).toContain("loose-nail");

    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Look at", targetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    expect(state.inventory).toContain("brass-plaque");

    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });

    expect(state.roomId).toBe("bedroom");
  });

  it("escapes the bedroom and reaches the corridor", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });

    state = play(state, { verb: "Look at", targetId: "mirror" });
    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    expect(state.inventory).toContain("small-iron-key");

    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Look at", targetId: "wardrobe" });
    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    state = play(state, { verb: "Look at", targetId: "servant-note" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    expect(state.roomId).toBe("corridor");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL because `src/game/engine.ts` does not exist yet.

- [ ] **Step 4: Commit failing tests and types**

```bash
git add src/game/types.ts src/game/engine.test.ts
git commit -m "test: define escape castle engine paths"
```

---

### Task 3: Content Data and Engine Implementation

**Files:**
- Create: `src/game/content.ts`
- Create: `src/game/engine.ts`
- Modify: `src/game/engine.test.ts`

- [ ] **Step 1: Create room and item content**

Create `src/game/content.ts`:

```ts
import type { ActionResult, Command, Flag, GameItem, ItemId, Room, RoomId } from "./types";

export const items: Record<ItemId, GameItem> = {
  "coffin-lid": { id: "coffin-lid", label: "coffin lid" },
  "velvet-lining": { id: "velvet-lining", label: "velvet lining" },
  "brass-plaque": { id: "brass-plaque", label: "brass plaque", portable: true },
  "loose-nail": { id: "loose-nail", label: "loose nail", portable: true, visibleWhen: "coffinLidLoosened" },
  hinge: { id: "hinge", label: "hinge", visibleWhen: "plaqueRemoved" },
  "rosary-bead": { id: "rosary-bead", label: "rosary bead", visibleWhen: "coffinLidLoosened" },
  bed: { id: "bed", label: "bed" },
  nightstand: { id: "nightstand", label: "nightstand" },
  mirror: { id: "mirror", label: "mirror" },
  wardrobe: { id: "wardrobe", label: "wardrobe" },
  window: { id: "window", label: "window" },
  "locked-door": { id: "locked-door", label: "locked door" },
  "bell-pull": { id: "bell-pull", label: "bell pull" },
  "loose-floorboard": { id: "loose-floorboard", label: "loose floorboard", visibleWhen: "floorboardRevealed" },
  "small-iron-key": { id: "small-iron-key", label: "small iron key", portable: true },
  "moth-eaten-cloak": { id: "moth-eaten-cloak", label: "moth-eaten cloak", portable: true, visibleWhen: "wardrobeOpen" },
  "servant-note": { id: "servant-note", label: "servant note", visibleWhen: "wardrobeOpen" },
  upstairs: { id: "upstairs", label: "upstairs" },
  downstairs: { id: "downstairs", label: "downstairs" },
  "roof-hatch": { id: "roof-hatch", label: "roof hatch" },
  "rusted-crank": { id: "rusted-crank", label: "rusted crank" },
  "moon-dial": { id: "moon-dial", label: "moon dial" },
  "stained-glass": { id: "stained-glass", label: "stained glass" },
  chain: { id: "chain", label: "chain" },
  "basement-door": { id: "basement-door", label: "basement door" },
  keyhole: { id: "keyhole", label: "keyhole" },
  "iron-keyring": { id: "iron-keyring", label: "iron keyring" },
  "wine-rack": { id: "wine-rack", label: "wine rack" },
  "cold-draft": { id: "cold-draft", label: "cold draft" }
};

export const rooms: Record<RoomId, Room> = {
  coffin: {
    id: "coffin",
    title: "Inside the Coffin",
    description:
      "You wake in total darkness, pressed inside a narrow coffin. Your hands brush velvet lining. Above you, the coffin lid does not move. A brass plaque is fixed near your shoulder.",
    itemIds: ["coffin-lid", "velvet-lining", "brass-plaque", "loose-nail", "hinge", "rosary-bead"]
  },
  bedroom: {
    id: "bedroom",
    title: "Guest Chamber",
    description:
      "You spill from the coffin into a locked guest chamber. A narrow bed faces a cracked mirror above a nightstand. A wardrobe leans near the locked door. A bell pull hangs beside a cold window.",
    itemIds: ["bed", "nightstand", "mirror", "wardrobe", "window", "locked-door", "bell-pull", "loose-floorboard"]
  },
  corridor: {
    id: "corridor",
    title: "Branching Corridor",
    description:
      "The corridor bends around a portrait of Count Veyr. One stair climbs upstairs toward moonlight. Another descends downstairs into cold air.",
    itemIds: ["upstairs", "downstairs"]
  },
  upstairs: {
    id: "upstairs",
    title: "Roof Hatch Landing",
    description:
      "At the top of the stairs, a roof hatch waits beneath stained glass. A rusted crank, moon dial, and hanging chain control the old mechanism.",
    itemIds: ["roof-hatch", "rusted-crank", "moon-dial", "stained-glass", "chain"]
  },
  downstairs: {
    id: "downstairs",
    title: "Basement Door",
    description:
      "The lower stair ends at a heavy basement door. A keyhole shines in the oak. An iron keyring, wine rack, and cold draft mark the wall nearby.",
    itemIds: ["basement-door", "keyhole", "iron-keyring", "wine-rack", "cold-draft"]
  }
};

const initialFlags: Record<Flag, boolean> = {
  coffinLidLoosened: false,
  plaqueRemoved: false,
  hingeWedged: false,
  floorboardRevealed: false,
  wardrobeOpen: false,
  doorUnlatched: false,
  moonLockSeen: false,
  crescentRevealed: false,
  moonDialCrescent: false,
  roofHatchUnlocked: false
};

export function createFlags(): Record<Flag, boolean> {
  return { ...initialFlags };
}

export function resolveAction(command: Command): ActionResult {
  const key =
    command.verb === "Use"
      ? `${command.verb}:${command.targetId}:${command.secondaryTargetId}`
      : `${command.verb}:${command.targetId}`;

  return actions[key] ?? {
    message: "That does not seem useful right now."
  };
}

const actions: Record<string, ActionResult> = {
  "Push:coffin-lid": {
    message: "The lid shifts a finger's width, then catches near the hinge.",
    setFlags: { coffinLidLoosened: true }
  },
  "Look at:velvet-lining": {
    message: "The lining is torn near your shoulder. Something sharp scratches your sleeve.",
    setFlags: { coffinLidLoosened: true }
  },
  "Take:loose-nail": {
    message: "You work the loose nail free.",
    addInventory: ["loose-nail"]
  },
  "Look at:brass-plaque": {
    message: "Raised letters spell VEYR. One corner of the plaque is loose."
  },
  "Use:loose-nail:brass-plaque": {
    message: "You pry the plaque free. A faint blade of moonlight reveals the coffin hinge.",
    addInventory: ["brass-plaque"],
    setFlags: { plaqueRemoved: true }
  },
  "Use:brass-plaque:hinge": {
    message: "You wedge the brass plaque into the hinge gap.",
    setFlags: { hingeWedged: true }
  },
  "Open:coffin-lid": {
    message: "There is no handle on this side."
  },
  "Use:loose-nail:coffin-lid": {
    message: "You scratch the wood, but gain no leverage."
  },
  "Look at:mirror": {
    message: "The mirror refuses your reflection, but shows scratches under the bed."
  },
  "Look at:bed": {
    message: "Under the bed, a loose floorboard sits proud of the others.",
    setFlags: { floorboardRevealed: true }
  },
  "Open:loose-floorboard": {
    message: "The board lifts with a groan. A small iron key waits in the dust.",
    addInventory: ["small-iron-key"]
  },
  "Use:small-iron-key:wardrobe": {
    message: "The wardrobe lock clicks open.",
    setFlags: { wardrobeOpen: true }
  },
  "Look at:wardrobe": {
    message: "A moth-eaten cloak hangs beside a servant note tucked into the wood.",
    setFlags: { wardrobeOpen: true }
  },
  "Take:moth-eaten-cloak": {
    message: "You take the moth-eaten cloak.",
    addInventory: ["moth-eaten-cloak"]
  },
  "Look at:servant-note": {
    message: "The note says the bell pull releases the corridor latch after midnight."
  },
  "Pull:bell-pull": {
    message: "Somewhere inside the wall, a latch drops.",
    setFlags: { doorUnlatched: true }
  },
  "Use:small-iron-key:locked-door": {
    message: "The key turns partway, then stops. It was made for something smaller."
  },
  "Open:locked-door": {
    message: "The door opens onto a branching corridor.",
    nextRoomId: "corridor"
  },
  "Open:upstairs": {
    message: "You climb toward the tower landing.",
    nextRoomId: "upstairs"
  },
  "Open:downstairs": {
    message: "You descend toward the basement door.",
    nextRoomId: "downstairs"
  },
  "Look at:roof-hatch": {
    message: "The hatch is sealed by a moon-phase lock.",
    setFlags: { moonLockSeen: true }
  },
  "Look at:stained-glass": {
    message: "Moonlight passes through panes of blue, red, and bone-white glass."
  },
  "Use:moth-eaten-cloak:stained-glass": {
    message: "The cloak blocks most of the light. One torn crescent still shines through.",
    setFlags: { crescentRevealed: true }
  },
  "Turn:moon-dial": {
    message: "You turn the moon dial to the crescent mark.",
    setFlags: { moonDialCrescent: true }
  },
  "Pull:chain": {
    message: "The chain rattles. The roof hatch lock releases.",
    setFlags: { roofHatchUnlocked: true }
  },
  "Open:roof-hatch": {
    message: "The hatch opens onto cold roof air. The next route is beyond this prototype."
  },
  "Look at:basement-door": {
    message: "Heavy oak, newer lock, and a smell of earth and old water."
  },
  "Look at:keyhole": {
    message: "The keyhole needs a long silver key."
  },
  "Take:iron-keyring": {
    message: "The iron keyring is fixed to the wall."
  },
  "Use:small-iron-key:basement-door": {
    message: "Wrong key. The basement remains shut."
  },
  "Open:basement-door": {
    message: "The basement door is locked."
  }
};
```

- [ ] **Step 2: Implement pure engine**

Create `src/game/engine.ts`:

```ts
import { createFlags, items, resolveAction, rooms } from "./content";
import type { ActionResult, Command, GameItem, GameState, ItemId } from "./types";

export function createInitialState(): GameState {
  return {
    roomId: "coffin",
    inventory: [],
    flags: createFlags(),
    log: [
      "You wake in total darkness inside a coffin.",
      "Choose a verb, then choose a highlighted noun."
    ]
  };
}

export function getVisibleItems(state: GameState): GameItem[] {
  const room = rooms[state.roomId];
  const roomItems = room.itemIds
    .map((itemId) => items[itemId])
    .filter((item) => !item.visibleWhen || state.flags[item.visibleWhen]);

  const inventoryItems = state.inventory.map((itemId) => items[itemId]);

  return [...roomItems, ...inventoryItems].filter(
    (item, index, allItems) => allItems.findIndex((candidate) => candidate.id === item.id) === index
  );
}

export function getCurrentRoom(state: GameState) {
  return rooms[state.roomId];
}

export function runCommand(state: GameState, command: Command): { state: GameState; result: ActionResult } {
  if (!canReferenceItem(state, command.targetId)) {
    return appendResult(state, { message: "You cannot reach that from here." });
  }

  if (command.verb === "Use" && !canReferenceItem(state, command.secondaryTargetId)) {
    return appendResult(state, { message: "You cannot use that here." });
  }

  const result = resolveAction(command);
  const guardedResult = applyPuzzleGuards(state, command, result);

  return appendResult(state, guardedResult);
}

function canReferenceItem(state: GameState, itemId: ItemId): boolean {
  return getVisibleItems(state).some((item) => item.id === itemId);
}

function applyPuzzleGuards(state: GameState, command: Command, result: ActionResult): ActionResult {
  if (command.verb === "Push" && command.targetId === "coffin-lid" && state.flags.hingeWedged) {
    return {
      message: "The wedged hinge snaps. You shove the coffin lid open and tumble into a guest chamber.",
      nextRoomId: "bedroom"
    };
  }

  if (command.verb === "Open" && command.targetId === "locked-door" && !state.flags.doorUnlatched) {
    return {
      message: "The room door will not move. The lock is not the only thing holding it shut."
    };
  }

  if (command.verb === "Pull" && command.targetId === "chain" && !state.flags.moonDialCrescent) {
    return {
      message: "The chain strains, but the hatch mechanism stays locked."
    };
  }

  if (command.verb === "Open" && command.targetId === "roof-hatch" && !state.flags.roofHatchUnlocked) {
    return {
      message: "The roof hatch is still sealed."
    };
  }

  return result;
}

function appendResult(state: GameState, result: ActionResult): { state: GameState; result: ActionResult } {
  const nextInventory = new Set(state.inventory);

  for (const itemId of result.addInventory ?? []) {
    nextInventory.add(itemId);
  }

  for (const itemId of result.removeInventory ?? []) {
    nextInventory.delete(itemId);
  }

  const nextState: GameState = {
    roomId: result.nextRoomId ?? state.roomId,
    inventory: [...nextInventory],
    flags: {
      ...state.flags,
      ...result.setFlags
    },
    log: [...state.log, result.message]
  };

  return { state: nextState, result };
}
```

- [ ] **Step 3: Extend tests for roof hatch and basement lock**

Append to `src/game/engine.test.ts` inside the `describe` block:

```ts
  it("opens the upstairs roof hatch and keeps the basement locked", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    state = play(state, { verb: "Open", targetId: "upstairs" });
    state = play(state, { verb: "Look at", targetId: "roof-hatch" });
    state = play(state, { verb: "Use", targetId: "moth-eaten-cloak", secondaryTargetId: "stained-glass" });
    state = play(state, { verb: "Turn", targetId: "moon-dial" });
    state = play(state, { verb: "Pull", targetId: "chain" });
    state = play(state, { verb: "Open", targetId: "roof-hatch" });

    expect(state.flags.roofHatchUnlocked).toBe(true);
    expect(state.log.at(-1)).toContain("cold roof air");

    state = play(state, { verb: "Open", targetId: "downstairs" });
    expect(state.log.at(-1)).toBe("You cannot reach that from here.");
  });

  it("allows entering the downstairs route from the corridor but not opening the basement", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });
    state = play(state, { verb: "Open", targetId: "downstairs" });

    expect(state.roomId).toBe("downstairs");

    state = play(state, { verb: "Look at", targetId: "keyhole" });
    state = play(state, { verb: "Open", targetId: "basement-door" });

    expect(state.roomId).toBe("downstairs");
    expect(state.log.at(-1)).toBe("The basement door is locked.");
  });
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for all engine tests.

- [ ] **Step 5: Commit engine and content**

```bash
git add src/game/content.ts src/game/engine.ts src/game/engine.test.ts
git commit -m "feat: add escape castle game engine"
```

---

### Task 4: Parser-Lite UI

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace scaffold with UI renderer**

Replace `src/main.ts` with:

```ts
import "./styles.css";
import { getCurrentRoom, getVisibleItems, runCommand, createInitialState } from "./game/engine";
import { verbs } from "./game/types";
import type { Command, GameState, ItemId, Verb } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

let state = createInitialState();
let selectedVerb: Verb = "Look at";
let pendingUseTarget: ItemId | null = null;

function render(): void {
  const room = getCurrentRoom(state);
  const visibleItems = getVisibleItems(state);
  const inventoryItems = visibleItems.filter((item) => state.inventory.includes(item.id));
  const roomItems = visibleItems.filter((item) => !state.inventory.includes(item.id));

  app.innerHTML = `
    <main class="shell">
      <section class="terminal" aria-live="polite">
        <header class="topbar">
          <div>
            <p class="eyebrow">Castle Veyr</p>
            <h1>${escapeHtml(room.title)}</h1>
          </div>
          <button class="reset-button" type="button" data-reset>Reset</button>
        </header>

        <section class="room">
          <p>${renderDescription(room.description, roomItems.map((item) => item.id))}</p>
        </section>

        <section class="command-panel">
          <div class="verbs" aria-label="Verb buttons">
            ${verbs
              .map(
                (verb) => `
                  <button class="verb ${verb === selectedVerb ? "selected" : ""}" type="button" data-verb="${verb}">
                    ${verb}
                  </button>
                `
              )
              .join("")}
          </div>

          <div class="inventory" aria-label="Inventory">
            <span>Inventory</span>
            ${
              inventoryItems.length > 0
                ? inventoryItems
                    .map(
                      (item) => `
                        <button class="noun inventory-item" type="button" data-item="${item.id}">
                          ${escapeHtml(item.label)}
                        </button>
                      `
                    )
                    .join("")
                : `<em>empty</em>`
            }
          </div>

          <div class="preview">${escapeHtml(getCommandPreview(visibleItems))}</div>
        </section>

        <section class="log" aria-label="Command log">
          ${state.log.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("")}
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-verb]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedVerb = button.dataset.verb as Verb;
      pendingUseTarget = null;
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.item as ItemId;
      chooseItem(itemId);
    });
  });

  app.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => {
    state = createInitialState();
    selectedVerb = "Look at";
    pendingUseTarget = null;
    render();
  });
}

function chooseItem(itemId: ItemId): void {
  if (selectedVerb === "Use") {
    if (pendingUseTarget === null) {
      pendingUseTarget = itemId;
      render();
      return;
    }

    if (pendingUseTarget === itemId) {
      pendingUseTarget = null;
      render();
      return;
    }

    execute({ verb: "Use", targetId: pendingUseTarget, secondaryTargetId: itemId });
    pendingUseTarget = null;
    return;
  }

  execute({ verb: selectedVerb, targetId: itemId } as Command);
}

function execute(command: Command): void {
  const labelById = new Map(getVisibleItems(state).map((item) => [item.id, item.label]));
  const commandText =
    command.verb === "Use"
      ? `> Use ${labelById.get(command.targetId) ?? command.targetId} with ${
          labelById.get(command.secondaryTargetId) ?? command.secondaryTargetId
        }`
      : `> ${command.verb} ${labelById.get(command.targetId) ?? command.targetId}`;

  const outcome = runCommand(
    {
      ...state,
      log: [...state.log, commandText]
    },
    command
  );

  state = outcome.state;
  render();
}

function getCommandPreview(visibleItems: Array<{ id: ItemId; label: string }>): string {
  const labelById = new Map(visibleItems.map((item) => [item.id, item.label]));

  if (selectedVerb === "Use" && pendingUseTarget) {
    return `> Use ${labelById.get(pendingUseTarget) ?? pendingUseTarget} with ...`;
  }

  return `> ${selectedVerb} ...`;
}

function renderDescription(description: string, itemIds: ItemId[]): string {
  let rendered = escapeHtml(description);

  for (const itemId of itemIds) {
    const item = getVisibleItems(state).find((candidate) => candidate.id === itemId);

    if (!item) {
      continue;
    }

    const pattern = new RegExp(`\\b${escapeRegExp(item.label)}\\b`, "gi");
    rendered = rendered.replace(
      pattern,
      `<button class="noun inline-noun" type="button" data-item="${item.id}">${escapeHtml(item.label)}</button>`
    );
  }

  return rendered;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

render();
```

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: TypeScript build passes.

- [ ] **Step 3: Commit UI logic**

```bash
git add src/main.ts
git commit -m "feat: add parser-lite browser UI"
```

---

### Task 5: TUI Styling and Responsive Layout

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace scaffold CSS**

Replace `src/styles.css` with:

```css
:root {
  color: #eadfcb;
  background: #12100d;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 16px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button {
  font: inherit;
}

.shell {
  min-height: 100vh;
  padding: 20px;
  background:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    #12100d;
  background-size: 100% 4px;
}

.terminal {
  width: min(980px, 100%);
  min-height: calc(100vh - 40px);
  margin: 0 auto;
  border: 1px solid #6e5c3f;
  background: #18140f;
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.45);
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #4d402d;
}

.eyebrow {
  margin: 0 0 6px;
  color: #b79c68;
  text-transform: uppercase;
  letter-spacing: 0;
  font-size: 0.78rem;
}

h1 {
  margin: 0;
  color: #f4ead7;
  font-size: 1.35rem;
  line-height: 1.25;
}

.reset-button,
.verb,
.noun {
  border: 1px solid #7f6844;
  color: #f0e2c6;
  background: #211a12;
  cursor: pointer;
}

.reset-button,
.verb {
  min-height: 38px;
  padding: 8px 12px;
}

.reset-button:hover,
.verb:hover,
.noun:hover {
  border-color: #c29b4b;
  background: #2c2317;
}

.room {
  padding: 24px 20px;
  border-bottom: 1px solid #4d402d;
  color: #e7dcc8;
  line-height: 1.75;
}

.room p,
.log p {
  margin: 0;
}

.inline-noun {
  display: inline;
  padding: 1px 4px;
  border-color: #92774a;
  color: #ffe2a0;
  background: #2a2115;
}

.command-panel {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid #4d402d;
}

.verbs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
}

.verb.selected {
  color: #14100c;
  background: #d6a84e;
  border-color: #f1cf82;
}

.inventory {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 38px;
  color: #bda97f;
}

.inventory span {
  color: #f0e2c6;
}

.inventory em {
  color: #8d7b5e;
  font-style: normal;
}

.inventory-item {
  min-height: 32px;
  padding: 5px 9px;
}

.preview {
  min-height: 32px;
  padding: 7px 10px;
  border: 1px solid #4d402d;
  color: #93d7a3;
  background: #0f140f;
}

.log {
  display: grid;
  gap: 10px;
  max-height: 34vh;
  overflow: auto;
  padding: 18px 20px 24px;
  color: #cfc2a9;
  line-height: 1.55;
}

.log p:nth-last-child(1) {
  color: #f4ead7;
}

@media (max-width: 640px) {
  .shell {
    padding: 0;
  }

  .terminal {
    min-height: 100vh;
    border-left: 0;
    border-right: 0;
  }

  .topbar {
    flex-direction: column;
  }

  .reset-button {
    width: 100%;
  }

  .verbs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: Build passes.

- [ ] **Step 3: Commit styling**

```bash
git add src/styles.css
git commit -m "style: add terminal adventure layout"
```

---

### Task 6: Final Verification and Local Server

**Files:**
- No source changes expected unless verification finds a defect.

- [ ] **Step 1: Run automated tests**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

- [ ] **Step 3: Start local dev server**

Run: `npm run dev`

Expected: Vite prints a local URL, normally `http://127.0.0.1:5173/`.

- [ ] **Step 4: Manual smoke test in browser**

Open the local URL and verify:

- Verb buttons are visible.
- Room nouns are highlighted and clickable.
- Inventory starts empty.
- Clicking `Push` then `coffin lid` logs `> Push coffin lid`.
- `Look at` then `velvet lining` reveals `loose nail`.
- `Use` supports selecting one noun, then a second noun.
- Escaping the coffin changes the title to `Guest Chamber`.
- The basement door remains locked.

- [ ] **Step 5: Commit any verification fixes**

Only run this if source changes were needed:

```bash
git add src package.json package-lock.json index.html tsconfig.json
git commit -m "fix: polish escape castle prototype"
```

---

## Self-Review

Spec coverage:

- Browser-playable static app: Task 1.
- Vite, TypeScript, plain CSS, no backend, no game engine: Task 1 and Task 5.
- Verb buttons and highlighted nouns: Task 4.
- Inventory nouns and `Use X with Y`: Task 4.
- Command preview and response log: Task 4.
- Coffin tutorial: Task 3 tests and content.
- Guest bedroom escape: Task 3 tests and content.
- Upstairs roof hatch puzzle: Task 3 tests and content.
- Downstairs locked basement tease: Task 3 tests and content.
- Authored invalid responses: Task 3 content.
- Golden path verification: Task 3 tests and Task 6.

Placeholder scan: no TBD, TODO, or unspecified implementation steps remain.

Type consistency: `Verb`, `ItemId`, `RoomId`, `Flag`, `GameState`, and `Command` are defined before use and referenced consistently across tasks.

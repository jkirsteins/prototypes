# Five Players, Quiet Lands and Passive Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `02-balticmap`, let only five factions take turns while the other 21 sit quiet and grey, and give lands passive statuses - one table, five entries, each with one hook and a hover line.

**Architecture:** Every faction keeps its seat and its deck. A new passive status, `keeps-to-itself`, makes a faction's turn a no-op, and `advance` skipping such a seat is the entire turn-loop change. Because a quiet land is still an ordinary faction, subjugating one, poaching it off a rival, healing it or incorporating it all work through the rules that already exist - no annexation path, no new event type. The other four statuses hang off the same table: a round-wrap heal, a capture on assassination, a damage reduction, a wealth bonus.

**Tech Stack:** TypeScript, Vite, vitest, plain imperative DOM. No new dependencies.

## Global Constraints

- The spec is `docs/superpowers/specs/2026-08-09-five-seats-and-passive-statuses-design.md`. Read it before Task 1.
- `npm test` and `npm run build` must both pass before every commit (run from `02-balticmap/`).
- Never `git add -A`. Stage explicit paths under `02-balticmap/` only - sibling prototypes may be mid-edit in another session.
- Never interpolate a card or faction name into a string. Player-facing prose that names one is built from `t()`, `card()`, `faction()` segments (`src/rich-text.ts`); `tests/naming-convention.test.ts` enforces it.
- No em dashes, no unicode arrows, no fancy quotes, no ellipsis characters anywhere in code, comments, docs or commit messages. Plain ASCII punctuation only.
- Comments explain why, never chronicle. No dates, no "was X, now Y" in code comments.
- A card whose effect, legality or targeting changes needs its `POLICY_COVERAGE` entry in `src/ai.ts` updated to name the branch that decides it (Task 14).
- An event that moves a defense score or a disease stack must carry `amount`, or the round summary and the activity log drift silently.
- Sparse-store convention: a key is present only when it says something. `passives` holds no empty arrays.
- No new `GameEventType` is needed anywhere in this plan. If you find yourself adding one, you have re-invented the annexation path the design deliberately removed - stop and re-read section 4 of the spec.
- `npm run balance` is NOT run as part of this work.

---

### Task 1: The passive table and its store

**Files:**
- Create: `src/passives.ts`
- Test: `tests/passives.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PassiveDef`, `PASSIVES: Record<string, PassiveDef>`, `Passives = Readonly<Record<string, readonly string[]>>`, `QUIET_PASSIVES: readonly string[]`, `WILD_LANDS_HEAL_CHANCE`, `WILD_LANDS_HEAL`, `HILL_COUNTRY_REDUCTION`, `passivesOn(p, polygon)`, `hasPassive(p, polygon, id)`, `addPassive(p, polygon, id)`, `stripOnCapture(p, polygon)`, `playsTurns(p, factionId)`, `damageAfterTerrain(view: {passives: Passives}, polygon, damage)`.

- [ ] **Step 1: Write the failing test**

Create `tests/passives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addPassive, damageAfterTerrain, hasPassive, PASSIVES, passivesOn, playsTurns,
  QUIET_PASSIVES, stripOnCapture, type Passives,
} from "../src/passives";

describe("the passive table", () => {
  it("gives every status a name, a line of text and a capture rule", () => {
    for (const [id, def] of Object.entries(PASSIVES)) {
      expect(def.id, id).toBe(id);
      expect(def.name.length, id).toBeGreaterThan(0);
      expect(def.text.length, id).toBeGreaterThan(0);
      expect(typeof def.strippedOnCapture, id).toBe("boolean");
    }
  });

  it("strips exactly the two statuses that describe an unheld land", () => {
    const stripped = Object.values(PASSIVES)
      .filter((d) => d.strippedOnCapture)
      .map((d) => d.id)
      .sort();
    expect(stripped).toEqual(["no-successor", "wild-lands"]);
  });

  it("keeps a taken land quiet - staying quiet is not about who holds it", () => {
    expect(PASSIVES["keeps-to-itself"].strippedOnCapture).toBe(false);
    expect(QUIET_PASSIVES).toContain("keeps-to-itself");
  });
});

describe("the passive store", () => {
  it("reads an absent land as carrying nothing", () => {
    expect(passivesOn({}, "selija")).toEqual([]);
    expect(hasPassive({}, "selija", "wild-lands")).toBe(false);
  });

  it("adds a status once", () => {
    const once = addPassive({}, "selija", "wild-lands");
    expect(addPassive(once, "selija", "wild-lands")).toBe(once);
    expect(passivesOn(once, "selija")).toEqual(["wild-lands"]);
  });

  it("keeps the ground and the silence, and drops the rest, on capture", () => {
    let p: Passives = {};
    for (const id of ["keeps-to-itself", "wild-lands", "no-successor", "hill-country"]) {
      p = addPassive(p, "selija", id);
    }
    expect(passivesOn(stripOnCapture(p, "selija"), "selija"))
      .toEqual(["keeps-to-itself", "hill-country"]);
  });

  it("drops the key entirely when nothing survives capture", () => {
    const p = addPassive(addPassive({}, "selija", "wild-lands"), "selija", "no-successor");
    expect(stripOnCapture(p, "selija")).toEqual({});
  });
});

describe("playsTurns", () => {
  it("is false only for a faction that keeps to itself", () => {
    expect(playsTurns({}, "selonians")).toBe(true);
    expect(playsTurns({ selija: ["wild-lands"] }, "selija")).toBe(true);
    expect(playsTurns({ selija: ["keeps-to-itself"] }, "selija")).toBe(false);
  });
});

describe("damageAfterTerrain", () => {
  it("takes a quarter off an attack on hill country", () => {
    const view = { passives: addPassive({}, "selija", "hill-country") };
    expect(damageAfterTerrain(view, "selija", 4)).toBe(3);
  });

  it("leaves flat ground alone", () => {
    expect(damageAfterTerrain({ passives: {} }, "zemgale", 4)).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- passives`
Expected: FAIL, cannot resolve `../src/passives`.

- [ ] **Step 3: Write the module**

Create `src/passives.ts`:

```ts
/** Passive statuses: standing properties of a LAND, not of whoever holds it.
 *
 *  One table and five hooks. `strippedOnCapture` is the axis that keeps the
 *  two kinds apart: a status describing a land nobody holds dies the moment
 *  somebody takes it, while a status describing the ground - or the fact that
 *  the land has no ambitions of its own - survives every change of hands.
 *
 *  `keeps-to-itself` is why this module is small and the rest of the game did
 *  not have to grow a second kind of land. A quiet faction is an ordinary
 *  faction that skips its turn: it can be raided, subjugated, poached, healed
 *  and incorporated by the rules that already exist, and a card that removed
 *  the status would hand it back the turns and the deck it was dealt at the
 *  start.
 *
 *  A new status is a row here plus the one hook that reads it, and it does not
 *  ship until the land hover names it. */

export interface PassiveDef {
  id: string;
  name: string; // player-facing, shown on the land hover
  text: string; // one line, what it does
  strippedOnCapture: boolean;
}

export const PASSIVES: Record<string, PassiveDef> = {
  "keeps-to-itself": {
    id: "keeps-to-itself", name: "Keeps to itself",
    text: "This land takes no turns and plays no cards.",
    strippedOnCapture: false,
  },
  "wild-lands": {
    id: "wild-lands", name: "Wild lands",
    text: "10% chance each round to recover 1 defense.",
    strippedOnCapture: true,
  },
  "no-successor": {
    id: "no-successor", name: "No successor",
    text: "If its ruler is killed, the land falls to the killer.",
    strippedOnCapture: true,
  },
  "hill-country": {
    id: "hill-country", name: "Hill country",
    text: "Incoming attack damage reduced by a quarter.",
    strippedOnCapture: false,
  },
  "river-trade": {
    id: "river-trade", name: "River trade",
    text: "Earns its holder 1 extra wealth a turn.",
    strippedOnCapture: false,
  },
};

/** What a land that does not act starts with. Only the last two are stripped
 *  when somebody takes it: a conquest stops repairing itself and stops falling
 *  to an assassin, but it stays quiet. */
export const QUIET_PASSIVES: readonly string[] = [
  "keeps-to-itself", "wild-lands", "no-successor",
];

export const WILD_LANDS_HEAL_CHANCE = 0.1;
export const WILD_LANDS_HEAL = 1;
export const HILL_COUNTRY_REDUCTION = 0.25;

/** polygon id -> the statuses it carries. Absent key means none, the sparse
 *  convention `defense` and `armies` already keep. */
export type Passives = Readonly<Record<string, readonly string[]>>;

export function passivesOn(p: Passives, polygon: string): readonly string[] {
  return p[polygon] ?? [];
}

export function hasPassive(p: Passives, polygon: string, id: string): boolean {
  return passivesOn(p, polygon).includes(id);
}

export function addPassive(p: Passives, polygon: string, id: string): Passives {
  if (hasPassive(p, polygon, id)) return p;
  return { ...p, [polygon]: [...passivesOn(p, polygon), id] };
}

/** What a land keeps when it changes hands. */
export function stripOnCapture(p: Passives, polygon: string): Passives {
  const had = passivesOn(p, polygon);
  const kept = had.filter((id) => PASSIVES[id]?.strippedOnCapture !== true);
  if (kept.length === had.length) return p;
  if (kept.length === 0) {
    const { [polygon]: _, ...rest } = p;
    return rest;
  }
  return { ...p, [polygon]: kept };
}

/** Whether this faction takes its turn at all. The one question the turn loop
 *  asks; everything else about a quiet land is the ordinary rules. */
export function playsTurns(p: Passives, factionId: string): boolean {
  return !hasPassive(p, factionId, "keeps-to-itself");
}

/** Hostile damage after the ground has had its say. The one spelling, called
 *  by both sites that deal damage and by the card preview, so what a tip
 *  promises and what lands cannot drift. */
export function damageAfterTerrain(
  view: { passives: Passives }, polygon: string, damage: number,
): number {
  return hasPassive(view.passives, polygon, "hill-country")
    ? damage * (1 - HILL_COUNTRY_REDUCTION)
    : damage;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- passives`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/passives.ts tests/passives.test.ts
git commit -m "feat(balticmap): a land carries passive statuses"
```

---

### Task 2: Where a terrain status may plausibly sit

**Files:**
- Modify: `src/passives.ts`
- Test: `tests/passives.test.ts`

**Interfaces:**
- Consumes: `PASSIVES`, `Passives`, `addPassive`, `QUIET_PASSIVES` (Task 1); `Rng` from `src/cards.ts`.
- Produces: `TERRAIN_ELIGIBILITY: Readonly<Record<string, readonly string[]>>`, `TERRAIN_CHANCE`, `rollTerrain(factionIds: string[], rng: Rng): Passives`, `seedPassives(factionIds: string[], acting: readonly string[], rng: Rng): Passives`.

- [ ] **Step 1: Write the failing test**

Append to `tests/passives.test.ts`:

```ts
import { seededRng } from "../src/sim";
import { rollTerrain, seedPassives, TERRAIN_ELIGIBILITY } from "../src/passives";
import data from "../src/data/map.json";

describe("terrain eligibility", () => {
  it("names only real lands and only statuses that survive capture", () => {
    const lands = new Set(data.factions.map((f) => f.id));
    for (const [land, ids] of Object.entries(TERRAIN_ELIGIBILITY)) {
      expect(lands.has(land), land).toBe(true);
      expect(ids.length, land).toBeGreaterThan(0);
      for (const id of ids) {
        expect(PASSIVES[id], `${land}/${id}`).toBeDefined();
        expect(PASSIVES[id].strippedOnCapture, `${land}/${id}`).toBe(false);
      }
    }
  });

  it("rolls the same terrain twice from the same seed", () => {
    const ids = Object.keys(TERRAIN_ELIGIBILITY);
    expect(rollTerrain(ids, seededRng(3))).toEqual(rollTerrain(ids, seededRng(3)));
  });

  it("never gives a land a status it is not eligible for", () => {
    const rolled = rollTerrain(["selonians", "osilians", "jersikans"], seededRng(9));
    for (const [land, carried] of Object.entries(rolled)) {
      for (const id of carried) {
        expect(TERRAIN_ELIGIBILITY[land] ?? [], land).toContain(id);
      }
    }
  });
});

describe("seedPassives", () => {
  it("quiets every land that does not act, and none that does", () => {
    const lands = ["selonians", "jersikans", "sakalans"];
    const seeded = seedPassives(lands, ["selonians"], seededRng(1));
    expect(playsTurns(seeded, "selonians")).toBe(true);
    expect(playsTurns(seeded, "jersikans")).toBe(false);
    expect(hasPassive(seeded, "jersikans", "wild-lands")).toBe(true);
    expect(hasPassive(seeded, "selonians", "no-successor")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- passives`
Expected: FAIL, `rollTerrain` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/passives.ts` (and add `import type { Rng } from "./cards";` at the top):

```ts
/** Which lands could plausibly carry which ground, read off what the map
 *  already says about each region in its own flavour text: hills and uplands
 *  for `hill-country`, the trade rivers for `river-trade`. Random placement
 *  that ignored this put hills on the Semigallian plain, which the map calls
 *  flat and fertile two lines away.
 *
 *  A land absent from the table gets no terrain status, which is the honest
 *  answer for the plains and the islands. */
export const TERRAIN_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  // Highlands, uplands and wooded hills.
  "eastern-aukstaitian-confederacy": ["hill-country"],
  "sakalans": ["hill-country"],
  "selonians": ["hill-country"],
  "ugandians": ["hill-country"],
  "samogitian-confederacy": ["hill-country"],
  // The trade rivers: the Daugava, the Gauja, the Nemunas, the Lielupe, the
  // Vistula.
  "jersikans": ["river-trade"],
  "lower-daugava-livs": ["river-trade"],
  "talavians": ["river-trade"],
  "lietuva": ["river-trade"],
  "dainavians": ["river-trade"],
  "nadruvians": ["river-trade"],
  "semigallian-confederacy": ["river-trade"],
  "pomesanians": ["river-trade"],
};

/** How often an eligible land actually carries its ground. Half, so two runs
 *  of the same map are different maps to fight over. */
export const TERRAIN_CHANCE = 0.5;

/** Two draws per eligible land, in faction order: whether it carries anything
 *  and which of its own options it gets. A frozen contract like every other
 *  draw in the deal - `tests/rng-isolation.test.ts` replays it. */
export function rollTerrain(factionIds: string[], rng: Rng): Passives {
  let out: Passives = {};
  for (const land of factionIds) {
    const eligible = TERRAIN_ELIGIBILITY[land];
    if (eligible === undefined || eligible.length === 0) continue;
    if (rng() >= TERRAIN_CHANCE) continue;
    out = addPassive(out, land, eligible[Math.floor(rng() * eligible.length)]);
  }
  return out;
}

/** The statuses a fresh game starts with: the ground, rolled, plus the quiet
 *  set on every faction that does not act. */
export function seedPassives(
  factionIds: string[], acting: readonly string[], rng: Rng,
): Passives {
  let out = rollTerrain(factionIds, rng);
  for (const land of factionIds) {
    if (acting.includes(land)) continue;
    for (const id of QUIET_PASSIVES) out = addPassive(out, land, id);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- passives`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/passives.ts tests/passives.test.ts
git commit -m "feat(balticmap): terrain statuses land where the map says they could"
```

---

### Task 3: The store reaches the rules

**Files:**
- Modify: `src/game.ts` (`GameState`, `newGame`, `viewOf`), `src/playability.ts` (`RulesView`), `src/relations.ts` (`isUnheld`)
- Test: `tests/relations.test.ts`, `tests/playability.test.ts:28-51` (view builder), `tests/target-explanations.test.ts:27` (view builder)

**Interfaces:**
- Consumes: `Passives` (Task 1).
- Produces: `GameState.passives: Passives`, `RulesView.passives: Passives`, `isUnheld(factionId, overlords, incorporated): boolean`.

- [ ] **Step 1: Write the failing test**

Append to `tests/relations.test.ts`:

```ts
import { isUnheld } from "../src/relations";

describe("isUnheld", () => {
  it("is true for a land in nobody's realm", () => {
    expect(isUnheld("jersikans", new Map(), {})).toBe(true);
  });

  it("is false once somebody has subjugated it", () => {
    expect(isUnheld("jersikans", new Map([["jersikans", "selonians"]]), {})).toBe(false);
  });

  it("is false once somebody has annexed it", () => {
    expect(isUnheld("jersikans", new Map(), { jersikans: "selonians" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- relations`
Expected: FAIL, `isUnheld` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/relations.ts`, after `realmRootOf`:

```ts
/** A land no realm holds: nobody's vassal and nobody's annexation. What the
 *  grey fill asks, together with the land being quiet - an unheld land that
 *  plays its own turns is simply a rival at full independence. */
export function isUnheld(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  return !overlords.has(factionId) && !(factionId in incorporated);
}
```

In `src/playability.ts`, import `type Passives` from `./passives` and add to `RulesView` after `factionIds`:

```ts
  /** Polygon id -> the passive statuses it carries (src/passives.ts). Read by
   *  the damage sites, the income rule and the AI. */
  passives: Passives;
```

In `src/game.ts`: add `import { type Passives } from "./passives";`, add to `GameState`

```ts
  /** Polygon id -> passive statuses (src/passives.ts). Seeded at the deal in
   *  `pickFaction`; the writers after that are capture (which strips) and any
   *  future card that grants or removes one. */
  passives: Passives;
```

initialise `passives: {}` in `newGame`, and add `passives: state.passives,` to `viewOf`.

In `tests/playability.test.ts` and `tests/target-explanations.test.ts`, add `passives: {},` to each view builder's defaults.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. Any failure is a view literal missing `passives` - fix it the same way.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/playability.ts src/relations.ts tests/relations.test.ts tests/playability.test.ts tests/target-explanations.test.ts
git commit -m "feat(balticmap): the rules can read a land's passive statuses"
```

---

### Task 4: Five factions act; the rest keep to themselves

**Files:**
- Modify: `src/game.ts` (`MAX_ACTIVE`, `actingFactions`, `pickFaction`, `advance`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `seedPassives` (Task 2), `playsTurns` (Task 1), `GameState.passives` (Task 3).
- Produces: `MAX_ACTIVE: number`, `pickFaction(state, factionId, rng, opts?: { reservedFactionIds?: string[] })`.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts` (reuse the file's existing `pickFaction`, `chooseBuild`, `startGame`, `newGame`, `advance` and `seededRng` imports):

```ts
import { MAX_ACTIVE } from "../src/game";
import { playsTurns } from "../src/passives";

describe("who acts", () => {
  const RING = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  // A ring: each land borders the next, so the spacing rule has real work.
  const ringAdj = Object.fromEntries(
    RING.map((id, i) => [
      id, [RING[(i + 1) % RING.length], RING[(i + RING.length - 1) % RING.length]],
    ]),
  );
  const deal = (seed: number, opts?: { reservedFactionIds?: string[] }) =>
    pickFaction(
      chooseBuild(startGame(newGame(RING, ringAdj)), "warpath"),
      "a", seededRng(seed), opts,
    );
  const acting = (g: GameState) =>
    g.players.map((p) => p.factionId).filter((f) => playsTurns(g.passives, f));

  it("still deals every faction a seat and a deck", () => {
    const g = deal(1);
    expect(g.players).toHaveLength(RING.length);
    for (const p of g.players) expect(p.deck.length + p.hand.length).toBeGreaterThan(0);
  });

  it("lets exactly five of them act, the human first", () => {
    const g = deal(1);
    expect(acting(g)).toHaveLength(MAX_ACTIVE);
    expect(acting(g)[0]).toBe("a");
  });

  it("never lets two acting factions border each other", () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const homes = acting(deal(seed));
      for (const home of homes) {
        for (const other of homes) {
          if (home === other) continue;
          expect(ringAdj[home], `seed ${seed}`).not.toContain(other);
        }
      }
    }
  });

  it("picks the same five twice from the same seed", () => {
    expect(acting(deal(5))).toEqual(acting(deal(5)));
  });

  it("lets a reserved pick act", () => {
    expect(acting(deal(4, { reservedFactionIds: ["f"] }))).toContain("f");
  });

  it("lets everybody act when the map is smaller than the table", () => {
    const g = pickFaction(
      chooseBuild(startGame(newGame(["a", "b", "c"])), "warpath"),
      "a", seededRng(1),
    );
    expect(acting(g)).toHaveLength(3);
  });

  it("skips a quiet seat when the turn moves on", () => {
    const g = deal(1);
    const next = advance({ ...g, playedThisTurn: true }, seededRng(1));
    expect(playsTurns(next.passives, next.players[next.current].factionId)).toBe(true);
    expect(next.current).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- game`
Expected: FAIL, `MAX_ACTIVE` is not exported and every faction acts.

- [ ] **Step 3: Write the implementation**

In `src/game.ts`, above `pickFaction`:

```ts
/** How many factions take turns on a map. Everybody else keeps a seat and a
 *  deck and simply never plays - see `keeps-to-itself` in src/passives.ts.
 *  Clamped to the land count, so a three-land test map has everybody acting. */
export const MAX_ACTIVE = 5;

/** Which factions take turns: the human's pick, any reserved pick (a
 *  multiplayer guest), then lands drawn from a seeded shuffle of the rest,
 *  skipping any that borders one already chosen.
 *
 *  The spacing pass can run out of room - a small or a chain-shaped map - so a
 *  second pass fills what is left without the test. Placement never fails, and
 *  the fallback is the only reason two acting lands may end up adjacent. */
function actingFactions(
  state: GameState, humanFactionId: string, reserved: string[], rng: Rng,
): string[] {
  const out = [humanFactionId];
  for (const id of reserved) {
    if (id !== humanFactionId && state.factionIds.includes(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  const cap = Math.max(out.length, Math.min(MAX_ACTIVE, state.factionIds.length));
  const pool = shuffle(state.factionIds.filter((id) => !out.includes(id)), rng);
  const spaced = (id: string): boolean =>
    out.every((placed) => !(state.adjacency[placed] ?? []).includes(id));
  for (const id of pool) {
    if (out.length >= cap) break;
    if (spaced(id)) out.push(id);
  }
  for (const id of pool) {
    if (out.length >= cap) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
```

Extend `pickFaction` - the seat deal itself is untouched, so the strategy roll
and deck shuffle per seat stay the frozen contract they were:

```ts
export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
  /** Factions that must take turns besides the human's - the multiplayer
   *  guest's pick. Everything else is chosen at random. */
  opts?: { reservedFactionIds?: string[] },
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const acting = actingFactions(
    state, factionId, opts?.reservedFactionIds ?? [], rng,
  );
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, state.humanStrategy, rng),
    ...others.map((id, i) =>
      makePlayer(i + 2, id, rng() < 0.5 ? "warpath" : "pestilence", rng),
    ),
  ];
  const passives = seedPassives(state.factionIds, acting, rng);
  return beginTurn(
    { ...state, phase: "playing", players, current: 0, passives }, rng,
  );
}
```

Add `import { playsTurns, seedPassives, type Passives } from "./passives";`.

In `advance`, extend `inert`:

```ts
  // A quiet faction takes no turn at all, so the loop passes over it exactly
  // as it passes over one that has been incorporated. This is the whole
  // turn-loop cost of a map that is mostly unheld.
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated ||
    !playsTurns(state.passives, state.players[i].factionId);
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: the new tests PASS. Suites that assumed every faction acts - `tests/standings.test.ts`, `tests/sim.test.ts`, `tests/scenarios.test.ts`, `tests/hud.test.ts` - may fail on play counts or pacing. Fix each by making the factions under test act (name them through the human pick or by seeding `passives` in the fixture), never by raising `MAX_ACTIVE`. Where a scenario band genuinely moves, update the band and say in a comment that five acting factions moved it.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/
git commit -m "feat(balticmap): five factions take turns, the rest keep to themselves"
```

---

### Task 5: The smaller board

**Files:**
- Modify: `src/defense.ts:11-16`, `src/game.ts` (`TURNIP_HARVEST_THRESHOLD`, `victoryRealmSize`)
- Test: `tests/defense.test.ts`, `tests/game.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFENSE_PER_POPULATION = 5000`, `DEFAULT_DEFENSE_MAX = 6`, `TURNIP_HARVEST_THRESHOLD = 3`, `victoryRealmSize(n) = ceil(0.5 * n)`.

- [ ] **Step 1: Write the failing test**

In `tests/defense.test.ts`:

```ts
it("sizes the real map's lands from 2 to 18", () => {
  expect(defenseMaxFromPopulations({ small: 10000, big: 90000 }))
    .toEqual({ small: 2, big: 18 });
});
```

In `tests/game.test.ts`:

```ts
it("ends the run at half the map", () => {
  expect(victoryRealmSize(26)).toBe(13);
  expect(victoryRealmSize(9)).toBe(5);
});

it("earns a harvest every third turnip", () => {
  expect(TURNIP_HARVEST_THRESHOLD).toBe(3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- defense game`
Expected: FAIL - 20/180, 15, and 5.

- [ ] **Step 3: Write the implementation**

- `src/defense.ts`: `export const DEFENSE_PER_POPULATION = 5000;`, `export const DEFAULT_DEFENSE_MAX = 6;`. Update both doc comments to quote the real range (2..18) and stop saying "population / 50".
- `src/game.ts`: `export const TURNIP_HARVEST_THRESHOLD = 3;` and

```ts
/** Lands needed to win: half the roster, rounded up. Derived rather than
 *  hardcoded so it cannot rot when the map changes. */
export function victoryRealmSize(factionCount: number): number {
  return Math.ceil(0.5 * factionCount);
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS after fixing fixtures that hardcode the shipped default or the 55% threshold. `tests/helpers.ts:defenseMaxAll` keeps its own `each = 600` default - test polygons may be any size, so leave it unless a test's arithmetic depends on the shipped number.

- [ ] **Step 5: Commit**

```bash
git add src/defense.ts src/game.ts tests/
git commit -m "feat(balticmap): a tenth of the defense, half the map to win, a harvest every third turnip"
```

---

### Task 6: A Subjugate in every deck

**Files:**
- Modify: `src/cards.ts:213-219` (`startingDeck`)
- Test: `tests/cards.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `startingDeck()` returning 10 cards including one `subjugate`.

Note: the card's rules text does NOT change. A quiet land is an ordinary
faction, so "turn a faction in reach into your vassal" already describes what
happens when you take one.

- [ ] **Step 1: Write the failing test**

```ts
it("starts every seat with one Subjugate", () => {
  const deck = startingDeck();
  expect(deck.filter((c) => c === "subjugate")).toHaveLength(1);
  expect(deck).toHaveLength(10);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- cards`
Expected: FAIL, 0 Subjugate in a 9-card deck.

- [ ] **Step 3: Write the implementation**

```ts
export function startingDeck(): string[] {
  return [
    "raid", "raid", "raid",
    "fortify", "fortify", "fortify", "fortify", "fortify",
    "grow-crops",
    // The one card that takes ground. Every seat opens on a map that is
    // mostly unheld, so a deck without it can win nothing.
    "subjugate",
  ];
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cards.ts tests/cards.test.ts
git commit -m "feat(balticmap): every deck opens holding a Subjugate"
```

---

### Task 7: Taking a quiet land, and what it costs it

**Files:**
- Modify: `src/game.ts` (`playCard`, `landSubjugation`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `stripOnCapture` (Task 1).
- Produces: no new exports. `landSubjugation` strips the target's capture-stripped statuses.

This is the task that proves the design: no new event, no new store, no second
arm on the card. The only code change is the strip.

- [ ] **Step 1: Write the failing test**

```ts
describe("taking a quiet land", () => {
  const LANDS = ["alpha", "beta", "gamma", "delta"];
  const adj = {
    alpha: ["beta"], beta: ["alpha", "gamma"],
    gamma: ["beta", "delta"], delta: ["gamma"],
  };
  /** alpha acts, beta is quiet and broken to the gate, Subjugate in hand. */
  function ready(): GameState {
    const g = pickFaction(
      chooseBuild(startGame(newGame(LANDS, adj)), "warpath"),
      "alpha", seededRng(1),
    );
    return {
      ...g,
      players: g.players.map((p, i) => (i === 0 ? { ...p, hand: ["subjugate"] } : p)),
      passives: {
        beta: ["keeps-to-itself", "wild-lands", "no-successor", "hill-country"],
      },
      defense: { beta: 0 },
      playedThisTurn: false,
    };
  }

  it("makes it an ordinary vassal", () => {
    const after = playCard(ready(), 0, seededRng(2), "beta");
    expect(after.overlords.get("beta")).toBe("alpha");
  });

  it("strips what described it as unheld, and leaves the rest", () => {
    const after = playCard(ready(), 0, seededRng(2), "beta");
    expect(after.passives.beta).toEqual(["keeps-to-itself", "hill-country"]);
  });

  it("leaves it silent - a taken land still takes no turn", () => {
    const after = playCard(ready(), 0, seededRng(2), "beta");
    const withTurn = advance({ ...after, playedThisTurn: true }, seededRng(3));
    expect(withTurn.players[withTurn.current].factionId).not.toBe("beta");
  });

  it("never plays the tribute it was handed", () => {
    const after = playCard(ready(), 0, seededRng(2), "beta");
    const beta = after.players.find((p) => p.factionId === "beta")!;
    expect(beta.deck.filter((c) => c === "pay-military-tribute").length).toBeGreaterThan(0);
    expect(after.log.some((e) => e.type === "tribute")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- game`
Expected: FAIL on the strip test (the others should already pass - keep them, they are the regression guard for the whole design).

- [ ] **Step 3: Write the implementation**

In `playCard`, add `let passives = state.passives;` beside the other locals and `passives` to the returned state, then strip inside `landSubjugation`:

```ts
  const landSubjugation = (target: string): void => {
    const formerLord = overlords.get(target);
    // The target's own vassals come along: taking a lord takes its pyramid.
    overlords.set(target, p.factionId);
    // A land that has changed hands is no longer a land nobody holds, so the
    // statuses that said so go. What describes the ground - and the fact that
    // this land has no ambitions of its own - stays.
    passives = stripOnCapture(passives, target);
    players = updateFaction(players, target, (pl) => {
      const clean = stripTribute(pl);
      return {
        ...clean,
        deck: shuffle([...clean.deck, ...TRIBUTE_CARDS], rng),
      };
    });
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: target, overlordFactionId: p.factionId,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
  };
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): a taken land loses what said nobody held it"
```

---

### Task 8: No successor - kill the ruler, take the land

**Files:**
- Modify: `src/game.ts` (`playCard`, the `assassinate-ruler` branch)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `landSubjugation` (Task 7), `hasPassive` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
describe("No successor", () => {
  const LANDS = ["alpha", "beta", "gamma"];
  const adj = { alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta"] };
  function ready(): GameState {
    const g = pickFaction(
      chooseBuild(startGame(newGame(LANDS, adj)), "warpath"),
      "alpha", seededRng(1),
    );
    return {
      ...g,
      players: g.players.map((p, i) =>
        i === 0 ? { ...p, hand: ["assassinate-ruler"] } : p),
      passives: { beta: ["keeps-to-itself", "no-successor"] },
      playedThisTurn: false,
    };
  }

  it("takes a land carrying it when its ruler is killed, gate or no gate", () => {
    const after = playCard(ready(), 0, seededRng(2), "beta");
    expect(after.overlords.get("beta")).toBe("alpha");
    expect(after.passives.beta).toEqual(["keeps-to-itself"]);
  });

  it("does not fire when a bodyguard turned the blade aside", () => {
    const after = playCard({ ...ready(), guards: { bodyguard: ["beta"] } }, 0, seededRng(2), "beta");
    expect(after.overlords.get("beta")).toBeUndefined();
  });

  it("leaves a land without the status alone", () => {
    const after = playCard({ ...ready(), passives: {} }, 0, seededRng(2), "beta");
    expect(after.overlords.get("beta")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- game`
Expected: FAIL, `beta` has no overlord in the first test.

- [ ] **Step 3: Write the implementation**

In the `assassinate-ruler` branch, after the `events[0]` update:

```ts
    // No successor: a land with nobody to take up the crown falls to whoever
    // killed its ruler, gate and respite alike bypassed - the killing IS the
    // taking. A prevented play never reaches this branch, so a bodyguard
    // stops it without a second check.
    if (
      hasPassive(passives, targetId, "no-successor") &&
      !fullRealmOf(p.factionId, overlords, incorporated).has(targetId)
    ) {
      landSubjugation(targetId);
    }
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): a land with no successor falls to its ruler's killer"
```

---

### Task 9: Wild lands repair themselves

**Files:**
- Modify: `src/game.ts` (`beginTurn`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `hasPassive`, `WILD_LANDS_HEAL`, `WILD_LANDS_HEAL_CHANCE` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
describe("Wild lands", () => {
  const base = () =>
    pickFaction(
      chooseBuild(startGame(newGame(["alpha", "beta"])), "warpath"),
      "alpha", seededRng(1),
    );
  const wild = (over = {}) => ({
    ...base(), current: 0, defense: { beta: 1 },
    passives: { beta: ["keeps-to-itself", "wild-lands"] }, ...over,
  });

  it("recovers 1 defense on a lucky roll at the round wrap, and logs it", () => {
    const after = beginTurn(wild(), () => 0); // every roll a hit
    expect(after.defense.beta).toBe(2);
    const healed = after.log.find((e) => e.type === "healed" && e.targetFactionId === "beta")!;
    expect(healed.amount).toBe(1);
    expect(healed.cardId).toBeUndefined();
  });

  it("does nothing on an unlucky roll", () => {
    expect(beginTurn(wild(), () => 0.99).defense.beta).toBe(1);
  });

  it("rolls once a round, not once a turn", () => {
    expect(beginTurn(wild({ current: 1 }), () => 0).defense.beta).toBe(1);
  });

  it("leaves a land already at its ceiling alone", () => {
    expect(beginTurn(wild({ defense: {} }), () => 0).defense.beta).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- game`
Expected: FAIL, defense stays at 1.

- [ ] **Step 3: Write the implementation**

In `beginTurn`, make `defense` a `let` and insert after the marches resolve, before the draw block:

```ts
  // Wild lands: a land nobody tends slowly grows its defenses back. Rolled
  // once a ROUND - at the wrap onto the first seat - rather than once a turn,
  // so five acting factions do not make it a five-times-faster recovery. It
  // moves a defense score, so it is logged and walked; the seat whose turn is
  // beginning owns the line, the turn-start-clock convention the independence
  // gate already keeps.
  if (state.current === 0) {
    for (const polygon of state.factionIds) {
      if (!hasPassive(state.passives, polygon, "wild-lands")) continue;
      const v = { defense, defenseMax: state.defenseMax };
      if (defenseOf(v, polygon) >= defenseMaxOf(v, polygon)) continue;
      if (rng() >= WILD_LANDS_HEAL_CHANCE) continue;
      defense = applyHeal(v, polygon, WILD_LANDS_HEAL);
      events.push({
        turn: state.turn, playerId: p.id, type: "healed",
        targetFactionId: polygon, amount: WILD_LANDS_HEAL,
      });
    }
  }
```

Add `defenseMaxOf` to the `./defense` import list in `src/game.ts` if absent.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, `tests/standings.test.ts` included - the walk sees these heals because they carry `amount`.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): wild lands grow their defenses back"
```

---

### Task 10: Hill country blunts what lands on it

**Files:**
- Modify: `src/game.ts` (`resolveMarches`, the Plague branch), `src/target-explanations.ts:225`
- Test: `tests/game.test.ts`, `tests/target-explanations.test.ts`

**Interfaces:**
- Consumes: `damageAfterTerrain` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

In `tests/game.test.ts`, build the two states from this file's existing patterns - a march is declared by playing `raid` with a source and lands on the actor's next `beginTurn`; a disease stack is set by playing `spread-disease`:

```ts
describe("Hill country", () => {
  it("takes a quarter off a march that lands on it", () => {
    // Set up a declared raid of known strength from alpha at beta, then let
    // it land with beta carrying hill-country. A raid of 4 leaves 3.
    const landed = landDeclaredRaid({ hill: true, strength: 4 });
    const flat = landDeclaredRaid({ hill: false, strength: 4 });
    expect(damageDealt(flat)).toBe(4);
    expect(damageDealt(landed)).toBe(3);
  });

  it("takes a quarter off a plague cashed on it", () => {
    const dealt = cashPlagueOn({ hill: true, stacks: 1 });
    expect(dealt).toBe(PLAGUE_DAMAGE_PER_STACK * 0.75);
  });
});
```

Write `landDeclaredRaid`, `damageDealt` and `cashPlagueOn` as local helpers in the test file, on the small `alpha/beta/gamma` map the other tests use. Do not add helpers to `src/`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- game`
Expected: FAIL, full damage lands.

- [ ] **Step 3: Write the implementation**

In `resolveMarches`:

```ts
    const winner = loser === axis.a ? axis.b : axis.a;
    // The ground has its say on the leftover that actually lands, not on what
    // each side set out with: a counter-raid is answered by armies, a hill by
    // whatever gets past them.
    const dealt = damageAfterTerrain(view, loser, delta);
    const before = defenseOf({ defense, defenseMax: state.defenseMax }, loser);
    const moved = Math.min(before, dealt);
    if (moved <= 0) continue;
    defense = applyDamage({ defense, defenseMax: state.defenseMax }, loser, dealt);
```

In the Plague branch of `playCard`:

```ts
      const damage = damageAfterTerrain(
        view, polygon, stacks * PLAGUE_DAMAGE_PER_STACK * mult,
      );
```

In `src/target-explanations.ts`, where the attack preview quotes
`attackDamageFor`, pass the figure through `damageAfterTerrain(view, targetFactionId, damage)` before printing it, so the tip and the landing agree.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/target-explanations.ts tests/
git commit -m "feat(balticmap): hill country blunts what lands on it"
```

---

### Task 11: River trade pays its holder

**Files:**
- Modify: `src/playability.ts` (`wealthIncomeFor`)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `hasPassive` (Task 1), `RulesView.passives` (Task 3).
- Produces: `wealthIncomeFor(view: {incorporated; settlements; passives}, factionId): number`.

- [ ] **Step 1: Write the failing test**

```ts
it("pays 1 more a turn for each river-trade land held outright", () => {
  const v = view({
    incorporated: { beta: "alpha" },
    passives: { beta: ["river-trade"] },
  });
  expect(wealthIncomeFor(v, "alpha")).toBe(2);
});

it("pays nothing extra for a vassal's river, which tribute already channels", () => {
  const v = view({
    overlords: new Map([["beta", "alpha"]]),
    passives: { beta: ["river-trade"] },
  });
  expect(wealthIncomeFor(v, "alpha")).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- playability`
Expected: FAIL, income is 1 in the first case.

- [ ] **Step 3: Write the implementation**

```ts
export function wealthIncomeFor(
  view: {
    incorporated: Incorporated;
    settlements: Record<string, number>;
    passives: Passives;
  },
  factionId: string,
): number {
  let founded = 0;
  let trade = 0;
  for (const land of incorporatedRealmOf(factionId, view.incorporated)) {
    founded += view.settlements[land] ?? 0;
    // The river pays whoever holds the bank. A vassal's river is not counted
    // here for the same reason its settlements are not: tribute is the channel
    // by which a vassal's wealth reaches its lord, and counting it here would
    // tax it twice.
    if (hasPassive(view.passives, land, "river-trade")) trade += 1;
  }
  return 1 + founded + trade;
}
```

Every caller passes a full `RulesView`, so no call sites change; add
`passives: {}` to any object literal a test hands it.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/playability.ts tests/playability.test.ts
git commit -m "feat(balticmap): a river pays whoever holds its bank"
```

---

### Task 12: The leaderboard lists the players

**Files:**
- Modify: `src/view.ts:21-76` (`SCOREBOARD_ROWS`, `standingsFor`), `src/hud.ts:1587-1599` (`renderScoreboard`)
- Test: `tests/view.test.ts`

**Interfaces:**
- Consumes: `playsTurns` (Task 1).
- Produces: `standingsFor(args: { acting: string[]; humanFactionId; realmSize; incorporated; needed }): StandingRow[]`; `SCOREBOARD_ROWS` removed.

- [ ] **Step 1: Write the failing test**

Rewrite the `standingsFor` block of `tests/view.test.ts`:

```ts
describe("standingsFor", () => {
  const args = (over = {}) => ({
    acting: ["alpha", "beta", "gamma", "delta", "epsilon"],
    humanFactionId: "gamma",
    realmSize: (f: string) =>
      ({ alpha: 4, beta: 3, gamma: 2, delta: 1, epsilon: 1 })[f] ?? 0,
    incorporated: {},
    needed: 13,
    ...over,
  });

  it("gives every acting faction a row, best first", () => {
    const rows = standingsFor(args());
    expect(rows.map((r) => r.factionId))
      .toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(rows.filter((r) => r.isHuman)).toHaveLength(1);
  });

  it("gives no row to a land that takes no turns", () => {
    expect(standingsFor(args()).map((r) => r.factionId)).not.toContain("zeta");
  });

  it("drops an acting faction that has been incorporated", () => {
    const rows = standingsFor(args({ incorporated: { delta: "alpha" } }));
    expect(rows.map((r) => r.factionId)).not.toContain("delta");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- view`
Expected: FAIL, three rows plus the human, and `acting` is not a parameter.

- [ ] **Step 3: Write the implementation**

In `src/view.ts`, delete `SCOREBOARD_ROWS` and rewrite:

```ts
/** The scoreboard: one row per faction that ACTS, best realm first.
 *
 *  Every player fits now - five of them, not twenty-six factions - so there is
 *  no top-N cut and no separate row for a human who fell outside it. A land
 *  that takes no turns gets no row: it is ground to be taken, not a contender.
 *
 *  Only factions that could actually win are ranked, the same test the victory
 *  check applies - not incorporated. A vassal stays in the ranking because the
 *  rules let one win.
 *
 *  Ties on land count resolve by seat order: `acting` arrives in seat order
 *  and `sort` is stable, so equal realms keep a fixed order and the board does
 *  not reshuffle itself from one turn to the next. */
export function standingsFor(args: {
  acting: string[];
  humanFactionId: string | undefined;
  realmSize(factionId: string): number;
  incorporated: Incorporated;
  needed: number;
}): StandingRow[] {
  const { acting, humanFactionId, realmSize, incorporated, needed } = args;
  const pct = (lands: number): number =>
    Math.min(100, Math.floor((lands / needed) * 100));
  return acting
    .filter((f) => !(f in incorporated))
    .sort((a, b) => realmSize(b) - realmSize(a))
    .map((factionId) => ({
      factionId,
      lands: realmSize(factionId),
      needed,
      percent: pct(realmSize(factionId)),
      isHuman: factionId === humanFactionId,
    }));
}
```

In `src/hud.ts:1589`, replace `factionIds: state.factionIds` with

```ts
      acting: state.players
        .map((pl) => pl.factionId)
        .filter((f) => playsTurns(state.passives, f)),
```

and drop any now-unused `SCOREBOARD_ROWS` import.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/view.ts src/hud.ts tests/view.test.ts
git commit -m "feat(balticmap): the leaderboard lists every player and only players"
```

---

### Task 13: Grey lands on the map, statuses on the hover

**Files:**
- Modify: `src/main.ts` (`applyOwnership`, `hoverLines`), `src/target-explanations.ts` (`passiveLines`)
- Test: `tests/target-explanations.test.ts`

**Interfaces:**
- Consumes: `isUnheld` (Task 3), `playsTurns`, `PASSIVES`, `passivesOn` (Task 1).
- Produces: `passiveLines(passives: Passives, polygon: string): TooltipLine[]`.

- [ ] **Step 1: Write the failing test**

```ts
describe("passiveLines", () => {
  it("names every status on the land, one line each", () => {
    const lines = passiveLines({ selija: ["keeps-to-itself", "hill-country"] }, "selija");
    expect(lines.map((l) => l.text)).toEqual([
      "Keeps to itself - This land takes no turns and plays no cards.",
      "Hill country - Incoming attack damage reduced by a quarter.",
    ]);
    expect(lines[0].blockStart).toBe(true);
  });

  it("says nothing about a land carrying nothing", () => {
    expect(passiveLines({}, "selija")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- target-explanations`
Expected: FAIL, `passiveLines` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/target-explanations.ts`, beside `defenseBreakdown`:

```ts
/** Every passive status on a land, one line each: what it is and what it does.
 *  Public whoever holds the land - a status the player cannot see is a rule
 *  they cannot play around, which is why no status ships without this. */
export function passiveLines(passives: Passives, polygon: string): TooltipLine[] {
  return passivesOn(passives, polygon).map((id, i) => ({
    text: `${PASSIVES[id].name} - ${PASSIVES[id].text}`,
    ...(i === 0 ? { blockStart: true as const } : {}),
  }));
}
```

In `src/main.ts`:

1. In `hoverLines`, after the `defenseBreakdown` / `diseaseBreakdown` block:

```ts
  lines.push(...passiveLines(game.passives, region.faction));
```

2. In `applyOwnership`, the fill:

```ts
    // Grey is "quiet AND unheld". A quiet land somebody has taken wears its
    // own hue and the vassal stripes, so the map shows an empire growing;
    // leaving it grey would hide the only thing conquest is for.
    const grey =
      inPlay() &&
      !playsTurns(game.passives, region.faction) &&
      isUnheld(region.faction, game.overlords, game.incorporated);
    el.setAttribute(
      "fill", grey ? UNOWNED_FILL : factionById.get(effective)!.color,
    );
```

with, near the other map constants:

```ts
/** What a land nobody plays and nobody holds is painted. One flat grey for all
 *  of them: a people's hue on this map means somebody is playing behind it,
 *  and twenty-one hues nobody was playing was the map describing a game that
 *  was not happening. Distinct from the off-map neighbour grey, which is
 *  lighter. */
const UNOWNED_FILL = "#c3bfb6";
```

3. `renderVassalOverlay`, `renderRealmHalo` and the union outlines need no change - they walk realms, and an unheld land is in nobody's.

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/target-explanations.ts tests/target-explanations.test.ts
git commit -m "feat(balticmap): grey for the lands nobody plays, and every status on the hover"
```

---

### Task 14: The AI reaches for the free land

**Files:**
- Modify: `src/ai.ts` (the assassinate branch, `POLICY_COVERAGE`)
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `hasPassive` (Task 1), Task 8.
- Produces: no new exports.

A quiet seat never reaches `aiTakeTurn`, so the policy needs no guard of its
own, and Subjugate's branch already reaches quiet lands because they are
ordinary factions in reach.

- [ ] **Step 1: Write the failing test**

```ts
it("prefers a No successor land for the blade, whatever its leadership", () => {
  // gamma has the higher leadership; beta carries no-successor and is in reach.
  const action = chooseAction(assassinChoiceState());
  expect(action).toMatchObject({ type: "play", targetId: "beta" });
});
```

Build `assassinChoiceState()` in the test file from its existing fixtures: a
small map, the actor holding `assassinate-ruler`, `passives: { beta: [...] }`
and `rulers` giving gamma the higher leadership.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ai`
Expected: FAIL, gamma is chosen.

- [ ] **Step 3: Write the implementation**

```ts
  const assassinate = idxOf("assassinate-ruler");
  if (assassinate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "assassinate-ruler")
      .filter((t) => !holdsGuard(v, t, "bodyguard"));
    // A land with No successor is taken outright by the killing, whatever its
    // ruler was worth: a card that wins a land beats a card that removes a
    // leadership stack.
    const free = targets
      .filter((t) => hasPassive(v.passives, t, "no-successor"))
      .sort((a, b) => order(a) - order(b))[0];
    const pick =
      free ??
      targets
        .filter((t) => (v.leadership[t] ?? 0) >= WAR_COUNCIL_LEADERSHIP)
        .sort(
          (a, b) =>
            (v.leadership[b] ?? 0) - (v.leadership[a] ?? 0) || order(a) - order(b),
        )[0];
    if (pick !== undefined) {
      return { type: "play", cardIndex: assassinate, targetId: pick };
    }
  }
```

Update the two `POLICY_COVERAGE` entries:

```ts
  "subjugate":
    "2: subjugate any faction whose gate is open, quiet lands included - a " +
    "land that takes no turns is a faction in reach like any other; the pick " +
    "among open gates is the biggest full realm, ties by faction order",
  "assassinate-ruler":
    "4: kill the ruler of a land carrying No successor in reach, which takes " +
    "it outright; else the highest leadership in reach, bodyguard risk unknown",
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, `POLICY_COVERAGE` test included.

- [ ] **Step 5: Commit**

```bash
git add src/ai.ts tests/ai.test.ts
git commit -m "feat(balticmap): the AI takes the land a dead ruler leaves open"
```

---

### Task 15: Arrows start and end at the towns

**Files:**
- Modify: `src/main.ts:775-795` (the inset constants and `insetFor`), `src/main.ts:953-970` (`drawMarch`), `src/main.ts:1097-1120` (the fade-out ghost)
- Test: none new - `src/arrows.ts` geometry is unchanged and already covered; this is verified in the browser (Task 17).

**Interfaces:**
- Consumes: nothing.
- Produces: `TOWN_CLEARANCE_TAIL`, `TOWN_CLEARANCE_HEAD`, `CLEARANCE_MAX_SHARE` replacing `ARROW_INSET`, `ARROW_INSET_SHARE`, `ARROW_HEAD_INSET_SHARE`.

- [ ] **Step 1: Replace the constants**

```ts
/** How far an arrow's ends stop short of the two towns it runs between. The
 *  anchors ARE towns (`marchAnchors`), so the only thing to clear is the dot
 *  and the name under it - not the land, which is what the old region-centre
 *  insets were sized for and why an arrow out of a town began well past it and
 *  gave up well short of its target.
 *
 *  Capped as a share of the axis together, because two neighbouring towns can
 *  be 90 units apart and a clearance longer than the axis turns the segment
 *  inside out. */
const TOWN_CLEARANCE_TAIL = 12;
const TOWN_CLEARANCE_HEAD = 6;
const CLEARANCE_MAX_SHARE = 0.35;
```

- [ ] **Step 2: Use them in `drawMarch`**

```ts
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const fitClearance = Math.min(
    1,
    (length * CLEARANCE_MAX_SHARE) / (TOWN_CLEARANCE_TAIL + TOWN_CLEARANCE_HEAD),
  );
  const pull = TOWN_CLEARANCE_TAIL * fitClearance;
  const head = TOWN_CLEARANCE_HEAD * fitClearance;
  const usable = length - pull - head;
  const inset = insetSegment(
    from.x, from.y, to.x, to.y,
    pull + Math.max(0, usable) * (1 - lengthShare), head,
  );
```

Delete `insetFor` and the three old constants once nothing references them.

- [ ] **Step 3: Use them in the fade-out ghost**

Apply the identical `pull`/`head` arithmetic at `src/main.ts:1108`, so a landed
arrow fades out exactly where the live one stood.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`, and `npm run lint` from the repo root.
Expected: PASS with no unused-constant lint error.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "fix(balticmap): a march arrow leaves one town and bites the next"
```

---

### Task 16: The multiplayer guest gets to play

**Files:**
- Modify: `src/main.ts` (`tryDeal`)
- Test: verified in Task 17.

**Interfaces:**
- Consumes: `pickFaction(..., opts)` (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Reserve the guest's faction**

In `tryDeal`:

```ts
  // The guest's land must be one of the factions that ACT, or the seat exists
  // and never gets a turn. Everything else about the deal is unchanged: every
  // faction still gets a seat and a deck.
  game = pickFaction(game, net.hostPick, rng, {
    reservedFactionIds: [pick.factionId],
  });
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "fix(balticmap): a joining guest is one of the factions that act"
```

---

### Task 17: Play it

**Files:**
- Modify: `CLAUDE.md` (the prototype's own agent notes), this plan (tick the boxes)

- [ ] **Step 1: Full green**

From `02-balticmap/`: `npm test && npm run build`. From the repo root: `npm run lint`.
Expected: all pass. Fix anything red before going further.

- [ ] **Step 2: Boot the map and read it**

Start the root dev server and open

`http://127.0.0.1:4173/prototypes/02/?seed=7&faction=selonians&build=warpath`

Read the text in every screenshot, not only its layout:

- the leaderboard shows five rows, one of them yours, and no sixth;
- the map is mostly grey, with five coloured lands that do not border each other;
- a grey land's badge shows a small number over a small max (2..18);
- hovering a grey land names Keeps to itself, Wild lands and No successor;
- hovering a hill or river land names its ground, held or not;
- a full round passes quickly - the quiet lands take no turns.

- [ ] **Step 3: Take a land**

`...&turns=6&defense=jersikans:0&hand=subjugate,raid,fortify`

- Subjugate is armed and Jersika is a legal target; the click takes it.
- Jersika turns from grey to its own hue with your stripes, its Wild lands and No successor lines disappear from the hover while Keeps to itself stays, and the leaderboard count rises.
- Play on for a few rounds: Jersika never takes a turn and never pays tribute.

- [ ] **Step 4: Watch an arrow**

`...&march=selonians>jersikans`

- The arrow leaves the source town's dot and its head bites the target town's dot, with no gap at either end. This is the reported bug; compare against the screenshot in the design doc's section 7.
- The strength label sits on the shaft, and the arrow is clickable as a counter while you hold a Raid.

- [ ] **Step 5: Say how it plays**

Write two or three sentences in the handoff: whether a War council raid one-shotting an average land and Hillfort full-healing anything actually spoil the game at these maxes, and whether five players on 26 lands leaves the map too empty or about right. This is the judgement gate the card rule in `AGENTS.md` asks for - name what to play and what would look wrong.

- [ ] **Step 6: Record the shape in the prototype's notes**

Add a short section to `02-balticmap/CLAUDE.md`: every faction has a seat and a deck, but only `MAX_ACTIVE` of them take turns - the difference is one passive status, `keeps-to-itself`, and `advance` skipping it is the whole turn-loop cost. Say why that matters: a quiet land is an ordinary faction, so subjugation, poaching, healing and incorporation all work unchanged, and a card that removed the status would wake it up with the deck it was dealt. Note that `src/passives.ts` is the one place a land's standing properties live, that `strippedOnCapture` is the axis, and that a status does not ship without a hover line.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-08-09-five-seats-and-passive-statuses.md
git commit -m "docs(balticmap): one status is the difference between a land that plays and one that does not"
```

# Survidle Species Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five hard-coded animals with a catalogue of about thirty species that have ranges, seasons and their own yields; let the player hunt or fish for a chosen species or for whatever is about; make wolves a population that drives the night hazard.

**Architecture:** `src/sim/species.ts` is the one source of truth for every species. `src/world/wildlife.ts` turns a region's habitat shares plus a per-species range noise into capacities. `animals.ts`, `skills.ts`, `tasks.ts`, `intent.ts`, `events.ts` and the panels iterate the catalogue instead of naming species. The sound plan (`2026-09-03-survidle-sound.md`) reads the catalogue's `calls` and is done after this one.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom for UI tests). No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-species-and-sound-design.md`, sections 1, 2, 3, 5, 6 and 7.

## Global Constraints

- Every quantity is a real one: kilograms, kilometres, minutes, individuals per km2.
- The sim never uses `Math.random`; every roll goes through the `Rng` passed in or `new Rng(state.rng)` written back to `state.rng`.
- `npm test` and `npm run build` (which runs `tsc`) must pass before every commit. Run both from `08-survidle/`.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`. Another session may be mid-edit on this branch.
- No em dashes and no non-typable characters in code, comments, docs or UI text. Use `-`, `...`, `->`.
- Comments explain, they never chronicle: no "was X, now Y", no dates.
- `SaveFile.version` stays 3. Old saves must load.
- The catalogue's key order seeds each species' range noise. Do not reorder entries once the plan has landed; append.
- Species ids are camelCase (`willowGrouse`), names are lower-case English ("willow grouse").

---

## File map

| File | Responsibility |
|---|---|
| `src/sim/species.ts` (new) | `SpeciesDef`, the catalogue, `SPECIES_IDS`, class predicates, `waterOf`, `seasonFactor`, `monthName` use |
| `src/world/wildlife.ts` (new) | `wildlifeCapacity`, `rangeNoise` |
| `src/world/gen.ts` | lake and sea shares, capacity via `wildlifeCapacity`, `speciesHere` |
| `src/world/cells.ts` | `waterKindOf` |
| `src/sim/types.ts` | `Species` re-exported from the catalogue, `Task.any`, `RegionState.pop` partial |
| `src/sim/items.ts` | `fur` item, recipe alts; `ANIMALS` and `SpeciesDef` removed |
| `src/sim/animals.ts` | seasons, migrants, voice-only, per-catalogue growth, `popOf` |
| `src/sim/regionstate.ts` | partial pop, `fillPopulations` |
| `src/sim/events.ts` | wolf roll by density |
| `src/sim/skills.ts` | keys, pool caps, extras by class, per-species fish weight |
| `src/sim/tasks.ts` | rows per species, water kinds, `any` draw, fish arg |
| `src/sim/position.ts` | `watersideCell` with a water kind |
| `src/sim/intent.ts` | ground per species, gerunds, yield items with fur |
| `src/sim/save.ts` | dead pop keys, arg renames |
| `src/sim/calendar.ts` | `monthName` |
| `src/ui/panels.ts` | roster lines, Hunt group per region |
| `src/main.ts` | `fillPopulations` after load, rng into `startTask` |
| `tests/species.test.ts` (new), `tests/wildlife.test.ts` (new) | catalogue and capacity |
| existing tests | updated where they named `grouse`, `fish` or `ANIMALS` |

---

### Task 1: The catalogue and the fur item

**Files:**
- Create: `src/sim/species.ts`
- Modify: `src/sim/items.ts` (KgItem list, `ITEM_KG`, `KG_ITEMS`, `ITEM_NAMES`, three recipes)
- Modify: `src/sim/types.ts:44-49` (`KgItem`)
- Modify: `src/sim/calendar.ts` (export `monthName`)
- Test: `tests/species.test.ts`

**Interfaces:**
- Produces: `SPECIES_DEFS: Record<Species, SpeciesDef>`, `SPECIES_IDS: Species[]`, `type Species`, `type Habitat`, `awayWord(def): "gone" | "denned"`, the `fat` item and food, `isFish(s)`, `isHunted(s)`, `isVoiceOnly(s)`, `huntedLand(): Species[]`, `fishSpecies(): Species[]`, `waterOf(s): "lake" | "sea" | null`, `seasonFactor(def, month): number`, `extrasClass(s): "fur" | "big" | "bird" | "fish" | null`, `monthName(m: number): string`.

- [ ] **Step 1: Write the failing tests**

`tests/species.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  awayWord, extrasClass, fishSpecies, huntedLand, isFish, isHunted, isVoiceOnly, seasonFactor, SPECIES_DEFS, SPECIES_IDS, waterOf,
} from "../src/sim/species";
import { AUTO_EAT_ORDER, FOODS, ITEM_KG, KG_ITEMS, RECIPES } from "../src/sim/items";
import { monthName } from "../src/sim/calendar";

describe("the species catalogue", () => {
  it("has about thirty species, each with somewhere to live", () => {
    expect(SPECIES_IDS.length).toBeGreaterThanOrEqual(30);
    for (const s of SPECIES_IDS) {
      const def = SPECIES_DEFS[s];
      const weights = Object.values(def.habitat);
      expect(weights.length, s).toBeGreaterThan(0);
      for (const w of weights) expect(w, s).toBeGreaterThan(0);
      expect(def.range, s).toBeGreaterThan(0);
      expect(def.range, s).toBeLessThanOrEqual(1);
      expect(def.growth, s).toBeGreaterThan(0);
    }
  });

  it("gives every hunted species meat and a spot, and fish the shore", () => {
    for (const s of SPECIES_IDS) {
      const def = SPECIES_DEFS[s];
      if (!def.hunt) {
        expect(def.yields, s).toBeUndefined();
        expect(isVoiceOnly(s)).toBe(true);
        continue;
      }
      expect(isHunted(s)).toBe(true);
      expect(def.yields?.meatKg, s).toBeGreaterThan(0);
      expect(def.hunt.minutes, s).toBeGreaterThan(0);
      expect(def.hunt.odds, s).toBeGreaterThan(0);
      if (def.kind === "fish") {
        expect(isFish(s)).toBe(true);
        expect(def.hunt.spot).toBe("shore");
        expect(waterOf(s)).not.toBeNull();
      }
    }
    expect(huntedLand()).toContain("hare");
    expect(huntedLand()).toContain("capercaillie");
    expect(huntedLand()).not.toContain("perch");
    expect(huntedLand()).not.toContain("loon");
    expect(fishSpecies()).toContain("perch");
    expect(fishSpecies()).toContain("cod");
  });

  it("knows which water a species wants", () => {
    expect(waterOf("perch")).toBe("lake");
    expect(waterOf("cod")).toBe("sea");
    expect(waterOf("eider")).toBe("sea");
    expect(waterOf("mallard")).toBe("lake");
    expect(waterOf("beaver")).toBe("lake");
    expect(waterOf("hare")).toBeNull();
  });

  it("seasons: residents thin in winter by their factor, migrants are away", () => {
    expect(seasonFactor(SPECIES_DEFS.deer, 0)).toBe(0.6);
    expect(seasonFactor(SPECIES_DEFS.deer, 6)).toBe(1);
    expect(seasonFactor(SPECIES_DEFS.hare, 0)).toBe(1);
    expect(seasonFactor(SPECIES_DEFS.burbot, 1)).toBe(1.5);
    expect(seasonFactor(SPECIES_DEFS.mallard, 0)).toBe(0);
    expect(seasonFactor(SPECIES_DEFS.mallard, 3)).toBe(1);
    expect(seasonFactor(SPECIES_DEFS.mallard, 8)).toBe(1);
    expect(seasonFactor(SPECIES_DEFS.mallard, 9)).toBe(0);
    expect(seasonFactor(SPECIES_DEFS.loon, 3)).toBe(0);
    expect(seasonFactor(SPECIES_DEFS.loon, 4)).toBe(1);
    // A denned bear is a migrant to the rule.
    expect(seasonFactor(SPECIES_DEFS.bear, 0)).toBe(0);
    expect(seasonFactor(SPECIES_DEFS.bear, 6)).toBe(1);
  });

  it("sorts species into extras classes", () => {
    expect(extrasClass("hare")).toBe("fur");
    expect(extrasClass("fox")).toBe("fur");
    expect(extrasClass("deer")).toBe("big");
    expect(extrasClass("wolf")).toBe("big");
    expect(extrasClass("bear")).toBe("big");
    expect(extrasClass("wolverine")).toBe("fur");
    expect(extrasClass("capercaillie")).toBe("bird");
    expect(extrasClass("pike")).toBe("fish");
    expect(extrasClass("loon")).toBeNull();
  });

  it("fur and fat are kilogram items, fat is a rich food kept for last, and the fur pieces take fur with hide as the alt", () => {
    expect(ITEM_KG.fur).toBe(1);
    expect(KG_ITEMS.has("fur")).toBe(true);
    expect(ITEM_KG.fat).toBe(1);
    expect(KG_ITEMS.has("fat")).toBe(true);
    expect(FOODS.fat).toEqual({ kcalPerKg: 9000, portionKg: 0.1, sickChance: 0 });
    expect(AUTO_EAT_ORDER.at(-1)).toBe("fat");
    expect(SPECIES_DEFS.bear.yields?.fatKg).toBe(10);
    expect(awayWord(SPECIES_DEFS.bear)).toBe("denned");
    expect(awayWord(SPECIES_DEFS.mallard)).toBe("gone");
    expect(RECIPES.furHat.needs).toEqual([{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }]);
    expect(RECIPES.furMittens.needs[0]).toEqual({ item: "fur", qty: 1, alt: "hide" });
    expect(RECIPES.hideBlanket.needs[0]).toEqual({ item: "hide", qty: 4, alt: "fur" });
  });

  it("names months", () => {
    expect(monthName(0)).toBe("January");
    expect(monthName(3)).toBe("April");
    expect(monthName(11)).toBe("December");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/species.test.ts`
Expected: FAIL, "Cannot find module '../src/sim/species'".

- [ ] **Step 3: Add `fur` to the items**

In `src/sim/types.ts`, the `KgItem` union gains `"fur"`:

```ts
export type KgItem =
  | "firewood" | "hide" | "fur" | "fat" | "rawMeat" | "cookedMeat" | "driedMeat"
  | "fish" | "cookedFish" | "berries" | "wetFirewood";
```

In `src/sim/items.ts`:

```ts
export const ITEM_KG: Record<ItemId, number> = {
  log: 20, stick: 0.5, bark: 0.2, cordage: 0.1, stone: 1.5, bone: 0.3,
  sinew: 0.05, snare: 0.4, arrow: 0.05, torch: 0.4,
  firewood: 1, hide: 1, fur: 1, fat: 1, rawMeat: 1, cookedMeat: 1, driedMeat: 1,
  fish: 1, cookedFish: 1, berries: 1, wetFirewood: 1,
};

export const KG_ITEMS = new Set<ItemId>([
  "firewood", "hide", "fur", "fat", "rawMeat", "cookedMeat", "driedMeat", "fish", "cookedFish", "berries", "wetFirewood",
]);
```

Add `fur: "fur", fat: "fat",` after `hide: "hide",` in `ITEM_NAMES`. Fat is a food, the richest there is, kept for last:

```ts
export type FoodId = "rawMeat" | "cookedMeat" | "driedMeat" | "cookedFish" | "berries" | "fat";
export const FOODS: Record<FoodId, { kcalPerKg: number; portionKg: number; sickChance: number }> = {
  rawMeat: { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0.25 },
  cookedMeat: { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0 },
  driedMeat: { kcalPerKg: 3500, portionKg: 0.15, sickChance: 0 },
  cookedFish: { kcalPerKg: 1000, portionKg: 0.3, sickChance: 0 },
  berries: { kcalPerKg: 500, portionKg: 0.2, sickChance: 0 },
  fat: { kcalPerKg: 9000, portionKg: 0.1, sickChance: 0 },
};
export const AUTO_EAT_ORDER: FoodId[] = ["berries", "cookedFish", "cookedMeat", "driedMeat", "fat"];
```

Check `grep -n "FoodId\|FOODS" src` for exhaustive switches or lists over foods (the inventory panel's eat buttons, `eat` in actions.ts) and make sure a `fat` stack in the pack gets an eat button like the others; it is not a perishable, so it lives in `items`, not `stacks`. Change the three recipes:

```ts
  furHat: { name: "fur hat", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furHat" } },
  furMittens: { name: "fur mittens", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furMittens" } },
  hideBlanket: { name: "hide blanket", needs: [{ item: "hide", qty: 4, alt: "fur" }, { item: "sinew", qty: 2 }], tool: "needle", minutes: 240, out: { clothing: "hideBlanket" } },
```

Leave `ANIMALS` and `SpeciesDef` in `items.ts` for now; Task 2 removes them.

- [ ] **Step 4: Export `monthName` from the calendar**

In `src/sim/calendar.ts`, add below `MONTH_NAMES`:

```ts
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "April" for month 3. */
export function monthName(month: number): string {
  return MONTH_FULL[((month % 12) + 12) % 12];
}
```

- [ ] **Step 5: Write the catalogue**

`src/sim/species.ts`:

```ts
/**
 * Every animal in the north, in one place: where it lives, how far its
 * range reaches, when it is here, what taking one costs and yields, and
 * what it sounds like. Regions, hunting, fishing, skills, the panels and
 * the sound all read this and name no species of their own.
 *
 * Key order is load-bearing: a species' position seeds its range noise, so
 * reordering the catalogue redraws every range. Append new species.
 */
import type { SpotId, Terrain } from "./types";

export type Habitat = Exclude<Terrain, "water"> | "lake" | "sea";
export type SpeciesClass = "mammal" | "bird" | "fish";
export type WaterKind = "lake" | "sea";

export type SeasonRule =
  | { kind: "resident"; /** capacity factor December to February */ winter?: number }
  /** Present from the arrive month to the month before leave, 0-based; absent otherwise. away is how the absence reads: gone south, or denned. */
  | { kind: "migrant"; arrive: number; leave: number; away?: "gone" | "denned" };

export interface Call {
  /** Slot in the audio manifest. */
  sound: string;
  when: "day" | "night" | "dawn" | "dusk" | "any";
  /** 0-based inclusive month range; absent means all year. */
  months?: [number, number];
  /** Relative frequency among a region's open calls. */
  weight: number;
}

export interface SpeciesDef {
  name: string;
  kind: SpeciesClass;
  /** Individuals per km2 of each habitat at full occupancy. Absent means none. */
  habitat: Partial<Record<Habitat, number>>;
  /** Habitats at least one of which the region must have some of; capacity scales with their share up to a quarter. */
  needs?: Habitat[];
  /** Share of suitable regions the species occupies, 0..1. */
  range: number;
  season: SeasonRule;
  /** Daily logistic growth rate for residents. */
  growth: number;
  /** Absent for voice-only species. */
  hunt?: {
    spot: SpotId;
    minutes: number;
    odds: number;
    injury: number;
    /** Recommended Hunting or Fishing level; absent means none. */
    level?: number;
    /** Odds factor at night; 0.7 when absent. */
    night?: number;
  };
  yields?: { meatKg: number; hideKg?: number; furKg?: number; fatKg?: number; bone?: number; sinew?: number };
  calls?: Call[];
}

const resident = (winter?: number): SeasonRule => (winter === undefined ? { kind: "resident" } : { kind: "resident", winter });
const migrant = (arrive: number, leave: number, away?: "denned"): SeasonRule => (away ? { kind: "migrant", arrive, leave, away } : { kind: "migrant", arrive, leave });
const fish = (name: string, lake: number | null, sea: number | null, range: number, odds: number, meatKg: number, extra: Partial<SpeciesDef> & { level?: number; night?: number } = {}): SpeciesDef => ({
  name, kind: "fish",
  habitat: { ...(lake !== null ? { lake } : {}), ...(sea !== null ? { sea } : {}) },
  range, season: extra.season ?? resident(), growth: 0.003,
  hunt: { spot: "shore", minutes: 60, odds, injury: 0, ...(extra.level !== undefined ? { level: extra.level } : {}), ...(extra.night !== undefined ? { night: extra.night } : {}) },
  yields: { meatKg },
  ...(extra.needs ? { needs: extra.needs } : {}),
});

export const SPECIES_DEFS = {
  // Mammals. Fur-bearers yield fur; deer and bigger yield hide.
  hare: { name: "mountain hare", kind: "mammal", habitat: { meadow: 20, birch: 16, bog: 8, pine: 4, fell: 3 }, range: 1.0, season: resident(), growth: 0.006,
    hunt: { spot: "heath", minutes: 90, odds: 0.6, injury: 0, night: 0.9 }, yields: { meatKg: 1.2, furKg: 0.2, bone: 1 } },
  squirrel: { name: "red squirrel", kind: "mammal", habitat: { spruce: 12, pine: 10, birch: 4 }, range: 0.9, season: resident(), growth: 0.006,
    hunt: { spot: "forest", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.2, furKg: 0.1 },
    calls: [{ sound: "squirrel", when: "day", weight: 1 }] },
  fox: { name: "red fox", kind: "mammal", habitat: { meadow: 1.5, birch: 1.2, pine: 1, spruce: 1, bog: 0.8, rock: 0.5, fell: 0.3 }, range: 0.95, season: resident(), growth: 0.002,
    hunt: { spot: "heath", minutes: 150, odds: 0.3, injury: 0, level: 3 }, yields: { meatKg: 3, furKg: 1, bone: 2, sinew: 1 },
    calls: [{ sound: "fox", when: "night", months: [11, 1], weight: 2 }] },
  beaver: { name: "beaver", kind: "mammal", habitat: { lake: 4 }, needs: ["birch", "meadow"], range: 0.5, season: resident(), growth: 0.001,
    hunt: { spot: "shore", minutes: 150, odds: 0.4, injury: 0, level: 3 }, yields: { meatKg: 10, furKg: 1.5, fatKg: 2, bone: 2, sinew: 1 } },
  deer: { name: "roe deer", kind: "mammal", habitat: { birch: 6, meadow: 5, pine: 3, spruce: 2 }, range: 0.7, season: resident(0.6), growth: 0.0012,
    hunt: { spot: "forest", minutes: 180, odds: 0.45, injury: 0, level: 4 }, yields: { meatKg: 12, hideKg: 3, fatKg: 1, bone: 4, sinew: 3 } },
  reindeer: { name: "wild reindeer", kind: "mammal", habitat: { fell: 3, rock: 2, bog: 1.5, pine: 1 }, range: 0.6, season: resident(), growth: 0.0008,
    hunt: { spot: "outcrop", minutes: 200, odds: 0.4, injury: 0.05, level: 6 }, yields: { meatKg: 40, hideKg: 5, fatKg: 4, bone: 5, sinew: 4 } },
  elk: { name: "elk", kind: "mammal", habitat: { spruce: 1.0, bog: 0.8, birch: 0.5, pine: 0.3 }, range: 0.8, season: resident(0.6), growth: 0.0006,
    hunt: { spot: "forest", minutes: 240, odds: 0.3, injury: 0.15, level: 8 }, yields: { meatKg: 150, hideKg: 20, fatKg: 8, bone: 8, sinew: 6 },
    calls: [{ sound: "elk", when: "dusk", months: [8, 9], weight: 2 }, { sound: "elk", when: "night", months: [8, 9], weight: 2 }] },
  wolf: { name: "wolf", kind: "mammal", habitat: { spruce: 0.08, pine: 0.06, bog: 0.05, birch: 0.04, fell: 0.02 }, range: 0.35, season: resident(), growth: 0.0005,
    hunt: { spot: "forest", minutes: 240, odds: 0.25, injury: 0.35, level: 12 }, yields: { meatKg: 25, furKg: 3, fatKg: 1, bone: 6, sinew: 4 },
    calls: [{ sound: "wolf", when: "night", weight: 1 }] },
  wolverine: { name: "wolverine", kind: "mammal", habitat: { fell: 0.03, spruce: 0.03, rock: 0.02, bog: 0.02 }, range: 0.4, season: resident(), growth: 0.0005,
    hunt: { spot: "outcrop", minutes: 240, odds: 0.2, injury: 0, level: 10 }, yields: { meatKg: 8, furKg: 1.5, bone: 3, sinew: 2 } },
  // Denned November to March: absent the way a migrant is, and the same rule says so.
  bear: { name: "brown bear", kind: "mammal", habitat: { spruce: 0.15, pine: 0.1, bog: 0.1, birch: 0.08 }, range: 0.5, season: migrant(3, 10, "denned"), growth: 0.0006,
    hunt: { spot: "forest", minutes: 300, odds: 0.25, injury: 0.5, level: 15 }, yields: { meatKg: 80, furKg: 8, fatKg: 10, bone: 8, sinew: 5 } },

  // Game birds, all taken with the bow.
  willowGrouse: { name: "willow grouse", kind: "bird", habitat: { bog: 12, birch: 8, meadow: 4, fell: 2 }, range: 0.9, season: resident(), growth: 0.005,
    hunt: { spot: "heath", minutes: 60, odds: 0.6, injury: 0 }, yields: { meatKg: 0.4 },
    calls: [{ sound: "willowGrouse", when: "dawn", weight: 2 }, { sound: "willowGrouse", when: "dusk", weight: 2 }] },
  ptarmigan: { name: "rock ptarmigan", kind: "bird", habitat: { fell: 8, rock: 5 }, range: 0.8, season: resident(), growth: 0.005,
    hunt: { spot: "outcrop", minutes: 60, odds: 0.55, injury: 0 }, yields: { meatKg: 0.35 },
    calls: [{ sound: "ptarmigan", when: "day", weight: 2 }] },
  blackGrouse: { name: "black grouse", kind: "bird", habitat: { birch: 5, meadow: 4, bog: 3, pine: 2 }, range: 0.7, season: resident(), growth: 0.005,
    hunt: { spot: "heath", minutes: 90, odds: 0.5, injury: 0 }, yields: { meatKg: 0.8 },
    calls: [{ sound: "blackGrouse", when: "dawn", months: [2, 4], weight: 3 }] },
  capercaillie: { name: "capercaillie", kind: "bird", habitat: { spruce: 3, pine: 3 }, range: 0.5, season: resident(), growth: 0.005,
    hunt: { spot: "forest", minutes: 120, odds: 0.4, injury: 0, level: 2 }, yields: { meatKg: 2.5 },
    calls: [{ sound: "capercaillie", when: "dawn", months: [2, 4], weight: 3 }] },
  hazelGrouse: { name: "hazel grouse", kind: "bird", habitat: { spruce: 6, birch: 2 }, range: 0.6, season: resident(), growth: 0.005,
    hunt: { spot: "forest", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.3 } },
  mallard: { name: "mallard", kind: "bird", habitat: { lake: 10 }, range: 0.8, season: migrant(3, 9), growth: 0.005,
    hunt: { spot: "shore", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.8 },
    calls: [{ sound: "mallard", when: "day", weight: 2 }] },
  eider: { name: "eider", kind: "bird", habitat: { sea: 15 }, range: 0.9, season: resident(), growth: 0.005,
    hunt: { spot: "shore", minutes: 90, odds: 0.45, injury: 0 }, yields: { meatKg: 1.5 },
    calls: [{ sound: "eider", when: "day", weight: 2 }] },
  goose: { name: "bean goose", kind: "bird", habitat: { bog: 3 }, range: 0.5, season: migrant(3, 9), growth: 0.005,
    hunt: { spot: "heath", minutes: 120, odds: 0.3, injury: 0, level: 3 }, yields: { meatKg: 2.5 },
    calls: [{ sound: "goose", when: "any", months: [3, 3], weight: 3 }, { sound: "goose", when: "any", months: [8, 9], weight: 3 }] },

  // Voice-only birds: heard and listed, never hunted.
  loon: { name: "black-throated loon", kind: "bird", habitat: { lake: 2 }, range: 0.7, season: migrant(4, 9), growth: 0.005,
    calls: [{ sound: "loon", when: "dusk", weight: 3 }, { sound: "loon", when: "night", weight: 3 }] },
  cuckoo: { name: "cuckoo", kind: "bird", habitat: { birch: 3, pine: 2, spruce: 1 }, range: 0.8, season: migrant(4, 7), growth: 0.005,
    calls: [{ sound: "cuckoo", when: "day", weight: 3 }, { sound: "cuckoo", when: "dawn", weight: 3 }] },
  raven: { name: "raven", kind: "bird", habitat: { fell: 1, rock: 1, spruce: 0.3 }, range: 0.9, season: resident(), growth: 0.005,
    calls: [{ sound: "raven", when: "day", weight: 2 }] },
  owl: { name: "Ural owl", kind: "bird", habitat: { spruce: 0.5, pine: 0.3 }, range: 0.5, season: resident(), growth: 0.005,
    calls: [{ sound: "owl", when: "night", weight: 2 }, { sound: "owl", when: "night", months: [1, 4], weight: 2 }] },
  crane: { name: "crane", kind: "bird", habitat: { bog: 1.5 }, range: 0.5, season: migrant(3, 9), growth: 0.005,
    calls: [{ sound: "crane", when: "dawn", weight: 2 }, { sound: "crane", when: "day", weight: 2 }] },
  woodpecker: { name: "great spotted woodpecker", kind: "bird", habitat: { spruce: 2, pine: 2, birch: 2 }, range: 0.8, season: resident(), growth: 0.005,
    calls: [{ sound: "woodpecker", when: "day", months: [2, 4], weight: 2 }] },

  // Lake fish.
  perch: fish("perch", 40, null, 0.9, 0.6, 0.3),
  roach: fish("roach", 40, null, 0.6, 0.7, 0.2),
  pike: fish("pike", 8, null, 0.8, 0.35, 2.0, { level: 3 }),
  whitefish: fish("whitefish", 20, null, 0.6, 0.5, 0.6, { level: 2 }),
  char: fish("arctic char", 15, null, 0.4, 0.45, 0.8, { level: 4, needs: ["fell", "rock"] }),
  trout: fish("brown trout", 12, null, 0.5, 0.4, 0.7, { level: 3 }),
  burbot: fish("burbot", 10, null, 0.5, 0.4, 1.2, { level: 2, night: 1.3, season: resident(1.5) }),

  // Sea fish.
  cod: fish("cod", null, 30, 0.9, 0.5, 2.5, { level: 2 }),
  saithe: fish("saithe", null, 25, 0.7, 0.5, 1.5),
  herring: fish("herring", null, 60, 0.6, 0.8, 0.15),
} satisfies Record<string, SpeciesDef>;

export type Species = keyof typeof SPECIES_DEFS;
export const SPECIES_IDS = Object.keys(SPECIES_DEFS) as Species[];

export function speciesDef(s: Species): SpeciesDef {
  return SPECIES_DEFS[s];
}

export function isFish(s: Species): boolean {
  return SPECIES_DEFS[s].kind === "fish";
}

export function isHunted(s: Species): boolean {
  return SPECIES_DEFS[s].hunt !== undefined;
}

export function isVoiceOnly(s: Species): boolean {
  return SPECIES_DEFS[s].hunt === undefined;
}

/** Hunted species that are not fish: what the bow takes. */
export function huntedLand(): Species[] {
  return SPECIES_IDS.filter((s) => isHunted(s) && !isFish(s));
}

export function fishSpecies(): Species[] {
  return SPECIES_IDS.filter(isFish);
}

/** The water a species lives on or in, for species whose habitat is water at all. */
export function waterOf(s: Species): WaterKind | null {
  const h = SPECIES_DEFS[s].habitat;
  if (h.lake !== undefined) return "lake";
  if (h.sea !== undefined) return "sea";
  return null;
}

/** How a migrant's absence reads on the region card: "gone until April" or "denned until April". */
export function awayWord(def: SpeciesDef): "gone" | "denned" {
  return def.season.kind === "migrant" ? (def.season.away ?? "gone") : "gone";
}

/** Capacity factor for a month: a resident's winter thinning, a migrant's absence. */
export function seasonFactor(def: SpeciesDef, month: number): number {
  const r = def.season;
  if (r.kind === "resident") return month >= 11 || month <= 1 ? (r.winter ?? 1) : 1;
  return month >= r.arrive && month < r.leave ? 1 : 0;
}

/** Which mastery extras a hunted species gets: an animal that can hurt you or gives hide is big game; otherwise fur makes a fur-bearer. */
export function extrasClass(s: Species): "fur" | "big" | "bird" | "fish" | null {
  const def = SPECIES_DEFS[s];
  if (!def.hunt || !def.yields) return null;
  if (def.kind === "fish") return "fish";
  if (def.kind === "bird") return "bird";
  if (def.hunt.injury > 0 || def.yields.hideKg) return "big";
  return def.yields.furKg ? "fur" : "big";
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd 08-survidle && npx vitest run tests/species.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean (the old `ANIMALS` still compiles because nothing changed there yet).

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/species.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/calendar.ts 08-survidle/tests/species.test.ts
git commit -m "feat(survidle): the species catalogue, and fur as its own item"
```

---

### Task 2: Regions carry lake and sea, and a capacity per species from the catalogue

**Files:**
- Create: `src/world/wildlife.ts`
- Modify: `src/world/gen.ts:19-48` (RegionDef), `:60-136` (buildRegion)
- Modify: `src/world/cells.ts` (add `waterKindOf`)
- Test: `tests/wildlife.test.ts`

**Interfaces:**
- Consumes: `SPECIES_DEFS`, `SPECIES_IDS`, `Habitat`, `Species` from Task 1; `fbm` from `world/noise.ts`; `derive` from `rng.ts`; `fieldsAt` from `world/terrain.ts`.
- Produces: `RegionDef.lake: number`, `RegionDef.sea: number`, `RegionDef.capacity: Partial<Record<Species, number>>`, `speciesHere(r: RegionDef): Species[]`, `wildlifeCapacity(seed, area, shares, cx, cy)`, `rangeNoise(seed, index, cx, cy): number`, `waterKindOf(world, idx): "lake" | "sea" | null`.

This task changes the type of `capacity`, which `animals.ts`, `regionstate.ts` and the tests read as `Record<Species, number>` with the OLD `Species`. Until Task 3 lands `tsc` will complain in those files. Do Tasks 2 and 3 back to back and commit them together at the end of Task 3; run the wildlife tests alone in between with `npx vitest run tests/wildlife.test.ts`, which does not need `tsc`.

- [ ] **Step 1: Write the failing tests**

`tests/wildlife.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SPECIES_DEFS, SPECIES_IDS, type Habitat, type Species } from "../src/sim/species";
import { generateWorld, regionAt, speciesHere, waterKindOf, type RegionDef } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { rangeNoise, wildlifeCapacity } from "../src/world/wildlife";

/** A sample of regions across the map: every 7th lattice cell. */
function sample(seed: number): RegionDef[] {
  const world = generateWorld(seed);
  const out: RegionDef[] = [];
  for (let ly = 0; ly < LATTICE_H; ly += 7) for (let lx = 0; lx < LATTICE_W; lx += 7) out.push(regionAt(world, ly * LATTICE_W + lx));
  return out;
}

describe("wildlife capacity", () => {
  it("range noise is spread so that a range of r covers about r of the country", () => {
    let over65 = 0;
    let over10 = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const u = rangeNoise(7, i % 30, (i * 37) % 1800, (i * 91) % 1300);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      if (u >= 0.65) over65++;
      if (u >= 0.1) over10++;
    }
    expect(over65 / n).toBeGreaterThan(0.25);
    expect(over65 / n).toBeLessThan(0.45);
    expect(over10 / n).toBeGreaterThan(0.85);
    expect(over10 / n).toBeLessThan(0.97);
  });

  it("is area times habitat, absent below half an animal or outside the range", () => {
    const shares: Record<Habitat, number> = { fell: 0, rock: 0, bog: 0, spruce: 1, pine: 0, birch: 0, meadow: 0, lake: 0, sea: 0 };
    const cap = wildlifeCapacity(1, 16, shares, 100, 100);
    // Squirrels at 12 per km2 of spruce on 16 km2, times the heart factor 0.5..1.5.
    if (cap.squirrel !== undefined) {
      expect(cap.squirrel).toBeGreaterThanOrEqual(16 * 12 * 0.5 - 1e-9);
      expect(cap.squirrel).toBeLessThanOrEqual(16 * 12 * 1.5 + 1e-9);
    }
    expect(cap.perch).toBeUndefined();
    expect(cap.ptarmigan).toBeUndefined();
    expect(cap.eider).toBeUndefined();
    // Beavers need birch or meadow besides the lake.
    const lakeOnly = { ...shares, spruce: 0.5, lake: 0.5 };
    expect(wildlifeCapacity(1, 16, lakeOnly, 100, 100).beaver).toBeUndefined();
  });

  it("every species lives somewhere and is missing from somewhere suitable", () => {
    const suitable = (r: RegionDef, s: Species) => Object.entries(SPECIES_DEFS[s].habitat).some(([h, per]) => (h === "lake" ? r.lake : h === "sea" ? r.sea : r.frac[h as Exclude<Habitat, "lake" | "sea">]) * per * r.area >= 0.5);
    const present: Record<string, number> = {};
    const gaps: Record<string, number> = {};
    for (let seed = 1; seed <= 6; seed++) {
      for (const r of sample(seed)) {
        for (const s of SPECIES_IDS) {
          if (r.capacity[s]) present[s] = (present[s] ?? 0) + 1;
          else if (suitable(r, s)) gaps[s] = (gaps[s] ?? 0) + 1;
        }
      }
    }
    for (const s of SPECIES_IDS) {
      expect(present[s] ?? 0, `${s} present`).toBeGreaterThan(0);
      if (SPECIES_DEFS[s].range < 1) expect(gaps[s] ?? 0, `${s} absent from suitable`).toBeGreaterThan(0);
    }
  });

  it("keeps woodland birds off the fell and lake fish out of the sea", () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const r of sample(seed)) {
        if (r.frac.fell >= 0.8) for (const s of ["capercaillie", "hazelGrouse", "cuckoo", "squirrel", "perch", "pike"] as Species[]) expect(r.capacity[s], `${s} on fell`).toBeUndefined();
        if (r.sea > 0 && r.lake === 0) expect(r.capacity.perch, "perch in the sea").toBeUndefined();
        if (r.frac.water === 0) for (const s of ["perch", "cod", "mallard", "loon"] as Species[]) expect(r.capacity[s], `${s} with no water`).toBeUndefined();
        expect(r.lake + r.sea).toBeCloseTo(r.frac.water, 9);
        for (const s of speciesHere(r)) expect(Number.isFinite(r.capacity[s]!)).toBe(true);
      }
    }
  });

  it("tells sea from lake water", () => {
    const world = generateWorld(42);
    expect(waterKindOf(world, 0)).toBe("sea");
    const r = regionAt(world, world.start);
    const land = r.cells.find((c) => waterKindOf(world, c) === null);
    expect(land).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/wildlife.test.ts`
Expected: FAIL, cannot find `../src/world/wildlife`.

- [ ] **Step 3: `waterKindOf` in cells.ts**

Add to `src/world/cells.ts`, importing `fieldsAt` from `./terrain`:

```ts
/** Sea or lake for a water cell; null on land. The sea flag is the coast field's sign, so a lake is never salt. */
export function waterKindOf(world: World, idx: number): "lake" | "sea" | null {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  if (terrainOf(world, x, y) !== "water") return null;
  return fieldsAt(world.seed, x, y).sea ? "sea" : "lake";
}
```

Re-export it from `gen.ts`'s export line: add `waterKindOf` to `export { cellAt, cellIdx, neighbours, regionOf, regionPeek, terrainOf, terrainPeek, ... } from "./cells";`.

- [ ] **Step 4: `wildlife.ts`**

```ts
/**
 * Capacity per species for a region: area times habitat, times where the
 * species' range happens to reach. The range is a slow noise per species,
 * so a species has country it lives in and country it does not, a few
 * regions wide, and is densest in the heart of its range.
 */
import { derive } from "../rng";
import { type Habitat, type Species, SPECIES_DEFS, SPECIES_IDS } from "../sim/species";
import { fbm } from "./noise";

/** Cells per noise unit: about 25 km, so ranges are patches several regions wide. */
const RANGE_CELLS = 84;
/** fbm clusters around a half; this stretches it so a range of r covers about r of the map. Pinned by tests/wildlife.test.ts. */
const RANGE_SPREAD = 2.6;
/** Below this many animals a region has none of the species at all. */
const MIN_CAPACITY = 0.5;

export function rangeNoise(seed: number, index: number, cx: number, cy: number): number {
  const u = fbm(cx / RANGE_CELLS, cy / RANGE_CELLS, derive(seed, 2000 + index), 2);
  return Math.min(1, Math.max(0, 0.5 + (u - 0.5) * RANGE_SPREAD));
}

export function wildlifeCapacity(seed: number, area: number, shares: Record<Habitat, number>, cx: number, cy: number): Partial<Record<Species, number>> {
  const out: Partial<Record<Species, number>> = {};
  SPECIES_IDS.forEach((s, i) => {
    const def = SPECIES_DEFS[s];
    let raw = 0;
    for (const [h, per] of Object.entries(def.habitat) as [Habitat, number][]) raw += shares[h] * per;
    raw *= area;
    if (def.needs) raw *= Math.min(1, 4 * def.needs.reduce((a, h) => a + shares[h], 0));
    if (raw < MIN_CAPACITY) return;
    const u = rangeNoise(seed, i, cx, cy);
    if (u < 1 - def.range) return;
    const heart = (u - (1 - def.range)) / def.range;
    out[s] = raw * (0.5 + heart);
  });
  return out;
}
```

If the first test's bands fail, adjust `RANGE_SPREAD` (larger spreads more) until both bands hold; do not loosen the test.

- [ ] **Step 5: gen.ts: lake and sea shares, catalogue capacity, `speciesHere`**

In `src/world/gen.ts`:

Replace the imports `import { SPECIES, type Species, type SpotId, type Terrain } from "../sim/types";` with:

```ts
import { type Habitat, type Species, type SpotId, type Terrain } from "../sim/types";
import { fieldsAt, LATTICE, LATTICE_H, LATTICE_W, TERRAINS, WORLD_H, WORLD_W } from "./terrain";
import { wildlifeCapacity } from "./wildlife";
```

(and drop `LATTICE, ...` from the old terrain import line). `Habitat` is re-exported from `types.ts` in Task 3 Step 1; until then import it from `../sim/species` directly and switch after.

In `RegionDef`, replace `capacity: Record<Species, number>;` with:

```ts
  /** Shares of the region's cells that are lake water and sea water; together they are frac.water. */
  lake: number;
  sea: number;
  /** Animals the region can hold, by species; a species not here never lives here. */
  capacity: Partial<Record<Species, number>>;
```

In `buildRegion`, inside the scan loop after `count[terrainOf(world, x, y)]++;` add:

```ts
      if (terrainOf(world, x, y) === "water") {
        if (fieldsAt(world.seed, x, y).sea) seaCells++;
        else lakeCells++;
      }
```

with `let seaCells = 0; let lakeCells = 0;` declared beside `sx`. Replace the `capacity` block (from `const capacity: Record<Species, number> = {` through the `for (const s of SPECIES) if (capacity[s] < 0.5) capacity[s] = 0;` line) with:

```ts
  const lake = lakeCells / n;
  const sea = seaCells / n;
  const shares: Record<Habitat, number> = {
    fell: frac.fell, rock: frac.rock, bog: frac.bog, spruce: frac.spruce, pine: frac.pine, birch: frac.birch, meadow: frac.meadow, lake, sea,
  };
  const cx = sx / n;
  const cy = sy / n;
  const capacity = wildlifeCapacity(world.seed, area, shares, cx, cy);
```

and delete the later `const cx = sx / n; const cy = sy / n;` pair. Add `lake, sea,` to the `RegionDef` literal after `frac,`. Add at the bottom of gen.ts:

```ts
/** The species with any capacity in a region, in catalogue order. */
export function speciesHere(r: RegionDef): Species[] {
  return SPECIES_IDS.filter((s) => (r.capacity[s] ?? 0) > 0);
}
```

importing `SPECIES_IDS` from `../sim/species`.

- [ ] **Step 6: Run the wildlife tests**

Run: `cd 08-survidle && npx vitest run tests/wildlife.test.ts`
Expected: PASS. (`tsc` is red until Task 3; that is expected.)

Do not commit yet. Continue to Task 3.

---

### Task 3: The switch: every module reads the catalogue

The old `Species` (`hare | grouse | deer | elk | fish`) and `ANIMALS` go. This task is the minimal set of edits that makes `tsc` and `npm test` green again with catalogue species. Behaviour beyond that (seasons, "anything", extras, panel groups) comes in Tasks 4 to 8.

**Files:**
- Modify: `src/sim/types.ts` (Species, SPECIES, pop, Task)
- Modify: `src/sim/items.ts` (delete `SpeciesDef`, `ANIMALS`)
- Modify: `src/sim/animals.ts`, `src/sim/regionstate.ts`, `src/sim/skills.ts`, `src/sim/tasks.ts`, `src/sim/intent.ts`, `src/sim/position.ts`, `src/ui/panels.ts`
- Modify tests: `tests/animals.test.ts`, `tests/skills.test.ts`, `tests/tasks.test.ts`, `tests/intent.test.ts`, `tests/ui.test.ts` and any other that names `grouse`, `"fish"` as a species, `ANIMALS` or `SPECIES`

**Interfaces:**
- Produces: `type Species` and `type Habitat` re-exported from `types.ts`; `RegionState.pop: Partial<Record<Species, number>>`; `popOf(st, s): number` in `animals.ts`; `watersideCell(world, idx, kind?: "lake" | "sea" | "any")`; `fish` task `arg` is a species id; `hunt` rows only for species with capacity here; `MASTERY_KEYS.hunting = [...huntedLand().map(s => "hunt:" + s), "snare"]`, `MASTERY_KEYS.fishing = fishSpecies().map(s => "fish:" + s)`; `huntExtras(state, s)` returns `{ meatKg, hideKg, furKg, bone, sinew, injuryFactor }`; `fishKg(state, s)`.

- [ ] **Step 1: types.ts**

Replace

```ts
export type Species = "hare" | "grouse" | "deer" | "elk" | "fish";
export const SPECIES: Species[] = ["hare", "grouse", "deer", "elk", "fish"];
```

with

```ts
export type { Habitat, Species } from "./species";
```

In `RegionState`, replace `pop: Record<Species, number>;` with:

```ts
  /** Animals by species, only for species with capacity here. */
  pop: Partial<Record<Species, number>>;
```

In `Task`, add after `repeat: boolean;`:

```ts
  /** Started as "hunt anything" or "fish for anything": the arg is the species drawn, and a repeat draws again. */
  any?: boolean;
```

Update the `Task.arg` comment: `/** Species for hunt and fish, recipe for craft, structure for build, region for travel, spot for walk, food for cook. */`.

Since `types.ts` now imports from `species.ts` and `species.ts` imports types from `types.ts`, both imports are type-only; that is legal and erased.

- [ ] **Step 2: items.ts**

Delete `export interface SpeciesDef {...}` and `export const ANIMALS = {...}` from `src/sim/items.ts`, and drop `Species` from its type import.

- [ ] **Step 3: animals.ts**

Rewrite `src/sim/animals.ts`:

```ts
import type { Rng } from "../rng";
import { regionAt, speciesHere, type World } from "../world/gen";
import type { Calendar } from "./calendar";
import { log } from "./log";
import { regionState, touchedRegions } from "./regionstate";
import { isVoiceOnly, type Species, SPECIES_DEFS } from "./species";
import type { GameState, RegionState } from "./types";

const MIGRATION = 0.03;
/** Species whose comings and goings near the player are worth a log line. */
const NOTABLE: Species[] = ["deer", "reindeer", "elk", "wolf", "bear"];

export function density(pop: number, k: number): number {
  return k <= 0 ? 0 : Math.min(1, pop / k);
}

export function densityLabel(d: number): string {
  if (d < 0.02) return "none";
  if (d < 0.15) return "tracks";
  if (d < 0.4) return "few";
  if (d < 0.7) return "some";
  return "many";
}

/** Animals of a species in a region; none for a species the region never holds. */
export function popOf(st: RegionState, s: Species): number {
  return st.pop[s] ?? 0;
}

/** Capacity as it stands this season: winter thins the browsers, migrants are away. */
export function seasonalCapacity(world: World, region: number, s: Species, cal: Calendar): number {
  const k = regionAt(world, region).capacity[s] ?? 0;
  const def = SPECIES_DEFS[s];
  const r = def.season;
  if (r.kind === "resident") return cal.season === "winter" ? k * (r.winter ?? 1) : k;
  return cal.month >= r.arrive && cal.month < r.leave ? k : 0;
}

export function regionDensity(state: GameState, world: World, region: number, s: Species, cal: Calendar): number {
  return density(popOf(regionState(state, world, region), s), seasonalCapacity(world, region, s, cal));
}

/** Runs once per game day at 04:00: growth, then migration. Logs notable movements near the player. */
export function dailyAnimals(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  const growing = cal.month >= 3 && cal.month <= 8;
  const here = state.player.region;
  const before = NOTABLE.map((s) => popOf(regionState(state, world, here), s));
  const touched = touchedRegions(state);
  const touchedSet = new Set(touched);

  for (const id of touched) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      const def = SPECIES_DEFS[s];
      const k = seasonalCapacity(world, r.id, s, cal);
      const pop = popOf(st, s);
      if (isVoiceOnly(s)) {
        st.pop[s] = k;
      } else if (def.season.kind === "migrant") {
        // A flock arrives over a few weeks and leaves the same way; next year's replaces what was taken.
        st.pop[s] = pop + (k - pop) * 0.1;
      } else if (k <= 0) {
        st.pop[s] = 0;
      } else if (growing) {
        st.pop[s] = Math.max(0, pop + def.growth * pop * (1 - pop / k));
      } else if (pop > k) {
        // Winter thins a herd the land cannot feed.
        st.pop[s] = pop - (pop - k) * 0.05;
      }
    }
  }

  // Migration: a share of each mammal population leaves for a touched neighbour
  // with room. Untouched country sits at its starting numbers, so nothing
  // moves in or out of it. Birds and fish do not shuffle.
  const moves: { from: number; to: number; s: Species; n: number }[] = [];
  for (const id of touched) {
    const r = regionAt(world, id);
    const nbs = r.neighbours.filter((nb) => touchedSet.has(nb.id));
    if (!nbs.length) continue;
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      if (SPECIES_DEFS[s].kind !== "mammal") continue;
      const n = popOf(st, s) * MIGRATION;
      if (n < 0.01) continue;
      const weights = nbs.map((nb) => {
        const k = seasonalCapacity(world, nb.id, s, cal);
        return Math.max(0, k - popOf(state.regions[nb.id], s));
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let pick = rng.next() * total;
      let to = nbs[0].id;
      for (let i = 0; i < weights.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          to = nbs[i].id;
          break;
        }
      }
      moves.push({ from: id, to, s, n });
    }
  }
  for (const m of moves) {
    state.regions[m.from].pop[m.s] = popOf(state.regions[m.from], m.s) - m.n;
    state.regions[m.to].pop[m.s] = popOf(state.regions[m.to], m.s) + m.n;
  }

  NOTABLE.forEach((s, i) => {
    const now = popOf(state.regions[here], s);
    const was = before[i];
    if (was < 0.5 && now < 0.5) return;
    const change = (now - was) / Math.max(0.5, was);
    if (change > 0.25) log(state, `${cap(SPECIES_DEFS[s].name)} tracks are fresher around ${regionAt(world, here).name}.`, "good");
    else if (change < -0.25) {
      const gone = moves.find((m) => m.from === here && m.s === s);
      const where = gone ? ` toward ${regionAt(world, gone.to).name}` : "";
      log(state, `The ${SPECIES_DEFS[s].name} have moved on${where}.`);
    }
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Note the migration destination weight uses a neighbour's capacity only where the neighbour has the species; `seasonalCapacity` returns 0 for a region without it, so wolves never migrate into a wolfless region. That is the range holding.

- [ ] **Step 4: regionstate.ts**

Replace the `newRegionState` pop lines and add `fillPopulations`:

```ts
import { regionAt, speciesHere, type World } from "../world/gen";
import { log } from "./log";
import type { GameState, RegionState, Species } from "./types";

/** Starting numbers: seven tenths of what the land can hold. */
export function startingPop(world: World, id: number): Partial<Record<Species, number>> {
  const r = regionAt(world, id);
  const pop: Partial<Record<Species, number>> = {};
  for (const s of speciesHere(r)) pop[s] = r.capacity[s]! * 0.7;
  return pop;
}

export function newRegionState(world: World, id: number): RegionState {
  const r = regionAt(world, id);
  return {
    wood: r.wood0,
    pop: startingPop(world, id),
    ...
  };
}

/**
 * A region saved before a species existed has no number for it. Fill every
 * touched region's missing species at their starting numbers, and drop
 * numbers for species the catalogue no longer has. Called once after a
 * load, with the world in hand, which fillDefaults does not have.
 */
export function fillPopulations(state: GameState, world: World): void {
  for (const [key, st] of Object.entries(state.regions)) {
    const id = Number(key);
    const start = startingPop(world, id);
    for (const k of Object.keys(st.pop)) if (!(k in start)) delete st.pop[k as Species];
    for (const s of Object.keys(start) as Species[]) st.pop[s] ??= start[s];
  }
}
```

(`...` above stands for the unchanged rest of the literal: `campCell`, `structures`, `boughBedAge`, `build`, `fire`, `rack`, `snareCatch`, `smoke`, `logsWet`. Keep them exactly as they are.)

Call `fillPopulations(state, world)` in `src/main.ts` `boot()` right after `world = generateWorld(state.seed);`, importing it from `./sim/regionstate`.

- [ ] **Step 5: position.ts: a water kind for the shore**

Replace `watersideCell`:

```ts
import { neighbours, waterKindOf } from "../world/gen";

/** Land beside water: any water, or only a lake or only the sea. */
export function watersideCell(world: World, idx: number, kind: "lake" | "sea" | "any" = "any"): boolean {
  return neighbours(world, idx).some((n) => {
    const w = waterKindOf(world, n);
    return w !== null && (kind === "any" || w === kind);
  });
}
```

(`neighbours` is already imported there; add `waterKindOf`.) `byWater` keeps calling it with the default.

- [ ] **Step 6: skills.ts**

Replace the `ANIMALS` import with `import { fishSpecies, huntedLand, type Species, SPECIES_DEFS } from "./species";` and drop `Species` from the `./types` import. Then:

```ts
export const MASTERY_KEYS: Record<SkillId, string[]> = {
  woodcraft: ["chop:spruce", "chop:pine", "chop:birch", "sticks", "bark", "split"],
  foraging: ["berries", "stone"],
  hunting: [...huntedLand().map((s) => `hunt:${s}`), "snare"],
  fishing: fishSpecies().map((s) => `fish:${s}`),
  crafting: [...RECIPE_IDS.map((r) => `craft:${r}`), "repair", "sharpen"],
  building: [...STRUCTURE_IDS.filter((s) => s !== "snare").map((s) => `build:${s}`), "light", "lightTorch", "cook:rawMeat", "cook:fish"],
};
```

`masteryKey`: move `"fish"` out of the pass-through list into its own case: `case "fish": return \`fish:${arg}\`;`.

`RECOMMENDED`: build the species part from the catalogue:

```ts
export const RECOMMENDED: Record<string, { skill: SkillId; level: number }> = {
  "craft:bow": { skill: "crafting", level: 5 },
  "craft:hideBlanket": { skill: "crafting", level: 6 },
  "craft:hideCoat": { skill: "crafting", level: 8 },
  "craft:hideTrousers": { skill: "crafting", level: 8 },
  "craft:hideBoots": { skill: "crafting", level: 8 },
  "build:cabin": { skill: "building", level: 10 },
};
for (const s of huntedLand()) {
  const l = SPECIES_DEFS[s].hunt?.level;
  if (l) RECOMMENDED[`hunt:${s}`] = { skill: "hunting", level: l };
}
for (const s of fishSpecies()) {
  const l = SPECIES_DEFS[s].hunt?.level;
  if (l) RECOMMENDED[`fish:${s}`] = { skill: "fishing", level: l };
}
```

`EXTRAS`: keep the chop and craft entries; replace the hunt and fish entries with the old shape for now (Task 6 rebuilds them by class):

```ts
  "hunt:hare": { at20: "the hide comes off whole, 0.3 kg", at50: "a bone more" },
  "hunt:deer": { at20: "a sinew more", at50: "half the chance of a hurt" },
  "hunt:elk": { at20: "a sinew more", at50: "half the chance of a hurt" },
```

and delete the `fish` entry.

`keyName`: `if (kind === "hunt" || kind === "fish") return \`${cap(SPECIES_DEFS[arg as Species].name)} ${kind === "hunt" ? "hunting" : "fishing"}\`;`.

`huntExtras`:

```ts
export function huntExtras(state: GameState, species: Species): { meatKg: number; hideKg: number; furKg: number; fatKg: number; bone: number; sinew: number; injuryFactor: number } {
  const y = SPECIES_DEFS[species].yields ?? { meatKg: 0 };
  const m = masteryOf(state, "hunting", `hunt:${species}`);
  const out = { meatKg: y.meatKg, hideKg: y.hideKg ?? 0, furKg: y.furKg ?? 0, fatKg: y.fatKg ?? 0, bone: y.bone ?? 0, sinew: y.sinew ?? 0, injuryFactor: 1 };
  if (species === "hare") {
    if (m >= 20) out.furKg = 0.3;
    if (m >= 50) out.bone += 1;
  } else if (species === "deer" || species === "elk") {
    if (m >= 20) out.sinew += 1;
    if (m >= 50) out.injuryFactor = 0.5;
  }
  return out;
}

/** Kilograms a catch of this species weighs, after mastery. */
export function fishKg(state: GameState, species: Species): number {
  const m = masteryOf(state, "fishing", `fish:${species}`);
  return (SPECIES_DEFS[species].yields?.meatKg ?? 0) * (m >= 50 ? 5 / 3 : m >= 20 ? 4 / 3 : 1);
}
```

`injuryChance`: `const base = (SPECIES_DEFS[species].hunt?.injury ?? 0) + 0.1 * gap(state, \`hunt:${species}\`);`.

`oddsFactor(state, species: Species)`:

```ts
export function oddsFactor(state: GameState, species: Species): number {
  const fishing = SPECIES_DEFS[species].kind === "fish";
  const skill: SkillId = fishing ? "fishing" : "hunting";
  const key = fishing ? `fish:${species}` : `hunt:${species}`;
  return (1 + skillBonus(state, skill)) * 0.5 ** gap(state, key);
}
```

- [ ] **Step 7: tasks.ts**

Imports: drop `ANIMALS` and `type SpeciesDef` from the `./items` import and `SPECIES` from `./types`; add:

```ts
import { popOf, regionDensity } from "./animals";
import { fishSpecies, huntedLand, isFish, type Species, SPECIES_DEFS, waterOf } from "./species";
```

(`regionDensity` is already imported; extend that line. `speciesHere` is not needed in tasks.ts: the rows filter on `r.capacity[s]` directly.)

Add a helper above `checkFresh`:

```ts
/** Whether the cell suits a species' spot: its ground, and for the shore, its water. */
function spotSuits(world: World, at: number, spot: SpotId, water: "lake" | "sea" | null): boolean {
  switch (spot) {
    case "forest": return forestCell(world, at);
    case "outcrop": return rockCell(world, at);
    case "heath": return heathCell(world, at);
    case "shore": return watersideCell(world, at, water ?? "any");
    case "camp": return true;
  }
}

const SPOT_WHAT: Record<SpotId, string> = { forest: "forest", outcrop: "rock", heath: "heath", shore: "water", camp: "camp" };

function huntDetail(state: GameState, s: Species, odds: number): string {
  const x = huntExtras(state, s);
  const parts = [`${x.meatKg} kg meat`];
  if (x.hideKg) parts.push(`${x.hideKg} kg hide`);
  if (x.furKg) parts.push(`${x.furKg} kg fur`);
  if (x.fatKg) parts.push(`${x.fatKg} kg fat`);
  if (x.bone) parts.push(`${x.bone} bone`);
  if (x.sinew) parts.push(`${x.sinew} sinew`);
  return `${parts.join(", ")}; ${oddsText(odds)}`;
}
```

Replace the `hunt` and `fish` cases in `checkFresh`:

```ts
    case "hunt": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      if (!def?.hunt || isFish(s)) return { ...opt({ group: "hunt", label: "Hunt" }), ok: false, why: "no such animal" };
      const d = regionDensity(state, world, p.region, s, cal);
      const o = ground(spotSuits(world, at, def.hunt.spot, waterOf(s)), def.hunt.spot, SPOT_WHAT[def.hunt.spot], opt({
        group: "hunt", label: `Hunt ${def.name}`, duration: def.hunt.minutes, repeatable: true, detail: huntDetail(state, s, huntOdds(state, cal, d, s)),
      }));
      if (!o.ok) return o;
      if (!hasTool(p, "bow")) return { ...o, ok: false, why: "needs a bow" };
      if (totalQty([p.pack], "arrow") < 1) return { ...o, ok: false, why: "needs arrows in the pack" };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
    case "fish": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      if (!def?.hunt || !isFish(s)) return { ...opt({ group: "hunt", label: "Fish" }), ok: false, why: "no such fish" };
      const d = regionDensity(state, world, p.region, s, cal);
      const kg = fishKg(state, s) * yieldFactor(state, "fishing");
      const o = ground(watersideCell(world, at, waterOf(s) ?? "any"), "shore", "water", opt({ group: "hunt", label: `Fish for ${def.name}`, duration: def.hunt.minutes, repeatable: true, detail: `${kg.toFixed(1)} kg per catch; ${oddsText(huntOdds(state, cal, d, s))}` }));
      if (!o.ok) {
        if (watersideCell(world, at) && !watersideCell(world, at, waterOf(s) ?? "any")) return { ...o, why: waterOf(s) === "lake" ? `no ${def.name} in salt water` : `no ${def.name} in a lake` };
        return o;
      }
      if (!hasTool(p, "fishingSpear")) return { ...o, ok: false, why: "needs a fishing spear" };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
```

`huntOdds`:

```ts
export function huntOdds(state: GameState, cal: Calendar, density: number, species: Species): number {
  const def = SPECIES_DEFS[species].hunt!;
  let odds = density * def.odds * oddsFactor(state, species);
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= def.night ?? 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  return Math.min(0.95, odds);
}
```

`availableTasks`: replace the `for (const s of SPECIES) ...` line with:

```ts
  for (const s of huntedLand()) if (r.capacity[s]) out.push(check(state, world, cal, "hunt", s));
  for (const s of fishSpecies()) if (r.capacity[s]) out.push(check(state, world, cal, "fish", s));
```

(`r` is already `regionAt(world, state.player.region)` there.)

`complete`, `hunt` case: replace `ANIMALS[s]` with `SPECIES_DEFS[s]`, `st.pop[s] = Math.max(0, st.pop[s] - 1)` with `st.pop[s] = Math.max(0, popOf(st, s) - 1)`, `def.meatKg` with `x.meatKg` (compute `const x = huntExtras(state, s)` before `produce`), and after the hide line add `if (x.furKg) produce(state, world, "fur", x.furKg);` and `if (x.fatKg) produce(state, world, "fat", x.fatKg);`. The log line uses `x.meatKg`.

`complete`, `fish` case:

```ts
    case "fish": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      const d = regionDensity(state, world, p.region, s, cal);
      if (wearTool(p, "fishingSpear", wearFactor(state, world, "fish", s))) log(state, "The spear shaft splits.", "bad");
      if (rng.chance(huntOdds(state, cal, d, s))) {
        st.pop[s] = Math.max(0, popOf(st, s) - 1);
        state.stats.animals++;
        const kg = fishKg(state, s) * yieldFactor(state, "fishing");
        produce(state, world, "fish", kg);
        log(state, `A ${def.name}, ${kg.toFixed(1)} kg.`, "good");
      } else log(state, "Nothing bites.");
      return;
    }
```

`collectSnares` and the snare build check stay on `hare`: where they read `st.pop.hare` use `popOf(st, "hare")`, and where `r.capacity.hare` is compared use `(r.capacity.hare ?? 0)`.

- [ ] **Step 8: intent.ts**

Replace the `ANIMALS` import with `import { type Species, SPECIES_DEFS, waterOf } from "./species";`.

`groundOf`: `if (task === "hunt" || task === "fish") return SPECIES_DEFS[arg as Species].hunt?.spot ?? null;` (delete `fish: "shore"` from `GROUND_OF`).

`suits(world, cell, ground)` gains the species: change the signature to `suits(world: World, cell: number, ground: SpotId, water: "lake" | "sea" | null)` and the shore case to `return watersideCell(world, cell, water ?? "any");`. Every caller passes `waterOf(arg as Species)` when the task is `hunt` or `fish`, else `null`. Read the callers (`resolveCell` and whatever else uses `suits`) and thread the argument through.

`yieldItems`: `if (task === "hunt") return ["rawMeat", "hide", "fur", "fat", "bone", "sinew"];`.

`GERUND`: `hunt: (arg) => \`hunting ${SPECIES_DEFS[arg as Species].name}\`, fish: (arg) => \`fishing for ${SPECIES_DEFS[arg as Species].name}\`,`.

Search intent.ts for any other `ANIMALS` or `"fish"` species use and convert the same way.

- [ ] **Step 9: panels.ts**

Replace the `ANIMALS` import with `import { fishSpecies, huntedLand, SPECIES_DEFS } from "../sim/species";` and drop `SPECIES` from the `../sim/types` import; import `speciesHere` from `../world/gen`.

Region line (minimal, Task 8 groups it): 

```ts
  const animals = speciesHere(r).map((s) => `${SPECIES_DEFS[s].name}: <b>${densityLabel(regionDensity(state, world, id, s, cal))}</b>`).join(", ");
```

`INTENT_GROUPS`: it is a constant that names species. Make it a function of the region:

```ts
export function intentGroups(r: RegionDef): { label: string; items: { id: TaskId; arg?: string }[] }[] {
  return [
    { label: "Gather", items: [{ id: "chop" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }] },
    { label: "Hunt", items: [
      ...huntedLand().filter((s) => r.capacity[s]).map((s) => ({ id: "hunt" as TaskId, arg: s })),
      ...fishSpecies().filter((s) => r.capacity[s]).map((s) => ({ id: "fish" as TaskId, arg: s })),
    ] },
    { label: "Camp", items: [...] },   // unchanged
    { label: "Make", items: RECIPE_IDS.map((id) => ({ id: "craft" as TaskId, arg: id })) },
    { label: "Build", items: STRUCTURE_IDS.map((id) => ({ id: "build" as TaskId, arg: id })) },
  ];
}
```

(keep the Camp list exactly as it is today) and update its callers in panels.ts (`grep -n INTENT_GROUPS src tests`) to call `intentGroups(regionAt(world, state.player.region))`.

- [ ] **Step 10: tests**

Update every test that named the old species. `grep -rn "grouse\|ANIMALS\|SPECIES\b\|\"fish\")\|'fish')" tests`. Rules:

- `SPECIES` from `../src/sim/types` becomes `SPECIES_IDS` from `../src/sim/species`; a loop over species reads `popOf(st, s)` and `r.capacity[s] ?? 0`.
- `"grouse"` becomes `"willowGrouse"`.
- `check(state, world, cal, "fish")` and `startTask(..., "fish")` name a species that the start region has. Write a helper in the test file: 

```ts
import { fishSpecies } from "../src/sim/species";
import { regionAt } from "../src/world/gen";
/** A fish the player's region holds; the tests want one that exists, not a particular one. */
function aFish(g: G): Species { return fishSpecies().find((s) => regionAt(g.world, g.state.player.region).capacity[s])!; }
```

and use `aFish(g)` as the arg. If a seeded start region has no fish at all, pick a seed whose start region has (`for (let s = 1; s < 40; s++)` in a scratch script) and change the test's seed, noting the reason in a comment.
- `MASTERY_KEYS.hunting` equality becomes `expect(MASTERY_KEYS.hunting).toEqual([...huntedLand().map((s) => \`hunt:${s}\`), "snare"])`; `poolCapacity("fishing")` becomes `fishSpecies().length * 6000` for now (Task 6 caps it).
- `fishKg(state)` becomes `fishKg(state, "perch")`; expectations become `0.3`, `0.4` and `0.5` for mastery 1, 20 and 50.
- `huntExtras(state, "hare").hideKg` becomes `.furKg`.
- `regionState(...).pop.deer` becomes `popOf(regionState(...), "deer")`.
- Tests with seeds 17 and 19 (intent walks) may now start in a different region or draw differently because `dailyAnimals` consumes more rng. If one fails on a changed random outcome, re-seed it: try seeds upward from the old one until the test's premise (a shore nearby, deer present, and so on) holds again, and say so in a comment on the seed.

- [ ] **Step 11: Typecheck and run everything**

Run: `cd 08-survidle && npx tsc --noEmit && npx vitest run`
Expected: clean and green. Fix any remaining `ANIMALS`/`SPECIES` reference `tsc` finds (`grep -rn "ANIMALS\|SPECIES\b" src` must return nothing).

- [ ] **Step 12: Commit Tasks 2 and 3 together**

```bash
git add 08-survidle/src 08-survidle/tests
git commit -m "feat(survidle): regions hold a roster from the catalogue; every module reads it"
```

(`git add 08-survidle/src 08-survidle/tests` is scoped to this prototype; check `git status` first that nothing of another session's is staged from it.)

---

### Task 4: Seasons and migrants in the daily simulation

Task 3 wrote the logic; this task pins it with tests, and adds the ice rule for lake birds.

**Files:**
- Modify: `src/sim/animals.ts` (`seasonalCapacity` ice rule)
- Test: `tests/animals.test.ts`

**Interfaces:**
- Consumes: `seasonalCapacity(world, region, s, cal)`, `dailyAnimals`, `popOf`.
- Produces: `seasonalCapacity` takes `iceCm` as a fifth parameter: `seasonalCapacity(world, region, s, cal, iceCm = 0)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/animals.test.ts` (adjusting the file's imports to the new modules per Task 3):

```ts
import { popOf, seasonalCapacity } from "../src/sim/animals";
import { SPECIES_DEFS, type Species } from "../src/sim/species";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { ICE_THIN_CM } from "../src/sim/weather";

/** A touched region holding the species, from the player's region outward across the lattice. */
function regionWith(state: GameState, world: World, s: Species): number {
  for (let id = 0; id < LATTICE_W * LATTICE_H; id++) {
    if (regionAt(world, id).capacity[s]) {
      regionState(state, world, id);
      return id;
    }
  }
  throw new Error(`no region with ${s}`);
}

describe("seasons", () => {
  it("migrants are away in January and here in June; lake birds leave when the ice comes", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "mallard");
    const k = regionAt(world, id).capacity.mallard!;
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 275))).toBe(0);   // early January
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 70))).toBe(k);    // June
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 70), ICE_THIN_CM)).toBe(0);
    expect(seasonalCapacity(world, id, "loon", calendar(1440 * 70), ICE_THIN_CM)).toBe(0);
    const perchId = regionWith(state, world, "perch");
    expect(seasonalCapacity(world, perchId, "perch", calendar(1440 * 70), 30)).toBe(regionAt(world, perchId).capacity.perch);
  });

  it("a migrant flock arrives over ten days and is gone a month after it leaves", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "mallard");
    const st = regionState(state, world, id);
    const k = regionAt(world, id).capacity.mallard!;
    st.pop.mallard = 0;
    const rng = new Rng(3);
    for (let d = 0; d < 10; d++) dailyAnimals(state, world, calendar(1440 * (30 + d)), rng);   // May
    expect(popOf(st, "mallard")).toBeGreaterThan(k * 0.5);
    for (let d = 0; d < 30; d++) dailyAnimals(state, world, calendar(1440 * (200 + d)), rng);  // mid October on
    expect(popOf(st, "mallard")).toBeLessThan(k * 0.1);
  });

  it("voice-only species sit at capacity and residents thin in winter by their factor", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "raven");
    const st = regionState(state, world, id);
    st.pop.raven = 0;
    dailyAnimals(state, world, calendar(1440 * 70), new Rng(1));
    expect(popOf(st, "raven")).toBe(regionAt(world, id).capacity.raven);
    const deerId = regionWith(state, world, "deer");
    expect(seasonalCapacity(world, deerId, "deer", calendar(1440 * 275))).toBeCloseTo(regionAt(world, deerId).capacity.deer! * 0.6, 9);
    expect(seasonalCapacity(world, deerId, "deer", calendar(1440 * 70))).toBe(regionAt(world, deerId).capacity.deer);
  });

  it("mammals migrate, birds and fish do not, and nothing enters a region without the species", () => {
    const { state, world } = newGame(5);
    for (const nb of regionAt(world, state.player.region).neighbours) regionState(state, world, nb.id);
    const rng = new Rng(4);
    const before: Record<number, Partial<Record<Species, number>>> = {};
    for (const [id, st] of Object.entries(state.regions)) before[Number(id)] = { ...st.pop };
    dailyAnimals(state, world, calendar(1440 * 220), rng);   // November: no growth
    for (const [key, st] of Object.entries(state.regions)) {
      const id = Number(key);
      for (const s of Object.keys(st.pop) as Species[]) {
        expect(regionAt(world, id).capacity[s], `${s} in ${id} without capacity`).toBeGreaterThan(0);
        if (SPECIES_DEFS[s].kind !== "mammal" && SPECIES_DEFS[s].season.kind === "resident") expect(st.pop[s]).toBeCloseTo(before[id][s]!, 9);
      }
    }
  });
});
```

Add `import type { GameState } from "../src/sim/types"; import type { World } from "../src/world/gen";` at the top.

- [ ] **Step 2: Run the tests to verify the ice case fails**

Run: `cd 08-survidle && npx vitest run tests/animals.test.ts`
Expected: the first test FAILS on the `ICE_THIN_CM` expectation (`seasonalCapacity` ignores a fifth argument); the others pass or fail on details you fix in the code, not the test.

- [ ] **Step 3: The ice rule**

In `src/sim/animals.ts`:

```ts
import { SPECIES_DEFS, isVoiceOnly, type Species } from "./species";
import { ICE_THIN_CM } from "./weather";

/** Capacity as it stands this season: winter thins the browsers, migrants are away, lake birds leave a frozen lake. */
export function seasonalCapacity(world: World, region: number, s: Species, cal: Calendar, iceCm = 0): number {
  const k = regionAt(world, region).capacity[s] ?? 0;
  const def = SPECIES_DEFS[s];
  if (def.kind === "bird" && def.habitat.lake !== undefined && iceCm >= ICE_THIN_CM) return 0;
  const r = def.season;
  if (r.kind === "resident") return cal.season === "winter" ? k * (r.winter ?? 1) : k;
  return cal.month >= r.arrive && cal.month < r.leave ? k : 0;
}
```

`regionDensity` and `dailyAnimals` pass `state.weather.iceCm`. Check `weather.ts` does not import `animals.ts` (it does not), so the import is not circular.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/animals.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/animals.ts 08-survidle/tests/animals.test.ts
git commit -m "feat(survidle): migrants come and go, lake birds leave the ice, voice-only species keep their numbers"
```

---

### Task 5: Wolves drive the night

**Files:**
- Modify: `src/sim/events.ts:22-32`
- Test: `tests/events.test.ts` (new)

**Interfaces:**
- Consumes: `regionDensity(state, world, region, "wolf", cal, iceCm)`.

- [ ] **Step 1: Write the failing test**

`tests/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { hourlyEvents } from "../src/sim/events";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { placeAt } from "../src/sim/position";

/** Midnight in June, unsheltered, no fire: the wolf roll's conditions. */
const NIGHT = calendar(1440 * 70 + 16 * 60);   // 00:00 on day 71

function nights(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], hours: number, seed = 1): number {
  const rng = new Rng(seed);
  let attacks = 0;
  for (let h = 0; h < hours; h++) {
    const before = state.player.health;
    state.player.health = 100;
    state.player.sick = 1;   // keep the fever roll from muddying the count
    hourlyEvents(state, world, NIGHT, 10, 10, rng);
    if (state.player.health < 100) attacks++;
    void before;
  }
  return attacks;
}

describe("wolves", () => {
  it("never come where there are none, and come more where there are many", () => {
    const { state, world } = newGame(5);
    let safe = -1;
    let wolfy = -1;
    for (let id = 0; id < LATTICE_W * LATTICE_H && (safe < 0 || wolfy < 0); id++) {
      const r = regionAt(world, id);
      if (r.landCells < 20) continue;
      if (!r.capacity.wolf && safe < 0) safe = id;
      if (r.capacity.wolf && wolfy < 0) wolfy = id;
    }
    placeAt(state, world, regionAt(world, safe).campCell);
    expect(nights(state, world, 2000)).toBe(0);
    placeAt(state, world, regionAt(world, wolfy).campCell);
    regionState(state, world, wolfy).pop.wolf = regionAt(world, wolfy).capacity.wolf;
    const full = nights(state, world, 2000, 2);
    expect(full).toBeGreaterThan(20);
    regionState(state, world, wolfy).pop.wolf = regionAt(world, wolfy).capacity.wolf! * 0.1;
    const thin = nights(state, world, 2000, 3);
    expect(thin).toBeLessThan(full / 3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/events.test.ts`
Expected: FAIL: attacks in the safe region are about 20 (1% of 2000).

- [ ] **Step 3: Scale the roll by wolf density**

In `src/sim/events.ts`, import `regionDensity` from `./animals` and replace the wolf block:

```ts
  // Wolves: the night outside, where wolves live, worse in winter. A region without wolves has quiet nights.
  if (cal.isNight && !sheltered(state, world) && !firelit(state, world)) {
    let chance = 0.02 * regionDensity(state, world, p.region, "wolf", cal, state.weather.iceCm);
    if (cal.season === "winter") chance *= 2;
    if (chance > 0 && rng.chance(chance)) {
      p.health = Math.max(0, p.health - 25);
      p.injured = Math.max(p.injured, 24 * 60);
      log(state, "Wolves out of the dark. You fight them off, bleeding.", "bad");
      if (p.health <= 0) die(state, "wolves");
    }
  }
```

`chance > 0 &&` keeps the rng stream untouched in wolfless country, so seeded runs there are unchanged by this task.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/events.test.ts && npx vitest run`
Expected: PASS. If a seeded test elsewhere shifted because the start region has wolves, re-seed per Task 3 Step 10.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/events.ts 08-survidle/tests/events.test.ts
git commit -m "feat(survidle): wolves are a population, and the night is only as dangerous as the local pack"
```

---

### Task 6: Mastery extras by class, and the pool caps

**Files:**
- Modify: `src/sim/skills.ts` (`EXTRAS`, `huntExtras`, `poolCapacity`, `oddsFactor`)
- Modify: `src/sim/tasks.ts` (`hunt` miss branch uses `arrowLoss`)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `huntExtras` returns `{ meatKg, hideKg, furKg, bone, sinew, injuryFactor, oddsFactor, arrowLoss }`; `POOL_KEY_CAP`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/skills.test.ts`:

```ts
import { extrasClass, fishSpecies, huntedLand } from "../src/sim/species";

describe("extras by class", () => {
  function withMastery(key: string, skill: "hunting" | "fishing", m: number) {
    const { state, world } = newGame(3);
    state.skills[skill].mastery[key] = masteryMinutes(m);
    return { state, world };
  }

  it("fur-bearers: half again the fur at 20, a bone more at 50", () => {
    expect(huntExtras(withMastery("hunt:fox", "hunting", 1).state, "fox")).toMatchObject({ furKg: 1, bone: 2 });
    expect(huntExtras(withMastery("hunt:fox", "hunting", 20).state, "fox")).toMatchObject({ furKg: 1.5, bone: 2 });
    expect(huntExtras(withMastery("hunt:fox", "hunting", 50).state, "fox")).toMatchObject({ furKg: 1.5, bone: 3 });
    expect(huntExtras(withMastery("hunt:hare", "hunting", 20).state, "hare").furKg).toBeCloseTo(0.3, 9);
  });

  it("big game: a sinew more at 20, half the hurt at 50", () => {
    expect(huntExtras(withMastery("hunt:reindeer", "hunting", 20).state, "reindeer")).toMatchObject({ sinew: 5, injuryFactor: 1 });
    expect(huntExtras(withMastery("hunt:wolf", "hunting", 50).state, "wolf")).toMatchObject({ sinew: 5, injuryFactor: 0.5 });
  });

  it("birds: no arrow lost at 20, a quarter better odds at 50", () => {
    expect(huntExtras(withMastery("hunt:capercaillie", "hunting", 1).state, "capercaillie")).toMatchObject({ arrowLoss: 0.5, oddsFactor: 1 });
    expect(huntExtras(withMastery("hunt:capercaillie", "hunting", 20).state, "capercaillie")).toMatchObject({ arrowLoss: 0, oddsFactor: 1 });
    expect(huntExtras(withMastery("hunt:capercaillie", "hunting", 50).state, "capercaillie")).toMatchObject({ arrowLoss: 0, oddsFactor: 1.25 });
  });

  it("fish: a third more at 20, two thirds more at 50", () => {
    expect(fishKg(withMastery("fish:pike", "fishing", 1).state, "pike")).toBeCloseTo(2.0, 9);
    expect(fishKg(withMastery("fish:pike", "fishing", 20).state, "pike")).toBeCloseTo(2.0 * 4 / 3, 9);
    expect(fishKg(withMastery("fish:pike", "fishing", 50).state, "pike")).toBeCloseTo(2.0 * 5 / 3, 9);
  });

  it("every hunted species has extras text of its class", () => {
    for (const s of [...huntedLand(), ...fishSpecies()]) {
      const key = fishSpecies().includes(s) ? `fish:${s}` : `hunt:${s}`;
      expect(EXTRAS[key], key).toBeDefined();
      expect(extrasClass(s)).not.toBeNull();
    }
  });

  it("the pools of Hunting and Fishing count six and three keys", () => {
    expect(poolCapacity("hunting")).toBe(6 * 6000);
    expect(poolCapacity("fishing")).toBe(3 * 6000);
    expect(poolCapacity("woodcraft")).toBe(6 * 6000);
    expect(poolCapacity("crafting")).toBe(MASTERY_KEYS.crafting.length * 6000);
  });
});
```

Delete the older assertions these supersede (the `poolCapacity("fishing")` one from Task 3 Step 10, the old `fishKg` numbers).

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/skills.test.ts`
Expected: FAIL on `arrowLoss`, the fox fur, the pool caps.

- [ ] **Step 3: Implement**

In `src/sim/skills.ts`:

```ts
/** Keys the pool counts, for the skills whose rosters would otherwise put the perks out of reach. */
const POOL_KEY_CAP: Partial<Record<SkillId, number>> = { hunting: 6, fishing: 3 };

export function poolCapacity(skill: SkillId): number {
  return POOL_MINUTES_PER_KEY * Math.min(MASTERY_KEYS[skill].length, POOL_KEY_CAP[skill] ?? Number.POSITIVE_INFINITY);
}
```

`EXTRAS` species entries, built from the class:

```ts
const CLASS_EXTRAS = {
  fur: { at20: "the pelt comes off whole, half again the fur", at50: "a bone more" },
  big: { at20: "a sinew more", at50: "half the chance of a hurt" },
  bird: { at20: "an arrow is never lost on a miss", at50: "a quarter better odds" },
  fish: { at20: "a third more per catch", at50: "two thirds more per catch" },
};
for (const s of huntedLand()) EXTRAS[`hunt:${s}`] = CLASS_EXTRAS[extrasClass(s)!];
for (const s of fishSpecies()) EXTRAS[`fish:${s}`] = CLASS_EXTRAS.fish;
```

(placed after the `EXTRAS` literal, which keeps its chop and craft entries and drops the three hunt lines from Task 3.)

```ts
export function huntExtras(state: GameState, species: Species): {
  meatKg: number; hideKg: number; furKg: number; fatKg: number; bone: number; sinew: number; injuryFactor: number; oddsFactor: number; arrowLoss: number;
} {
  const y = SPECIES_DEFS[species].yields ?? { meatKg: 0 };
  const m = masteryOf(state, "hunting", `hunt:${species}`);
  const out = { meatKg: y.meatKg, hideKg: y.hideKg ?? 0, furKg: y.furKg ?? 0, fatKg: y.fatKg ?? 0, bone: y.bone ?? 0, sinew: y.sinew ?? 0, injuryFactor: 1, oddsFactor: 1, arrowLoss: 0.5 };
  switch (extrasClass(species)) {
    case "fur":
      if (m >= 20) out.furKg = Math.round(out.furKg * 1.5 * 100) / 100;
      if (m >= 50) out.bone += 1;
      break;
    case "big":
      if (m >= 20) out.sinew += 1;
      if (m >= 50) out.injuryFactor = 0.5;
      break;
    case "bird":
      if (m >= 20) out.arrowLoss = 0;
      if (m >= 50) out.oddsFactor = 1.25;
      break;
  }
  return out;
}
```

`oddsFactor` multiplies by `huntExtras(state, species).oddsFactor` for non-fish species. In `tasks.ts` `complete` `hunt` miss branch, replace `if (rng.chance(0.5))` with `const loss = huntExtras(state, s).arrowLoss; if (loss > 0 && rng.chance(loss))`.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/skills.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/skills.test.ts
git commit -m "feat(survidle): mastery extras by what the animal is; Hunting and Fishing pools count a few keys"
```

---

### Task 7: Hunt anything, fish for anything

**Files:**
- Modify: `src/sim/tasks.ts` (`checkFresh` any cases, `beginTask` draw, `stepTask` repeat, `availableTasks`)
- Modify: `src/sim/intent.ts` (`groundOf` for any, gerund)
- Modify: `src/main.ts` (pass `rng` to `startTask`)
- Modify: `src/ui/panels.ts` (`intentGroups` adds the two any rows)
- Test: `tests/tasks.test.ts`

**Interfaces:**
- Produces: `startTask(state, world, cal, id, arg?, repeat?, rng?)` and `beginTask(...)` with the same trailing `rng?: Rng`; `drawSpecies(state, world, cal, rng, id: "hunt" | "fish", at): Species | null`; `Task.any`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/tasks.test.ts`:

```ts
import { huntedLand, fishSpecies, SPECIES_DEFS, type Species } from "../src/sim/species";
import { drawSpecies } from "../src/sim/tasks";
import { addItem } from "../src/sim/inventory";

describe("anything", () => {
  function armed(g: G) {
    g.state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false }, { id: "fishingSpear", durability: 100, litres: 0, frozen: false });
    addItem(g.state.player.pack, "arrow", 10);
  }

  it("offers Hunt anything and Fish for anything ahead of the species rows", () => {
    const g = newGame(3);
    const rows = availableTasks(g.state, g.world, cal).filter((o) => o.group === "hunt");
    expect(rows[0]).toMatchObject({ id: "hunt", arg: "any", label: "Hunt anything" });
    const fishAt = rows.findIndex((o) => o.id === "fish");
    expect(rows[fishAt]).toMatchObject({ id: "fish", arg: "any", label: "Fish for anything" });
    // Only species with capacity here have rows.
    const r = regionAt(g.world, g.state.player.region);
    for (const o of rows) if (o.arg !== "any") expect(r.capacity[o.arg as Species]).toBeGreaterThan(0);
  });

  it("draws only from species about, on ground that suits them", () => {
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    placeAtSpot(state, world, state.player.region, "forest");
    const at = cellOf(state, world);
    const st = regionState(state, world, state.player.region);
    const rng = new Rng(9);
    for (let i = 0; i < 50; i++) {
      const s = drawSpecies(state, world, cal, rng, "hunt", at)!;
      expect(huntedLand()).toContain(s);
      expect(SPECIES_DEFS[s].hunt!.spot).toBe("forest");
      expect(st.pop[s]!).toBeGreaterThanOrEqual(1);
    }
    for (const s of huntedLand()) st.pop[s] = 0;
    expect(drawSpecies(state, world, cal, rng, "hunt", at)).toBeNull();
    expect(check(state, world, cal, "hunt", "any").why).toBe("nothing about");
  });

  it("starts as the species drawn, trains it, and draws again on repeat", () => {
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, cal, "hunt", "any", true, new Rng(5))).toBe(true);
    const first = state.task!;
    expect(first.any).toBe(true);
    expect(first.arg).not.toBe("any");
    expect(huntedLand()).toContain(first.arg);
    expect(first.duration).toBe(SPECIES_DEFS[first.arg as Species].hunt!.minutes);
    expect(state.log.at(-1)!.text).toMatch(/^Fresh sign: /);
    const rng = new Rng(1);
    for (let m = 0; m < first.duration + 1 && state.task === first; m++) stepTask(state, world, cal, rng, 1);
    expect(state.skills.hunting.mastery[`hunt:${first.arg}`]).toBeGreaterThan(0);
    expect(state.task?.any).toBe(true);
  });

  it("fishing for anything at a sea shore never lands a lake fish", () => {
    // Seed 11's start region has both a lake shore and a sea shore; change the seed if the map changes, with the reason here.
    const g = newGame(11);
    const { state, world } = g;
    armed(g);
    const r = regionAt(world, state.player.region);
    const sea = r.cells.find((c) => cellAt(world, c).terrain !== "water" && watersideCell(world, c, "sea"));
    expect(sea).toBeDefined();
    placeAt(state, world, sea!);
    const rng = new Rng(2);
    for (let i = 0; i < 30; i++) {
      const s = drawSpecies(state, world, cal, rng, "fish", sea!);
      if (s) expect(SPECIES_DEFS[s].habitat.sea).toBeDefined();
    }
  });
});
```

Import `watersideCell` from `../src/sim/position` and `cellAt` from `../src/world/gen` in the test if not already. For the seed in the last test: run a scratch loop over seeds 1 to 40 with `generateWorld` and pick the first whose start region has both `lake > 0` and `sea > 0` and a land cell beside each; put that seed in and keep the comment.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/tasks.test.ts -t anything`
Expected: FAIL: `drawSpecies` is not exported, "any" rows missing.

- [ ] **Step 3: Implement the draw and the rows**

In `src/sim/tasks.ts`:

```ts
import { Rng } from "../rng";   // was `import type`; the class is needed for the fallback stream

/** Species a hunt or a cast could meet from this cell: hunted, of the right kind, about now, and suited by the ground. */
function candidates(state: GameState, world: World, cal: Calendar, id: "hunt" | "fish", at: number): { s: Species; w: number }[] {
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const pool = id === "fish" ? fishSpecies() : huntedLand();
  const out: { s: Species; w: number }[] = [];
  for (const s of pool) {
    if (!r.capacity[s] || popOf(st, s) < 1) continue;
    const def = SPECIES_DEFS[s].hunt!;
    if (!spotSuits(world, at, def.spot, waterOf(s))) continue;
    const d = regionDensity(state, world, state.player.region, s, cal);
    if (d <= 0) continue;
    out.push({ s, w: d * def.odds });
  }
  return out;
}

/** What "anything" turns out to be: drawn by how likely each species is to be met. Null when nothing is about. */
export function drawSpecies(state: GameState, world: World, cal: Calendar, rng: Rng, id: "hunt" | "fish", at: number): Species | null {
  const c = candidates(state, world, cal, id, at);
  const total = c.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let pick = rng.next() * total;
  for (const x of c) {
    pick -= x.w;
    if (pick <= 0) return x.s;
  }
  return c[c.length - 1].s;
}
```

In `checkFresh`, before the existing `hunt`/`fish` cases handle a species, add the `any` branches at the top of each case:

```ts
    case "hunt": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "hunt", at);
        const kinds = huntedLand().filter((s) => r.capacity[s] && popOf(st, s) >= 1);
        const o = opt({ group: "hunt", label: "Hunt anything", duration: 120, repeatable: true, detail: `whatever is about; ${kinds.length} kind${kinds.length === 1 ? "" : "s"} here` });
        if (!kinds.length) return { ...o, ok: false, why: "nothing about" };
        if (!c.length) return ground(false, "forest", "forest", o);
        if (!hasTool(p, "bow")) return { ...o, ok: false, why: "needs a bow" };
        if (totalQty([p.pack], "arrow") < 1) return { ...o, ok: false, why: "needs arrows in the pack" };
        return o;
      }
      ...existing species branch...
    }
    case "fish": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "fish", at);
        const kinds = fishSpecies().filter((s) => r.capacity[s] && popOf(st, s) >= 1);
        const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Fish for anything", duration: 60, repeatable: true, detail: `whatever bites; ${kinds.length} kind${kinds.length === 1 ? "" : "s"} here` }));
        if (!o.ok) return o;
        if (!hasTool(p, "fishingSpear")) return { ...o, ok: false, why: "needs a fishing spear" };
        if (!c.length) return { ...o, ok: false, why: "nothing about" };
        return o;
      }
      ...existing species branch...
    }
```

`availableTasks`: push `check(state, world, cal, "hunt", "any")` before the hunted-land loop and `check(state, world, cal, "fish", "any")` before the fish loop.

`startTask` and `beginTask` gain a trailing `rng?: Rng`. In `beginTask`, after `if (!o.ok) return false;` and `setAside(...)`, add before the `walk`/`travel` branch:

```ts
  let any = false;
  if ((id === "hunt" || id === "fish") && arg === "any") {
    const r = rng ?? new Rng(state.rng);
    const drawn = drawSpecies(state, world, cal, r, id, cellOf(state, world));
    if (!rng) state.rng = r.s;
    if (!drawn) return false;
    arg = drawn;
    any = true;
    log(state, id === "hunt" ? `Fresh sign: a ${SPECIES_DEFS[drawn].name}.` : `A swirl under the bank: ${SPECIES_DEFS[drawn].name}.`);
  }
```

and set `state.task = { id, arg, progress: ..., duration: fresh.duration, repeat: repeat && o.repeatable, ...(any ? { any: true } : {}) };` where `fresh` is computed with the drawn `arg`. Note `arg` must be reassignable: change the parameter to `arg?: string` and use a local `let a = arg;` if the linter objects to reassigning a parameter.

In `stepTask`, keep `const any = t.any;` beside `repeat`, and replace the repeat block with:

```ts
  if (repeat && !state.dead) {
    const wanted = any ? "any" : arg;
    const o = check(state, world, cal, id, wanted);
    if (!o.ok) log(state, `${o.label}: ${o.why}. You stop.`);
    else if (!beginTask(state, world, cal, id, wanted, true, rng)) log(state, `${o.label}: nothing about. You stop.`);
  }
```

`beginTask` sets aside nothing here because `state.task` is already null, and the paused-share lookup keys on the drawn species, which is right: half a stalk of a hare resumes as a hare.

In `src/main.ts` `onClick`, pass `rng` as the last argument of both `startTask(...)` calls. In `src/sim/intent.ts`, find where the runner calls `beginTask` and pass its `rng`; `groundOf` returns `"forest"` for `hunt` with arg `any` and `"shore"` for `fish` with arg `any`; `suits` gets `null` for the water of `any`. `GERUND.hunt` for `any` reads "hunting" (the task's own arg is already the drawn species, so `GERUND` only ever sees a species; leave it).

The task label while stalking: in `panels.ts` `taskHtml` (find where the running task's label is composed), when `state.task.any` is true append ` (whatever was about)` to the label.

`intentGroups` in `panels.ts`: the Hunt group starts with `{ id: "hunt", arg: "any" }`, and `{ id: "fish", arg: "any" }` goes before the fish species rows.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/main.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/tasks.test.ts
git commit -m "feat(survidle): hunt anything and fish for anything draw what is about; a chosen target needs a local population"
```

---

### Task 8: The region panel lists the roster in four lines

**Files:**
- Modify: `src/ui/panels.ts` (region html)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `speciesHere`, `regionDensity`, `densityLabel`, `SPECIES_DEFS`, `monthName`, `isVoiceOnly`, `isFish`.
- Produces: `rosterHtml(state, world, id, cal): string`.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui.test.ts` (follow the file's existing way of rendering `regionHtml`; it imports `regionHtml` from `../src/ui/panels` and builds a `UiState` with `newUiState()`):

```ts
import { rosterHtml } from "../src/ui/panels";
import { SPECIES_DEFS, type Species } from "../src/sim/species";
import { regionAt, speciesHere } from "../src/world/gen";
import { regionState } from "../src/sim/regionstate";

it("lists the roster in Game, Birds, Fish and Heard lines, only species that live here", () => {
  const { state, world } = newGame(5);
  const id = state.player.region;
  const html = rosterHtml(state, world, id, calendar(1440 * 275));   // January
  const r = regionAt(world, id);
  for (const s of speciesHere(r)) expect(html).toContain(SPECIES_DEFS[s].name);
  for (const s of Object.keys(SPECIES_DEFS) as Species[]) if (!r.capacity[s]) expect(html).not.toContain(`${SPECIES_DEFS[s].name}`);
  if (r.capacity.mallard) expect(html).toContain("mallard gone until April");
  if (r.capacity.bear) expect(html).toContain("brown bear denned until April");
  if (r.capacity.loon) expect(html).toContain("loon (from May)");
  if (r.capacity.hare) {
    regionState(state, world, id).pop.hare = 0;
    expect(rosterHtml(state, world, id, calendar(0))).toContain("hare <b>none</b>");
  }
  expect(html.startsWith("<div>Game:") || html.startsWith("<div>Birds:") || html.startsWith("<div>Fish:") || html.startsWith("<div>Heard:")).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/ui.test.ts`
Expected: FAIL: `rosterHtml` not exported.

- [ ] **Step 3: Implement**

In `src/ui/panels.ts`:

```ts
import { awayWord, isFish, isVoiceOnly, SPECIES_DEFS, type Species } from "../sim/species";
import { monthName } from "../sim/calendar";

/** "mallard gone until April" for a migrant out of season, otherwise the density in words. */
function rosterEntry(state: GameState, world: World, id: number, s: Species, cal: Calendar): string {
  const def = SPECIES_DEFS[s];
  if (def.season.kind === "migrant" && (cal.month < def.season.arrive || cal.month >= def.season.leave)) {
    return isVoiceOnly(s) ? `${def.name} (from ${monthName(def.season.arrive)})` : `${def.name} ${awayWord(def)} until ${monthName(def.season.arrive)}`;
  }
  if (isVoiceOnly(s)) return def.name;
  return `${def.name} <b>${densityLabel(regionDensity(state, world, id, s, cal, state.weather.iceCm))}</b>`;
}

/** Four lines, each only the species that live here: Game, Birds, Fish, Heard. Empty lines are left out. */
export function rosterHtml(state: GameState, world: World, id: number, cal: Calendar): string {
  const here = speciesHere(regionAt(world, id));
  const groups: [string, (s: Species) => boolean][] = [
    ["Game", (s) => SPECIES_DEFS[s].kind === "mammal"],
    ["Birds", (s) => SPECIES_DEFS[s].kind === "bird" && !isVoiceOnly(s)],
    ["Fish", (s) => isFish(s)],
    ["Heard", (s) => isVoiceOnly(s)],
  ];
  return groups
    .map(([label, pick]) => {
      const list = here.filter(pick).map((s) => rosterEntry(state, world, id, s, cal));
      return list.length ? `<div>${label}: ${list.join(", ")}</div>` : "";
    })
    .join("");
}
```

In `regionHtml`, replace the `animals` line and wherever it was interpolated with `rosterHtml(state, world, id, cal)`.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/panels.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): the region card lists game, birds, fish and what is heard"
```

---

### Task 9: Old saves load

**Files:**
- Modify: `src/sim/save.ts` (`fillDefaults`)
- Test: `tests/advance-save.test.ts`

**Interfaces:**
- Consumes: `fillPopulations` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `tests/advance-save.test.ts`:

```ts
import { fillPopulations } from "../src/sim/regionstate";
import { speciesHere } from "../src/world/gen";

it("a save from the five-animal world loads with its roster filled and its dead keys gone", () => {
  const { state, world } = newGame(5);
  const id = state.player.region;
  const st = state.regions[id];
  (st as unknown as { pop: Record<string, number> }).pop = { hare: 10, grouse: 20, deer: 3, elk: 1, fish: 40 };
  state.task = { id: "fish", progress: 0, duration: 60, repeat: false };
  state.paused["hunt:grouse@123"] = { id: "hunt", arg: "grouse", fraction: 0.5, cell: 123 };
  const file = deserialize(serialize(state))!;
  fillPopulations(file.state, world);
  const pop = file.state.regions[id].pop as Record<string, number | undefined>;
  expect(pop.grouse).toBeUndefined();
  expect(pop.fish).toBeUndefined();
  if (regionAt(world, id).capacity.hare) expect(pop.hare).toBe(10);
  for (const s of speciesHere(regionAt(world, id))) expect(pop[s]).toBeGreaterThan(0);
  expect(file.state.task).toMatchObject({ id: "fish", arg: "any" });
  expect(file.state.paused["hunt:grouse@123"].arg).toBe("willowGrouse");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/advance-save.test.ts`
Expected: FAIL on `task.arg`.

- [ ] **Step 3: Implement the renames in `fillDefaults`**

```ts
  // The one-species fish and the one grouse became a roster: a fish task with no
  // species fishes for anything, and the old grouse is the willow grouse.
  const renameArg = (t: { id: TaskId; arg?: string } | null | undefined) => {
    if (!t) return;
    if (t.id === "fish" && !t.arg) t.arg = "any";
    if (t.id === "hunt" && t.arg === "grouse") t.arg = "willowGrouse";
  };
  renameArg(state.task);
  renameArg(state.intent ? { id: state.intent.task, arg: state.intent.arg } : null);
  if (state.intent && state.intent.task === "fish" && !state.intent.arg) state.intent.arg = "any";
  if (state.intent && state.intent.task === "hunt" && state.intent.arg === "grouse") state.intent.arg = "willowGrouse";
  for (const p of Object.values(state.paused)) renameArg(p);
```

(the intent lines are spelled out because `renameArg` on a copy would not write back; keep the two explicit lines and drop the `renameArg(state.intent ? ...)` call). Import `TaskId` as a type. The pop cleanup is `fillPopulations`, already called from `boot()`.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/save.ts 08-survidle/tests/advance-save.test.ts
git commit -m "fix(survidle): saves from the five-animal world load with a full roster"
```

---

### Task 10: Docs, build, and a look in the browser

**Files:**
- Modify: `docs/README.md`, `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`

- [ ] **Step 1: README**

In "How it plays", replace the Winter bullet's "Deer and elk thin out." with "Deer and elk thin out, the ducks and geese are gone south, and the lakes' birds leave with the ice." Add a bullet after "Carrying matters":

```
- **Species.** About thirty animals live in the north, each with a range:
  capercaillie in some old spruce country and not all of it, ptarmigan and
  reindeer on the fell, eider and cod on the coast, perch and pike in the
  lakes, wolves in patches of forest where the nights are dangerous. The
  region card lists what lives here. Hunt or fish for a chosen species,
  or for anything, and what you meet is drawn by how many are about. Each
  species has its own mastery, yields and recommended level; fur-bearers
  give fur, deer and bigger give hide.
```

In "Where the numbers live", change the `items.ts` line to end "structures." and add:

```
- `src/sim/species.ts`: every species: habitat, range, season, hunt odds, yields, calls.
- `src/world/wildlife.ts`: how a region's habitat and a species' range become a capacity.
```

- [ ] **Step 2: Roadmap**

In the roadmap spec, find the table or list of sub-projects and add a row/entry: "Species and sound: landed by `2026-09-03-survidle-species-and-sound-design.md`. Later: snares that take grouse, bear with hibernation, seals on the coast, grayling and salmon with the rivers." Follow the roadmap's own format for that section.

- [ ] **Step 3: Full check**

Run: `cd 08-survidle && npm test && npm run build`
Expected: both green.

- [ ] **Step 4: Browser**

Run `cd 08-survidle && npm run dev` and open `http://127.0.0.1:5173/prototypes/08/?seed=5`. Check: the region card shows the four roster lines; the Hunt group starts with "Hunt anything" and lists only species with rows; with `window.survidle.state.player.tools.push({id:"bow",durability:100,litres:0,frozen:false})` and arrows added via the console, "Hunt anything" starts and the Doing panel names the species drawn; `window.survidle.advance(1440 * 200)` to autumn and the ducks read "gone until April". Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/docs/README.md 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the README and roadmap know the species catalogue"
```

Then proceed to `docs/superpowers/plans/2026-09-03-survidle-sound.md`.

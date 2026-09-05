import { describe, expect, it } from "vitest";
import {
  awayWord, extrasClass, fishSpecies, huntedLand, isFish, isHunted, isVoiceOnly, perKm2, seasonFactor, SPECIES_DEFS, SPECIES_IDS, waterOf,
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

  it("keeps the catalogue in the order the world was drawn with", () => {
    // A species' position seeds its range noise, so a reorder redraws every range in every world. Append; never insert or sort.
    expect(SPECIES_IDS).toEqual([
      "hare", "squirrel", "fox", "beaver", "deer", "reindeer", "elk", "wolf", "wolverine", "bear",
      "willowGrouse", "ptarmigan", "blackGrouse", "capercaillie", "hazelGrouse", "mallard", "eider", "goose",
      "loon", "cuckoo", "raven", "owl", "crane", "woodpecker",
      "perch", "roach", "pike", "whitefish", "char", "trout", "burbot",
      "cod", "saithe", "herring",
    ]);
  });

  it("names months", () => {
    expect(monthName(0)).toBe("January");
    expect(monthName(3)).toBe("April");
    expect(monthName(11)).toBe("December");
  });
});

describe("fish capacities", () => {
  it("come from biomass per hectare over mean weight, so one survivor never moves a shore's density", () => {
    // A boreal lake: perch 30 kg/ha at 80 g, pike 15 kg/ha at 1.5 kg (year loop spec 2.1).
    expect(perKm2(30, 0.08)).toBe(37500);
    expect(SPECIES_DEFS.perch.habitat.lake).toBe(perKm2(30, 0.08));
    expect(SPECIES_DEFS.roach.habitat.lake).toBe(perKm2(20, 0.1));
    expect(SPECIES_DEFS.pike.habitat.lake).toBe(perKm2(15, 1.5));
    expect(SPECIES_DEFS.whitefish.habitat.lake).toBe(perKm2(10, 0.5));
    expect(SPECIES_DEFS.char.habitat.lake).toBe(perKm2(5, 0.6));
    expect(SPECIES_DEFS.trout.habitat.lake).toBe(perKm2(5, 0.5));
    expect(SPECIES_DEFS.burbot.habitat.lake).toBe(perKm2(5, 1.0));
    expect(SPECIES_DEFS.cod.habitat.sea).toBe(perKm2(5, 2.5));
    expect(SPECIES_DEFS.saithe.habitat.sea).toBe(perKm2(5, 1.5));
    expect(SPECIES_DEFS.herring.habitat.sea).toBe(perKm2(30, 0.15));
    for (const s of fishSpecies()) {
      const h = SPECIES_DEFS[s].habitat;
      expect((h.lake ?? 0) + (h.sea ?? 0), s).toBeGreaterThanOrEqual(200);
    }
  });
});

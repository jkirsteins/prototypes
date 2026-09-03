import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { addItem, hasTool, qty, tool } from "../src/sim/inventory";
import { placeAtSpot } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import {
  chopSticks, craftSuccess, effectiveNeeds, EXTRAS, fishKg, gap, gapInjury, huntExtras, injuryChance,
  level, levelMinutes, MASTERY_KEYS, masteryKey, masteryLevel, masteryMinutes, newSkills, poolCapacity,
  RECOMMENDED, SKILL_IDS, skillOf, skillLevel, speedFactor, spoiledNeeds, wearFactor, yieldFactor,
} from "../src/sim/skills";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { availableTasks, check, huntOdds, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { workSpeed } from "../src/sim/player";
import { regionDensity } from "../src/sim/animals";

describe("skill curves", () => {
  it("skill level is hours squared: 1 at 0, 2 at 2 h, 10 at 162 h, capped at 50", () => {
    expect(level(0)).toBe(1);
    expect(level(119)).toBe(1);
    expect(level(120)).toBe(2);
    expect(level(9720)).toBe(10);
    expect(level(9719)).toBe(9);
    expect(level(1e9)).toBe(50);
    expect(levelMinutes(10)).toBe(9720);
  });

  it("mastery level is a gentler curve: 20 at 90.25 h, capped at 99", () => {
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(5415)).toBe(20);
    expect(masteryLevel(5414)).toBe(19);
    expect(masteryLevel(1e9)).toBe(99);
    expect(masteryMinutes(20)).toBe(5415);
  });

  it("a pool holds 100 hours per mastery key", () => {
    expect(poolCapacity("fishing")).toBe(6000);
    expect(poolCapacity("woodcraft")).toBe(6 * 6000);
    expect(MASTERY_KEYS.hunting).toEqual(["hunt:hare", "hunt:grouse", "hunt:deer", "hunt:elk", "snare"]);
    expect(MASTERY_KEYS.crafting).toContain("craft:hideBlanket");
    expect(MASTERY_KEYS.building).toContain("build:boughBed");
    expect(MASTERY_KEYS.building).not.toContain("build:snare");
  });

  it("every EXTRAS and RECOMMENDED key names an action a skill actually owns", () => {
    const allKeys = SKILL_IDS.flatMap((id) => MASTERY_KEYS[id]);
    for (const key of Object.keys(EXTRAS)) expect(allKeys).toContain(key);
    for (const key of Object.keys(RECOMMENDED)) expect(allKeys).toContain(key);
  });
});

describe("what trains what", () => {
  it("maps every task to a skill and a mastery key, and walks to nothing", () => {
    const { state, world } = newGame(3);
    expect(skillOf("chop")).toBe("woodcraft");
    expect(skillOf("build", "snare")).toBe("hunting");
    expect(skillOf("build", "cabin")).toBe("building");
    expect(skillOf("cook")).toBe("building");
    expect(skillOf("walk")).toBeNull();
    expect(skillOf("sleep")).toBeNull();
    placeAtSpot(state, world, state.player.region, "forest");
    expect(masteryKey(state, world, "chop")).toMatch(/^chop:(spruce|pine|birch)$/);
    expect(masteryKey(state, world, "hunt", "elk")).toBe("hunt:elk");
    expect(masteryKey(state, world, "build", "snare")).toBe("snare");
    expect(masteryKey(state, world, "cook")).toBe("cook:rawMeat");
    expect(masteryKey(state, world, "walk", "spot:camp")).toBeNull();
  });

  it("a fresh run has every skill at zero, and an old save is filled the same way", () => {
    const { state } = newGame(3);
    for (const id of SKILL_IDS) expect(state.skills[id]).toEqual({ xp: 0, mastery: {}, pool: 0 });
    const raw = JSON.parse(serialize(state, 1));
    delete raw.state.skills;
    const file = deserialize(JSON.stringify(raw));
    expect(file!.state.skills).toEqual(newSkills());
  });
});

type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number) {
  const rng = new Rng(1);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("training", () => {
  it("an hour of felling is an hour of Woodcraft, of that tree kind, and of the pool", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    startTask(state, world, cal, "chop");
    run(g, 30);
    expect(state.skills.woodcraft.xp).toBe(30);
    expect(state.skills.woodcraft.mastery[key]).toBe(30);
    expect(state.skills.woodcraft.pool).toBe(30);
    expect(state.skills.hunting.xp).toBe(0);
  });

  it("walking trains nothing", () => {
    const g = newGame(3);
    const { state, world } = g;
    startTask(state, world, cal, "walk", "spot:forest");
    run(g, 5);
    for (const id of SKILL_IDS) expect(state.skills[id].xp).toBe(0);
  });

  it("a felling set aside keeps the minutes it earned", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 20);
    stopTask(state, world);
    expect(state.skills.woodcraft.xp).toBe(20);
  });

  it("logs the level-up as the hours cross", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.skills.woodcraft.xp = 119;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 2);
    expect(skillLevel(state, "woodcraft")).toBe(2);
    expect(state.log.filter((e) => e.text === "Woodcraft 2.")).toHaveLength(1);
  });

  it("the pool stops at capacity", () => {
    const g = newGame(4);
    const { state, world } = g;
    state.skills.fishing.pool = 6000 - 1;
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    startTask(state, world, cal, "fish");
    run(g, 5);
    expect(state.skills.fishing.pool).toBe(6000);
  });
});

describe("effects", () => {
  it("Woodcraft 11 fells 10% faster than Woodcraft 1", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const slow = workSpeed(state, world);
    state.skills.woodcraft.xp = levelMinutes(11);
    expect(workSpeed(state, world)).toBeCloseTo(slow * 1.1, 6);
  });

  it("Hunting 11 has 10% better odds; Fishing reads its own skill", () => {
    const { state, world } = newGame(3);
    const d = regionDensity(state, world, state.player.region, "hare", cal);
    const base = huntOdds(state, world, cal, d, "hare");
    state.skills.hunting.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, d, "hare")).toBeCloseTo(base * 1.1, 6);
    const df = regionDensity(state, world, state.player.region, "fish", cal);
    const fish = huntOdds(state, world, cal, df, "fish");
    state.skills.fishing.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, df, "fish")).toBeCloseTo(fish * 1.1, 6);
  });

  it("Crafting 11 wears the needle 10% less", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 2);
    for (const g2 of state.player.clothing) g2.durability = 50;
    state.skills.crafting.xp = levelMinutes(11);
    startTask(state, world, cal, "repair");
    run(g, 400);
    expect(state.task).toBeNull();
    // Mending wears the needle by 2 at Crafting 1; 1.8 here.
    expect(tool(state.player, "needle")!.durability).toBeCloseTo(98.2, 6);
  });

  it("mastery adds a quarter percent per level on that action alone", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(41);
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    expect(speedFactor(state, world, "sticks")).toBeCloseTo(1, 6);
  });

  it("pool checkpoints: 10% gives x1.05, 50% replaces it with x1.10, 25% halves wear, 95% ends it", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const cap = poolCapacity("woodcraft");
    state.skills.woodcraft.pool = cap * 0.1;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.05, 6);
    state.skills.woodcraft.pool = cap * 0.5;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    state.skills.woodcraft.pool = cap * 0.25;
    expect(wearFactor(state, world, "chop")).toBeCloseTo(0.5, 6);
    state.skills.woodcraft.pool = cap * 0.95;
    expect(wearFactor(state, world, "chop")).toBe(0);
  });
});

describe("soft gates", () => {
  it("elk at Hunting 1 is one try in 128 of the base odds", () => {
    const { state, world } = newGame(3);
    expect(gap(state, "hunt:elk")).toBe(7);
    const d = regionDensity(state, world, state.player.region, "elk", cal);
    state.skills.hunting.xp = levelMinutes(8);
    const atLevel = huntOdds(state, world, cal, d, "elk");
    state.skills.hunting.xp = 0;
    expect(huntOdds(state, world, cal, d, "elk")).toBeCloseTo((atLevel / 1.07) / 128, 9);
  });

  it("a cabin at Building 4 goes at 1 / 1.3^6 of the pace", () => {
    const { state, world } = newGame(3);
    state.skills.building.xp = levelMinutes(4);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.03 / 1.3 ** 6, 6);
    state.skills.building.xp = levelMinutes(10);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.09, 6);
  });
});

describe("the button text agrees with the sim", () => {
  it("chop, stone and hunt details follow mastery and pool the same way completion does", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(20);
    const chop = availableTasks(state, world, cal).find((o) => o.id === "chop")!;
    expect(chop.detail).toContain("5 sticks");

    state.skills.foraging.pool = poolCapacity("foraging");
    const stone = availableTasks(state, world, cal).find((o) => o.id === "stone")!;
    expect(stone.detail).toContain("5 stone");

    state.skills.hunting.mastery["hunt:hare"] = masteryMinutes(20);
    const hare = availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "hare")!;
    expect(hare.detail).toContain("0.3 kg hide");
  });

  it("odds that round to nothing but are not zero read \"under 1%\", not \"about 0%\"", () => {
    const { state, world } = newGame(3);
    const elk = availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "elk")!;
    expect(elk.detail).toContain("under 1%");
  });
});

describe("backfire under level", () => {
  it("elk at Hunting 1 hurts you 85% of the time; deer at Hunting 2, 20%", () => {
    const { state } = newGame(3);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.85, 9);
    state.skills.hunting.xp = levelMinutes(2);
    expect(injuryChance(state, "deer")).toBeCloseTo(0.2, 9);
    state.skills.hunting.xp = levelMinutes(8);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.15, 9);
    expect(injuryChance(state, "hare")).toBe(0);
  });

  it("the gap alone hurts you on every attempt, not just a successful one: elk 70% at Hunting 1, none at Hunting 8", () => {
    const { state } = newGame(3);
    expect(gapInjury(state, "elk")).toBeCloseTo(0.7, 9);
    expect(gapInjury(state, "hare")).toBe(0);
    state.skills.hunting.xp = levelMinutes(8);
    expect(gapInjury(state, "elk")).toBe(0);
    state.skills.hunting.xp = 0;
    state.skills.hunting.mastery["hunt:elk"] = masteryMinutes(50);
    expect(gapInjury(state, "elk")).toBeCloseTo(0.35, 9);
  });

  it("a bow at Crafting 1 comes out one time in 16; a failure spoils half the materials", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 / 16, 9);
    state.player.tools.push({ id: "knife", durability: 100 });
    addItem(state.player.pack, "log", 1);
    addItem(state.player.pack, "cordage", 3);
    startTask(state, world, cal, "craft", "bow");
    // Seed 1's first roll in run() is above 1/16, so this attempt fails.
    run(g, 400);
    expect(state.task).toBeNull();
    expect(hasTool(state.player, "bow")).toBe(false);
    expect(qty(state.player.pack, "log")).toBe(0);
    expect(qty(state.player.pack, "cordage")).toBe(2);
    expect(state.log.some((e) => e.text.startsWith("The bow is spoiled"))).toBe(true);
  });

  it("a spoiled attempt keeps kilogram needs exact and rounds counts up", () => {
    expect(spoiledNeeds([{ item: "hide", qty: 4 }, { item: "sinew", qty: 2 }])).toEqual([
      { item: "hide", qty: 2 }, { item: "sinew", qty: 1 },
    ]);
  });
});

describe("mastery extras", () => {
  it("spruce felling at mastery 20 gives a fifth stick; at 50 the axe keeps its edge on spruce", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    expect(chopSticks(state, world)).toBe(4);
    state.skills.woodcraft.mastery[key] = masteryMinutes(20);
    expect(chopSticks(state, world)).toBe(5);
    expect(wearFactor(state, world, "chop")).toBe(1);
    state.skills.woodcraft.mastery[key] = masteryMinutes(50);
    expect(wearFactor(state, world, "chop")).toBe(0);
    startTask(state, world, cal, "chop");
    run(g, 200);
    expect(qty(state.player.pack, "stick")).toBe(5);
  });

  it("a hare at mastery 20 keeps its hide whole; at 50 a bone more", () => {
    const { state } = newGame(3);
    expect(huntExtras(state, "hare")).toEqual({ hideKg: 0.2, bone: 1, sinew: 0, injuryFactor: 1 });
    state.skills.hunting.mastery["hunt:hare"] = masteryMinutes(20);
    expect(huntExtras(state, "hare").hideKg).toBe(0.3);
    state.skills.hunting.mastery["hunt:hare"] = masteryMinutes(50);
    expect(huntExtras(state, "hare").bone).toBe(2);
  });

  it("deer and elk: a sinew more at 20, half the injury at 50", () => {
    const { state } = newGame(3);
    state.skills.hunting.xp = levelMinutes(8);
    state.skills.hunting.mastery["hunt:elk"] = masteryMinutes(20);
    expect(huntExtras(state, "elk").sinew).toBe(7);
    state.skills.hunting.mastery["hunt:elk"] = masteryMinutes(50);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.075, 9);
  });

  it("fish: 0.9 kg per catch at 20, 1.2 at 50", () => {
    const { state } = newGame(3);
    expect(fishKg(state)).toBeCloseTo(0.7, 9);
    state.skills.fishing.mastery.fish = masteryMinutes(20);
    expect(fishKg(state)).toBeCloseTo(0.9, 9);
    state.skills.fishing.mastery.fish = masteryMinutes(50);
    expect(fishKg(state)).toBeCloseTo(1.2, 9);
  });

  it("hide and fur recipes: one sinew fewer at 20, a tenth less hide at 50", () => {
    const { state } = newGame(3);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 6 }, { item: "sinew", qty: 2 }]);
    state.skills.crafting.mastery["craft:hideCoat"] = masteryMinutes(20);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 6 }, { item: "sinew", qty: 1 }]);
    state.skills.crafting.mastery["craft:hideCoat"] = masteryMinutes(50);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 5.5 }, { item: "sinew", qty: 1 }]);
    state.skills.crafting.mastery["craft:furHat"] = masteryMinutes(20);
    // A need that drops to zero is left out rather than listed as 0.
    expect(effectiveNeeds(state, "furHat")).toEqual([{ item: "fur", qty: 1, alt: "hide" }]);
    expect(effectiveNeeds(state, "cordage")).toEqual([{ item: "bark", qty: 3 }]);
  });

  it("crossing 20 logs the extra", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(20) - 1;
    startTask(state, world, cal, "chop");
    run(g, 2);
    expect(state.log.some((e) => e.text.includes("mastery 20") && e.text.includes(EXTRAS["chop:spruce"].at20))).toBe(true);
  });
});

describe("pool yield perks", () => {
  it("Foraging and Fishing get x1.2 at 25% and x1.5 at 95%; other skills stay at 1", () => {
    const { state } = newGame(3);
    expect(yieldFactor(state, "foraging")).toBe(1);
    state.skills.foraging.pool = poolCapacity("foraging") * 0.25;
    expect(yieldFactor(state, "foraging")).toBe(1.2);
    state.skills.foraging.pool = poolCapacity("foraging") * 0.95;
    expect(yieldFactor(state, "foraging")).toBe(1.5);
    state.skills.woodcraft.pool = poolCapacity("woodcraft");
    expect(yieldFactor(state, "woodcraft")).toBe(1);
  });

  it("stone at a full pool is 5 per gather, taken from a real gather rather than the formula alone", () => {
    // No seed's start region ever has an outcrop: findStart requires forest >= 0.45,
    // which leaves no room for rock. Seed 4's world has one two lattice cells over,
    // at region 2405 - reached directly, the way tests place the player anywhere.
    const g = newGame(4);
    const { state, world } = g;
    placeAtSpot(state, world, 2405, "outcrop");
    state.skills.foraging.pool = poolCapacity("foraging");
    expect(startTask(state, world, cal, "stone")).toBe(true);
    run(g, 30);
    expect(qty(state.player.pack, "stone")).toBe(5);
  });

  it("fish at a full pool and mastery 1 catches 0.7 * 1.5 kg", () => {
    const g = newGame(4);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    state.skills.fishing.pool = poolCapacity("fishing");
    expect(startTask(state, world, cal, "fish")).toBe(true);
    run(g, 60);
    // Seed 1's roll in run() misses this cast, so the catch fails and there is
    // nothing in the pack to weigh; assert on the button's figure instead.
    expect(qty(state.player.pack, "fish")).toBe(0);
    expect(check(state, world, cal, "fish").detail).toContain("1.0 kg per catch");
  });

  it("Foraging and Fishing trade the wear perk for yield: full pool means normal wear, not zero", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    state.skills.fishing.pool = poolCapacity("fishing");
    expect(wearFactor(state, world, "fish")).toBe(1);
    state.skills.woodcraft.pool = poolCapacity("woodcraft");
    expect(wearFactor(state, world, "chop")).toBe(0);
  });
});

describe("options carry progression", () => {
  it("every trainable option has a mastery level and share; walks have none", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    state.skills.woodcraft.mastery[masteryKey(state, world, "chop")!] = masteryMinutes(3) + 7;
    const opts = availableTasks(state, world, cal);
    const chop = opts.find((o) => o.id === "chop")!;
    expect(chop.mastery!.level).toBe(3);
    expect(chop.mastery!.share).toBeCloseTo(7 / (masteryMinutes(4) - masteryMinutes(3)), 9);
    expect(opts.find((o) => o.id === "walk")!.mastery).toBeUndefined();
  });

  it("a recommendation reads on the button, and says when you are under it", () => {
    const { state, world } = newGame(3);
    const elk = availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "elk")!;
    expect(elk.recommended).toEqual({ text: "Hunting 8", under: true });
    expect(elk.detail).not.toContain("Hunting 8");
    const cabin = availableTasks(state, world, cal).find((o) => o.id === "build" && o.arg === "cabin")!;
    expect(cabin.detail).toContain("at Building 1 this takes 10.6x as long");
    state.player.tools.push({ id: "knife", durability: 100 });
    const bow = availableTasks(state, world, cal).find((o) => o.id === "craft" && o.arg === "bow")!;
    expect(bow.detail).toContain("6% chance it comes out");
    state.skills.hunting.xp = levelMinutes(8);
    expect(availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "elk")!.recommended!.under).toBe(false);
    expect(availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "hare")!.recommended).toBeUndefined();
  });
});

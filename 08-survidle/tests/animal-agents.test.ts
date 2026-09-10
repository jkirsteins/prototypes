import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { activateWildlife, claimHuntableAnimal, dailyWildlife, emptyWildlife, noteWildlifeSightings, resetWildlifeKnowledge, stepWildlife, takeWildlifeMember, visibleWildlife, wildlifeMembers } from "../src/sim/wildlife-agents";
import { calendar, monthStartDoy } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { setSkillLevel } from "../src/sim/horizon";
import { cellAt, neighbours, regionAt } from "../src/world/gen";
import { advance } from "../src/sim/advance";
import { cellOf } from "../src/sim/position";
import { animalVisualSlot, LEVELS, mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { passable } from "../src/world/route";
import { recognitionHtml } from "../src/ui/wildlife-panel";
import { SPECIES_DEFS } from "../src/sim/species";
import { addItem, pile, qty } from "../src/sim/inventory";
import { beginTask, check } from "../src/sim/tasks";
import { placeAt } from "../src/sim/position";
import { dailyAnimals } from "../src/sim/animals";
import { siteCamp } from "./siting-helpers";
import { resolveCell } from "../src/sim/intent";

function campCell(st: { campCell: number | null }): number {
  if (st.campCell === null) throw new Error("test needs a camp");
  return st.campCell;
}

describe("large animal agents", () => {
  it("moves a routed animal from the entry edge to the exit edge within its visual cell", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    const here = subject.active!.cell;
    const east = here + 1;
    subject.active!.intent = "hunt";
    subject.active!.target = east;
    subject.active!.route = [east];

    const slots = [0, 5, 9].map((minute) => animalVisualSlot(subject, world, minute, 6));
    expect(slots.map((slot) => slot % 6)).toEqual([0, 3, 5]);
    expect(new Set(slots.map((slot) => Math.floor(slot / 6))).size).toBe(1);
  });

  it("lets a wandering animal roam while a resting animal stays put", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.active!.intent = "wander";
    subject.active!.target = null;
    subject.active!.route = [];
    expect(animalVisualSlot(subject, world, 0, 6)).not.toBe(animalVisualSlot(subject, world, 2, 6));
    subject.active!.intent = "rest";
    expect(animalVisualSlot(subject, world, 0, 6)).toBe(animalVisualSlot(subject, world, 8, 6));
  });

  it("keeps every modeled species' social and life-history rules in the catalogue", () => {
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) {
      expect(SPECIES_DEFS[species].agent).toBeDefined();
    }
    expect(SPECIES_DEFS.wolf.agent?.form).toBe("pack");
    expect(SPECIES_DEFS.bear.agent?.form).toBe("individual");
    expect(SPECIES_DEFS.bear.agent?.denMonths).toEqual([10, 2]);
  });
  it("materializes only the current region and never exceeds its populations", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));

    expect(state.wildlife.activeRegion).toBe(state.player.region);
    const active = state.wildlife.subjects.filter((s) => s.active !== null);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(12);
    for (const s of active) {
      expect(s.region).toBe(state.player.region);
      expect(regionAt(world, s.region).cells).toContain(s.active!.cell);
      expect(wildlifeMembers(s)).toBeLessThanOrEqual(Math.floor(regionState(state, world, s.region).pop[s.species] ?? 0));
    }
  });

  it("removes an active bear subject when no whole bear remains in its population", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    expect(state.wildlife.subjects.some((s) => s.species === "bear")).toBe(true);

    st.pop.bear = 0.69;
    activateWildlife(state, world, new Rng(2));
    expect(state.wildlife.subjects.some((s) => s.species === "bear")).toBe(false);
  });

  it("uses social group targets while solitary animals remain individuals", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) st.pop[species] = 0;
    st.pop.deer = 18;
    st.pop.bear = 3;
    activateWildlife(state, world, new Rng(1));

    const deer = state.wildlife.subjects.filter((s) => s.species === "deer");
    expect(deer.length).toBeGreaterThan(1);
    expect(deer.every((s) => wildlifeMembers(s) >= 2 && wildlifeMembers(s) <= 8)).toBe(true);
    expect(state.wildlife.subjects.filter((s) => s.species === "bear").every((s) => wildlifeMembers(s) === 1)).toBe(true);
  });

  it("keeps bears dormant and off the winter map rather than making them easy prey", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));

    const bear = state.wildlife.subjects.find((s) => s.species === "bear");
    expect(bear).toBeDefined();
    expect(bear!.active).toBeNull();
    expect(visibleWildlife(state, world, calendar(state.minute, state.startDoy))).not.toContain(bear);
  });

  it("offers skilled den tracking, then a known winter den POI and distinct den hunt", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    setSkillLevel(state, "hunting", 5);
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    expect(bear.denCell).not.toBeNull();
    const tracking = check(state, world, calendar(state.minute, state.startDoy), "findDen");
    expect(tracking.ok).toBe(true);
    expect(tracking.label).toBe("Find bear den");
    state.wildlife.knownDens[bear.denCell!] = true;
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 2);
    const hunt = check(state, world, calendar(state.minute, state.startDoy), "hunt", "bear");
    expect(hunt.ok).toBe(true);
    expect(hunt.label).toContain("at den");
    expect(resolveCell(state, world, calendar(state.minute, state.startDoy), "hunt", "bear", "nearest").cell).toBe(bear.denCell);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "hunt", "bear", false, new Rng(7))).toBe(true);
    expect(state.task?.wildlifeSubject).toBe(bear.id);
    const away = neighbours(world, bear.denCell!).find((cell) => passable(cellAt(world, cell).terrain) && cellAt(world, cell).region === state.player.region)!;
    placeAt(state, world, away);
    const ui = newUiState();
    ui.zoom = 0;
    const html = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    expect(html).toContain("mk-den");
    expect(html).toMatch(/data-map-info="[^"]*known bear den/);
  });

  it("keeps a known bear den huntable throughout the modeled denning season", () => {
    const { state, world } = newGame(79, monthStartDoy(10));
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    expect(bear.denCell).not.toBeNull();
    state.wildlife.knownDens[bear.denCell!] = true;
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 1);

    const hunt = check(state, world, calendar(state.minute, state.startDoy), "hunt", "bear");
    expect(hunt.ok).toBe(true);
    expect(hunt.label).toContain("at den");
  });

  it("collapses old cells and activates the new current region", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const old = state.player.region;
    const next = regionAt(world, old).neighbours[0].id;
    state.player.region = next;
    regionState(state, world, next);

    activateWildlife(state, world, new Rng(2));

    expect(state.wildlife.activeRegion).toBe(next);
    expect(state.wildlife.subjects.filter((s) => s.region === old).every((s) => s.active === null)).toBe(true);
    expect(state.wildlife.subjects.filter((s) => s.active !== null).every((s) => s.region === next)).toBe(true);
  });

  it("moves on ten-minute detailed ticks and never in aggregate mode", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active);
    expect(subject).toBeDefined();
    subject!.active!.intent = "wander";
    subject!.active!.target = null;

    stepWildlife(state, world, calendar(10), new Rng(4), 10, "aggregate");
    expect(subject!.active).toBeNull();
    expect(state.wildlife.activeRegion).toBeNull();
    state.minute = 20;
    stepWildlife(state, world, calendar(20), new Rng(4), 10, "detailed");
    expect(state.wildlife.lastSpatialTick).toBe(2);
    expect(regionAt(world, state.player.region).cells).toContain(subject!.active!.cell);
  });

  it.each(["campfire", "torch"] as const)("makes wolves steer around a lit %s without despawning", (light) => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    const center = light === "campfire" ? campCell(st) : cellOf(state, world);
    const distance = (cell: number) => Math.abs((cell % world.w) - (center % world.w)) + Math.abs(Math.floor(cell / world.w) - Math.floor(center / world.w));
    const source = regionAt(world, state.player.region).cells.find((cell) => passable(cellAt(world, cell).terrain) && distance(cell) === 3 && neighbours(world, cell).some((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region && distance(n) === 2));
    expect(source).toBeDefined();
    wolf.active!.cell = source!;
    wolf.active!.target = center;
    wolf.active!.intent = "hunt";
    if (light === "campfire") st.fire.lit = true;
    else state.player.torch.lit = true;

    state.minute = 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "detailed");
    expect(state.wildlife.subjects).toContain(wolf);
    expect(distance(wolf.active!.cell)).toBeGreaterThanOrEqual(3);

    st.fire.lit = false;
    state.player.torch.lit = false;
    wolf.active!.cell = source!;
    wolf.active!.target = center;
    state.minute = 20;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "detailed");
    expect(distance(wolf.active!.cell)).toBe(2);
  });

  it("resolves wolf pursuit from positions and decrements prey once", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    st.pop.deer = Math.max(4, st.pop.deer ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    const deer = state.wildlife.subjects.find((s) => s.species === "deer")!;
    const deerCell = regionAt(world, state.player.region).cells.find((cell) => passable(cellAt(world, cell).terrain) && neighbours(world, cell).some((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region))!;
    const wolfCell = neighbours(world, deerCell).find((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region)!;
    deer.active!.cell = deerCell;
    deer.active!.rest = 100;
    wolf.active!.cell = wolfCell;
    wolf.active!.hunger = 100;
    const members = wildlifeMembers(deer);
    const population = st.pop.deer!;
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(wildlifeMembers(deer)).toBe(members - 1);
    expect(st.pop.deer).toBe(population - 1);
    expect(wolf.condition).toBeGreaterThan(70);
  });

  it("warns before a positional night wolf attack", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    state.wildlife.subjects = state.wildlife.subjects.filter((subject) => subject.form !== "herd");
    st.pop.deer = 0;
    st.pop.reindeer = 0;
    st.pop.elk = 0;
    const playerCell = cellOf(state, world);
    wolf.active!.cell = neighbours(world, playerCell).find((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region)!;
    wolf.active!.hunger = 100;
    state.survivors[state.survivors.length - 1].person.quirks = [];
    const night = calendar(16 * 60, state.startDoy);

    state.minute = 16 * 60;
    stepWildlife(state, world, night, new Rng(3), 10, "detailed");
    expect(state.player.health).toBe(100);
    expect(state.log.some((entry) => entry.text.includes("Wolves"))).toBe(true);

    state.minute += 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(state.player.health).toBeLessThan(100);
  });

  it("will not attack from the survivor's cell through fire or a carried torch", () => {
    for (const light of ["fire", "torch"] as const) {
      const { state, world } = newGame(79);
      siteCamp(state, world);
      const st = regionState(state, world, state.player.region);
      st.pop.wolf = 4;
      activateWildlife(state, world, new Rng(1));
      const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
      state.wildlife.subjects = [wolf];
      wolf.active!.cell = cellOf(state, world);
      wolf.active!.hunger = 100;
      if (light === "fire") st.fire.lit = true;
      else state.player.torch.lit = true;
      state.minute = 16 * 60;

      stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
      expect(state.player.health).toBe(100);
      expect(wolf.active!.intent).toBe("flee");
    }
  });

  it("reconciles a local successful hunt without double-counting aggregate population", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.species === "deer")!;
    const members = wildlifeMembers(subject);
    const population = regionState(state, world, state.player.region).pop.deer!;

    expect(takeWildlifeMember(state, "deer")).toBe(subject);
    expect(wildlifeMembers(subject)).toBe(members - 1);
    expect(regionState(state, world, state.player.region).pop.deer).toBe(population);

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "aggregate");
    expect(takeWildlifeMember(state, "deer")).toBe(subject);
    expect(wildlifeMembers(subject)).toBe(members - 2);
  });

  it("cannot claim a fractional animal or harvest more whole animals than exist", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    const cell = cellOf(state, world);
    st.pop.hare = 1.69;

    expect(claimHuntableAnimal(state, world, "hare", cell)).toBe(true);
    expect(st.pop.hare).toBeCloseTo(0.69, 9);
    expect(claimHuntableAnimal(state, world, "hare", cell)).toBe(false);
    expect(st.pop.hare).toBeCloseTo(0.69, 9);
  });

  it("requires a targeted wildlife subject to exist before claiming its animal", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.deer = 2.4;
    expect(claimHuntableAnimal(state, world, "deer", cellOf(state, world), 99999)).toBe(false);
    expect(st.pop.deer).toBeCloseTo(2.4, 9);
  });

  it("does not claim a represented animal from another cell", () => {
    const { state, world } = newGame(79);
    const region = state.player.region;
    const st = regionState(state, world, region);
    st.pop.deer = 2;
    activateWildlife(state, world, new Rng(1));
    const deer = state.wildlife.subjects.find((subject) => subject.species === "deer")!;
    const encounter = regionAt(world, region).cells.find((cell) => cell !== deer.active?.cell)!;

    expect(claimHuntableAnimal(state, world, "deer", encounter)).toBe(false);
    expect(wildlifeMembers(deer)).toBe(2);
    expect(st.pop.deer).toBe(2);
  });

  it("claims a represented animal only at its encounter cell", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.deer = 2;
    activateWildlife(state, world, new Rng(1));
    const deer = state.wildlife.subjects.find((subject) => subject.species === "deer")!;

    expect(claimHuntableAnimal(state, world, "deer", deer.active!.cell)).toBe(true);
    expect(st.pop.deer).toBe(1);
    expect(wildlifeMembers(deer)).toBe(1);
  });

  it("conserves aggregate animals across claims and explicit regional movement", () => {
    const { state, world } = newGame(79);
    const home = state.player.region;
    const neighbour = regionAt(world, home).neighbours.find((candidate) => regionAt(world, candidate.id).capacity.deer);
    expect(neighbour).toBeDefined();
    const a = regionState(state, world, home);
    const b = regionState(state, world, neighbour!.id);
    a.pop.deer = 3.6;
    b.pop.deer = 1.2;
    const starting = a.pop.deer + b.pop.deer;

    expect(claimHuntableAnimal(state, world, "deer", cellOf(state, world))).toBe(true);
    const afterHarvest = a.pop.deer + b.pop.deer;
    expect(afterHarvest).toBeCloseTo(starting - 1, 9);

    dailyAnimals(state, world, calendar(1440 * 220), new Rng(4), null);
    expect(a.pop.deer + b.pop.deer).toBeCloseTo(afterHarvest, 9);
  });

  it("is wired into advance only when detailed mode is requested", () => {
    const detailed = newGame(79);
    const aggregate = newGame(79);
    advance(detailed.state, detailed.world, 11, { wildlife: "detailed" });
    advance(aggregate.state, aggregate.world, 11, { wildlife: "aggregate" });
    expect(detailed.state.wildlife.subjects.some((s) => s.active)).toBe(true);
    expect(aggregate.state.wildlife.subjects).toHaveLength(0);
  });

  it("keeps a twelve-subject spatial tick below the frame budget", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf"] as const) st.pop[species] = 24;
    activateWildlife(state, world, new Rng(1));
    expect(state.wildlife.subjects.filter((subject) => subject.active).length).toBe(12);
    const started = performance.now();
    for (let tick = 1; tick <= 10; tick++) {
      state.minute = tick * 10;
      stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(tick), 10, "detailed");
    }
    expect((performance.now() - started) / 10).toBeLessThan(16);
  });

  it("turns a pregnant group's birth into a real cohort and population", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const herd = state.wildlife.subjects.find((s) => s.species === "deer")!;
    herd.reproductive = "pregnant";
    const before = wildlifeMembers(herd);
    const pop = regionState(state, world, herd.region).pop.deer!;
    dailyWildlife(state, world, calendar(35 * 1440, state.startDoy), new Rng(3));
    expect(state.wildlife.subjects.filter((subject) => subject.species === "deer").reduce((sum, subject) => sum + wildlifeMembers(subject), 0)).toBeGreaterThan(before);
    expect(regionState(state, world, herd.region).pop.deer).toBeGreaterThan(pop);
    expect(herd.reproductive).toBe("dependent");
  });

  it("splits an oversized social group without changing its total population", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) st.pop[species] = 0;
    st.pop.deer = 10;
    activateWildlife(state, world, new Rng(1));
    const groups = state.wildlife.subjects.filter((subject) => subject.species === "deer");
    groups[0].cohorts[0].count = 10;
    state.wildlife.subjects = [groups[0]];
    const before = st.pop.deer;

    dailyWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3));
    const after = state.wildlife.subjects.filter((subject) => subject.species === "deer");
    expect(after.length).toBe(2);
    expect(after.every((subject) => wildlifeMembers(subject) <= 8)).toBe(true);
    expect(after.reduce((sum, subject) => sum + wildlifeMembers(subject), 0)).toBe(10);
    expect(st.pop.deer).toBe(before);
  });

  it("lets a hungry solitary predator take exposed camp meat unless fire deters it", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    const camp = campCell(st);
    bear.active!.cell = camp;
    bear.active!.hunger = 100;
    addItem(pile(state, camp), "rawMeat", 3);
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(qty(pile(state, camp), "rawMeat")).toBeLessThan(3);
    expect(state.log.some((e) => e.text.includes("brown bear") && e.text.includes("meat"))).toBe(true);
  });

  it("does not turn fire into an absolute bear-proof bubble", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    st.fire.lit = true;
    st.rack.kg = 3;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    bear.active!.cell = campCell(st);
    bear.active!.hunger = 100;
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(st.rack.kg).toBeLessThan(3);
  });

  it("applies predator food risk in aggregate catch-up without spatial subjects", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    regionAt(world, state.player.region).capacity.bear = 100;
    st.pop.bear = 100;
    st.rack.kg = 3;
    for (let day = 0; day < 2000 && st.rack.kg === 3; day++) {
      dailyWildlife(state, world, calendar(day * 1440, state.startDoy), new Rng(day), "aggregate");
    }
    expect(st.rack.kg).toBe(2);
    expect(state.wildlife.subjects).toHaveLength(0);
  });

  it("does not draw aggregate theft randomness for an empty camp", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    delete state.piles[campCell(st)];
    st.rack.kg = 0;
    const before = new Rng(9123);
    const actual = new Rng(9123);
    dailyWildlife(state, world, calendar(state.minute, state.startDoy), actual, "aggregate");
    expect(actual.s).toBe(before.s);
  });

  it("keeps a persistent denning bear in the population when it emerges", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    for (const monthDay of [120, 150]) {
      const cal = calendar(12 * 60, monthDay);
      dailyAnimals(state, world, cal, new Rng(monthDay), null);
      dailyWildlife(state, world, cal, new Rng(monthDay));
    }
    expect(state.wildlife.subjects).toContain(bear);
    expect(st.pop.bear).toBeGreaterThanOrEqual(1);
  });
});

describe("animal recognition", () => {
  it("credits at most once a day and recognizes faster with Hunting skill", () => {
    const { state, world } = newGame(79);
    state.wildlife = emptyWildlife();
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    setSkillLevel(state, "hunting", 11);

    noteWildlifeSightings(state, [subject.id], 1);
    noteWildlifeSightings(state, [subject.id], 1);
    expect(state.wildlife.familiarity[subject.id].points).toBe(3);
    expect(subject.name).toBeNull();
    noteWildlifeSightings(state, [subject.id], 2);

    expect(subject.name).not.toBeNull();
    expect(state.wildlife.recognitionQueue).toEqual([subject.id]);
    expect(recognitionHtml(state, subject.id)).toContain("You recognize this animal");
    expect(recognitionHtml(state, subject.id)).toContain(subject.name!);
  });

  it("drops a pending recognition when that subject dies", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.species === "bear") ?? state.wildlife.subjects[0];
    subject.cohorts = [{ sex: "m", bornYear: 1, count: 1 }];
    state.wildlife.recognitionQueue = [subject.id];
    takeWildlifeMember(state, subject.species, subject.id);
    expect(state.wildlife.recognitionQueue).toEqual([]);
  });

  it("gives an heir a hidden head start but requires a sighting in this life", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.name = "Mora";
    state.wildlife.recognized[subject.id] = true;
    state.survivors[0].events.push({ kind: "animalRecognized", subject: subject.id, name: "Mora", day: 2, date: { year: 1, doy: 93 } });

    resetWildlifeKnowledge(state);
    expect(state.wildlife.inherited[subject.id]).toBe(3);
    expect(state.wildlife.recognized[subject.id]).toBeUndefined();
    expect(state.wildlife.recognitionQueue).toEqual([]);
    expect(state.wildlife.lastSpatialTick).toBe(-1);

    setSkillLevel(state, "hunting", 11);
    noteWildlifeSightings(state, [subject.id], 3);
    expect(state.wildlife.recognized[subject.id]).toBe(true);
    expect(subject.name).toBe("Mora");
    expect(state.wildlife.recognitionQueue).toEqual([subject.id]);
  });

  it("shows only currently visible subjects and gives a named subject its accent", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.active!.cell = neighbours(world, cellOf(state, world)).find((c) => passable(cellAt(world, c).terrain) && cellAt(world, c).region === state.player.region)!;
    const cal = calendar(state.minute, state.startDoy);
    expect(visibleWildlife(state, world, cal).map((s) => s.id)).toContain(subject.id);

    subject.name = "Mora";
    state.wildlife.recognized[subject.id] = true;
    const close = newUiState();
    close.zoom = 0;
    const html = mapHtml(world, state, close, cal);
    expect(html).toContain("mk-animal");
    expect(html).toContain("Mora");
    expect(html).toContain(`wildlife-${subject.colour}`);
    const marker = html.match(new RegExp(`data-wildlife-id="${subject.id}"[^>]*data-visual-slot="(\\d+)"`));
    expect(marker).not.toBeNull();
    if (!marker) throw new Error("expected a visual wildlife slot");
    expect(Number(marker[1])).toBeLessThan(LEVELS[0].detail ** 2);

    close.zoom = 3;
    expect(mapHtml(world, state, close, cal)).not.toContain("mk-animal");
  });

  it("round-trips version 8 and fills older saves with empty wildlife", () => {
    const { state } = newGame(79);
    const current = JSON.parse(serialize(state));
    expect(current.version).toBe(8);
    expect(deserialize(JSON.stringify(current))!.state.wildlife).toEqual(state.wildlife);

    current.version = 7;
    delete current.state.wildlife;
    const old = deserialize(JSON.stringify(current));
    expect(old!.state.wildlife).toEqual(emptyWildlife());
  });
});

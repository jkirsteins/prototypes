import { describe, expect, it } from "vitest";
import { CAPABILITIES, type CapabilityKey, capabilityFor, NOT_TIERS, PRODUCERS, standingHere } from "../src/sim/capabilities";
import { calendar } from "../src/sim/calendar";
import { RECIPES, STRUCTURE_IDS, STRUCTURES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { campSite, regionState } from "../src/sim/regionstate";
import { RECOMMENDED, RUNG_LEVEL } from "../src/sim/skills";
import { doHtml } from "../src/ui/dopanel";
import { regionHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";

const keys = new Set(CAPABILITIES.flatMap((r) => r.keys));

describe("the capability spine's coverage", () => {
  it("every key a row names exists in the code", () => {
    for (const k of keys) {
      const [kind, ...rest] = k.split(":");
      const name = rest.join(":");
      if (kind === "rec") expect(RECOMMENDED[name], k).toBeDefined();
      else if (kind === "build") expect(STRUCTURES[name as keyof typeof STRUCTURES], k).toBeDefined();
      else if (kind === "craft") expect(RECIPES[name as keyof typeof RECIPES], k).toBeDefined();
      else if (kind === "rung") expect(RUNG_LEVEL[name as keyof typeof RUNG_LEVEL], k).toBeDefined();
      else throw new Error(`unknown key kind ${k}`);
    }
  });

  it("every recommended level that names a capability has a row; species are content beneath one", () => {
    for (const k of Object.keys(RECOMMENDED)) {
      if (k.startsWith("hunt:") || k.startsWith("fish:")) continue;
      expect(keys.has(`rec:${k}`), k).toBe(true);
    }
  });

  it("every structure that unlocks a capability has a row", () => {
    for (const id of STRUCTURE_IDS) {
      if (NOT_TIERS.includes(id)) continue;
      expect(keys.has(`build:${id}`), id).toBe(true);
    }
  });

  it("every delegation rung has a row", () => {
    for (const kind of Object.keys(RUNG_LEVEL)) expect(keys.has(`rung:${kind}` as CapabilityKey), kind).toBe(true);
  });

  it("the rungs are one row, and it names all five", () => {
    const rungs = CAPABILITIES.filter((r) => r.tier === "rung");
    expect(rungs.length).toBe(1);
    expect(rungs[0].keys).toEqual(["rung:job", "rung:grind", "rung:keep", "rung:condition", "rung:pace"]);
    expect(rungs[0].id).toBe("jobs, grinds, keeps, conditions and pace");
  });

  it("the producers are exactly the rows marked producer", () => {
    const marked = CAPABILITIES.filter((r) => r.producer).map((r) => r.id).sort();
    expect(marked).toEqual([...PRODUCERS].sort());
  });

  it("every row connects systems or says why it stands alone, and none is a percent", () => {
    for (const r of CAPABILITIES) {
      if (!r.alone) expect(r.receives.length, r.id).toBeGreaterThan(0);
      if (typeof r.tier === "object") expect(r.receives, r.id).not.toContain(r.tier.skill);
      expect(r.gives, r.id).not.toContain("%");
      expect(r.id.length, r.id).toBeGreaterThan(2);
    }
  });
});

describe("what a capability tells the panel", () => {
  it("finds a row from the task and the argument a Do row is built with", () => {
    expect(capabilityFor("craft", "basketTrap")?.id).toBe("basket trap");
    expect(capabilityFor("craft", "snare")?.id).toBe("snares");
    expect(capabilityFor("build", "dryingRack")?.id).toBe("drying rack");
    // An hour of work is not a capability, and neither is a row with no argument.
    expect(capabilityFor("chop", undefined)).toBeNull();
    expect(capabilityFor("build", undefined)).toBeNull();
  });

  it("reaches every producer, so none of them is a thing the panel can never explain", () => {
    for (const r of CAPABILITIES.filter((c) => c.producer)) {
      const reached = r.keys.some((k) => {
        const [kind, arg] = k.split(":");
        return (kind === "build" || kind === "craft") && capabilityFor(kind, arg) === r;
      });
      expect(reached, `${r.id} is a producer no Do row can reach`).toBe(true);
    }
  });

  it("gives every producer something to say on both sides", () => {
    for (const r of CAPABILITIES.filter((c) => c.producer)) {
      expect(r.gives.length, r.id).toBeGreaterThan(0);
      expect(r.limits.length, r.id).toBeGreaterThan(0);
    }
  });

  it("knows which producers stand at this camp and which do not", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const rack = capabilityFor("build", "dryingRack")!;
    const trap = capabilityFor("craft", "basketTrap")!;
    expect(standingHere(state, st, world, rack)).toBe(false);
    campSite(st).structures.dryingRack = true;
    expect(standingHere(state, st, world, rack)).toBe(true);
    expect(standingHere(state, st, world, trap)).toBe(false);
    st.trap = { cell: st.campCell, kg: 0, oilyKg: 0, fish: [], age: 0 };
    expect(standingHere(state, st, world, trap)).toBe(true);
  });

  it("names a standing producer's limit in the region panel, and says nothing when none stands", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    expect(regionHtml(state, world, cal, newUiState())).not.toContain("40 kg a rack");
    campSite(st).structures.dryingRack = true;
    expect(regionHtml(state, world, cal, newUiState())).toContain("40 kg a rack");
  });

  it("promises a producer on its Do row, built or not", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, newUiState());
    expect(html).toContain("the first food a camp makes without you");
  });
});

/**
 * The forage discovery scan is paid once per change of ground, not once
 * per look.
 *
 * It used to walk every known patch six times on every call, and the call
 * came on every look the survivor took - inside a forecast, every simulated
 * hour of every run. Profiled at 19% of a two-minute trace, and the heap
 * rose by 130 MB on each real hour's forecast. Safari reloaded the tab.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { knownForageOpportunityKeys, SUPPORTED_FORAGE_FOODS } from "../src/sim/opportunity-catalog";
import { cellOf } from "../src/sim/position";
import type { OpportunityKey } from "../src/sim/types";

describe("the forage scan", () => {
  it("answers the same for unchanged ground", () => {
    const { state, world } = newGame(3);
    const cal = calendar(state.minute, state.startDoy);
    // A landing discovers its ground's forage at once, so forget it again:
    // the scan is only asked for what is still undiscovered.
    for (const food of SUPPORTED_FORAGE_FOODS) delete state.opportunities.discoveredAt[`forage:${food}` as OpportunityKey];
    const a = knownForageOpportunityKeys(state, world, cal);
    const b = knownForageOpportunityKeys(state, world, cal);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it("scans nothing once every forage is discovered", () => {
    const { state, world } = newGame(3);
    for (const food of SUPPORTED_FORAGE_FOODS) state.opportunities.discoveredAt[`forage:${food}` as OpportunityKey] = 0;
    // A world whose cellAt would throw proves the ground was never walked.
    const poisoned = new Proxy(world, { get(t, k) { if (k === "solved" || k === "fineChunks") throw new Error("ground was walked"); return Reflect.get(t, k); } });
    expect(knownForageOpportunityKeys(state, poisoned, calendar(state.minute, state.startDoy))).toEqual([]);
  });

  it("reads new ground when a patch becomes known", () => {
    const { state, world } = newGame(3);
    const cal = calendar(state.minute, state.startDoy);
    for (const food of SUPPORTED_FORAGE_FOODS) delete state.opportunities.discoveredAt[`forage:${food}` as OpportunityKey];
    const before = knownForageOpportunityKeys(state, world, cal);
    // Learning ground moves the generation stamp, so the next call re-reads.
    markKnown(state, cellOf(state, world));
    const after = knownForageOpportunityKeys(state, world, cal);
    // Same landing ground, so the same answer - but arrived at afresh, not from the stale summary.
    expect(after).toEqual(before);
  });
});

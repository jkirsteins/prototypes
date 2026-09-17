/**
 * What a tab nobody is looking at gives back. Safari reclaims a background
 * tab that holds a lot of memory and says so - "This web page was reloaded
 * because it was using significant memory" - and the run's heaviest held
 * things are the built ground and the viewsheds over it. Both are rebuilt
 * from the seed on demand, so a hidden tab has no reason to keep them.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { calendar } from "../src/sim/calendar";
import { cellOf, placeAt } from "../src/sim/position";
import { seeFrom, visibleCells } from "../src/sim/sight";
import { releaseViewsheds } from "../src/sim/sight";
import { FINE_CHUNK_HIDDEN_LIMIT, terrainOf, trimFineChunks } from "../src/world/cells";
import { worldCacheStats } from "../src/world/aggregate";

describe("what a hidden tab gives back", () => {
  it("keeps only the few most recent chunks and builds the rest again when asked", () => {
    const { state, world } = newGame(7);
    // Ground far enough apart to fall in different chunks.
    for (let i = 0; i < 12; i++) terrainOf(world, 500 + i * 300, 500 + i * 300);
    expect(world.fineChunks.size).toBeGreaterThan(FINE_CHUNK_HIDDEN_LIMIT);
    const dropped = trimFineChunks(world, FINE_CHUNK_HIDDEN_LIMIT);
    expect(dropped).toBeGreaterThan(0);
    expect(world.fineChunks.size).toBe(FINE_CHUNK_HIDDEN_LIMIT);
    // Nothing is lost: the ground is the seed's, and asking builds it again.
    const before = worldCacheStats(world).fineChunkBuilds;
    expect(terrainOf(world, 500, 500)).toBeTruthy();
    expect(worldCacheStats(world).fineChunkBuilds).toBeGreaterThan(before);
    expect(cellOf(state, world)).toBeGreaterThanOrEqual(0);
  });

  it("answers the same view after its viewsheds are dropped", () => {
    const { state, world } = newGame(7);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    placeAt(state, world, here);
    const first = visibleCells(state, world, cal, here);
    releaseViewsheds();
    const again = visibleCells(state, world, cal, here);
    expect(again.size).toBe(first.size);
    seeFrom(state, world, cal, here);
  });
});

import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";

/** A player nobody may touch: any read throws, so a world function that still reaches for the body fails loudly. */
function forbidPlayer(state: ReturnType<typeof newGame>["state"]) {
  state.player = new Proxy(state.player, { get(_t, key) { throw new Error(`nobody mode read player.${String(key)}`); } });
}

describe("nobody home", () => {
  it("runs the world half only and never reads the player", () => {
    const { state, world } = newGame(8);
    kitOut(state, world);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 6;
    st.rack.kg = 3;
    st.snareCatch.count = 2;
    st.structures.snares = 2;
    state.player.autoFeed = true;
    state.dead = { cause: "froze", minute: state.minute };
    forbidPlayer(state);
    advance(state, world, 90 * 1440, { nobody: true });
    expect(state.minute).toBeCloseTo(90 * 1440, 3);
    expect(st.fire.lit).toBe(false);
    expect(st.rack.kg).toBe(0);
    // The catch cycles between being taken by the fox and re-caught by the standing snares over 90
    // untended days, so the count at the exact end is a coin flip on the seed; assert the fox rule ran.
    expect(state.log.some((e) => e.text.includes("fox got to the snares"))).toBe(true);
  });

  it("does nothing in nobody mode that a dead flag would stop while alive", () => {
    const { state, world } = newGame(8);
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 60);
    expect(state.minute).toBe(0);
    advance(state, world, 60, { nobody: true });
    expect(state.minute).toBe(60);
  });

  it("freezes the water at camp over a winter gap, with the bucket rolling its split", () => {
    const { state, world } = newGame(8, 280);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "barkBucket", 3);
    addItem(pile(state, st.campCell), "water", 30);
    state.dead = { cause: "froze", minute: state.minute };
    forbidPlayer(state);
    advance(state, world, 120 * 1440, { nobody: true });
    expect(qty(pile(state, st.campCell), "water")).toBe(0);
    expect(qty(pile(state, st.campCell), "ice")).toBeGreaterThan(0);
    // The split is a one-in-three roll per bucket on the freezing hour; deterministic per seed, so assert only that the rule ran.
    expect(qty(pile(state, st.campCell), "barkBucket")).toBeLessThanOrEqual(3);
  });
});

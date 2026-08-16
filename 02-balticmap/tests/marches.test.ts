import { describe, expect, it } from "vitest";
import {
  addMarch, armiesOn, axisKeyOf, axesOf,
  clearMarches, freeArmiesOn, marchesFrom, resolveAxis,
  type March, type Marches,
} from "../src/marches";

/** Autoincrementing so two calls with no explicit `id` still get distinct
 *  keys - the same "never reused" property `GameState.nextMarchId` gives the
 *  real game, kept here so a test that does not care about ids does not have
 *  to name one. */
let nextTestMarchId = 1;
const march = (over: Partial<March> = {}): March => ({
  id: nextTestMarchId++, actor: "selonians", from: "selija", to: "talava",
  cardId: "raid", damage: 4, holdsArmy: true, declared: 1, expiry: 3, ...over,
});

/** This module takes a land's army cap as a plain argument now - it knows
 *  nothing of defense scores, only src/defense.ts's `armyCapFor` derives one
 *  from a real ceiling. 1 throughout, the same "one army per land" default
 *  the old ARMIES_PER_POLYGON constant stood in for. */
const CAP = 1;

describe("armies", () => {
  it("reads an absent polygon as the default rather than zero", () => {
    expect(armiesOn({}, "selija", CAP)).toBe(CAP);
    expect(armiesOn({ selija: 3 }, "selija", CAP)).toBe(3);
    expect(armiesOn({ selija: 0 }, "selija", CAP)).toBe(0);
  });

  it("clamps a hand-edited negative count to zero", () => {
    expect(armiesOn({ selija: -2 }, "selija", CAP)).toBe(0);
  });

});

describe("free armies", () => {
  it("counts a declared march as holding its source's army", () => {
    const marches = addMarch({}, march());
    expect(freeArmiesOn({}, marches, "selija", CAP)).toBe(0);
    expect(freeArmiesOn({ selija: 2 }, marches, "selija", CAP)).toBe(1);
  });

  it("never goes negative when more marches leave than armies remain", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ to: "talava" }));
    marches = addMarch(marches, march({ to: "latgale" }));
    expect(freeArmiesOn({}, marches, "selija", CAP)).toBe(0);
  });

  it("does not charge the target for a march aimed at it", () => {
    const marches = addMarch({}, march());
    expect(freeArmiesOn({}, marches, "talava", CAP)).toBe(CAP);
  });

  it("charges one army for a whole fan, not one per arrow", () => {
    // Great raid: one sally out of selija, three arrows. Only the first holds
    // the army, so a land with two armies still has one left over.
    let marches: Marches = {};
    marches = addMarch(marches, march({ to: "talava", holdsArmy: true }));
    marches = addMarch(marches, march({ to: "latgale", holdsArmy: false }));
    marches = addMarch(marches, march({ to: "zemgale", holdsArmy: false }));
    expect(freeArmiesOn({}, marches, "selija", CAP)).toBe(0);
    expect(freeArmiesOn({ selija: 2 }, marches, "selija", CAP)).toBe(1);
  });
});

describe("addMarch", () => {
  it("keys a march by its own id", () => {
    const marches = addMarch(addMarch({}, march({ id: 7 })), march({ id: 8 }));
    expect(Object.keys(marches).sort()).toEqual(["7", "8"]);
  });

  it("never hands a cleared march's key to a later one", () => {
    // The whole point of the id. The old scheme allocated the lowest FREE
    // slot, so this sequence produced the same key twice for two different
    // armies, and anything keyed on it followed the wrong arrow.
    const first = addMarch({}, march({ id: 1 }));
    const afterClear = clearMarches(first, ["1"]);
    const second = addMarch(afterClear, march({ id: 2 }));
    expect(Object.keys(second)).toEqual(["2"]);
  });
});

describe("marchesFrom", () => {
  const marches = [
    march({ from: "selija", to: "talava" }),
    march({ from: "latgale", to: "talava" }),
    march({ from: "talava", to: "selija", actor: "latgalians" }),
  ].reduce<Marches>((m, x) => addMarch(m, x), {});

  it("picks out the arrows this polygon sent, and no arrow aimed at it", () => {
    expect(marchesFrom(marches, "selija").map((m) => m.to)).toEqual(["talava"]);
    expect(marchesFrom(marches, "talava").map((m) => m.to)).toEqual(["selija"]);
  });
});

describe("axesOf", () => {
  it("names an axis by its two polygons sorted, whichever way the march runs", () => {
    expect(axisKeyOf("talava", "selija")).toBe(axisKeyOf("selija", "talava"));
  });

  it("puts the two directions of one axis on opposite sides", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ from: "selija", to: "talava", damage: 4 }));
    marches = addMarch(marches, march({
      from: "talava", to: "selija", actor: "talavans", damage: 6,
    }));
    const axes = axesOf(marches);
    expect(axes).toHaveLength(1);
    expect(axes[0].a).toBe("selija");
    expect(axes[0].b).toBe("talava");
    expect(axes[0].fromA.map((m) => m.damage)).toEqual([4]);
    expect(axes[0].fromB.map((m) => m.damage)).toEqual([6]);
  });

  it("names the side that declared first as the one that opened", () => {
    let marches: Marches = {};
    // Inserted in reverse of declaration order, and tied on expiry (left at
    // the factory default), so a reader still keyed on expiry falls through
    // to the insertion-order tie-break and picks the WRONG side (b, inserted
    // first) - only a reader of `declared` picks a (declared first, but
    // inserted second).
    marches = addMarch(marches, march({ from: "talava", to: "selija", declared: 5 }));
    marches = addMarch(marches, march({ from: "selija", to: "talava", declared: 1 }));
    expect(axesOf(marches)[0].opening).toBe("a");
  });

  it("reads the opening side off the declaration, not the arrival", () => {
    // A far attack declared first and a near answer declared later can land on
    // the SAME turn once travel time exists. The opening side is the one that
    // started the quarrel, which only `declared` knows.
    //
    // Both marches expire on the same turn, so a reader still keyed on
    // `expiry` falls through to the insertion-order tie-break - and a
    // `Marches` record's integer-like keys enumerate in ASCENDING id order
    // regardless of call order (see the `Marches` doc comment), so the
    // smaller id is what that tie-break actually favours. Giving the smaller
    // id to the LATER-declared march (side b) means the two readings
    // disagree: an expiry-tie-then-insertion-order reader picks b, and a
    // declared-order reader picks a.
    let marches: Marches = {};
    marches = addMarch(marches, march({
      id: 1, from: "talava", to: "selija", declared: 3, expiry: 4,
    }));
    marches = addMarch(marches, march({
      id: 2, from: "selija", to: "talava", declared: 1, expiry: 4,
    }));
    const [axis] = axesOf(marches);
    expect(axis.opening).toBe(axis.a === "selija" ? "a" : "b");
  });

  it("falls back to declaration order for two declared in the same round", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ from: "talava", to: "selija", declared: 2 }));
    marches = addMarch(marches, march({ from: "selija", to: "talava", declared: 2 }));
    expect(axesOf(marches)[0].opening).toBe("b");
    // And the other way round, so the tie-break is really being read.
    let other: Marches = {};
    other = addMarch(other, march({ from: "selija", to: "talava", declared: 2 }));
    other = addMarch(other, march({ from: "talava", to: "selija", declared: 2 }));
    expect(axesOf(other)[0].opening).toBe("a");
  });

  it("calls a one-sided axis its own opener", () => {
    expect(axesOf(addMarch({}, march())) [0].opening).toBe("a");
    expect(axesOf(addMarch({}, march({ from: "talava", to: "selija" })))[0].opening)
      .toBe("b");
  });

  it("orders axes deterministically, not by declaration order", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ from: "zemgale", to: "selija" }));
    marches = addMarch(marches, march({ from: "aizkraukle", to: "selija" }));
    expect(axesOf(marches).map((x) => `${x.a}|${x.b}`))
      .toEqual(["aizkraukle|selija", "selija|zemgale"]);
  });
});

describe("resolveAxis", () => {
  /** The two facts each pairing is judged on, without the marches themselves -
   *  which land takes it, and how much. */
  const hits = (out: ReturnType<typeof resolveAxis>) =>
    out.map((e) => ({ loser: e.loser, delta: e.delta }));

  it("lands an uncontested march's full strength on its target", () => {
    expect(hits(resolveAxis("selija", "talava", [march({ damage: 4 })], [])))
      .toEqual([{ loser: "talava", delta: 4 }]);
  });

  it("deducts the weaker counter and lands only the leftover", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 10 })],
      [march({ from: "talava", to: "selija", damage: 4 })],
    );
    expect(hits(out)).toEqual([{ loser: "talava", delta: 6 }]);
    // The army that got through is the one that walks in on a broken land.
    expect(out[0].spear?.damage).toBe(10);
  });

  it("throws the stronger counter back at the attacker's own land", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 4 })],
      [march({ from: "talava", to: "selija", damage: 10 })],
    );
    expect(hits(out)).toEqual([{ loser: "selija", delta: 6 }]);
  });

  it("cancels an even clash without moving a score", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 5 })],
      [march({ from: "talava", to: "selija", damage: 5 })],
    );
    expect(hits(out)).toEqual([{ loser: null, delta: 0 }]);
    expect(out[0].spear).toBeNull();
  });

  it("pairs the armies off one for one, so both ends can be hit at once", () => {
    // Two Raids answered by one Strong raid. The Strong raid beats the Raid it
    // meets and pushes 1 through; the Raid nobody met pushes 1 back. Summed,
    // this was 2 against 2 and NOTHING happened - the defender's second army
    // evaporated having met no one.
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 1 }), march({ damage: 1 })],
      [march({ from: "talava", to: "selija", damage: 2 })],
    );
    expect(hits(out)).toEqual([
      { loser: "selija", delta: 1 },
      { loser: "talava", delta: 1 },
    ]);
  });

  it("pairs in declaration order, and the leftover meets nobody", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 3 }), march({ damage: 3 })],
      [march({ from: "talava", to: "selija", damage: 5 })],
    );
    expect(hits(out)).toEqual([
      { loser: "selija", delta: 2 },
      { loser: "talava", delta: 3 },
    ]);
    expect(out[1].fromB).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  addArmy, addMarch, ARMIES_PER_POLYGON, armiesOn, axisKeyOf, axesOf,
  clearMarches, freeArmiesOn, marchesAgainst, marchesFrom, resolveAxis,
  type March, type Marches,
} from "../src/marches";

const march = (over: Partial<March> = {}): March => ({
  actor: "selonians", from: "selija", to: "talava",
  cardId: "raid", damage: 4, holdsArmy: true, expiry: 3, ...over,
});

describe("armies", () => {
  it("reads an absent polygon as the default rather than zero", () => {
    expect(armiesOn({}, "selija")).toBe(ARMIES_PER_POLYGON);
    expect(armiesOn({ selija: 3 }, "selija")).toBe(3);
    expect(armiesOn({ selija: 0 }, "selija")).toBe(0);
  });

  it("clamps a hand-edited negative count to zero", () => {
    expect(armiesOn({ selija: -2 }, "selija")).toBe(0);
  });

  it("raises one and keeps the store sparse elsewhere", () => {
    expect(addArmy({}, "selija")).toEqual({ selija: ARMIES_PER_POLYGON + 1 });
    expect(addArmy({ selija: 4 }, "selija")).toEqual({ selija: 5 });
  });
});

describe("free armies", () => {
  it("counts a declared march as holding its source's army", () => {
    const marches = addMarch({}, march());
    expect(freeArmiesOn({}, marches, "selija")).toBe(0);
    expect(freeArmiesOn({ selija: 2 }, marches, "selija")).toBe(1);
  });

  it("never goes negative when more marches leave than armies remain", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ to: "talava" }));
    marches = addMarch(marches, march({ to: "latgale" }));
    expect(freeArmiesOn({}, marches, "selija")).toBe(0);
  });

  it("does not charge the target for a march aimed at it", () => {
    const marches = addMarch({}, march());
    expect(freeArmiesOn({}, marches, "talava")).toBe(ARMIES_PER_POLYGON);
  });

  it("charges one army for a whole fan, not one per arrow", () => {
    // Great raid: one sally out of selija, three arrows. Only the first holds
    // the army, so a land with two armies still has one left over.
    let marches: Marches = {};
    marches = addMarch(marches, march({ to: "talava", holdsArmy: true }));
    marches = addMarch(marches, march({ to: "latgale", holdsArmy: false }));
    marches = addMarch(marches, march({ to: "zemgale", holdsArmy: false }));
    expect(freeArmiesOn({}, marches, "selija")).toBe(0);
    expect(freeArmiesOn({ selija: 2 }, marches, "selija")).toBe(1);
  });
});

describe("addMarch", () => {
  it("keys a second march on the same axis apart from the first", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march());
    marches = addMarch(marches, march({ damage: 9 }));
    expect(Object.keys(marches)).toEqual(["selija>talava#0", "selija>talava#1"]);
  });

  it("reuses a freed slot so keys stay dense and deterministic", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march());
    marches = addMarch(marches, march({ damage: 9 }));
    marches = clearMarches(marches, ["selija>talava#0"]);
    marches = addMarch(marches, march({ damage: 7 }));
    expect(Object.keys(marches).sort()).toEqual([
      "selija>talava#0", "selija>talava#1",
    ]);
    expect(marches["selija>talava#0"].damage).toBe(7);
  });
});

describe("marchesFrom / marchesAgainst", () => {
  const marches = [
    march({ from: "selija", to: "talava" }),
    march({ from: "latgale", to: "talava" }),
    march({ from: "talava", to: "selija", actor: "latgalians" }),
  ].reduce<Marches>((m, x) => addMarch(m, x), {});

  it("splits by which end of the march the polygon sits on", () => {
    expect(marchesFrom(marches, "selija").map((m) => m.to)).toEqual(["talava"]);
    expect(marchesAgainst(marches, "talava").map((m) => m.from))
      .toEqual(["selija", "latgale"]);
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
    // Declared on turn 1 (expiry 2); the answer comes on turn 2 (expiry 3).
    marches = addMarch(marches, march({ from: "talava", to: "selija", expiry: 2 }));
    marches = addMarch(marches, march({ from: "selija", to: "talava", expiry: 3 }));
    // The axis sorts selija before talava, so the opener is side b.
    expect(axesOf(marches)[0].opening).toBe("b");
  });

  it("falls back to declaration order for two declared in the same round", () => {
    let marches: Marches = {};
    marches = addMarch(marches, march({ from: "talava", to: "selija", expiry: 2 }));
    marches = addMarch(marches, march({ from: "selija", to: "talava", expiry: 2 }));
    expect(axesOf(marches)[0].opening).toBe("b");
    // And the other way round, so the tie-break is really being read.
    let other: Marches = {};
    other = addMarch(other, march({ from: "selija", to: "talava", expiry: 2 }));
    other = addMarch(other, march({ from: "talava", to: "selija", expiry: 2 }));
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
  it("lands an uncontested march's full strength on its target", () => {
    expect(resolveAxis("selija", "talava", [march({ damage: 4 })], []))
      .toEqual({ loser: "talava", delta: 4, totalA: 4, totalB: 0 });
  });

  it("deducts the weaker counter and lands only the leftover", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 10 })],
      [march({ from: "talava", to: "selija", damage: 4 })],
    );
    expect(out).toEqual({ loser: "talava", delta: 6, totalA: 10, totalB: 4 });
  });

  it("throws the stronger counter back at the attacker's own land", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 4 })],
      [march({ from: "talava", to: "selija", damage: 10 })],
    );
    expect(out).toEqual({ loser: "selija", delta: 6, totalA: 4, totalB: 10 });
  });

  it("cancels an even clash without moving a score", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 5 })],
      [march({ from: "talava", to: "selija", damage: 5 })],
    );
    expect(out.delta).toBe(0);
    expect(out.loser).toBeNull();
  });

  it("sums each side, so two armies on one axis beat one", () => {
    const out = resolveAxis(
      "selija", "talava",
      [march({ damage: 3 }), march({ damage: 3 })],
      [march({ from: "talava", to: "selija", damage: 5 })],
    );
    expect(out).toEqual({ loser: "talava", delta: 1, totalA: 6, totalB: 5 });
  });
});

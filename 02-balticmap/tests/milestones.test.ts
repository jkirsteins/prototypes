import { describe, it, expect } from "vitest";
import {
  MILESTONES, milestonePoints, milestoneStandings,
} from "../src/milestones";
import {
  beginTurn, chooseBuild, newGame, pickFaction, playCard, startGame,
  type GameEvent, type GameState,
} from "../src/game";
import { DEFAULT_DEFENSE_MAX, SUBJUGATION_GATE } from "../src/defense";
import { seededRng } from "../src/rng";

const SIX = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

/** The human sits on alpha (player id 1); every other seat follows in faction
 *  order. Milestones read the log through `playerId`, so the ids matter. */
function dealt(): GameState {
  return pickFaction(
    chooseBuild(startGame(newGame(SIX)), "warpath", seededRng(1)),
    "alpha", seededRng(1),
  );
}

const idOf = (g: GameState, factionId: string): number =>
  g.players.find((p) => p.factionId === factionId)!.id;

/** Appends log entries as they would have been logged - the run history the
 *  "how many different lands have you ever" milestones read. */
function logged(
  g: GameState, factionId: string, events: Partial<GameEvent>[],
): GameState {
  return {
    ...g,
    log: [
      ...g.log,
      ...events.map((e) => ({
        turn: g.turn, playerId: idOf(g, factionId), type: "play" as const, ...e,
      })),
    ],
  };
}

const standingOf = (
  g: GameState, acting: string[], focus: string, id: string,
) => milestoneStandings(g, acting, focus).find((s) => s.milestone.id === id)!;

describe("the milestone table", () => {
  it("gives every milestone a name, a line of text, points and a goal", () => {
    for (const m of MILESTONES) {
      expect(m.name.length, m.id).toBeGreaterThan(0);
      expect(m.text.length, m.id).toBeGreaterThan(0);
      expect(m.points, m.id).toBeGreaterThan(0);
      expect(m.goal, m.id).toBeGreaterThan(0);
      expect(typeof m.progress, m.id).toBe("function");
    }
  });

  it("gives every milestone a distinct id", () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads a fresh world as nobody having reached anything", () => {
    const g = dealt();
    for (const m of MILESTONES) {
      expect(m.progress(g, "alpha") >= m.goal, m.id).toBe(false);
    }
    expect(milestonePoints(g, "alpha")).toBe(0);
  });
});

describe("milestoneStandings", () => {
  it("clamps the focused faction's progress to the goal and says when it is done", () => {
    const wide = MILESTONES.find((m) => m.id === "wide-realm")!;
    const g = {
      ...dealt(),
      overlords: new Map(
        ["beta", "gamma", "delta", "epsilon", "zeta"].map((f) => [f, "alpha"]),
      ),
    };
    // Six lands held against a goal of five: the raw progress overshoots and
    // the row clamps it, because a bar cannot be more than full.
    expect(wide.progress(g, "alpha")).toBe(6);
    const row = standingOf(g, SIX, "alpha", "wide-realm");
    expect(row.progress).toBe(wide.goal);
    expect(row.done).toBe(true);
  });

  it("reports no progress for a screen focused on nobody, badges regardless", () => {
    const g = {
      ...dealt(),
      overlords: new Map(
        ["beta", "gamma", "delta", "epsilon"].map((f) => [f, "alpha"]),
      ),
    };
    const rows = milestoneStandings(g, SIX, undefined);
    const wide = rows.find((r) => r.milestone.id === "wide-realm")!;
    expect(wide.progress).toBe(0);
    expect(wide.done).toBe(false);
    expect(wide.achievedBy).toEqual(["alpha"]);
  });

  it("lists everybody who reached it, in the seat order it was handed", () => {
    const g = {
      ...dealt(),
      overlords: new Map<string, string>([
        ["beta", "alpha"], ["gamma", "alpha"], ["delta", "alpha"],
        ["epsilon", "alpha"],
      ]),
      // zeta annexed four lands of its own, so two factions qualify at once.
      incorporated: {
        eta: "zeta", theta: "zeta", iota: "zeta", kappa: "zeta",
      },
      factionIds: [...SIX, "eta", "theta", "iota", "kappa"],
    };
    // Handed in a deliberately non-alphabetical seat order: the badges follow
    // the table, not a sort of their own.
    const row = standingOf(g, ["zeta", "alpha", "beta"], "alpha", "wide-realm");
    expect(row.achievedBy).toEqual(["zeta", "alpha"]);
  });

  it("races only the factions handed to it - a land that takes no turns races for nothing", () => {
    const g = {
      ...dealt(),
      overlords: new Map(
        ["beta", "gamma", "delta", "epsilon"].map((f) => [f, "alpha"]),
      ),
    };
    expect(standingOf(g, ["beta", "gamma"], "beta", "wide-realm").achievedBy)
      .toEqual([]);
  });

  it("returns one row per milestone, in table order", () => {
    const g = dealt();
    expect(milestoneStandings(g, SIX, "alpha").map((r) => r.milestone.id))
      .toEqual(MILESTONES.map((m) => m.id));
  });
});

describe("milestonePoints", () => {
  it("sums only the milestones actually reached", () => {
    const grown = MILESTONES.find((m) => m.id === "grown")!;
    const founders = MILESTONES.find((m) => m.id === "settled")!;
    let g: GameState = logged(dealt(), "alpha", Array.from(
      { length: grown.goal },
      () => ({ type: "play" as const, cardId: "prosperous-proliferation" }),
    ));
    expect(milestonePoints(g, "alpha")).toBe(grown.points);
    g = logged(g, "alpha", Array.from(
      { length: founders.goal },
      (_, i) => ({ type: "settled" as const, targetFactionId: SIX[i] }),
    ));
    expect(milestonePoints(g, "alpha")).toBe(grown.points + founders.points);
    // Somebody else's run is not yours.
    expect(milestonePoints(g, "beta")).toBe(0);
  });

  it("stops counting one milestone twice however far past the goal it goes", () => {
    const founders = MILESTONES.find((m) => m.id === "settled")!;
    const g = logged(dealt(), "alpha", Array.from(
      { length: founders.goal * 3 },
      () => ({ type: "settled" as const, targetFactionId: "beta" }),
    ));
    expect(milestonePoints(g, "alpha")).toBe(founders.points);
  });
});

describe("A wide realm", () => {
  it("reads the realm as it stands, and goes down when the realm does", () => {
    const wide = MILESTONES.find((m) => m.id === "wide-realm")!;
    const held = new Map(
      ["beta", "gamma", "delta", "epsilon"].map((f) => [f, "alpha"]),
    );
    const g = { ...dealt(), overlords: held };
    expect(wide.progress(g, "alpha")).toBe(5);
    expect(standingOf(g, SIX, "alpha", "wide-realm").done).toBe(true);

    // Two vassals walk off. The only milestone that can go backwards, and
    // deliberately: a realm is held, not banked.
    const lost = new Map(held);
    lost.delete("delta");
    lost.delete("epsilon");
    const after = { ...g, overlords: lost };
    expect(wide.progress(after, "alpha")).toBe(3);
    expect(standingOf(after, SIX, "alpha", "wide-realm").done).toBe(false);
  });

  it("counts the whole pyramid, not one level of it", () => {
    const wide = MILESTONES.find((m) => m.id === "wide-realm")!;
    const g = {
      ...dealt(),
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      incorporated: { delta: "gamma" },
    };
    expect(wide.progress(g, "alpha")).toBe(4);
  });
});

describe("Overlord", () => {
  it("counts DIFFERENT lands, so retaking one is not more progress", () => {
    const overlord = MILESTONES.find((m) => m.id === "overlord")!;
    let g = logged(dealt(), "alpha", [
      { type: "subjugated", targetFactionId: "beta" },
      { type: "subjugated", targetFactionId: "beta" },
      { type: "subjugated", targetFactionId: "beta" },
    ]);
    expect(overlord.progress(g, "alpha")).toBe(1);
    g = logged(g, "alpha", ["gamma", "delta", "epsilon", "zeta"].map((f) => ({
      type: "subjugated" as const, targetFactionId: f,
    })));
    expect(overlord.progress(g, "alpha")).toBe(overlord.goal);
    expect(standingOf(g, SIX, "alpha", "overlord").done).toBe(true);
  });

  it("credits the faction that made the play, not the one it was made against", () => {
    const overlord = MILESTONES.find((m) => m.id === "overlord")!;
    const g = logged(dealt(), "beta", [
      { type: "subjugated", targetFactionId: "alpha" },
    ]);
    expect(overlord.progress(g, "beta")).toBe(1);
    expect(overlord.progress(g, "alpha")).toBe(0);
  });

  it("counts a subjugation the rules actually made, once it lands", () => {
    // Through playCard and the claim it declares, rather than a hand-written
    // log line: the milestone reads the same event the game writes, and a
    // Subjugate is a demand made a turn ahead.
    const overlord = MILESTONES.find((m) => m.id === "overlord")!;
    let g = dealt();
    g = {
      ...g,
      defense: { beta: Math.floor(SUBJUGATION_GATE * DEFAULT_DEFENSE_MAX) },
      players: g.players.map((p, i) =>
        i === 0 ? { ...p, hand: ["subjugate"] } : p,
      ),
    };
    g = playCard(g, 0, seededRng(2), "beta");
    expect(g.claims["alpha>beta"]).toBeDefined();
    expect(overlord.progress(g, "alpha")).toBe(0);
    const landed = beginTurn({ ...g, turn: g.turn + 1 }, seededRng(2));
    expect(landed.overlords.get("beta")).toBe("alpha");
    expect(overlord.progress(landed, "alpha")).toBe(1);
  });
});

describe("The great host", () => {
  it("sums the army each land of the realm can muster from its own ceiling", () => {
    const host = MILESTONES.find((m) => m.id === "host")!;
    // DEFAULT_DEFENSE_MAX musters two armies a land, so four lands make the
    // eight the milestone asks for.
    const g = {
      ...dealt(),
      overlords: new Map(
        ["beta", "gamma", "delta"].map((f) => [f, "alpha"]),
      ),
    };
    expect(host.progress(g, "alpha")).toBe(host.goal);
    expect(standingOf(g, SIX, "alpha", "host").done).toBe(true);
  });

  it("loses the land under the burden of bureaucracy an army", () => {
    const host = MILESTONES.find((m) => m.id === "host")!;
    const realm = new Map(["beta", "gamma", "delta"].map((f) => [f, "alpha"]));
    const g = { ...dealt(), overlords: realm };
    const burdened = {
      ...g,
      passives: { ...g.passives, delta: ["burden-of-bureaucracy"] },
    };
    expect(host.progress(burdened, "alpha")).toBe(host.goal - 1);
    expect(standingOf(burdened, SIX, "alpha", "host").done).toBe(false);
  });
});

describe("Fruitful lands and The black season", () => {
  it("counts growth plays, whoever they were aimed at", () => {
    const grown = MILESTONES.find((m) => m.id === "grown")!;
    const g = logged(dealt(), "alpha", Array.from(
      { length: grown.goal },
      () => ({ type: "play" as const, cardId: "prosperous-proliferation" }),
    ));
    expect(grown.progress(g, "alpha")).toBe(grown.goal);
    // Another card played the same number of times is not this milestone.
    const wrong = logged(dealt(), "alpha", Array.from(
      { length: grown.goal },
      () => ({ type: "play" as const, cardId: "grow-crops" }),
    ));
    expect(grown.progress(wrong, "alpha")).toBe(0);
  });

  it("counts the DIFFERENT lands a plague was cashed on", () => {
    const black = MILESTONES.find((m) => m.id === "pestilent")!;
    const g = logged(dealt(), "alpha", [
      ...SIX.slice(0, 4).map((f) => ({
        type: "plagued" as const, targetFactionId: f,
      })),
      { type: "plagued" as const, targetFactionId: "beta" },
    ]);
    expect(black.progress(g, "alpha")).toBe(4);
    expect(standingOf(g, SIX, "alpha", "pestilent").done).toBe(false);
  });
});

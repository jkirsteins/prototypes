import { describe, it, expect } from "vitest";
import { buildReplaySteps, REPLAY_RULES, type ReplayView } from "../src/replay";
import type { GameEvent, GameEventType } from "../src/game";
import { CARDS } from "../src/cards";
import raw from "../src/data/baltic.json";
import type { MapData } from "../src/types";

const data = raw as MapData;

const view = (over?: Partial<ReplayView>): ReplayView => ({
  localPlayerId: 1,
  realm: new Set(["beta"]),
  interest: new Set(["beta", "gamma"]),
  ctx: null,
  ...over,
});

describe("REPLAY_RULES", () => {
  it("every passed-over entry says why, in a sentence", () => {
    for (const rule of Object.values(REPLAY_RULES)) {
      if (rule.kind !== "passed-over") continue;
      expect(rule.reason.length).toBeGreaterThan(20);
    }
  });

  it("no shown label bakes a card or faction name into plain text", () => {
    // The rich-text rule, applied to the replay's own surface: a name in a
    // label must be a segment the player can point at, never dead text. The
    // same check tests/naming-convention.test.ts runs over the log.
    const cardNames = Object.values(CARDS).map((c) => c.name);
    const factionNames = data.factions.map((f) => f.name);
    const sample: GameEvent = {
      turn: 3, playerId: 2, type: "healed",
      targetFactionId: "beta", sourceFactionId: "gamma",
      overlordFactionId: "alpha", cardId: "raid", amount: 1, via: "conquest",
    };
    for (const [type, rule] of Object.entries(REPLAY_RULES)) {
      if (rule.kind !== "shown") continue;
      for (const cause of [
        null,
        { kind: "card" as const, id: "fortify", playerId: 2 },
        { kind: "passive" as const, id: "wild-lands", playerId: 2 },
      ]) {
        const label = rule.label(
          { ...sample, type: type as GameEventType }, cause,
        );
        expect(label.length).toBeGreaterThan(0);
        for (const seg of label) {
          if (seg.kind !== "text") continue;
          for (const name of [...cardNames, ...factionNames]) {
            expect(seg.text).not.toContain(name);
          }
        }
      }
    }
  });
});

describe("buildReplaySteps", () => {
  const march = (over?: Partial<GameEvent>): GameEvent => ({
    turn: 4, playerId: 1, type: "march-resolved", cardId: "raid",
    targetFactionId: "beta", sourceFactionId: "alpha", amount: 2,
    clash: { incoming: 2, counter: 0 },
    ...over,
  });

  it("shows a march touching the realm at either end, and skips one touching neither", () => {
    const hit = buildReplaySteps([march()], view());
    expect(hit).toHaveLength(1);
    expect(hit[0].polygon).toBe("beta");
    expect(hit[0].sound).toBe("clash");

    const out = buildReplaySteps(
      [march({ targetFactionId: "delta", sourceFactionId: "alpha" })],
      view(),
    );
    expect(out).toHaveLength(0);
  });

  it("leaves an arrival that met nothing to the subjugation it caused", () => {
    // `metNothing`: no amount and no clash. The subjugated step names the same
    // card and says what became of the land, so replaying both would visit one
    // polygon twice for one arrival - the modal draws the same line.
    const fresh: GameEvent[] = [
      march({ amount: undefined, clash: undefined }),
      {
        turn: 4, playerId: 1, type: "subjugated", targetFactionId: "beta",
        overlordFactionId: "alpha", via: "conquest", cardId: "raid",
        consequence: true,
      },
    ];
    const steps = buildReplaySteps(fresh, view({ localPlayerId: 2 }));
    expect(steps.map((s) => s.event.type)).toEqual(["subjugated"]);
  });

  it("still calls a standoff answered in the field", () => {
    // A standoff keeps its clash - that is what separates it from an arrival
    // that met nothing, and the two must not read alike.
    const steps = buildReplaySteps(
      [march({ amount: undefined, clash: { incoming: 2, counter: 2 } })],
      view(),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toContainEqual({
      kind: "text", text: " was answered in the field",
    });
  });

  it("gives the wild-lands regrowth its passive cause, its rustle and its land", () => {
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 7, type: "passive-fired",
        passiveId: "wild-lands", targetFactionId: "gamma",
      },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1 },
    ];
    const steps = buildReplaySteps(fresh, view());
    // The passive-fired line itself is passed over; its consequence carries
    // the moment.
    expect(steps).toHaveLength(1);
    expect(steps[0].event.type).toBe("healed");
    expect(steps[0].polygon).toBe("gamma");
    expect(steps[0].sound).toBe("rustle");
    expect(steps[0].label).toContainEqual({ kind: "passive", passiveId: "wild-lands" });
  });

  it("skips a regrowth outside the interest set", () => {
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 7, type: "passive-fired",
        passiveId: "wild-lands", targetFactionId: "delta",
      },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "delta", amount: 1 },
    ];
    expect(buildReplaySteps(fresh, view())).toHaveLength(0);
  });

  it("skips what the local player's own play caused, and shows the same batch to the other seat", () => {
    const fresh: GameEvent[] = [
      { turn: 4, playerId: 1, type: "play", cardId: "fortify", targetFactionId: "beta" },
      {
        turn: 4, playerId: 1, type: "healed", targetFactionId: "beta",
        amount: 2, consequence: true,
      },
    ];
    expect(buildReplaySteps(fresh, view())).toHaveLength(0);
    // The guest watching the host's fortify: same batch, other seat.
    const theirs = buildReplaySteps(fresh, view({ localPlayerId: 2 }));
    expect(theirs).toHaveLength(1);
    expect(theirs[0].sound).toBe("hammer");
    expect(theirs[0].label).toContainEqual({ kind: "card", cardId: "fortify" });
  });

  it("a cause does not leak past the batch that carried it", () => {
    const fresh: GameEvent[] = [
      { turn: 4, playerId: 1, type: "play", cardId: "fortify", targetFactionId: "beta" },
      { turn: 4, playerId: 2, type: "draw", cardId: "raid" },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1 },
    ];
    const steps = buildReplaySteps(fresh, view({ localPlayerId: 1 }));
    // The heal after the unrelated draw is not "caused by" the local play,
    // so it is shown - with the no-cause label, not fortify's.
    expect(steps).toHaveLength(1);
    expect(steps[0].label).not.toContainEqual({ kind: "card", cardId: "fortify" });
  });

  it("indexes steps into the fresh batch so the floats can skip them", () => {
    const fresh: GameEvent[] = [
      { turn: 4, playerId: 2, type: "draw", cardId: "raid" },
      march(),
    ];
    const steps = buildReplaySteps(fresh, view());
    expect(steps).toHaveLength(1);
    expect(steps[0].index).toBe(1);
  });
});

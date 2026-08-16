// tests/net-codec.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import type { Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import { serializeGame, deserializeGame } from "../src/net-codec";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A real mid-game state: dealt, then a few AI rounds so the stores and the
 *  log are populated - then every defense-score store stamped non-empty, so
 *  the round-trip is checked against records a run may or may not have
 *  produced by that turn (overlords especially: the Map is the one field
 *  JSON cannot carry). */
function midGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseBuild(g, "warpath", seededRng(1));
  g = pickFaction(g, "alpha", rng);
  for (let i = 0; i < 12 && g.phase === "playing"; i++) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  return {
    ...g,
    overlords: new Map([...g.overlords, ["delta", "alpha"]]),
    defense: { ...g.defense, beta: 120 },
    disease: { ...g.disease, gamma: { alpha: 2, beta: 1 } },
    miasma: { ...g.miasma, alpha: 1 },
    turnips: { ...g.turnips, delta: 3 },
    // The duel variant rather than the `picking` one a fresh deal leaves: a
    // guest's postmortem has to quote the scope the host's loop is applying,
    // so the arm carrying ids and numbers is the one worth walking.
    gauntlet: { kind: "duel", enemy: "beta", until: g.turn + 20 },
  };
}

describe("net codec", () => {
  it("round-trips a mid-game state through JSON, overlords included", () => {
    const g = midGame(seededRng(7));
    expect(g.overlords.size).toBeGreaterThan(0);
    const wire = JSON.parse(JSON.stringify(serializeGame(g)));
    const back = deserializeGame(wire);
    expect(back).toEqual(g);
    expect(back.overlords).toBeInstanceOf(Map);
    // The defense-score stores are plain records and must survive verbatim.
    expect(back.defense).toEqual(g.defense);
    expect(back.disease).toEqual(g.disease);
    expect(back.miasma).toEqual(g.miasma);
    expect(back.turnips).toEqual(g.turnips);
  });

  it("raw JSON.stringify would have dropped overlords (the reason this file exists)", () => {
    const g = midGame(seededRng(7));
    const raw = JSON.parse(JSON.stringify(g));
    // Map -> {} is the silent bug the codec guards against. If this
    // assertion ever fails, overlords stopped being a Map and the codec
    // may be deletable - revisit, do not just fix the test.
    expect(raw.overlords).toEqual({});
  });

  it("carries nothing anywhere that JSON would quietly change", () => {
    // The value half of the compile-time guard in src/net-codec.ts. A type
    // says nothing about what a value actually holds - a field typed `any`,
    // or a store built at runtime - so this walks a real serialized state and
    // reports the dotted PATHS it objects to. The failure message names
    // `players[2].something`, not `false`.
    const offenders = notJsonSafe(serializeGame(midGame(seededRng(7))));
    expect(offenders).toEqual([]);
  });

  it("and the walk really does object to one", () => {
    // The guard's own guard: a walk that never fires is a walk nobody would
    // notice had stopped working.
    const planted = {
      ...serializeGame(midGame(seededRng(7))),
      players: [{ hand: [new Set(["a"])] }],
    };
    expect(notJsonSafe(planted)).toEqual(["players[0].hand[0]"]);
  });
});

/** Every path in `value` holding something a JSON round-trip would change. */
function notJsonSafe(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") {
    return typeof value === "function" ? [path] : [];
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    return [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => notJsonSafe(v, `${path}[${i}]`));
  }
  return Object.entries(value).flatMap(([k, v]) =>
    notJsonSafe(v, path === "" ? k : `${path}.${k}`),
  );
}

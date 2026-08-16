/** The run's last act, on the real Baltic map: a power beyond the frame is
 *  summoned, offered as the only fight left, and beaten by an army marched off
 *  the map.
 *
 *  It runs on the REAL region rather than the six-land fixture the rest of the
 *  gauntlet suite uses, and it has to: what is being checked is that a power
 *  borrowing a baked neighbour's ground joins the map's own adjacency, reach
 *  and march rules without any of them being taught about it - and a complete
 *  graph of six lands would answer yes to all of that for free.
 */
import { describe, it, expect } from "vitest";
import {
  beginTurn, chooseBuild, humanFactionOf, newGame, pickBoon, pickDuel,
  pickFaction, playCard, startGame, viewOf, winSizeFor, type GameState,
} from "../src/game";
import { REGIONS, setActiveRegion } from "../src/regions";
import { defenseMaxOf, factionAdjacencyOf, siteCapsOf } from "../src/adjacency";
import { duelCandidates, duelStakes } from "../src/gauntlet";
import { marchTargetsFrom } from "../src/playability";
import { seededRng } from "../src/rng";

setActiveRegion("baltic");
const MAP = REGIONS.baltic.map;
const POWER = REGIONS.baltic.foreignPower;
const HOME = "jersikans"; // a landing, so the expedition can set out from it

/** A board standing on act 3's exit: the human holds thirteen lands and the
 *  wrap has not yet been reached. Annexed rather than sworn, the `realm=` boot
 *  param's own rule - a vassal would come apart under its independence gate
 *  while the test watched. */
function atTheLastAct(): GameState {
  const ids = MAP.factions.map((f) => f.id);
  const ethnicities = Object.fromEntries(
    MAP.regions.map((r) => [r.faction, r.peoples[0]]),
  );
  const dealt = pickFaction(
    chooseBuild(
      startGame(newGame(
        ids, factionAdjacencyOf(MAP), ethnicities,
        siteCapsOf(MAP), defenseMaxOf(MAP),
      )),
      "warpath", seededRng(1),
    ),
    HOME, seededRng(1),
  );
  const take = ids.filter((f) => f !== HOME).slice(0, 12);
  return {
    ...dealt,
    act: 3,
    incorporated: Object.fromEntries(take.map((f) => [f, HOME])),
  };
}

const wrap = (g: GameState): GameState =>
  beginTurn({ ...g, current: 0, turn: g.turn + 1 }, seededRng(2));

describe("the last act is fought off the map", () => {
  it("summons the power onto the roster, and only at the last act", () => {
    const before = atTheLastAct();
    expect(before.factionIds).not.toContain(POWER.id);
    expect(before.foreign).toEqual([]);
    const after = wrap(before);
    expect(after.factionIds).toContain(POWER.id);
    expect(after.foreign).toEqual([POWER.id]);
    // An earlier act closes with a neighbour that was already standing.
    expect(wrap({ ...before, act: 1 }).foreign).toEqual([]);
  });

  it("does not move the bar it turns up for", () => {
    // It holds no ground on the map, so counting it would push the run's own
    // bar from thirteen lands to fourteen at the exact moment the last act
    // begins - in a number the player has been reading all game.
    const after = wrap(atTheLastAct());
    const home = humanFactionOf(after) as string;
    expect(after.factionIds.length).toBe(MAP.factions.length + 1);
    expect(winSizeFor(after, home)).toBe(
      Math.ceil(0.5 * MAP.factions.length),
    );
  });

  it("stands where the map already drew it, and reaches only its landings", () => {
    const after = wrap(atTheLastAct());
    // Its ground is a baked neighbour's, so the map needed no new geometry.
    expect(MAP.neighbors.some((n) => n.id === POWER.neighbor)).toBe(true);
    // Adjacency both ways, and nothing but the landings.
    expect(new Set(after.adjacency[POWER.id]))
      .toEqual(new Set(POWER.landings));
    for (const land of POWER.landings) {
      expect(after.adjacency[land]).toContain(POWER.id);
    }
  });

  it("is the only fight the offer holds, and an army can march to it", () => {
    const after = wrap(atTheLastAct());
    if (after.gauntlet.kind !== "rest") throw new Error("expected a rest");
    expect(after.gauntlet.boss).toBe(POWER.id);
    const offered = pickBoon(after, "mend", seededRng(3));
    expect(offered.gauntlet)
      .toEqual({ kind: "picking", candidates: [POWER.id], boss: true });
    // The ordinary reach and march rules answer for it with nothing added:
    // a landing may aim at it, and `duelStakes` offers the lands that can.
    const home = humanFactionOf(offered) as string;
    expect(duelCandidates(viewOf(offered), home)).toContain(POWER.id);
    expect(marchTargetsFrom(viewOf(offered), home, HOME)).toContain(POWER.id);
    expect(duelStakes(viewOf(offered), home, POWER.id).length)
      .toBeGreaterThan(0);
  });

  it("ends the run when its ground is taken", () => {
    const home = humanFactionOf(atTheLastAct()) as string;
    let g = pickBoon(wrap(atTheLastAct()), "mend", seededRng(3));
    // Flattened, so one arrow settles it: what this test is about is the
    // expedition ending the RUN, not how long a siege takes.
    g = { ...g, defense: { ...g.defense, [POWER.id]: 0 } };
    g = pickDuel(g, POWER.id, duelStakes(viewOf(g), home, POWER.id)[0]);
    expect(g.gauntlet).toMatchObject({ kind: "duel", enemy: POWER.id, boss: true });
    g = {
      ...g,
      players: g.players.map((p, i) => (i === 0 ? { ...p, hand: ["raid"] } : p)),
      playedThisTurn: false, repeatGroup: null,
    };
    g = playCard(g, 0, seededRng(4), POWER.id, { sourceId: HOME });
    // A real march, off the map, out of a land that faces it.
    expect(Object.values(g.marches).some((m) => m.to === POWER.id)).toBe(true);
    const landed = beginTurn({ ...g, turn: g.turn + 1 }, seededRng(5));
    expect(landed.phase).toBe("victory");
    expect(landed.log.map((e) => e.type)).toContain("duel-won");
  });

  it("is not won by holding the map while it still stands", () => {
    // Half the map SUMMONS the last act's boss; it does not end the run. A
    // player standing on thirteen lands with the power untouched has not won.
    const after = wrap(atTheLastAct());
    expect(after.phase).toBe("playing");
  });
});

/**
 * Writes a save at the one moment this change is about: an heir who has just
 * stepped off the boat. Nothing is assigned - a first survivor is landed,
 * given a camp, lived, killed, and the real `beginAgain` / `land` run - so
 * the save is whatever the simulation actually produced, and the page that
 * loads it is the ordinary application.
 *
 * Used by the before-and-after shots for roadmap Q's rulings 1 and 4. Run on
 * either revision, it writes that revision's own idea of what a heir knows.
 *
 *   npx vite-node scripts/heir-save.ts -- <out.json> [seed]
 */
import { writeFileSync } from "node:fs";
import { advance } from "../src/sim/advance";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { serialize } from "../src/sim/save";
import { regionAt } from "../src/world/gen";
import { regionState } from "../src/sim/regionstate";
import { placeAt } from "../src/sim/position";
import { current } from "../src/sim/record";

const args = process.argv.slice(2).filter((a) => a !== "--");
const sighted = args.includes("--sighted");
const [out, seedText] = args.filter((a) => !a.startsWith("--"));
if (!out) throw new Error("usage: heir-save.ts <out.json> [seed]");
const seed = Number(seedText ?? 17);

const { state, world } = newGame(seed);
// The camp on the region's own generated cell, which is where a survivor
// would have put it and where `requireCamp` says one can stand.
regionState(state, world, state.player.region).campCell = regionAt(world, state.player.region).campCell;
// Long enough that the first life walks real ground: what the heir does or
// does not inherit is exactly the ground these days cover.
advance(state, world, 12 * 1440);
die(state, "froze", regionAt(world, state.player.region).name);
beginAgain(state, world);
land(state, world, { first: "Ilze", last: "Berg" });

// `--sighted` walks the heir onto the old camp's own patch, which is the
// plainest way to put the camp in front of the eye. `placeAt` is the real
// move and takes the real look with it, so what comes back is whatever
// ruling 4's trigger actually hands back - nothing here writes knowledge.
if (sighted) {
  const oldCamp = current(state).oldCamp;
  if (oldCamp === null || oldCamp === undefined) throw new Error("this heir has no old camp to sight");
  placeAt(state, world, oldCamp);
}

writeFileSync(out, serialize(state));
// eslint-disable-next-line no-console
console.log(`heir landed: seed ${seed}, region ${regionAt(world, state.player.region).name}, written to ${out}`);

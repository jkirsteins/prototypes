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
// `--away` stops before the death: one survivor, a camp they made and a walk
// away from it. What camp view is actually for - the board held on the camp
// while the person is elsewhere - needs a camp somebody has seen.
const away = args.includes("--away");
const [out, seedText] = args.filter((a) => !a.startsWith("--"));
if (!out) throw new Error("usage: heir-save.ts <out.json> [seed]");
const seed = Number(seedText ?? 17);

const out_ = () => out;
const { state, world } = newGame(seed);
// The camp on the region's own generated cell, which is where a survivor
// would have put it and where `requireCamp` says one can stand.
regionState(state, world, state.player.region).campCell = regionAt(world, state.player.region).campCell;
// Long enough that the first life walks real ground: what the heir does or
// does not inherit is exactly the ground these days cover.
// A short life for `--away`: the point is a camp and a walk, and a survivor
// twelve days in with no fire dies on the page while it is being read.
advance(state, world, (away ? 2 : 12) * 1440);
if (away) {
  const home = regionAt(world, state.player.region);
  const camp = regionState(state, world, state.player.region).campCell!;
  // Far enough out that the camp is off the middle of the board, walked to so
  // the ground between is seen the way a survivor would have seen it.
  const out = home.cells.filter((c) => c !== camp).sort((a, b) => b - a)[0];
  placeAt(state, world, out);
  writeFileSync(out_(), serialize(state));
  process.exit(0);
}
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

/** Freezes the outcome of a fixed set of seeded games so a later change can
 *  prove it did not disturb the rng stream. Run once, before the change:
 *
 *  npm run capture:baseline
 */
import { writeFileSync } from "node:fs";
import { runGame } from "../src/sim";
import { BASELINE_FACTION, BASELINE_SEEDS, BASELINE_TURN_CAP } from "../tests/baseline-config";

const games = BASELINE_SEEDS.map((seed) =>
  runGame({ seed, humanFaction: BASELINE_FACTION, turnCap: BASELINE_TURN_CAP }),
);

writeFileSync(
  "tests/fixtures/seeded-games-baseline.json",
  `${JSON.stringify(games, null, 2)}\n`,
);
console.log(`wrote ${games.length} game summaries`);

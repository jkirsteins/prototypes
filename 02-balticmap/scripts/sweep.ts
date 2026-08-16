/** The stuck-seat sweep: does any seat, on any seeded run, reach a turn it
 *  cannot end?
 *
 *  A hung seat is the worst failure this app has - nothing is persisted, so
 *  the only way out of one is losing the run - and the shape that produces it
 *  is a change to WHO TAKES A TURN. The duel scope, the act ratchet, a
 *  summoned power and the leaderless arm are all that shape, so this is run
 *  after each of them and the answer must be zero every time.
 *
 *  It counts two failures and they are not the same one:
 *
 *  - **A stuck seat** is `runGame` throwing, or `endOrGiveUp` in src/ai.ts
 *    reaching its `console.error`. Both mean a seat proposed a move the rules
 *    refuse and had nothing else to play. Must be zero.
 *  - **An unresolved run** is one still playing at `turnCap`. It was always
 *    possible; what makes it worth counting is that a duel has no clock, so a
 *    fight neither side can crack has nothing but the stake to end it. This is
 *    a number to watch rather than a number that must be zero - see the risk
 *    note in docs/superpowers/plans/2026-08-16-difficulty-ramp-and-final-boss.md.
 *
 *  It drives the COMPETENT policy on the human seat, deliberately: a naive
 *  seat loses early and a run that ends at turn 20 exercises very little of
 *  the turn loop. Seats are walked round the roster so no one faction's
 *  border shape is the whole sample.
 *
 *  It is not part of `npm test` - it is seconds to minutes, not milliseconds.
 *
 *  npm run sweep
 *  npm run sweep -- --runs=200 --cap=200
 */
import { runGame, SIM_FACTION_IDS } from "../src/sim";
import { aiTakeTurn } from "../src/ai";

function num(name: string, fallback: number): number {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  const v = hit === undefined ? Number.NaN : Number(hit.slice(name.length + 3));
  return Number.isFinite(v) ? v : fallback;
}

const runs = num("runs", 60);
const turnCap = num("cap", 150);

let stuck = 0;
let unresolved = 0;
let victories = 0;
let defeats = 0;
const turns: number[] = [];
const realms: number[] = [];

// `endOrGiveUp` shouts through `console.error` rather than throwing, so a
// counted sweep has to listen for it as well as for the throw. Restored below:
// a script that leaves the console patched is a script that hides the next
// failure.
const realError = console.error;
let shouts = 0;
console.error = (...args: unknown[]): void => {
  shouts++;
  realError("[ai gave up]", ...args);
};

for (let i = 0; i < runs; i++) {
  const seed = 1000 + i;
  const humanFaction = SIM_FACTION_IDS[i % SIM_FACTION_IDS.length];
  try {
    const s = runGame({
      seed, humanFaction, turnCap, humanTurn: aiTakeTurn, arm: "mixed",
    });
    turns.push(s.turns);
    realms.push(s.finalRealmSize);
    if (s.outcome === "cap") unresolved++;
    if (s.outcome === "victory") victories++;
    if (s.outcome === "defeat") defeats++;
  } catch (err) {
    stuck++;
    realError(`[stuck] seed ${seed} ${humanFaction}: ${(err as Error).message}`);
  }
}

console.error = realError;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

console.log(JSON.stringify({
  runs,
  turnCap,
  stuckSeats: stuck,
  aiGaveUp: shouts,
  unresolved,
  unresolvedShare: Number((unresolved / runs).toFixed(3)),
  victories,
  defeats,
  medianTurns: median(turns),
  medianFinalRealm: median(realms),
}, null, 2));

// A non-zero exit on the failure that must be zero, so the sweep can gate a
// commit rather than only informing one.
if (stuck > 0 || shouts > 0) process.exitCode = 1;

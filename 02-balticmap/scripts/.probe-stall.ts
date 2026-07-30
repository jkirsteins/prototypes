/** Is a capped world a deadlock or merely slow?
 *
 *  Runs the same seeds twice: once at the shipped 300-turn cap, once at a far
 *  larger cap. A world that resolves under the large cap was slow. One that
 *  does not is a genuine stalemate, and its largest realm plus stall length say
 *  how far short it froze. */
import { runWorld, WORLD_ARMS } from "../src/sim";

const arm = process.argv.slice(2).find((a) => a.startsWith("--arm="))?.slice(6) ?? "full-deck";
const games = Number(process.argv.slice(2).find((a) => a.startsWith("--games="))?.slice(8) ?? 52);
const bigCap = Number(process.argv.slice(2).find((a) => a.startsWith("--bigcap="))?.slice(9) ?? 1500);
const deck = WORLD_ARMS[arm];

const rows: string[] = [];
let cappedAt300 = 0;
let resolvedLater = 0;
let hardStall = 0;
const winSize = Math.ceil(0.55 * 26);
console.log(`win size = ${winSize} of 26 lands\n`);

for (let seed = 1; seed <= games; seed++) {
  const short = runWorld({ seed, deck, turnCap: 300 });
  if (short.outcome === "unified") continue;
  cappedAt300++;
  const long = runWorld({ seed, deck, turnCap: bigCap });
  if (long.outcome === "unified") resolvedLater++;
  else hardStall++;
  rows.push(
    [
      `seed ${String(seed).padStart(3)}`,
      `@300: realm ${String(short.largestRealm).padStart(2)}/${winSize}`,
      `stall ${String(short.turnsSinceLastIncorporation).padStart(3)}`,
      `subj ${String(short.subjugations).padStart(3)}`,
      `inc ${String(short.incorporations).padStart(3)}`,
      `| @${bigCap}: ${long.outcome === "unified" ? `unified t${long.endTurn}` : `STILL CAPPED realm ${long.largestRealm}, stall ${long.turnsSinceLastIncorporation}, subj ${long.subjugations}, inc ${long.incorporations}`}`,
    ].join("  "),
  );
}

for (const r of rows) console.log(r);
console.log(
  `\n${arm}: ${games} worlds. capped at 300: ${cappedAt300} (${((cappedAt300 / games) * 100).toFixed(1)}%). ` +
    `of those, resolved by ${bigCap}: ${resolvedLater}, still frozen: ${hardStall}.`,
);

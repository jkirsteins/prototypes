/** Runs every scenario in src/scenarios.ts and checks its measured pacing
 *  against the committed bands. Exits non-zero if any band is missed, so a
 *  balance change that shifts pacing cannot land unnoticed.
 *
 *  npm run simulate:check
 */
import {
  SCENARIOS, WORLD_SCENARIOS, runScenario, runWorldScenario,
} from "../src/scenarios";

const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(2));

let failed = 0;
for (const scenario of SCENARIOS) {
  const started = process.hrtime.bigint();
  const result = runScenario(scenario);
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(
    `\n${result.ok ? "PASS" : "FAIL"}  ${scenario.id}` +
      `  (${scenario.games} games, ${scenario.humanPolicy}/${scenario.humanBuild}` +
      ` vs ${scenario.arm}, ${secs.toFixed(1)}s)`,
  );
  console.log(`      ${scenario.description}`);
  for (const c of result.checks) {
    console.log(
      `      ${c.ok ? "ok  " : "MISS"} ${c.metric.padEnd(24)}` +
        ` ${n1(c.value).padStart(7)}   expected ${c.band[0]}..${c.band[1]}`,
    );
  }
  if (!result.ok) failed += 1;
}

for (const scenario of WORLD_SCENARIOS) {
  const started = process.hrtime.bigint();
  const result = runWorldScenario(scenario);
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(
    `\n${result.ok ? "PASS" : "FAIL"}  ${scenario.id}` +
      `  (${scenario.games} worlds, ${scenario.arm}, ${secs.toFixed(1)}s)`,
  );
  console.log(`      ${scenario.description}`);
  for (const c of result.checks) {
    console.log(
      `      ${c.ok ? "ok  " : "MISS"} ${c.metric.padEnd(24)}` +
        ` ${n1(c.value).padStart(7)}   expected ${c.band[0]}..${c.band[1]}`,
    );
  }
  if (!result.ok) failed += 1;
}

const total = SCENARIOS.length + WORLD_SCENARIOS.length;
console.log(
  failed === 0
    ? `\nall ${total} scenarios inside their bands`
    : `\n${failed} of ${total} scenarios outside their bands`,
);
if (failed > 0) process.exit(1);

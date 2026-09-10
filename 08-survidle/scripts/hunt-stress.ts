import { runPersistentHuntStress } from "../src/sim/hunt-stress";

const args = process.argv.slice(2);
const daysArg = args.find((arg) => arg.startsWith("--days="));
const attemptsArg = args.find((arg) => arg.startsWith("--attempts="));
const days = daysArg ? Number(daysArg.slice(7)) : 153;
const attemptsPerDay = attemptsArg ? Number(attemptsArg.slice(11)) : 3;
const seeds = args.filter((arg) => !arg.startsWith("--")).map(Number).filter(Number.isFinite);

for (const seed of seeds.length ? seeds : [17, 19, 42, 79]) {
  const report = runPersistentHuntStress(seed, days, attemptsPerDay);
  console.log(
    `seed ${seed}: ${report.kills} kills / ${report.attempts} attempts in ${days} d, `
    + `local elk ${report.starting.toFixed(2)} -> ${report.ending.toFixed(2)}, `
    + `growth ${report.growth.toFixed(2)}, in ${report.immigration.toFixed(2)}, out ${report.emigration.toFixed(2)}, `
    + `mean odds ${(report.meanOdds * 100).toFixed(1)}%, pressure ${(report.meanPressureFactor * 100).toFixed(1)}%`,
  );
}

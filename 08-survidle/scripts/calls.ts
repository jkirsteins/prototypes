/**
 * What a run will sound like before it is played: lands the given seed on
 * the given day, lets the game run with nobody touching it, and prints the
 * game time of every call the scheduler would play - the calls roll from
 * the seed and the game minute, so this is the list, not a sample.
 *
 *   npm run calls -- <seed> [day-of-year] [hours]
 *
 * Day of year is 0-based (90 is 1 April, the default start; 358 is
 * 25 December). Hours default to 24. Beds and the task's beat are not
 * listed: they follow the state and the wall clock, not a roll.
 */
import { installNodeWorldCache } from "../src/world/solvecache.node";
import type { AudioEngine } from "../src/audio/engine";
import { createScheduler } from "../src/audio/scheduler";
import { advance } from "../src/sim/advance";
import { calendar, monthName } from "../src/sim/calendar";
import { land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { ambientTemperature, localWeather } from "../src/sim/weather";
import { regionAt } from "../src/world/gen";

installNodeWorldCache();
const [seedArg, doyArg, hoursArg] = process.argv.slice(2);
if (!seedArg || !/^\d+$/.test(seedArg)) {
  console.error("usage: npm run calls -- <seed> [day-of-year] [hours]");
  process.exit(2);
}
const seed = Number(seedArg);
const doy = doyArg ? Number(doyArg) : undefined;
const hours = hoursArg ? Number(hoursArg) : 24;

const { state, world } = newGame(seed, doy);
land(state, world);
const heard: { minute: number; slot: string; gain: number; pan: number }[] = [];
const engine = {
  unlock() {}, ready: () => true, setLoops() {}, duck() {}, update() {}, suspend() {}, resume() {},
  settings: () => ({ volume: 1, muted: false, ambience: true }),
  play(slot: string, opts?: { gain?: number; pan?: number }) {
    if (opts?.gain !== undefined && opts.pan !== undefined) heard.push({ minute: Math.floor(state.minute), slot, gain: opts.gain, pan: opts.pan });
  },
} as unknown as AudioEngine;
const scheduler = createScheduler(engine);

// One game minute a frame, as a 1x run with nobody hurrying: the calls
// depend on the minute and not on how the frames fall, so any step would
// list the same minutes.
const STEP = 1;
for (let t = 0; t <= hours * 60; t += STEP) {
  if (t > 0) advance(state, world, STEP, { wildlife: "detailed", live: true });
  const cal = calendar(state.minute, state.startDoy);
  scheduler.frame(state, world, cal, ambientTemperature(cal, localWeather(state, world)), t * 1000, true);
}

const start = calendar(0, state.startDoy);
console.log(`seed ${seed}, landing ${start.dayOfMonth} ${monthName(start.month)} at 08:00 in ${regionAt(world, state.player.region).name}, ${hours} h with nobody touching it:`);
const clock = (minute: number) => {
  const cal = calendar(minute, state.startDoy);
  const h = Math.floor(cal.hour);
  const m = Math.round((cal.hour - h) * 60);
  return `day ${Math.floor((minute + 8 * 60) / 1440) + 1} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
for (const c of heard) {
  const where = c.pan < -0.33 ? "left" : c.pan > 0.33 ? "right" : "ahead";
  const far = c.gain < 0.5 ? "far" : c.gain < 0.8 ? "middling" : "near";
  console.log(`  ${clock(c.minute)}  ${c.slot.padEnd(12)} ${far}, ${where}${c.slot === "howling" ? "   <- the pack in chorus" : ""}`);
}
if (heard.length === 0) console.log("  nothing: no call open, or none rolled.");

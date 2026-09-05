/**
 * The season spine: eight thresholds a year the journal is written
 * against and the goals list will key to. Each has a detector on the
 * world, an expected day from the curve, a line a week ahead and a line
 * when it arrives. Runs daily, alive or not; with nobody home it only
 * keeps the memory current, so the heir's year starts right.
 */
import type { Presence } from "./advance";
import { type Calendar, daylight } from "./calendar";
import { log } from "./log";
import { record } from "./record";
import { BERRY_FROM_DOY, BERRY_TO_DOY, MIDSUMMER_DOY } from "./tables";
import type { GameState, ThresholdId } from "./types";
import { ICE_SHORE_CM } from "./water";
import { seasonalMean } from "./weather";

export const THRESHOLDS: ThresholdId[] = ["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark", "coldSnap", "iceOut"];
export const RUT_DOY = 263;
export const DARK_HOURS = 6;
const AHEAD_DAYS = 7;

export const NAMES: Record<ThresholdId, string> = {
  berries: "The berries", rut: "The rut", firstFrost: "First frost", firstSnow: "First snow",
  lakeFreeze: "Lake freeze-up", dark: "The dark", coldSnap: "The cold snap", iceOut: "Ice-out",
};

/** Thresholds whose name reads as a plural subject: "The berries are near.", not "is near." */
const PLURAL: Set<ThresholdId> = new Set(["berries"]);

export const ASKS_FOR: Record<ThresholdId, string> = {
  berries: "Pick while they last; dry what you cannot eat.",
  rut: "Elk are on the move and dangerous; the bow and the spear are worth the most now.",
  firstFrost: "The berries stop; be under a roof with dry wood.",
  firstSnow: "Tracks show; wood gets wet; the walk costs more.",
  lakeFreeze: "Open water closes; a hole cut by axe is the water now.",
  dark: "Short days; work by the fire, and wood for the long nights.",
  coldSnap: "The coldest nights; a fire through every one, and stay in.",
  iceOut: "Open water again; the boat season begins.",
};

function firstDoy(from: number, pred: (doy: number) => boolean): number {
  for (let i = 0; i < 365; i++) {
    const d = (from + i) % 365;
    if (pred(d)) return d;
  }
  return from;
}

/** Where the curve puts each threshold in an ordinary year; the detectors say when it really comes. */
export function expectedDoy(id: ThresholdId): number {
  switch (id) {
    case "berries": return BERRY_FROM_DOY;
    case "rut": return RUT_DOY;
    // A clear night sits 4 C under the mean and a cold day another 4 under that.
    case "firstFrost": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 8);
    case "firstSnow": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 4);
    // Ice needs the mean itself under zero, and a few days of it for the shore to bear.
    case "lakeFreeze": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 0) + 3;
    case "dark": return firstDoy(MIDSUMMER_DOY, (d) => daylight(d) < DARK_HOURS);
    case "coldSnap": return 15;
    // The mean back above zero, then the winter's ice melting at twice the mean a day.
    case "iceOut": return firstDoy(0, (d) => seasonalMean(d) >= 0) + 25;
  }
}

function detect(id: ThresholdId, state: GameState, cal: Calendar): boolean {
  const w = state.weather;
  const doy = cal.dayOfYear;
  const afterMidsummer = doy >= MIDSUMMER_DOY;
  switch (id) {
    case "berries": return doy >= BERRY_FROM_DOY && doy < BERRY_TO_DOY;
    case "rut": return doy >= RUT_DOY && doy < RUT_DOY + 60;
    case "firstFrost": return afterMidsummer && seasonalMean(doy) + w.offset - 4 < 0;
    case "firstSnow": return afterMidsummer && w.snowCm > 0;
    case "lakeFreeze": return afterMidsummer && w.iceCm >= ICE_SHORE_CM;
    case "dark": return daylight(doy) < DARK_HOURS;
    case "coldSnap": return cal.season === "winter" && w.offset < -8;
    case "iceOut": return state.spine.fired.coldSnap !== undefined && !afterMidsummer && w.iceCm <= 0 && doy > 30;
  }
}

/**
 * The year a threshold is counted against: the calendar year for most, and
 * for the cold snap and ice-out the year of the January, so a snap in
 * December and one in January are the same winter and fire once.
 */
function yearOf(state: GameState, cal: Calendar, id: ThresholdId): number {
  const y = state.year + Math.floor((state.startDoy + cal.dayIndex) / 365);
  const winterKeyed = id === "coldSnap" || id === "iceOut";
  return winterKeyed && cal.dayOfYear >= MIDSUMMER_DOY ? y + 1 : y;
}

export function stepSpine(state: GameState, cal: Calendar, who: Presence | null): void {
  for (const id of THRESHOLDS) {
    const year = yearOf(state, cal, id);
    if (state.spine.fired[id] === year) continue;
    if (detect(id, state, cal)) {
      state.spine.fired[id] = year;
      if (who) {
        log(state, `${NAMES[id]}. Day ${cal.day}.`, "good");
        record(state, { kind: "threshold", id });
      }
      continue;
    }
    const exp = expectedDoy(id);
    const inDays = (((exp - cal.dayOfYear) % 365) + 365) % 365;
    if (who && inDays > 0 && inDays <= AHEAD_DAYS && state.spine.announced[id] !== year) {
      state.spine.announced[id] = year;
      log(state, `${NAMES[id]} ${PLURAL.has(id) ? "are" : "is"} near. ${ASKS_FOR[id]}`);
    }
  }
}

/** The next threshold not yet fired this year, by expected date, and how far off it is: 0 to 364; past its expected day it reads the days to next year's. */
export function nextThreshold(state: GameState, cal: Calendar): { id: ThresholdId; inDays: number } {
  let best: { id: ThresholdId; inDays: number } | null = null;
  for (const id of THRESHOLDS) {
    if (state.spine.fired[id] === yearOf(state, cal, id)) continue;
    // No ice goes out before a winter has made it.
    if (id === "iceOut" && state.spine.fired.coldSnap === undefined) continue;
    const inDays = (((expectedDoy(id) - cal.dayOfYear) % 365) + 365) % 365;
    if (!best || inDays < best.inDays) best = { id, inDays };
  }
  return best ?? { id: "berries", inDays: (((expectedDoy("berries") - cal.dayOfYear) % 365) + 365) % 365 };
}

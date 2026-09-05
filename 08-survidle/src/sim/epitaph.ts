/**
 * The selector: the same fixed list of notable events writes the tombstone
 * line, the cemetery entry and the away report's "what happened" line, so
 * the check-in loop and the survivor loop tell one story. Pure over a
 * record; templates over real quantities, no adjectives, no generated prose.
 */
import { fmtName } from "./names";
import { SPECIES_DEFS } from "./species";
import { STRUCTURES } from "./items";
import type { DeathCause, LifeEvent, LifeRecord, ThresholdId, WorldDate } from "./types";

export const THRESHOLD_NAMES: Record<ThresholdId, string> = {
  berries: "the berries", rut: "the rut", firstFrost: "the first frost", lakeFreeze: "the lake freeze",
  firstSnow: "the first snow", dark: "the dark", coldSnap: "the cold snap", iceOut: "ice-out",
};

const CAUSE_CLAUSE: Record<DeathCause, string> = {
  starved: "Starved", froze: "Died of cold", wolves: "Killed by wolves", sickness: "Died of fever",
  thirst: "Died of thirst", smoke: "Smothered by smoke in sleep", drowned: "Went through the ice", gaveUp: "Gave up",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function fmtWorldDate(d: WorldDate): string {
  let m = 0;
  let day = d.doy;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m++; }
  return `${day + 1} ${MONTHS[m]}, year ${d.year}`;
}

/** The month name a day-of-year falls in, from the same table `fmtWorldDate` uses. */
export function monthOfDoy(doy: number): string {
  let m = 0;
  let day = doy;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m++; }
  return MONTHS[m];
}

const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
function nth(n: number): string {
  if (ORDINAL[n]) return ORDINAL[n];
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function foodClause(kg: number): string {
  if (kg <= 0) return "nothing in the pack";
  return kg < 1 ? `${Math.round(kg * 1000)} g of dried meat in the pack` : `${Math.round(kg * 10) / 10} kg of food in the pack`;
}

/** The epitaph after the name: what the cemetery and the journal show once the name has its own button or heading. */
export function epitaphTail(rec: LifeRecord): string {
  const d = rec.died;
  if (!d) return `Landed ${fmtWorldDate(rec.landed)}.`;
  const when = d.after ? ` on the ${nth(d.after.nights)} night after ${THRESHOLD_NAMES[d.after.threshold]}` : "";
  const where = d.kmFromCamp < 0.2 ? "at camp" : `${d.kmFromCamp} km from camp`;
  const wood = d.campFirewoodKg > 0 ? `${d.campFirewoodKg} kg of firewood at camp` : "no firewood at camp";
  // A night-after clause reads as its own phrase and wants a comma before where; with nothing to say there, "at camp" reads straight on from the cause.
  const sep = when ? ", " : " ";
  return `Day ${d.day}. ${CAUSE_CLAUSE[d.cause]}${when}${sep}${where}, with ${foodClause(d.packFoodKg)} and ${wood}.`;
}

export function epitaph(rec: LifeRecord): string {
  return `${fmtName(rec.name)}. ${epitaphTail(rec)}`;
}

function eventLine(e: LifeEvent): string | null {
  switch (e.kind) {
    case "threshold": return `Day ${e.day}. ${cap(THRESHOLD_NAMES[e.id].replace(/^the /, ""))}.`;
    case "firstKill": return `Day ${e.day}. First ${SPECIES_DEFS[e.species].name}.`;
    case "built": return `Day ${e.day}. Built the ${STRUCTURES[e.structure].name}.`;
    case "repaired": return `Day ${e.day}. Mended the ${STRUCTURES[e.structure].name}.`;
    case "toolWorn": return `Day ${e.day}. The ${e.tool} wore out.`;
    case "frostbite": return `Day ${e.day}. Lost ${e.part} to frostbite.`;
    case "storm": return `Day ${e.day}. A storm passed.`;
    case "abandoned": return null;
    case "entered": return null;
  }
}

/** The dozen lines: the tombstone, the notable events in date order, the worst night, the cause. */
export function entry(rec: LifeRecord): string[] {
  const head = epitaph(rec);
  const middle: { day: number; text: string }[] = [];
  for (const e of rec.events) {
    const t = eventLine(e);
    if (t) middle.push({ day: e.day, text: t });
  }
  if (rec.worst) middle.push({ day: rec.worst.day, text: `Day ${rec.worst.day}. The worst night: warmth ${rec.worst.warmth}${rec.worst.wolves ? ", wolves at the fire" : ""}.` });
  middle.sort((a, b) => a.day - b.day);
  const tail = rec.died ? [`Day ${rec.died.day}. ${CAUSE_CLAUSE[rec.died.cause]}.`] : [];
  const room = 12 - 1 - tail.length;
  // Oldest lines drop from the middle, never the ends: the first three and the last three of a life stay.
  let kept = middle.map((m) => m.text);
  while (kept.length > room) kept = [...kept.slice(0, 3), ...kept.slice(4)];
  return [head, ...kept, ...tail];
}

/** One sentence of what happened on or after `day`, for the away report. */
export function since(rec: LifeRecord, day: number): string {
  const parts: string[] = [];
  for (const e of rec.events) {
    if (e.day < day) continue;
    const t = eventLine(e);
    if (t) parts.push(t.replace(/^Day (\d+)\. (.*)\.$/, (_m, d, s) => `${s.charAt(0).toLowerCase()}${s.slice(1)} on day ${d}`));
  }
  if (rec.worst && rec.worst.day >= day) parts.push(`the worst night on day ${rec.worst.day}`);
  if (!parts.length) return "Nothing worth telling.";
  return `${cap(parts.join("; "))}.`;
}

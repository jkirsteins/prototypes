/**
 * The life record: what a survivor did, kept per survivor in the world save
 * and uncapped, unlike the log. The journal, the epitaph and the away
 * report read it; nothing reads the log for history.
 */
import { CELL_KM } from "../units";
import { WORLD_W } from "../world/terrain";
import { calendar } from "./calendar";
import { qty } from "./inventory";
import { FOODS, type FoodId } from "./items";
import type { DeathCause, Died, GameState, LifeEvent, LifeEventBody, LifeRecord, WorldDate } from "./types";

export function newRecord(index: number, name: LifeRecord["name"], landed: WorldDate, gapDays: number): LifeRecord {
  return { name, index, landed, gapDays, events: [], worst: null, forecast: [], died: null };
}

/** The living survivor's record: the last in the list. */
export function current(state: GameState): LifeRecord {
  return state.survivors[state.survivors.length - 1];
}

/** The world date of a minute of this life: the landing year plus however many year ends the day index crossed. */
export function worldDate(state: GameState, minute = state.minute): WorldDate {
  const cal = calendar(minute, state.startDoy);
  return { year: state.year + Math.floor((state.startDoy + cal.dayIndex) / 365), doy: cal.dayOfYear };
}

/** Appends a life event at the seam that lived it, stamped with the day and world date it happened on. */
export function record(state: GameState, ev: LifeEventBody): void {
  const cal = calendar(state.minute, state.startDoy);
  current(state).events.push({ ...ev, day: cal.day, date: worldDate(state) });
}

export function hasEvent(state: GameState, pred: (e: LifeEvent) => boolean): boolean {
  return current(state).events.some(pred);
}

/** The coldest hour of any night so far; wolves stick to the night that set the minimum. */
export function noteNight(state: GameState, warmth: number, wolves: boolean): void {
  const rec = current(state);
  const day = calendar(state.minute, state.startDoy).day;
  if (!rec.worst || warmth < rec.worst.warmth) rec.worst = { day, warmth: Math.round(warmth), wolves };
  else if (wolves && rec.worst.day === day) rec.worst.wolves = true;
}

function packFoodKg(state: GameState): number {
  let kg = 0;
  for (const f of Object.keys(FOODS) as FoodId[]) kg += qty(state.player.pack, f);
  return kg;
}

/** Builds the died block from whatever is at hand: the region name comes in as a parameter since record.ts has no world. */
export function fillDied(state: GameState, cause: DeathCause, regionName: string): void {
  const p = state.player;
  const cal = calendar(state.minute, state.startDoy);
  const st = state.regions[p.region];
  const camp = st ? state.piles[st.campCell] : undefined;
  let campFoodKcal = 0;
  if (camp) for (const f of Object.keys(FOODS) as FoodId[]) campFoodKcal += qty(camp, f) * FOODS[f].kcalPerKg;
  const km = st ? Math.hypot(p.x - ((st.campCell % WORLD_W) + 0.5), p.y - (Math.floor(st.campCell / WORLD_W) + 0.5)) * CELL_KM : 0;
  const rec = current(state);
  const last = [...rec.events].reverse().find((e) => e.kind === "threshold");
  const died: Died = {
    day: cal.day, date: worldDate(state), cause, region: regionName,
    kmFromCamp: Math.round(km * 10) / 10, packFoodKg: Math.round(packFoodKg(state) * 100) / 100,
    campFoodKcal: Math.round(campFoodKcal), campFirewoodKg: camp ? Math.round(qty(camp, "firewood")) : 0,
    after: last && last.kind === "threshold" ? { threshold: last.id, nights: cal.day - last.day } : null,
  };
  rec.died = died;
}

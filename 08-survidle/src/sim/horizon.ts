/**
 * The horizon curve (idle curve spec, section 3): how long a camp holds
 * without the player, per stage. A stage is a skill profile on a stocked
 * camp; its list is the reference wants, each given once as the best kind
 * that profile has earned, and no player script, since the player is
 * away. The day of the first death is the horizon. The bands are steered
 * by, not hit, and are provisional until the calibration pass.
 */
import type { World } from "../world/gen";
import { advance } from "./advance";
import { calendar, START_DOY } from "./calendar";
import { addItem, pile } from "./inventory";
import { withinLadder } from "./ladder";
import { type WeekAverage, weekBefore } from "./ledger";
import { newGame } from "./newgame";
import { addOrder } from "./orders";
import { kitOut, kitTrap, REFERENCE_ORDERS } from "./reference";
import { regionState } from "./regionstate";
import { levelMinutes, SKILL_IDS } from "./skills";
import type { DeathCause, GameState, ItemId, SkillId } from "./types";

export interface HorizonStage {
  id: "manual" | "grinds" | "keeps" | "producers" | "stocked";
  label: string;
  /** Level per skill; a skill not named is at 1. */
  levels: Partial<Record<SkillId, number>>;
  /** Whole game days the camp should hold, inclusive. */
  band: [number, number];
  /** Structures set up before the run, beyond the arrival kit. */
  built?: ("turfHut" | "waterStore" | "trap")[];
  /** Items added straight to the camp pile, bypassing room, for a stage that starts already stocked. */
  stocks?: Partial<Record<"driedMeat" | "water" | "firewood", number>>;
}

const ALL_AT_5: Partial<Record<SkillId, number>> = Object.fromEntries(SKILL_IDS.map((s) => [s, 5]));

export const HORIZON_STAGES: HorizonStage[] = [
  { id: "manual", label: "manual only", levels: {}, band: [0, 2] },
  { id: "grinds", label: "jobs and grinds", levels: ALL_AT_5, band: [1, 2] },
  { id: "keeps", label: "keeps in woodcraft and building", levels: { ...ALL_AT_5, woodcraft: 10, building: 10 }, band: [3, 5] },
  { id: "producers", label: "trap, hut and trough at keeps", levels: { ...ALL_AT_5, fishing: 10, building: 10 }, band: [10, 20], built: ["turfHut", "waterStore", "trap"] },
  { id: "stocked", label: "the same, stocked", levels: { ...ALL_AT_5, fishing: 10, building: 10 }, band: [20, 60], built: ["turfHut", "waterStore", "trap"], stocks: { driedMeat: 10, water: 20, firewood: 200 } },
];

export function setSkillLevel(state: GameState, skill: SkillId, level: number): void {
  state.skills[skill].xp = levelMinutes(level);
}

/** A stocked camp at the stage's levels, the wants given once as what those levels allow. */
export function setUpStage(seed: number, stage: HorizonStage, startDoy = START_DOY): { state: GameState; world: World } {
  const g = newGame(seed, startDoy);
  kitOut(g.state, g.world, false);
  const st = regionState(g.state, g.world, g.state.player.region);
  for (const b of stage.built ?? []) {
    if (b === "turfHut") st.structures.turfHut = true;
    else if (b === "waterStore") st.structures.waterStore = true;
    else kitTrap(g.state, g.world);
  }
  if (stage.stocks) {
    const camp = pile(g.state, st.campCell);
    for (const [item, n] of Object.entries(stage.stocks)) addItem(camp, item as ItemId, n!);
  }
  for (const s of SKILL_IDS) setSkillLevel(g.state, s, stage.levels[s] ?? 1);
  for (const w of REFERENCE_ORDERS) {
    const best = withinLadder(g.state, w.req, w.kind);
    addOrder(g.state, g.world, best.req, best.kind);
  }
  return g;
}

export interface StageReport {
  seed: number;
  stage: HorizonStage["id"];
  /** Whole game days held before the death, or maxDays when still alive. */
  days: number;
  capped: boolean;
  cause: DeathCause | null;
  inBand: boolean;
  /** The week before the death, or before the cap. */
  week: WeekAverage | null;
  dayOfYear: number;
}

export function runStage(seed: number, stage: HorizonStage, maxDays: number, startDoy = START_DOY): StageReport {
  const { state, world } = setUpStage(seed, stage, startDoy);
  for (let d = 1; d <= maxDays && !state.dead; d++) advance(state, world, 1440);
  const end = calendar(state.dead ? state.dead.minute : state.minute, state.startDoy);
  const days = state.dead ? end.day - 1 : maxDays;
  const inBand = days >= stage.band[0] && days <= stage.band[1];
  return { seed, stage: stage.id, days, capped: !state.dead, cause: state.dead?.cause ?? null, inBand, week: weekBefore(state.ledger, end.day), dayOfYear: end.dayOfYear };
}

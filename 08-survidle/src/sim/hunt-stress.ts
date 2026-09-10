import { Rng, derive } from "../rng";
import { cellAt, regionAt } from "../world/gen";
import { advance } from "./advance";
import { popOf, regionDensity } from "./animals";
import { calendar } from "./calendar";
import { enableHuntAudit, finishHuntAudit, noteHuntAttempt } from "./hunt-audit";
import { disturbHuntingGround, huntPressureFactor } from "./hunting";
import { setSkillLevel } from "./horizon";
import { placeAt } from "./position";
import { regionState } from "./regionstate";
import { setUpReference } from "./reference";
import { SPECIES_DEFS } from "./species";
import { huntOdds } from "./tasks";
import { claimHuntableAnimal } from "./wildlife-agents";

export interface PersistentHuntStressReport {
  seed: number;
  days: number;
  attempts: number;
  kills: number;
  starting: number;
  births: number;
  growth: number;
  immigration: number;
  emigration: number;
  naturalDeaths: number;
  predationDeaths: number;
  ending: number;
  meanOdds: number;
  meanPressureFactor: number;
}

/**
 * Diagnostic hunter that deliberately ignores food, fatigue and good sense.
 * It stays on one suitable cell and attempts elk at a fixed cadence so this
 * measures the ecology under pressure, not the reference player's policy.
 */
export function runPersistentHuntStress(seed: number, days = 153, attemptsPerDay = 3): PersistentHuntStressReport {
  const { state, world } = setUpReference(seed, true);
  setSkillLevel(state, "hunting", 20);
  const region = state.player.region;
  const ground = regionAt(world, region);
  const elkHabitat = SPECIES_DEFS.elk.habitat;
  const habitatValue = (idx: number): number => {
    const terrain = cellAt(world, idx).terrain;
    return terrain in elkHabitat ? elkHabitat[terrain as keyof typeof elkHabitat] ?? 0 : 0;
  };
  const cell = ground.cells
    .filter((idx) => habitatValue(idx) > 0)
    .sort((a, b) => habitatValue(b) - habitatValue(a))[0];
  if (cell === undefined) throw new Error(`region ${ground.name} has no elk habitat`);

  // Materialize the immediate ecological basin so ordinary migration can
  // move animals into and out of the hunted region during the test.
  regionState(state, world, region);
  for (const neighbour of ground.neighbours) regionState(state, world, neighbour.id);
  placeAt(state, world, cell);
  enableHuntAudit(state, world);

  const huntRng = new Rng(derive(seed, 0x48554e54));
  let attempts = 0;
  let kills = 0;
  let oddsSum = 0;
  let pressureSum = 0;
  const minutes = SPECIES_DEFS.elk.hunt?.minutes ?? 240;
  for (let day = 0; day < days; day++) {
    let spent = 0;
    for (let attempt = 0; attempt < attemptsPerDay; attempt++) {
      const cal = calendar(state.minute, state.startDoy);
      const populationBefore = popOf(regionState(state, world, region), "elk");
      const pressureFactor = huntPressureFactor(state, world, cell);
      const odds = huntOdds(state, world, cal, regionDensity(state, world, region, "elk", cal), "elk");
      disturbHuntingGround(state, world, cell, false);
      const killed = huntRng.chance(odds) && claimHuntableAnimal(state, world, "elk", cell);
      if (killed) {
        kills++;
        disturbHuntingGround(state, world, cell, true);
      }
      noteHuntAttempt(state, world, {
        species: "elk", region, cell, populationBefore, odds, pressureFactor, success: killed, minutes,
      });
      attempts++;
      oddsSum += odds;
      pressureSum += pressureFactor;
      advance(state, world, minutes, { nobody: true });
      spent += minutes;
    }
    advance(state, world, Math.max(0, 1440 - spent), { nobody: true });
  }

  const audit = finishHuntAudit(state, world);
  const flow = audit.populations.find((entry) => entry.region === region && entry.species === "elk");
  if (!flow) throw new Error("elk population was not audited");
  return {
    seed, days, attempts, kills,
    starting: flow.starting, births: flow.births, growth: flow.growth,
    immigration: flow.immigration, emigration: flow.emigration,
    naturalDeaths: flow.naturalDeaths, predationDeaths: flow.predationDeaths,
    ending: flow.ending,
    meanOdds: attempts ? oddsSum / attempts : 0,
    meanPressureFactor: attempts ? pressureSum / attempts : 1,
  };
}

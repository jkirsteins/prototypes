/**
 * The teaching layer: what the game stops to explain, and when. The sim
 * names the moment and writes its words; whoever is listening draws it,
 * the same division src/sim/cues.ts keeps for sound. The queue itself
 * lives in skills.ts beside the unlock it is pushed from, which is what
 * keeps this file free to read skills.ts without a cycle.
 */
import { RUNG_LEVEL, RUNG_ORDER, RUNG_WORD, SKILL_IDS, SKILL_NAMES, skillLevel } from "./skills";
import type { GameState, Rung } from "./types";

/** A new survivor learns for themselves: a moment is about what this life can newly reach. */
export function resetTeaching(state: GameState): void {
  state.taught = {};
  state.teachQueue = [];
}

/**
 * What each rung is, in the concept's own terms. Which skill opened it is
 * the log line's business (RUNG_LINE in skills.ts, written on every unlock
 * in every skill); these lines are shown once per survivor and have to
 * read the same whichever skill got there first, so no skill is named.
 */
export const CONCEPTS: Record<Rung, { title: string; lines: string[] }> = {
  job: {
    title: "Jobs",
    lines: [
      "Until now every piece of work was a click of yours: one job, done once, watched.",
      "A skill practised this far keeps count without you. Say how many, or say what camp should end up holding, and walk away.",
    ],
  },
  grind: {
    title: "Grinds",
    lines: [
      "A grind is work that never ends.",
      "It takes every hour the list leaves free and never drops off, so it is what you put underneath everything else: the wood that keeps coming in while the real jobs get done.",
    ],
  },
  keep: {
    title: "Keeps",
    lines: [
      "A keep watches a pile instead of counting the work.",
      "Name what camp should hold and it goes quiet once the pile is there, then starts again when it drops. It reads the stored forms too, so meat on the rack counts against meat kept.",
    ],
  },
  condition: {
    title: "Conditions",
    lines: [
      "An order can now say when, and not only what.",
      "A season it runs in, a stock line it waits behind, the level a keep restarts at, a count to make each day. Work that waits for its moment costs nothing while it waits.",
    ],
  },
  pace: {
    title: "Pace",
    lines: [
      "An order can now carry a date.",
      "A keep can be due by a month, held at its figure after it, or spent by the season's close. This is how a winter is stocked during the summer without you counting the days.",
    ],
  },
};

/**
 * One rule of the north a landing puts in front of the player. Every line
 * is something the tables or the manual already establish and that the
 * game nowhere says out loud at the moment it would matter. A landing
 * shows one, so a player on their sixth survivor still meets a rule they
 * had not noticed, at no cost in clicks.
 */
export const TIPS: string[] = [
  "A hare alone starves you. You need fat: marrow, oily fish, eggs and roe in their season.",
  "Wet clothes in the cold kill in hours. Dry them by the fire before you sleep, not after.",
  "A deer is weeks of food that rots in a day unless you dry it, and its fat rots in three unless you render it.",
  "Two litres is a day's water. A trough at camp holds a week of it and saves you the walk.",
  "Dead wood off the forest floor is firewood by hand. A fire never needed the axe.",
  "A trap in the water works while you sleep. It is the first food a camp makes without you.",
  "The axe is honed, not used up. A whetstone brings the edge back for nothing.",
  "Berries are a season and then they are gone. Dry what you cannot eat.",
  "Walking after dark without a torch is slow going, and slow going in the cold is how people die.",
  "A once order starts the moment you click it, whatever the body says. That one is yours to judge.",
];

/**
 * The tip a landing shows: fixed for that landing, so a reload shows the
 * same one, and stepped on by one where it would repeat the last
 * landing's.
 */
export function tipFor(seed: number, index: number): string {
  const at = (n: number) => ((Math.abs(seed + n) % TIPS.length) + TIPS.length) % TIPS.length;
  const here = at(index);
  return TIPS[here === at(index - 1) ? (here + 1) % TIPS.length : here];
}

/**
 * What the welcome says about the survivor standing there: what they
 * landed holding, and what that already lets them ask for. The heir's
 * paragraph and the fresh one are the same question answered against a
 * different slate, so there is one place to change either. It reads the
 * live skills, which carrySkills has already written by the time a
 * welcome is drawn, so it needs to know nothing of the ancestor.
 */
export function welcomeLines(state: GameState): { held: string[]; body: string[] } {
  const held = SKILL_IDS.filter((s) => skillLevel(state, s) >= 2).map((s) => `${SKILL_NAMES[s]} ${skillLevel(state, s)}`);
  if (!held.length) {
    return {
      held,
      body: [
        "You land knowing nothing. Every job is yours to click, one at a time, and watched.",
        `Practise a skill to ${RUNG_LEVEL.job} and it begins keeping count without you; past that it takes longer and longer orders, up to work planned by the calendar.`,
      ],
    };
  }
  const top = [...RUNG_ORDER].reverse().find((r) => SKILL_IDS.some((s) => skillLevel(state, s) >= RUNG_LEVEL[r]));
  const body = [`You land carrying what came down to you: ${held.join(", ")}.`];
  body.push(
    top
      ? `That already takes ${RUNG_WORD[top]} from you: set the work down and walk away. Everything else is by hand until you have practised it yourself.`
      : "None of it is yet enough to set work down and walk away. That comes with practice.",
  );
  return { held, body };
}

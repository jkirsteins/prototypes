import type { World } from "../world/gen";
import { hungerLine } from "../sim/actions";
import type { Calendar } from "../sim/calendar";
import { feltTemperature, firelit, starvation } from "../sim/player";
import type { GameState, Person } from "../sim/types";
import { sleepiness, SLEEPY_AT } from "../sim/sleep";
import { THIRSTY_L } from "../sim/water";
import { faceFrame, FOCUSED_FACE, STATIC_FACE, type FaceExpression } from "./face";
import { moodOf, type Mood } from "./mood";

export type PortraitExpression = "happy" | "focused" | "cold" | "hot" | "unhappy" | "tired" | "hurt" | "sleep" | "dead";

export interface LivePortraitState {
  expression: PortraitExpression;
  activity: Mood;
  firelit: boolean;
  motion: "awake" | "limited" | "none";
  signature: string;
}

const EXPRESSIONS: Record<PortraitExpression, FaceExpression> = {
  happy: STATIC_FACE,
  focused: FOCUSED_FACE,
  cold: { eyes: "humble", eyebrows: "sad", mouth: "sad" },
  hot: { eyes: "wide", eyebrows: "sad", mouth: "agape" },
  unhappy: { eyes: "humble", eyebrows: "sad", mouth: "sad" },
  tired: { eyes: "humble", eyebrows: "sad", mouth: "agape" },
  hurt: { eyes: "humble", eyebrows: "angry", mouth: "sad" },
  sleep: { eyes: "bow", eyebrows: "neutral", mouth: "smile" },
  dead: { eyes: "bow", eyebrows: "sad", mouth: "sad" },
};

const FLAVOR: Record<PortraitExpression, FaceExpression> = {
  happy: { eyes: "happy", eyebrows: "raised", mouth: "laugh" },
  focused: { eyes: "wide", eyebrows: "angry", mouth: "smile" },
  cold: { eyes: "humble", eyebrows: "sad", mouth: "angry" },
  hot: { eyes: "wide", eyebrows: "raised", mouth: "agape" },
  unhappy: { eyes: "humble", eyebrows: "sad", mouth: "angry" },
  tired: { eyes: "bow", eyebrows: "sad", mouth: "agape" },
  hurt: { eyes: "humble", eyebrows: "angry", mouth: "angry" },
  sleep: EXPRESSIONS.sleep,
  dead: EXPRESSIONS.dead,
};

/** Pure projection of simulation state. It neither advances nor consumes RNG. */
export function livePortraitState(state: GameState, world: World, cal: Calendar, ambient: number): LivePortraitState {
  const p = state.player;
  const activity = moodOf(state);
  let expression: PortraitExpression;
  if (state.dead) expression = "dead";
  else if (activity === "sleep" || p.sleeping) expression = "sleep";
  else if (p.warmth < 40) expression = "cold";
  else if (p.sick > 0 || p.injured > 0) expression = "hurt";
  else if (p.water < THIRSTY_L) expression = "unhappy";
  else if (starvation(state) > 0 || p.kcal < hungerLine(state)) expression = "unhappy";
  else if (p.energy < 20 || sleepiness(p.sleepDebt, cal.hour) >= SLEEPY_AT) expression = "tired";
  else if (feltTemperature(state, world, ambient) > 20 && p.warmth >= 80) expression = "hot";
  else if (activity === "work") expression = "focused";
  else expression = "happy";

  const lit = firelit(state, world);
  const motion = expression === "dead" || expression === "sleep" ? "none" : expression === "happy" ? "awake" : "limited";
  const survivor = state.survivors.length - 1;
  return { expression, activity, firelit: lit, motion, signature: `${survivor}:${expression}:${activity}:${lit ? 1 : 0}` };
}

/** Layered SVG frames whose visibility is changed by CSS and the ambient controller. */
export function liveFaceHtml(person: Person, px: number, view: LivePortraitState): string {
  const base = EXPRESSIONS[view.expression];
  const raised = { ...base, eyebrows: "raised" } as FaceExpression;
  const blink = { ...base, eyes: "bow" } as FaceExpression;
  const classes = [
    "stat-face", `mood-${view.activity}`, "portrait", `is-${view.expression}`,
    view.firelit ? "is-firelit" : "",
    `motion-${view.motion}`,
    `focus-brow-${person.face % 2 === 0 ? "left" : "right"}`,
  ].filter(Boolean).join(" ");
  return `<span class="${classes}" data-portrait-signature="${view.signature}">`
    + `<span data-portrait-frame="base">${faceFrame(person, px, base)}</span>`
    + `<span data-portrait-frame="focus-raised">${faceFrame(person, px, raised)}</span>`
    + `<span data-portrait-frame="blink">${faceFrame(person, px, blink)}</span>`
    + `<span data-portrait-frame="flavor">${faceFrame(person, px, FLAVOR[view.expression])}</span>`
    + "</span>";
}

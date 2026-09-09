/**
 * The goal panel and its congratulation. The panel is the one thing on
 * the page that says what is worth doing next, so it sits above the clock
 * and never scrolls away; the overlay is the rung moment's shape, because
 * a goal reached and a rung opened are the same kind of event to a reader.
 */
import type { Calendar } from "../sim/calendar";
import { activeGoals, goalDef, type GoalId, unintroducedGoals } from "../sim/goals";
import type { GameState } from "../sim/types";
import type { World } from "../world/gen";
import { goalGuide, goalProgress } from "./goalguide";
import { esc, type UiState } from "./render";

/** The element ids a goal's fill and figure are written to each frame. */
function barId(id: GoalId): string {
  return `goal-${id}`;
}

function figure(at: number, target: number, unit?: string): string {
  return `${Math.floor(at + 1e-9)} / ${target}${unit ? ` ${unit}` : ""}`;
}

function rowHtml(state: GameState, world: World | undefined, cal: Calendar, id: GoalId): string {
  const g = goalDef(id);
  const progress = goalProgress(state, world, cal, id);
  const b = barId(id);
  const next = progress.steps.find((step) => !step.done)?.label;
  return `<li class="goal"><button class="goal-open" data-act="goal-open" data-goal="${id}" aria-label="${esc(`${g.title}, ${figure(progress.at, progress.target, progress.unit)}`)}"><span class="goal-line"><span class="goal-title">${esc(g.title)}</span><span class="goal-value" id="val-${b}">${esc(figure(progress.at, progress.target, progress.unit))}</span></span><span class="bar"><span class="fill" id="bar-${b}" style="width:${Math.max(0, Math.min(100, progress.at / progress.target * 100)).toFixed(1)}%"></span></span>${next ? `<span class="goal-next">${esc(next)}</span>` : ""}</button></li>`;
}

/**
 * The panel's markup. Empty once every goal is reached, which lets the
 * section collapse rather than stand there holding a congratulation
 * nobody asked to keep.
 */
export function goalsHtml(state: GameState, world: World, cal: Calendar): string;
export function goalsHtml(state: GameState, cal: Calendar): string;
export function goalsHtml(state: GameState, worldOrCal: World | Calendar, maybeCal?: Calendar): string {
  const world = maybeCal ? worldOrCal as World : undefined;
  const cal = maybeCal ?? worldOrCal as Calendar;
  const active = activeGoals(state, cal);
  if (active.length === 0) return "";
  return `<ul class="goals">${active.map((id) => rowHtml(state, world, cal, id)).join("")}</ul>`;
}

/**
 * The counted goals' figures, written each frame rather than built into
 * the markup: a kilo count that climbs with every armful would redraw the
 * panel on every frame it moved.
 */
export function updateGoalBars(state: GameState, world: World, cal: Calendar, root?: ParentNode): void;
export function updateGoalBars(state: GameState, cal: Calendar, root?: ParentNode): void;
export function updateGoalBars(state: GameState, worldOrCal: World | Calendar, calOrRoot?: Calendar | ParentNode, maybeRoot?: ParentNode): void {
  const hasWorld = Boolean(calOrRoot && "season" in calOrRoot);
  const world = hasWorld ? worldOrCal as World : undefined;
  const cal = (hasWorld ? calOrRoot : worldOrCal) as Calendar;
  const root = (hasWorld ? maybeRoot : calOrRoot as ParentNode | undefined) ?? document;
  for (const id of activeGoals(state, cal)) {
    const progress = goalProgress(state, world, cal, id);
    const at = progress.at;
    const b = barId(id);
    const fill = root.querySelector<HTMLElement>(`#bar-${b}`);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (at / progress.target) * 100)).toFixed(1)}%`;
    const val = root.querySelector<HTMLElement>(`#val-${b}`);
    // Floored, not rounded: 9.6 of 10 kg reads "9 / 10", not a "10 / 10" that
    // says the goal is done a kilo before it actually is.
    const text = figure(at, progress.target, progress.unit);
    if (val && val.textContent !== text) val.textContent = text;
  }
}

function stepsHtml(state: GameState, world: World, cal: Calendar, id: GoalId): string {
  const progress = goalProgress(state, world, cal, id);
  if (progress.steps.length === 0) return "";
  return `<ul class="goal-steps">${progress.steps.map((step) => `<li class="${step.done ? "done" : ""}"><span aria-hidden="true">[${step.done ? "x" : " "}]</span> ${esc(step.label)}</li>`).join("")}</ul>`;
}

export function goalGuideHtml(state: GameState, world: World, cal: Calendar, ids: GoalId[], done: GoalId[] = []): string {
  const completed = done.length > 0 ? `<div class="goal-met">${done.map((id) => `<span>[x] ${esc(goalDef(id).title)}</span>`).join("")}</div>` : "";
  const cards = ids.map((id) => {
    const def = goalDef(id);
    const guide = goalGuide(id);
    const progress = goalProgress(state, world, cal, id);
    const cue = guide.path ?? guide.prompt ?? "";
    return `<section class="goal-guide"><div class="goal-guide-head"><h1>${esc(def.title)}</h1><span>${esc(figure(progress.at, progress.target, progress.unit))}</span></div>${progress.deadline ? `<p class="goal-deadline">${esc(progress.deadline)}</p>` : ""}${stepsHtml(state, world, cal, id)}<p>${esc(guide.reason)}</p>${cue ? `<p class="example">${esc(cue)}</p>` : ""}</section>`;
  }).join("");
  return `<div class="box teach goal-modal">${completed}${cards}<button class="act" data-act="goal-close">Continue</button></div>`;
}

/**
 * The completions waiting to be shown, or null while something larger is
 * open. A rung is the bigger event and is not pre-empted by a goal that
 * finished in the same minute; a landing, a death and an away report all
 * come first for the same reason.
 */
export function goalMomentToOpen(state: GameState, ui: UiState): GoalId[] | null {
  if (ui.goalGuide || ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  return state.goals.queue.length > 0 ? [...state.goals.queue] : null;
}

export function goalIntroductionToOpen(state: GameState, cal: Calendar, ui: UiState): GoalId[] | null {
  if (ui.goalGuide || ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  const ids = unintroducedGoals(state, cal);
  return ids.length > 0 ? ids : null;
}

/**
 * The congratulation. Everything finished since the last one is named on
 * the one screen, and the goals now standing are introduced under it, so
 * a single dismissal leaves the player knowing where to walk.
 */
export function goalDoneHtml(state: GameState, cal: Calendar, done: GoalId[]): string {
  const word = done.length > 1 ? "Goals reached" : "Goal reached";
  const met = done.map((id) => `<p class="example">${esc(goalDef(id).title)}</p>`).join("");
  const next = activeGoals(state, cal);
  const ahead =
    next.length === 0
      ? `<p class="dim">That is the last of them. What you do here now is yours to choose.</p>`
      : `<p class="dim">Next:</p>${next.map((id) => `<p class="example">${esc(goalDef(id).title)}</p>`).join("")}`;
  return `<div class="box teach">
<h1>${word}</h1>
${met}
${ahead}
<button class="act" data-act="goal-close">On</button>
</div>`;
}

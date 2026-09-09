/**
 * The goal panel and its congratulation. The panel is the one thing on
 * the page that says what is worth doing next, so it sits above the clock
 * and never scrolls away; the overlay is the rung moment's shape, because
 * a goal reached and a rung opened are the same kind of event to a reader.
 */
import { calendar, type Calendar } from "../sim/calendar";
import { activeGoals, goalDef, type GoalId, unintroducedGoals } from "../sim/goals";
import type { GameState } from "../sim/types";
import type { World } from "../world/gen";
import { goalGuide, goalProgress } from "./goalguide";
import { esc, type UiState } from "./render";

function rowHtml(id: GoalId): string {
  const g = goalDef(id);
  return `<li class="goal"><button class="goal-open" data-act="goal-open" data-goal="${id}"><span aria-hidden="true">[ ]</span> <span class="goal-title">${esc(g.title)}</span></button></li>`;
}

/**
 * The panel's markup. Empty once every goal is reached, which lets the
 * section collapse rather than stand there holding a congratulation
 * nobody asked to keep.
 */
export function goalsHtml(state: GameState, world: World, cal: Calendar): string;
export function goalsHtml(state: GameState, cal: Calendar): string;
export function goalsHtml(state: GameState, worldOrCal: World | Calendar, maybeCal?: Calendar): string {
  const cal = maybeCal ?? worldOrCal as Calendar;
  const active = activeGoals(state, cal);
  if (active.length === 0) return "";
  return `<h2>Goals</h2><ul class="goals">${active.map(rowHtml).join("")}</ul>`;
}

function stepsHtml(state: GameState, world: World, cal: Calendar, id: GoalId): string {
  const progress = goalProgress(state, world, cal, id);
  if (progress.steps.length === 0) return "";
  return `<ul class="goal-steps">${progress.steps.map((step) => `<li class="${step.done ? "done" : ""}"><span aria-hidden="true">[${step.done ? "x" : " "}]</span> ${esc(step.label)}</li>`).join("")}</ul>`;
}

export function goalGuideHtml(
  state: GameState,
  world: World,
  cal: Calendar,
  ids: GoalId[],
  done: GoalId[] = [],
  automaticOrNotices: boolean | string[] = true,
  queuedNotices: string[] = [],
): string {
  const automatic = typeof automaticOrNotices === "boolean" ? automaticOrNotices : true;
  const notices = Array.isArray(automaticOrNotices) ? automaticOrNotices : queuedNotices;
  const completed = done.map((id) => `<p class="goal-status goal-complete">Goal completed: ${esc(goalDef(id).title)}</p>`).join("");
  const cards = ids.map((id) => {
    const def = goalDef(id);
    const guide = goalGuide(id);
    const label = automatic ? "New goal available" : "Current goal";
    return `<section class="goal-guide"><p class="goal-status">${label}: ${esc(def.title)}</p>${stepsHtml(state, world, cal, id)}${guide.note ? `<p class="goal-note">${esc(guide.note)}</p>` : ""}</section>`;
  }).join("");
  const notice = notices.map((text) => `<section class="goal-guide"><p>${esc(text)}</p></section>`).join("");
  return `<div class="box teach goal-modal"><h1>Goals</h1>${completed}${cards}${notice}<button class="act" data-act="goal-close">Continue</button></div>`;
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

export function goalNoticeToOpen(state: GameState, ui: UiState): string[] | null {
  if (ui.goalGuide || ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  if (state.goals.queue.length > 0) return null;
  if (unintroducedGoals(state, calendar(state.minute, state.startDoy)).length > 0) return null;
  return state.goals.noticeQueue.length > 0 ? [...state.goals.noticeQueue] : null;
}

/**
 * The congratulation. Everything finished since the last one is named on
 * the one screen, and the goals now standing are introduced under it, so
 * a single dismissal leaves the player knowing where to walk.
 */
export function goalDoneHtml(state: GameState, cal: Calendar, done: GoalId[]): string {
  const met = done.map((id) => `<p class="goal-status goal-complete">Goal completed: ${esc(goalDef(id).title)}</p>`).join("");
  const next = activeGoals(state, cal);
  const ahead = next.length === 0
    ? `<p class="dim">That is the last of them. What you do here now is yours to choose.</p>`
    : next.map((id) => `<p class="goal-status">New goal available: ${esc(goalDef(id).title)}</p>`).join("");
  return `<div class="box teach">
<h1>Goals</h1>
${met}
${ahead}
<button class="act" data-act="goal-close">Continue</button>
</div>`;
}

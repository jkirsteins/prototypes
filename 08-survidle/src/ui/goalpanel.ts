/**
 * The goal panel and its congratulation. The panel is the one thing on
 * the page that says what is worth doing next, so it sits above the clock
 * and never scrolls away; the overlay is the rung moment's shape, because
 * a goal reached and a rung opened are the same kind of event to a reader.
 */
import type { Calendar } from "../sim/calendar";
import { activeGoals, goalDef, type GoalId } from "../sim/goals";
import type { GameState } from "../sim/types";
import { esc, type UiState } from "./render";

/** The element ids a goal's fill and figure are written to each frame. */
function barId(id: GoalId): string {
  return `goal-${id}`;
}

function rowHtml(id: GoalId): string {
  const g = goalDef(id);
  const title = `<div class="goal-title">${esc(g.title)}</div>`;
  // A one-shot has nothing to watch: it is done or it is not.
  if (g.target <= 1) return `<li class="goal">${title}</li>`;
  const b = barId(id);
  return `<li class="goal">${title}<div class="bar"><div class="fill" id="bar-${b}"></div></div><span class="dim" id="val-${b}"></span></li>`;
}

/**
 * The panel's markup. Empty once every goal is reached, which lets the
 * section collapse rather than stand there holding a congratulation
 * nobody asked to keep.
 */
export function goalsHtml(state: GameState, cal: Calendar): string {
  const active = activeGoals(state, cal);
  if (active.length === 0) return "";
  const word = active.length > 1 ? "Your goals" : "Your goal";
  return `<h2>${word}</h2><ul class="goals">${active.map((id) => rowHtml(id)).join("")}</ul>`;
}

/**
 * The counted goals' figures, written each frame rather than built into
 * the markup: a kilo count that climbs with every armful would redraw the
 * panel on every frame it moved.
 */
export function updateGoalBars(state: GameState, cal: Calendar, root: ParentNode = document): void {
  for (const id of activeGoals(state, cal)) {
    const g = goalDef(id);
    if (g.target <= 1) continue;
    const at = state.goals.progress[id] ?? 0;
    const b = barId(id);
    const fill = root.querySelector<HTMLElement>(`#bar-${b}`);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (at / g.target) * 100)).toFixed(1)}%`;
    const val = root.querySelector<HTMLElement>(`#val-${b}`);
    const text = `${Math.round(at)} / ${g.target}${g.unit ? ` ${g.unit}` : ""}`;
    if (val && val.textContent !== text) val.textContent = text;
  }
}

/**
 * The completions waiting to be shown, or null while something larger is
 * open. A rung is the bigger event and is not pre-empted by a goal that
 * finished in the same minute; a landing, a death and an away report all
 * come first for the same reason.
 */
export function goalMomentToOpen(state: GameState, ui: UiState): GoalId[] | null {
  if (ui.goalsDone || ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  return state.goals.queue.length > 0 ? [...state.goals.queue] : null;
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

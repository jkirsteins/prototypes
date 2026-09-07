/**
 * The goal panel and its congratulation. The panel is the one thing on
 * the page that says what is worth doing next, so it sits above the clock
 * and never scrolls away; the overlay is the rung moment's shape, because
 * a goal reached and a rung opened are the same kind of event to a reader.
 */
import type { Calendar } from "../sim/calendar";
import { activeGoals, goalDef, type GoalId } from "../sim/goals";
import type { GameState } from "../sim/types";
import { esc } from "./render";

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

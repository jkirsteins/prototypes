import type { GameState } from "../sim/types";
import { esc } from "./render";

export function recognitionHtml(state: GameState, id: number): string {
  const subject = state.wildlife.subjects.find((s) => s.id === id);
  if (!subject?.name) return "";
  return `<div class="box teach wildlife-recognition">
<h1>You recognize this animal</h1>
<p>You call it ${esc(subject.name)}.</p>
<button class="act" data-act="recognition-close">On</button>
</div>`;
}

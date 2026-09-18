/** The needs ledger, read for the Log tab under ?debug: what the blocked rows published and what the camp row said. */
import { needsOf } from "../sim/needs";
import type { GameState } from "../sim/types";
import { esc } from "./render";

export function needsHtml(state: GameState): string {
  const n = needsOf(state);
  const by = n.fireBy.length ? ` (${n.fireBy.join(", ")})` : "";
  return `<div class="needs"><h2>Published needs</h2><div class="e">fire: ${esc(n.fire)}${esc(by)}</div><div class="e">camp row: ${n.fireRefusal ? esc(n.fireRefusal) : "nothing refused"}</div></div>`;
}

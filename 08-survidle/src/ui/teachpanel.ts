/**
 * The overlays that teach: the moment a rung opens, and the welcome a
 * survivor lands to. Both take their words from src/sim/teach.ts and their
 * examples from the Do panel's own rows, run through the real gate, so a
 * moment can never promise an order the panel would refuse to give.
 */
import type { Calendar } from "../sim/calendar";
import { intentOption } from "../sim/intent";
import { orderGate } from "../sim/ladder";
import { orderSentence } from "../sim/orders";
import { RUNG_LEVEL, SKILL_IDS, skillLevel } from "../sim/skills";
import { CONCEPTS } from "../sim/teach";
import type { GameState, Order, Rung, TaskId } from "../sim/types";
import { regionAt, type World } from "../world/gen";
import { intentGroups } from "./dopanel";
import { defaultChoiceFor, esc, rowRequest, type RowChoice } from "./render";

/**
 * The kind a rung's example is given as. A condition and a pace are laid
 * on a keep rather than being kinds of their own, and an example has no
 * condition fields to fill, so both show the keep they would decorate and
 * leave what they add to the prose. A keep the player can really give
 * beats a sentence they cannot.
 */
const EXAMPLE_UNTIL: Record<Rung, RowChoice["until"]> = {
  job: "times", grind: "forever", keep: "keep", condition: "keep", pace: "keep",
};

/**
 * One order this survivor could give right now, printed the way the order
 * list prints it. Null when nothing on the panel can carry the rung, and
 * the moment then shows its prose alone rather than inventing work.
 */
export function exampleFor(state: GameState, world: World, cal: Calendar, r: Rung): string | null {
  if (!SKILL_IDS.some((s) => skillLevel(state, s) >= RUNG_LEVEL[r])) return null;
  for (const g of intentGroups(regionAt(world, state.player.region))) {
    for (const { id, arg } of g.items) {
      const o = intentOption(state, world, cal, id, arg, "nearest");
      if (!o.ok) continue;
      const choice: RowChoice = { ...defaultChoiceFor(id as TaskId), until: EXAMPLE_UNTIL[r] };
      const { req, kind } = rowRequest(choice, id, arg);
      // The gate is the same one the row's kind button is greyed by, so an
      // example is only ever an order this survivor could actually give.
      if (!orderGate(state, req, kind).ok) continue;
      // An order that is never added to the list: orderSentence reads the
      // request and the kind, and an id of -1 collides with no real order.
      const order: Order = { id: -1, kind, req, done: 0, minutes: 0, skipped: "" };
      return orderSentence(state, world, cal, order);
    }
  }
  return null;
}

export function conceptHtml(state: GameState, world: World, cal: Calendar, r: Rung): string {
  const c = CONCEPTS[r];
  const example = exampleFor(state, world, cal, r);
  const shown = example ? `<p class="dim">You could now say:</p><p class="example">${esc(example)}</p>` : "";
  return `<div class="box teach">
<h1>${esc(c.title)}</h1>
${c.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
${shown}
<button class="act" data-act="teach-close">Got it</button>
</div>`;
}

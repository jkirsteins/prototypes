/**
 * The overlays that teach: the moment a rung opens, and the welcome a
 * survivor lands to. Both take their words from src/sim/teach.ts and their
 * examples from the Do panel's own rows, run through the real gate, so a
 * moment can never promise an order the panel would refuse to give.
 */
import { type Calendar, fmtDate } from "../sim/calendar";
import { intentOption } from "../sim/intent";
import { orderGate } from "../sim/ladder";
import { fmtName } from "../sim/names";
import { orderSentence } from "../sim/orders";
import { current } from "../sim/record";
import { RUNG_LEVEL, SKILL_IDS, SKILL_NAMES, skillLevel } from "../sim/skills";
import { CONCEPTS, tipFor } from "../sim/teach";
import type { GameState, Order, Rung, TaskId } from "../sim/types";
import { regionAt, type World } from "../world/gen";
import { intentGroups } from "./dopanel";
import { defaultChoiceFor, esc, rowRequest, type RowChoice, type UiState } from "./render";

/**
 * The kind a rung's example is given as. A condition and a pace are laid
 * on a keep rather than being kinds of their own, and an example has no
 * condition fields to fill, so both show the keep they would decorate and
 * leave what they add to the prose. A keep the player can really give
 * beats a sentence they cannot.
 *
 * The job's example is a camp-has and not an "N times", though the rung
 * opens both: orderSentence words a counted order by its progress ("0 of
 * 10 done"), which is what a live row wants and nonsense for an order
 * nobody has given yet.
 */
const EXAMPLE_UNTIL: Record<Rung, RowChoice["until"]> = {
  job: "campHas", grind: "forever", keep: "keep", condition: "keep", pace: "keep",
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

/**
 * The moment to open now, or null while something else owns the screen.
 *
 * Every overlay that beats `teach` in render()'s chain holds the queue shut,
 * and the away report is the one that matters: a rung crossed inside an
 * offline catch-up is queued by the catch-up itself, and the player has to
 * read what happened while they were gone before the game starts teaching
 * them. The cemetery is here for a second reason - a moment opened behind it
 * would be invisible and would stop the clock while the player reads.
 */
export function momentToOpen(state: GameState, ui: UiState): Rung | null {
  if (ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  return state.teachQueue[0] ?? null;
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

/**
 * The welcome a landing opens to, fresh survivor or heir alike. The first
 * welcome says who arrived and what they know. Goals say what to do next.
 */
export function welcomeHtml(state: GameState, cal: Calendar): string {
  const rec = current(state);
  const skills = SKILL_IDS.map((s) => `<span class="tag">${esc(SKILL_NAMES[s])} ${skillLevel(state, s)}</span>`).join("");
  return `<div class="box teach welcome">
<h1>${esc(fmtName(rec.name))}</h1>
<p class="dim">${esc(fmtDate(cal))}, day ${cal.day}.</p>
<p class="welcome-label">Starting skills</p>
<div class="statuses">${skills}</div>
<p class="welcome-label">Tip</p>
<p>${esc(tipFor(state.seed, state.survivors.length))}</p>
<button class="act" data-act="welcome-close">Begin</button>
</div>`;
}

/**
 * The card: who a survivor is, rendered one way for the screen and one way
 * for the clipboard from the same lines, so what the copy button gives is
 * what the screen shows without the markup. Every card carries the face,
 * the name, the four grade lines and the quirks; the living survivor's adds
 * the day, what they know, fear and have lost, and three stories from the
 * record. Stories leave the game as plain text until presentation exists.
 */
import { calendar } from "../sim/calendar";
import { stories } from "../sim/epitaph";
import { TOOLS } from "../sim/items";
import { fmtName } from "../sim/names";
import { gradeLines, quirkFear, quirkLine } from "../sim/person";
import { current } from "../sim/record";
import { level, SKILL_IDS, SKILL_NAMES } from "../sim/skills";
import type { GameState, LifeRecord, Person } from "../sim/types";
import { faceSvg } from "./face";
import { esc } from "./render";

export interface CardExtras {
  day: number;
  know: string;
  fear: string;
  lost: string;
  stories: string[];
}

/** The lines under the name, in order: grades, quirks, then the extras when given. */
export function cardLines(person: Person, extras?: CardExtras): string[] {
  const lines = [...gradeLines(person), ...person.quirks.map(quirkLine)];
  if (extras) {
    lines.push(`Day ${extras.day} of this life.`, `Knows: ${extras.know}`, `Fears: ${extras.fear}`, `Lost: ${extras.lost}`, ...extras.stories);
  }
  return lines;
}

export function cardText(person: Person, name: { first: string; last: string }, extras?: CardExtras): string {
  return [fmtName(name), ...cardLines(person, extras)].join("\n");
}

/**
 * The card as HTML. With `copy` the card carries a copy button and its text
 * for the clipboard; a card inside the landing screen's pick button carries
 * neither, since a button cannot hold a button.
 */
export function cardHtml(person: Person, name: { first: string; last: string }, extras?: CardExtras, opts: { px?: number; copy?: boolean; copied?: boolean } = {}): string {
  const lines = cardLines(person, extras);
  const px = opts.px ?? 64;
  const copy = opts.copy
    ? `<button class="mini" data-act="copy-card">${opts.copied ? "copied" : "copy"}</button><pre class="cardtext" hidden>${esc(cardText(person, name, extras))}</pre>`
    : "";
  return `<div class="cardbody"><div class="cardhead">${faceSvg(person, px)}<b>${esc(fmtName(name))}</b></div>${lines.map((t) => `<div class="e">${esc(t)}</div>`).join("")}${copy}</div>`;
}

/** What the living survivor's card adds, read from the state and the record. */
export function livingExtras(state: GameState): CardExtras {
  const rec = current(state);
  const p = state.player;
  const cal = calendar(state.minute, state.startDoy);
  const skills = SKILL_IDS.filter((s) => level(state.skills[s].xp) >= 3).map((s) => `${SKILL_NAMES[s]} ${level(state.skills[s].xp)}`);
  const shores = Object.keys(p.known).length;
  const know = [...skills, shores > 0 ? `${shores} shore${shores === 1 ? "" : "s"} read` : ""].filter(Boolean).join(", ") || "nothing yet.";
  const fears = rec.person.quirks.map(quirkFear).filter((f): f is string => f !== null);
  const fear = fears.length ? `${fears.join("; ")}.` : "nothing they will say.";
  const lost: string[] = [];
  if (p.toes) lost.push("toes to frostbite");
  if (p.fingers) lost.push("fingers to frostbite");
  for (const e of rec.events) {
    if (e.kind === "toolWorn") lost.push(`the ${TOOLS[e.tool].name}, worn out on day ${e.day}`);
    if (e.kind === "toolLost") lost.push(`the ${TOOLS[e.tool].name}, lost on day ${e.day}`);
  }
  return { day: cal.day, know: know.endsWith(".") ? know : `${know}.`, fear, lost: lost.length ? `${lost.join("; ")}.` : "nothing.", stories: stories(rec) };
}

/** A dead survivor's card, for the tombstone and the cemetery: the record's own stories, nothing that needs the body. */
export function deadExtras(rec: LifeRecord): CardExtras {
  const fears = rec.person.quirks.map(quirkFear).filter((f): f is string => f !== null);
  const lost: string[] = [];
  for (const e of rec.events) {
    if (e.kind === "frostbite") lost.push(`${e.part} to frostbite`);
    if (e.kind === "toolWorn") lost.push(`the ${TOOLS[e.tool].name}, worn out on day ${e.day}`);
    if (e.kind === "toolLost") lost.push(`the ${TOOLS[e.tool].name}, lost on day ${e.day}`);
  }
  return {
    day: rec.died?.day ?? 0,
    know: "what the entry says.",
    fear: fears.length ? `${fears.join("; ")}.` : "nothing they would say.",
    lost: lost.length ? `${lost.join("; ")}.` : "nothing.",
    stories: stories(rec),
  };
}

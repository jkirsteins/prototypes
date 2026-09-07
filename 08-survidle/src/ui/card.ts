/**
 * The card: who a survivor is, in three blocks a reader can tell apart at a
 * glance - the grades, the quirks, and this life. Every block is a group
 * rather than another row in one grey list, because the card is read in a
 * hurry: three across on the landing screen, beside an entry in the journal
 * and the cemetery.
 *
 * A fact is stated once. What a quirk refuses is the Fears line and is not
 * repeated in the quirk's own sentence; the dead say nothing under Knows,
 * and no card retells the record, because in every place a card renders the
 * life's own entry is printed beside it.
 */
import { calendar } from "../sim/calendar";
import { TOOLS } from "../sim/items";
import { fmtName } from "../sim/names";
import { type GradeLine, grades, quirkFear, quirkLine } from "../sim/person";
import { current } from "../sim/record";
import { level, SKILL_IDS, SKILL_NAMES } from "../sim/skills";
import type { GameState, LifeRecord, Person } from "../sim/types";
import { faceSvg } from "./face";
import { esc } from "./render";

export interface CardExtras {
  day: number;
  /** What they have learnt, or null for the dead, whose entry says it. */
  know: string | null;
  fear: string;
  lost: string;
}

/** One labelled row of the life block. */
interface Row {
  label: string;
  value: string;
}

export interface CardSections {
  grades: GradeLine[];
  quirks: string[];
  life: Row[];
}

/** The card's blocks, in reading order. */
export function cardSections(person: Person, extras?: CardExtras): CardSections {
  const life: Row[] = [];
  if (extras) {
    if (extras.know !== null) life.push({ label: "Knows", value: extras.know });
    life.push({ label: "Fears", value: extras.fear }, { label: "Lost", value: extras.lost });
  }
  return { grades: grades(person), quirks: person.quirks.map(quirkLine), life };
}

/** A quirk sentence, split so its name can carry the eye: "Forest-born." then the rest. */
function quirkHtml(line: string): string {
  const cut = line.indexOf(". ");
  if (cut < 0) return `<div class="q"><b>${esc(line)}</b></div>`;
  return `<div class="q"><b>${esc(line.slice(0, cut + 1))}</b> ${esc(line.slice(cut + 2))}</div>`;
}

/**
 * The card as HTML. The day rides in the head beside the name, where it
 * cannot be mistaken for the day that opens a story below.
 */
export function cardHtml(person: Person, name: { first: string; last: string }, extras?: CardExtras, opts: { px?: number } = {}): string {
  const s = cardSections(person, extras);
  const px = opts.px ?? 64;
  const day = extras ? `<span class="cardday">day ${extras.day}</span>` : "";
  const gradeRows = s.grades.map((g) => `<div class="g"><b>${esc(g.word)}</b>${g.evidence ? ` <span class="ev">${esc(g.evidence)}</span>` : ""}</div>`).join("");
  const quirks = s.quirks.length ? `<div class="cardblock">${s.quirks.map(quirkHtml).join("")}</div>` : "";
  const life = s.life.length ? `<dl class="cardblock kv">${s.life.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("")}</dl>` : "";
  return `<div class="cardbody"><div class="cardhead">${faceSvg(person, px)}<b>${esc(fmtName(name))}</b>${day}</div><div class="cardblock">${gradeRows}</div>${quirks}${life}</div>`;
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
  return { day: cal.day, know: know.endsWith(".") ? know : `${know}.`, fear, lost: lost.length ? `${lost.join("; ")}.` : "nothing." };
}

/** A dead survivor's card, for the tombstone and the cemetery: what the record kept, nothing that needs the body. */
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
    know: null,
    fear: fears.length ? `${fears.join("; ")}.` : "nothing they would say.",
    lost: lost.length ? `${lost.join("; ")}.` : "nothing.",
  };
}

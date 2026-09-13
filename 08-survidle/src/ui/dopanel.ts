import { itemLabel } from "../sim/actions";
import { calendar, type Calendar, monthName, monthStartDoy } from "../sim/calendar";
import { capabilityFor } from "../sim/capabilities";
import { knownHuntSpecies } from "../sim/hunting";
import { groundOf, intentOption, yieldItem } from "../sim/intent";
import { DECAYING, ITEM_NAMES, RECIPE_IDS, STRUCTURE_IDS } from "../sim/items";
import { gateSkill, NOT_ORDERS, orderGate, type Gate } from "../sim/ladder";
import { cellOf, kmBetween, SPOT_WORDS } from "../sim/position";
import { RUNG_LEVEL, skillLevel } from "../sim/skills";
import { fishSpecies, huntedLand, type Species } from "../sim/species";
import { plain } from "../sim/voice";
import { check, leftBehind, type TaskOption, withProgression } from "../sim/tasks";
import type { GameState, ItemId, OrderWhen, TaskId } from "../sim/types";
import { fmtDuration, fmtRealSeconds } from "../units";
import { realSecondsForOrder } from "./hurry";
import { regionState } from "../sim/regionstate";
import { shoppingTarget } from "../sim/shopping";
import { regionAt, type RegionDef, type World } from "../world/gen";
import { masteryLine } from "./panels";
import { purposesHtml } from "./panes";
import { PURPOSES, purposeOf, subtabOf } from "./purpose";
import { esc, rowRequest, type RowChoice, stockQty, type UiState } from "./render";
import { formatTravel } from "./travel";

const TREE_TERRAINS = ["spruce", "pine", "birch"] as const;

/**
 * The concepts a row serves, and the words it answers to that it never says
 * out loud. Nothing on the torch row says "fire" and nothing on the bough bed
 * says "sleep", so a reader who types the thing they want rather than the
 * thing it is called finds nothing without this.
 *
 * The `name` is the concept's own word and is rendered, as a tag on every row
 * it covers: a table the game consulted in private, put on screen. Without it
 * the food chain had no visible link anywhere - the ground advertised hare and
 * elk, the list offered no row that said "food", and a player could not learn
 * that roots are one except by reading to the end of a three-clause line. The
 * extra `words` are searched and never shown; they are the near misses a
 * reader might type instead.
 *
 * A row is named by its task id, or by `craft:<recipe>` and `build:<structure>`
 * where one task covers many rows. A concept lists every row it covers, the
 * ones whose own text already carries the word included, so each line reads as
 * the whole answer to that search rather than as the leftovers. A row that no
 * concept names is not a bug: most rows say what they are for.
 */
const VOCABULARY: { name: string; words: string; rows: string[] }[] = [
  { name: "weather", words: "sky forecast storm warning rain snow", rows: ["readSky"] },
  { name: "fire", words: "tinder kindling", rows: ["light", "lightIndoors", "lightTorch", "craft:torch", "craft:fireDrill", "build:firePit", "chop", "deadwood", "sticks", "bark", "split", "splitWedges", "melt"] },
  { name: "fuel", words: "firewood", rows: ["chop", "deadwood", "sticks", "split", "splitWedges"] },
  { name: "food", words: "eat hunger", rows: ["hunt", "findDen", "fish", "cook", "berries", "eggs", "roots", "innerBark", "seaweed", "tapSap", "crack", "grindBark", "hang", "setTrap", "emptyTrap", "build:snare", "build:dryingRack", "craft:snare", "craft:bow", "craft:arrows", "craft:fishingSpear", "craft:basketTrap"] },
  { name: "water", words: "drink thirst", rows: ["fill", "melt", "thaw", "iceHole", "tapSap", "build:seep", "build:waterStore", "craft:barkBucket", "craft:waterskin"] },
  { name: "warmth", words: "heat cold", rows: ["light", "lightIndoors", "lightTorch", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter", "build:boughBed", "repair", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens", "craft:hideBlanket"] },
  { name: "sleep", words: "rest bed", rows: ["rest", "build:boughBed", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter", "craft:hideBlanket"] },
  { name: "shelter", words: "roof cover weather", rows: ["findShelter", "improveCover", "emergencyShelter", "makeCamp", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter"] },
  { name: "tool", words: "gear", rows: ["craft", "sharpen", "hone"] },
  { name: "clothing", words: "clothes", rows: ["repair", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens"] },
  { name: "dark", words: "darkness", rows: ["lightTorch", "craft:torch"] },
  // The fire site is a fire pit and a hearth to everyone who has not read its label.
  { name: "firepit", words: "hearth", rows: ["build:firePit", "light"] },
];

/** Every row the vocabulary names, for the test that each one is a row that exists. */
export function keyedRows(): string[] {
  return [...new Set(VOCABULARY.flatMap((v) => v.rows))];
}

/** Every concept's word, for the filter to check a kw: against and for a test to walk. */
export function conceptNames(): string[] {
  return VOCABULARY.map((v) => v.name);
}

const KEYWORDS = new Map<string, string>();
const CONCEPTS = new Map<string, string[]>();
for (const { name, words, rows } of VOCABULARY) {
  for (const row of rows) {
    KEYWORDS.set(row, `${KEYWORDS.get(row) ?? ""} ${name} ${words}`);
    CONCEPTS.set(row, [...(CONCEPTS.get(row) ?? []), name]);
  }
}

/**
 * The concepts a row serves, in the order VOCABULARY declares them, so a row
 * reads the same way twice. Both keys are consulted: the concepts named for
 * the whole task, and the ones named for this recipe or structure. Splitting
 * a log is fire and fuel; a lean-to is warmth, sleep and shelter.
 */
export function conceptsFor(id: string | undefined, arg: string | undefined): string[] {
  if (!id) return [];
  const both = [...(CONCEPTS.get(id) ?? []), ...(arg ? (CONCEPTS.get(`${id}:${arg}`) ?? []) : [])];
  return VOCABULARY.map((v) => v.name).filter((n) => both.includes(n));
}

/** A row's invisible keywords: the ones for the whole task, plus the ones for this recipe or structure. */
function keywordsFor(id: string | undefined, arg: string | undefined): string {
  if (!id) return "";
  return `${KEYWORDS.get(id) ?? ""} ${arg ? (KEYWORDS.get(`${id}:${arg}`) ?? "") : ""}`;
}

/** What a row says out loud, in the order a reader's eye takes it: its own name first, then the lines under it. */
function spokenText(r: FilterableRow): [string, string] {
  return [r.label.toLowerCase(), [r.detail, r.why, r.group].filter(Boolean).join(" ").toLowerCase()];
}

/** Everything a row says plus everything it answers to, as one lowercase haystack. */
function rowText(r: FilterableRow): string {
  return [r.label, r.detail, r.why, r.group, keywordsFor(r.id, r.arg)].filter(Boolean).join(" ").toLowerCase();
}

interface FilterableRow {
  id?: string;
  arg?: string;
  label: string;
  detail?: string;
  why?: string;
  group?: string;
}

/** The words a filter is made of: lowercase, blanks dropped. */
function filterWords(text: string): string[] {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** The prefix that turns the filter box from a search into a concept. */
export const KW_PREFIX = "kw:";

/**
 * The concept a `kw:` filter asks for, or null for an ordinary search. A
 * concept tag writes this rather than its bare word because the two are
 * different questions: "food" is every row that says or answers to the
 * letters, which is the right answer when a reader types it and guesses;
 * `kw:food` is the rows the food concept names, exactly, which is the right
 * answer when they click a tag that promised them that set. A tag that
 * dragged in a row for spelling "food" in its detail line would be a tag
 * that lied about what it stood for.
 */
export function conceptAsked(text: string): string | null {
  const t = text.trim().toLowerCase();
  return t.startsWith(KW_PREFIX) ? t.slice(KW_PREFIX.length) : null;
}

/**
 * How squarely a row answers the words: 0 when its own name carries them all,
 * 1 when the lines under the name finish the job, 2 when only the invisible
 * keywords do, -1 when it does not answer at all. "fire" is answered by the
 * fire site at 0 and by Gather dead wood at 2, and that gap is what lets the
 * panel widen a search without burying the thing that was asked for.
 */
function matchTier(r: FilterableRow, words: string[]): number {
  const [name, lines] = spokenText(r);
  if (words.every((w) => name.includes(w))) return 0;
  if (words.every((w) => `${name} ${lines}`.includes(w))) return 1;
  const hay = rowText(r);
  return words.every((w) => hay.includes(w)) ? 2 : -1;
}

/**
 * Rows the filter finds, case-insensitive; an empty (or blank) filter keeps
 * everything. The match reads the whole row rather than the label alone, so a
 * word only the second line says - "firewood" under Gather dead wood, "axe"
 * under Open an ice hole - still finds the row it belongs to, and the
 * VOCABULARY above adds the words a row answers to but never says. Every word
 * in the filter has to land somewhere in that row, so a second word narrows
 * instead of widening. Best answer first, ties in the order they were listed.
 */
export function filterRows<T extends FilterableRow>(rows: T[], text: string): T[] {
  const concept = conceptAsked(text);
  if (concept !== null) return rows.filter((r) => conceptsFor(r.id, r.arg).includes(concept));
  const words = filterWords(text);
  if (!words.length) return rows;
  return rows
    .map((r, i) => ({ r, i, tier: matchTier(r, words) }))
    .filter((x) => x.tier >= 0)
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((x) => x.r);
}

/**
 * The same rows, split where the answer stops being direct: `direct` is what
 * the row itself says, `related` is what only the keywords claim. A reader
 * who types "fire" gets the fire rows as a list short enough to read, and the
 * wood and cooking rows the word also reaches under a heading that says so.
 */
export function rankRows<T extends FilterableRow>(rows: T[], text: string): { direct: T[]; related: T[] } {
  const words = filterWords(text);
  const found = filterRows(rows, text);
  // A concept has no weaker tier to hold apart: every row it returns is a row
  // it names, so there is no "also answers to" half to put under a heading.
  if (conceptAsked(text) !== null) return { direct: found, related: [] };
  if (!words.length) return { direct: found, related: [] };
  return { direct: found.filter((r) => matchTier(r, words) < 2), related: found.filter((r) => matchTier(r, words) === 2) };
}

/** Startable rows first; everything else keeps its order behind them. */
export function makeFirst<T extends { ok: boolean }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.ok), ...rows.filter((r) => !r.ok)];
}

/**
 * The Do panel's rows. The Hunt group is the region's own roster: what is
 * not here is not offered, plus the shore's own reading and the trap it
 * sets and empties.
 */
export function intentGroups(r: RegionDef): { label: string; items: { id: TaskId; arg?: string }[] }[] {
  return [
    { label: "Gather", items: [
      { id: "chop" },
      ...TREE_TERRAINS.filter((terrain) => r.frac[terrain] > 0).map((terrain) => ({ id: "chop" as TaskId, arg: terrain })),
      { id: "deadwood" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }, { id: "eggs" }, { id: "innerBark" }, { id: "roots" }, { id: "tapSap" }, { id: "seaweed" },
    ] },
    { label: "Hunt", items: [
      { id: "hunt" as TaskId, arg: "any" },
      ...huntedLand().map((s) => ({ id: "hunt" as TaskId, arg: s })),
      { id: "findDen" as TaskId },
      { id: "fish" as TaskId, arg: "any" },
      ...fishSpecies().filter((s) => r.capacity[s]).map((s) => ({ id: "fish" as TaskId, arg: s })),
      { id: "read" as TaskId }, { id: "setTrap" as TaskId }, { id: "emptyTrap" as TaskId },
    ] },
    { label: "Explore", items: [
      { id: "readSky" as TaskId },
      { id: "findShelter" as TaskId },
      { id: "explore" as TaskId, arg: `region:${r.id}` },
      ...r.neighbours.map((n) => ({ id: "explore" as TaskId, arg: `region:${n.id}` })),
      { id: "searchHome" as TaskId },
    ] },
    { label: "Camp", items: [{ id: "makeCamp" }, { id: "split" }, { id: "splitWedges" }, { id: "hang" }, { id: "cook", arg: "rawMeat" }, { id: "cook", arg: "fish" }, { id: "cook", arg: "oilyFish" }, { id: "cook", arg: "rawFat" }, { id: "cook", arg: "roots" }, { id: "crack" }, { id: "grindBark" }, { id: "light" }, { id: "lightIndoors" }, { id: "melt" }, { id: "thaw" }, { id: "fill", arg: "shore" }, { id: "fill", arg: "hole" }, { id: "fill", arg: "seep" }, { id: "iceHole" }, { id: "lightTorch" }, { id: "repair" }, { id: "sharpen" }, { id: "hone" }, { id: "rest" }] },
    { label: "Make", items: RECIPE_IDS.map((id) => ({ id: "craft" as TaskId, arg: id })) },
    // Mending sits with building because it is the same act on the same things: a
    // lean-to whose roof has gone is a lean-to to build again. It had no row of its
    // own while the raw list existed, which meant a structure could decay with no
    // way to repair it that a player would ever find.
    { label: "Build", items: [
      { id: "improveCover" as TaskId },
      { id: "emergencyShelter" as TaskId },
      ...STRUCTURE_IDS.map((id) => ({ id: "build" as TaskId, arg: id })),
      ...DECAYING.map((id) => ({ id: "mend" as TaskId, arg: id })),
      { id: "mend" as TaskId, arg: "seep" },
    ] },
  ];
}

/**
 * A kind button's label, item-aware: a keep or an until-camp-has names the
 * goods it is counting, not just the bare number. Light holds no stock, so
 * its "keep camp at N" has no N to show: the keep there is the fire staying
 * lit.
 */
function kindLabel(id: TaskId, arg: string | undefined, until: RowChoice["until"], n: number): string {
  const item = yieldItem(id, arg);
  if (until === "times") return `${n}x`;
  if (until === "daily") return `${n}/day`;
  if (until === "campHas") return item ? `camp: ${itemLabel(item, n)}` : "once";
  if (until === "keep") return item ? `keep: ${itemLabel(item, n)}` : id === "light" || id === "lightIndoors" ? "keep lit" : "once";
  if (until === "forever") return "forever";
  return "once";
}

/**
 * A single reason for every skill-gated control. The ladder's internal rung
 * names and training estimates do not belong in an action picker.
 */
function kindNeeds(gate: Gate): string {
  return gate.ok ? "" : "insufficient skill";
}

/**
 * The gate on a throwaway order carrying one condition and nothing else,
 * so the small print names that rung whatever kind the row is set to. The
 * figures are placeholders: the ladder reads which fields are there, not
 * what they say.
 */
function rungGate(state: GameState, id: TaskId, arg: string, rung: "condition" | "pace"): Gate {
  const when: OrderWhen = rung === "pace" ? { by: 0 } : { restart: 0 };
  return orderGate(state, { task: id, arg: arg || undefined, until: { kind: "once" }, deliver: "leave", where: "nearest", when }, "job");
}

/** A month picker's options: "any", then the twelve by name, the chosen one selected by the day of year it starts on. */
function monthOptions(chosen: number | undefined): string {
  const months = Array.from({ length: 12 }, (_, m) => `<option value="${m}"${chosen === monthStartDoy(m) ? " selected" : ""}>${esc(monthName(m))}</option>`).join("");
  return `<option value=""${chosen === undefined ? " selected" : ""}>any</option>${months}`;
}

/**
 * The condition fields under a row's kinds, from the condition rung: a
 * season by month, a stock line read at camp, and for a row that counts a
 * stock the restart line a keep's band reads and, at the pace rung, the
 * date its target is due. Under a rung the fields are absent and the small
 * print says which level opens them.
 *
 * The restart and the date show beside the kinds rather than after a keep
 * is chosen: a kind button is the click that gives the order, so there is
 * no moment between choosing "keep" and having given it. Only a keep
 * carries them out of rowRequest, so setting them and then clicking "once"
 * gives the once job it says.
 *
 * The item picker offers everything with a name rather than only what camp
 * holds: a stock line is most often a wait for something camp has none of
 * yet ("while camp has at least 1 bone"), which a picker over the pile
 * could not say.
 */
function whenHtml(o: TaskOption, arg: string, ui: UiState, state: GameState): string {
  const skill = gateSkill(o.id, arg || undefined);
  if (!skill) return "";
  const level = skillLevel(state, skill);
  const w = ui.choice.when;
  const keep = yieldItem(o.id, arg || undefined) !== null;
  const parts: string[] = [];
  if (level < RUNG_LEVEL.condition) {
    parts.push(`<small>${esc(kindNeeds(rungGate(state, o.id, arg, "condition")))}</small>`);
  } else {
    parts.push(`<span>from <select data-row-season-from>${monthOptions(w.season?.from)}</select> to <select data-row-season-to>${monthOptions(w.season?.to)}</select></span>`);
    const items = (Object.keys(ITEM_NAMES) as ItemId[]).map((i) => `<option value="${i}"${w.stock?.item === i ? " selected" : ""}>${esc(ITEM_NAMES[i])}</option>`).join("");
    const mode = `<select data-row-stock-mode><option value="atLeast"${w.stock?.under === undefined ? " selected" : ""}>at least</option><option value="under"${w.stock?.under === undefined ? "" : " selected"}>under</option></select>`;
    parts.push(`<span>while camp has <select data-row-stock-item><option value=""${w.stock ? "" : " selected"}>anything</option>${items}</select> ${mode} <input type="number" min="0" data-row-stock-n value="${w.stock ? stockQty(w.stock) : ""}"></span>`);
    if (keep) parts.push(`<span>restart under <input type="number" min="0" data-row-restart value="${w.restart ?? ""}"></span>`);
  }
  if (keep && level >= RUNG_LEVEL.condition) {
    // The spending box sits beside the date because it says what happens after
    // it: a store is spent by the window's close, a buffer holds at its figure.
    // With the date on "any" there is no "after" to qualify, so the box is not
    // drawn at all rather than offering a tick that would change nothing.
    const spendBox = w.by === undefined ? "" : ` <label><input type="checkbox" data-row-spend${w.spend ? " checked" : ""}> spent by the season's close</label>`;
    parts.push(level >= RUNG_LEVEL.pace
      ? `<span>due by <select data-row-by>${monthOptions(w.by)}</select>${spendBox}</span>`
      : `<small>${esc(kindNeeds(rungGate(state, o.id, arg, "pace")))}</small>`);
  }
  return `<div class="when">${parts.join("")}</div>`;
}

/** Only work with a real ground (sim/intent.ts's groundOf) moves for a different spot; everything else is camp-bound or carried, whatever its display group. */
function rowHasWhere(o: TaskOption): boolean {
  return groundOf(o.id, o.arg) !== null;
}

function rowWhereHtml(o: TaskOption, arg: string, ui: UiState, state: GameState, world: World): string {
  const r = regionAt(world, state.player.region);
  const here = cellOf(state, world);
  const opts = r.spots.filter((s) => s.id !== "camp").map((s) => {
    const km = kmBetween(state, world, here, s.cell, "safe");
    const walk = check(state, world, calendar(state.minute, state.startDoy), "walk", `cell:${s.cell}`);
    const label = `${SPOT_WORDS[s.id]}${km === null || !walk.ok ? "" : ` ${formatTravel(km, walk.duration, ui.travelDisplay)}`}`;
    return `<option value="${s.id}"${ui.choice.where === s.id ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
  return `<select data-act="row-where" data-id="${o.id}" data-arg="${esc(arg)}"><option value="nearest"${ui.choice.where === "nearest" ? " selected" : ""}>nearest</option>${opts}</select>`;
}

/**
 * The open row's expansion: the six kinds as compact buttons, the count,
 * the deliver toggle, for a gather or a hunt the
 * where select, and under them the conditions the row's rungs have opened.
 * "once" leads them so a plain click's deliver and where can
 * be chosen deliberately too, through the same row-kind path every other
 * kind takes, rather than always falling back to the default choice.
 */
function rowExpandHtml(o: TaskOption, arg: string, ui: UiState, state: GameState, world: World): string {
  const kinds: RowChoice["until"][] = ["once", "times", "daily", "campHas", "keep", "forever"];
  const button = (k: RowChoice["until"]) => {
    const { req, kind } = rowRequest({ ...ui.choice, until: k }, o.id, arg);
    const gate = orderGate(state, req, kind);
    const label = esc(kindLabel(o.id, arg, k, ui.choice.n));
    const title = gate.ok ? label : "insufficient skill";
    return `<span class="kind"><button data-act="row-kind" data-id="${o.id}" data-arg="${esc(arg)}" data-until="${k}" class="mini${gate.ok ? "" : " off"}" title="${title}">${label}</button></span>`;
  };
  const buttons = kinds.map(button).join("");
  const n = `<input type="number" min="1" data-row-n value="${ui.choice.n}">`;
  const deliver = `<button class="mini" data-act="row-deliver" data-id="${o.id}" data-arg="${esc(arg)}">${ui.choice.deliver === "camp" ? "bring to camp" : "leave where it is"}</button>`;
  const where = rowHasWhere(o) ? rowWhereHtml(o, arg, ui, state, world) : "";
  // What the face no longer says, said here in full.
  const detail = o.detail ? `<div class="detail"><small>${esc(plain(o.detail))}</small></div>` : "";
  const target = (o.id === "craft" || o.id === "build") ? shoppingTarget(o.id, arg) : null;
  const tracked = target && state.shopping?.task === target.task && state.shopping.arg === target.arg;
  const track = target
    ? `<button class="mini shopping-track${tracked ? " on" : ""}" data-act="shopping-track" data-id="${o.id}" data-arg="${esc(arg)}">${tracked ? "tracking materials" : "track materials"}</button>`
    : "";
  return `${detail}<div class="expand">${buttons}${n}${deliver}${where}${track}</div>${whenHtml(o, arg, ui, state)}`;
}

/**
 * A row's concepts, as buttons. Clicking one sets the filter to that concept,
 * which is the one-click category filter asked for at [203]: the objection was
 * to typing, not to filtering, and the filter is what rescued the tester twice.
 * The tag is rendered outside the row's own button, because a button inside a
 * button is not a button anywhere.
 */
function conceptsHtml(id: string | undefined, arg: string | undefined): string {
  const names = conceptsFor(id, arg);
  if (!names.length) return "";
  const one = (n: string) => `<button class="kw" data-act="kw" data-kw="${esc(n)}" title="Show every ${esc(n)} row">${esc(n)}</button>`;
  return `<span class="kws">${names.map(one).join("")}</span>`;
}

/**
 * A NOT_ORDERS task (rest, sleep, night, or a runner step) is a move the
 * Do panel starts directly, not something the ladder gates: rowRequest
 * always collapses its choice to a once job, so a kind button on such a row
 * would read "forever" and give a one-off rest. No more, no expansion.
 */
function intentRowHtml(o: TaskOption, ui: UiState, state: GameState, world: World): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(plain(o.recommended.text))}</small>` : "";
  const tags = conceptsHtml(o.id, o.arg);
  const bar = o.mastery ? masteryLine(state, o.mastery) : "";
  // A producer works while you do not, which is the shape of the whole game and
  // which no row said. It shows on a row that cannot start yet too: a producer
  // under its level is the row a player most needs the promise on.
  const cap = capabilityFor(o.id, o.arg);
  const gives = cap?.producer ? `<small class="gives">${esc(cap.gives)}</small>` : "";
  const canOpen = !NOT_ORDERS.includes(o.id);
  const open = canOpen && ui.open !== null && ui.open.id === o.id && ui.open.arg === arg;
  const more = canOpen ? `<button class="mini row-more${open ? " on" : ""}" data-act="row-more" data-id="${o.id}" data-arg="${esc(arg)}" aria-expanded="${open}">more</button>` : "";
  const expand = open ? rowExpandHtml(o, arg, ui, state, world) : "";
  const openCls = open ? " open" : "";
  if (!o.ok) {
    // Queuing a blocked makeCamp anyway would let the runner site the camp wherever the
    // body happens to be standing when the order starts, not the cell the click meant:
    // it gets no "add it anyway" queue path, only the reason it is grey. Work this
    // ground will never offer gets none either: the row would wait for a thing that
    // is not coming, at the head of a list it stops.
    const queueable = o.id !== "makeCamp" && !o.never;
    const act = queueable ? ` data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}" title="Add it anyway; it waits until it can start"` : " disabled";
    return `<div class="opt off${openCls}" data-opt="intent:${o.id}:${esc(arg)}"><button class="act"${act}>${esc(o.label)}${rec}<small>${esc(plain(o.why))}${o.detail ? ` - ${esc(plain(o.detail))}` : ""}</small>${bar}${gives}</button>${tags}${more}${expand}</div>`;
  }
  // Binding a camp is one click, no undo, and it decides every walk the run
  // makes afterwards. It was done by accident, immediately after learning that
  // siting is worth 5 km of walking, and the survivor ended up with a camp in
  // each of two regions and no way to tell which was which. So the click asks,
  // and the question says what camp this region already holds and what moving
  // it leaves behind, since neither is undone by the click.
  if (o.id === "makeCamp" && ui.confirmCamp && regionState(state, world, state.player.region).campCell !== null) {
    const st = regionState(state, world, state.player.region);
    // Where the camp being moved actually is. Not whereIs, which answers "camp"
    // for the camp cell and turns the whole sentence into a tautology.
    const km = kmBetween(state, world, cellOf(state, world), st.campCell!, "safe");
    const walk = check(state, world, calendar(state.minute, state.startDoy), "walk", `cell:${st.campCell!}`);
    const held = km === null || !walk.ok
      ? `${esc(regionAt(world, state.player.region).name)}'s camp is somewhere {you} cannot reach from here`
      : `${esc(regionAt(world, state.player.region).name)}'s camp stands ${esc(formatTravel(km, walk.duration, ui.travelDisplay))} from here`;
    const left = leftBehind(state, world);
    const small = left ? `${held}. ${esc(left)}` : `${held}.`;
    return `<div class="opt${openCls}" data-opt="intent:makeCamp:"><div class="confirm"><b>Move camp here?</b> <small>${small}</small><div><button class="mini danger" data-act="camp-yes" data-id="makeCamp" data-arg="">yes, camp here</button> <button class="mini" data-act="camp-no">no</button></div></div></div>`;
  }
  // A row you can do says its name and how long. Its detail is a sentence a
  // reader has to parse mid-scan, and the scan is what this panel is for, so
  // it moves under `more` rather than going away: still there for whoever
  // wants it, out of the way of whoever is looking for something else.
  // The bracket is the wall clock the bar will then show: a once action runs
  // hurried from start to end, anything else at the one scale, and the body's
  // pace stretches both. The row's own kind choice decides which it will be.
  const once = rowRequest(ui.choice, o.id, arg).req.until.kind === "once";
  const secs = fmtRealSeconds(realSecondsForOrder(state, world, o.id, o.arg, o.duration, once));
  const line = o.duration > 0 ? `${fmtDuration(o.duration)} (${secs})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const initial = o.initialWalk;
  const walk = initial
    ? `<small class="initial-walk">will walk to ${initial.nearest ? "nearest " : ""}${esc(initial.destination)} - ${esc(formatTravel(initial.km, initial.minutes, ui.travelDisplay))}</small>`
    : "";
  const possibilities = o.id === "makeCamp" && o.detail ? `<small>${esc(o.detail)}</small>` : "";
  return `<div class="opt${openCls}" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${esc(line)}</small>${walk}${possibilities}${bar}${gives}</button>${tags}${more}${expand}</div>`;
}

/** A group's rows, built at the open row's own chosen spot, so its duration and ok reflect that spot. */
function groupRows(g: { label: string; items: { id: TaskId; arg?: string }[] }, state: GameState, world: World, cal: Calendar, ui: UiState): TaskOption[] {
  const knownGame = new Set(knownHuntSpecies(state, world));
  return g.items.filter(({ id, arg }) => id !== "hunt" || arg === "any" || knownGame.has(arg as Species)).map(({ id, arg }) => {
    const argKey = arg ?? "";
    const open = ui.open !== null && ui.open.id === id && ui.open.arg === argKey;
    const where = open ? ui.choice.where : "nearest";
    const option = withProgression(state, world, intentOption(state, world, cal, id, arg, where));
    if (id !== "explore" || !arg?.startsWith("region:")) return option;
    const region = Number(arg.slice("region:".length));
    const label = region === state.player.region ? "Explore this region" : `Explore ${regionAt(world, region).name}`;
    return { ...option, label };
  }).filter((o) => (o.id !== "explore" && o.id !== "searchHome") || o.ok);
}

/**
 * The box the rows sit in, whether they came from a purpose or from the
 * filter.
 *
 * Both views use it and both give it the same name, because a row that
 * changed depth between them would be destroyed and rebuilt on every
 * keystroke: morphChildren finds a named node again among its siblings,
 * and a row whose parent is a different node has no siblings to be found
 * among. The heading is the only thing that differs.
 */
function rowsBox(key: string, heading: string, rows: string): string {
  const head = heading ? `<div class="fold">${heading}</div>` : "";
  return `<div class="grp" data-rows="${key}">${head}${rows}</div>`;
}

/**
 * What a filter shows instead of the pane: one ranked list across every
 * subtab, the rows that say the words above the rows that merely answer to
 * them. The purposes stand aside for as long as the box has text in it - a
 * search that left its answer shut inside a purpose the reader was not
 * looking at is the search that sent them looking by hand.
 */
function searchHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const rows = intentGroups(regionAt(world, state.player.region)).flatMap((g) => groupRows(g, state, world, cal, ui));
  const { direct, related } = rankRows(rows, ui.filter);
  // A concept heading says the concept, not the "kw:" that addressed it: the
  // prefix is how a tag asks, and no part of it is for a reader.
  const concept = conceptAsked(ui.filter);
  const typed = esc(concept ?? ui.filter.trim());
  if (!direct.length && !related.length) return rowsBox("main", `nothing answers to "${typed}"`, "");
  const body = (list: TaskOption[]) => list.map((o) => intentRowHtml(o, ui, state, world)).join("");
  // "also" only means something under rows that said the word themselves. A
  // search every row answers only through its keywords - "firepit", which no
  // label spells that way - is a list of answers, not a list of afterthoughts.
  if (!direct.length) return rowsBox("main", typed, body(related));
  return `${rowsBox("main", typed, body(direct))}${rowsBox("also", `also answers to "${typed}"`, body(related))}`;
}

/**
 * The rows of the showing subtab and purpose, startable ones first.
 *
 * Generic tree and fish actions lead their panes. Their specific variants
 * stay behind a small chooser so the common case is short without making
 * those choices undiscoverable. What a player cannot do yet still shows,
 * and says why.
 */
function paneRows(state: GameState, world: World, cal: Calendar, ui: UiState): TaskOption[] {
  const currentRegion = `region:${state.player.region}`;
  const wanted = intentGroups(regionAt(world, state.player.region))
    .flatMap((g) => g.items)
    .filter((i) => subtabOf(i.id, i.arg) === ui.panes.subtab && purposeOf(i.id, i.arg) === ui.panes.purpose)
    .filter((i) => i.id !== "chop" || !i.arg || ui.specific.trees)
    .filter((i) => i.id !== "fish" || i.arg === "any" || ui.specific.fish)
    .filter((i) => i.id !== "explore" || i.arg === currentRegion || ui.specific.regions);
  return makeFirst(groupRows({ label: ui.panes.subtab, items: wanted }, state, world, cal, ui));
}

/** How many rows each purpose of the showing subtab holds, for the counts the left pane carries. */
export function purposeCounts(state: GameState, world: World, ui: UiState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of PURPOSES[ui.panes.subtab]) counts[q] = 0;
  for (const i of intentGroups(regionAt(world, state.player.region)).flatMap((g) => g.items)) {
    if (subtabOf(i.id, i.arg) !== ui.panes.subtab) continue;
    if (i.id === "chop" && i.arg && !ui.specific.trees) continue;
    if (i.id === "fish" && i.arg !== "any" && !ui.specific.fish) continue;
    if (i.id === "explore" && i.arg !== `region:${state.player.region}` && !ui.specific.regions) continue;
    if ((i.id === "explore" || i.id === "searchHome") && !check(state, world, calendar(state.minute, state.startDoy), i.id, i.arg).ok) continue;
    const q = purposeOf(i.id, i.arg);
    if (q !== null && q in counts) counts[q]++;
  }
  return counts;
}

/**
 * The left pane of the Do split: the purposes this subtab offers, and how
 * many rows each holds. Search is a separate, global mode, so its results
 * use the whole width instead of leaving unrelated browse controls visible.
 */
export function doPurposesHtml(state: GameState, world: World, ui: UiState): string {
  if (ui.filter.trim()) return "";
  return purposesHtml(ui.panes, purposeCounts(state, world, ui));
}

function specificChooser(kind: keyof UiState["specific"], open: boolean): string {
  const one = kind === "trees" ? "tree" : kind === "regions" ? "region" : "fish";
  const label = open ? `hide ${one} choices` : `choose ${one}...`;
  return `<button class="mini specific" data-act="specific" data-specific="${kind}" aria-expanded="${open}">${label}</button>`;
}

function paneRowsHtml(rows: TaskOption[], ui: UiState, state: GameState, world: World): string {
  const currentRegion = `region:${state.player.region}`;
  const cal = calendar(state.minute, state.startDoy);
  const surveyPane = ui.panes.subtab === subtabOf("explore") && ui.panes.purpose === purposeOf("explore");
  const hasRegionChoices = surveyPane && regionAt(world, state.player.region).neighbours
    .some((n) => check(state, world, cal, "explore", `region:${n.id}`).ok);
  const chooser = hasRegionChoices ? specificChooser("regions", ui.specific.regions) : "";
  const currentIndex = rows.findIndex((o) => o.id === "explore" && o.arg === currentRegion);
  const rendered = rows.map((o) => {
    const row = intentRowHtml(o, ui, state, world);
    if (o.id === "chop" && !o.arg) return `${row}${specificChooser("trees", ui.specific.trees)}`;
    if (o.id === "fish" && o.arg === "any") return `${row}${specificChooser("fish", ui.specific.fish)}`;
    return row;
  });
  if (!chooser) return rendered.join("");
  if (currentIndex < 0) return `${chooser}${rendered.join("")}`;
  rendered[currentIndex] += chooser;
  return rendered.join("");
}

/** The item pane: the rows of one purpose, or what the filter found across all of them. */
export function doHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const body = ui.filter.trim()
    ? searchHtml(state, world, cal, ui)
    : ((rows) => (rows.length ? rowsBox("main", "", paneRowsHtml(rows, ui, state, world)) : rowsBox("main", "nothing here yet", "")))(
        paneRows(state, world, cal, ui),
      );
  return body;
}

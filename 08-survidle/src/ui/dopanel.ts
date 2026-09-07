import { itemLabel } from "../sim/actions";
import { type Calendar, monthName, monthStartDoy } from "../sim/calendar";
import { groundOf, intentOption, yieldItem } from "../sim/intent";
import { ITEM_NAMES, RECIPE_IDS, STRUCTURE_IDS } from "../sim/items";
import { gateSkill, NOT_ORDERS, orderGate, type Gate } from "../sim/ladder";
import { cellOf, kmBetween } from "../sim/position";
import { levelMinutes, RUNG_LEVEL, skillLevel } from "../sim/skills";
import { fishSpecies, huntedLand } from "../sim/species";
import { plain } from "../sim/voice";
import { SPOT_NAMES, type TaskOption, withProgression } from "../sim/tasks";
import type { GameState, ItemId, OrderWhen, TaskId } from "../sim/types";
import { fmtDuration, fmtKm, fmtReal } from "../units";
import { regionAt, type RegionDef, type World } from "../world/gen";
import { actionsHtml, instantHtml, masteryBar } from "./panels";
import { esc, rowRequest, type RowChoice, stockQty, type UiState } from "./render";

/** The Do panel's fold state, under one local storage key: which groups are shut. Absent means open. */
export const FOLD_KEY = "survidle.ui";

export function loadFolds(storage: Storage): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(FOLD_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveFold(storage: Storage, group: string, open: boolean): void {
  storage.setItem(FOLD_KEY, JSON.stringify({ ...loadFolds(storage), [group]: open }));
}

/**
 * The words a row answers to that it never says out loud. Nothing on the
 * torch row says "fire" and nothing on the bough bed says "sleep", so a
 * reader who types the thing they want rather than the thing it is called
 * finds nothing without this. The words are never rendered: they widen what
 * the filter matches and change no part of the panel a player looks at.
 *
 * A row is named by its task id, or by `craft:<recipe>` and `build:<structure>`
 * where one task covers many rows. A concept lists every row it covers, the
 * ones whose own text already carries the word included, so each line reads as
 * the whole answer to that search rather than as the leftovers. A row that no
 * concept names is not a bug: most rows say what they are for.
 */
const VOCABULARY: { words: string; rows: string[] }[] = [
  { words: "fire tinder kindling", rows: ["light", "lightIndoors", "lightTorch", "craft:torch", "craft:fireDrill", "build:firePit", "chop", "deadwood", "sticks", "bark", "split", "splitWedges", "melt", "night"] },
  { words: "fuel firewood", rows: ["chop", "deadwood", "sticks", "split", "splitWedges"] },
  { words: "food eat hunger", rows: ["hunt", "fish", "cook", "berries", "eggs", "roots", "innerBark", "seaweed", "tapSap", "crack", "grindBark", "hang", "setTrap", "emptyTrap", "build:snare", "build:dryingRack", "craft:snare", "craft:bow", "craft:arrows", "craft:fishingSpear", "craft:basketTrap"] },
  { words: "water drink thirst", rows: ["fill", "melt", "thaw", "iceHole", "tapSap", "build:seep", "build:waterStore", "craft:barkBucket", "craft:waterskin"] },
  { words: "warmth heat cold", rows: ["light", "lightIndoors", "lightTorch", "night", "sleep", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter", "build:boughBed", "repair", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens", "craft:hideBlanket"] },
  { words: "sleep rest bed", rows: ["sleep", "rest", "night", "build:boughBed", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter", "craft:hideBlanket"] },
  { words: "shelter roof", rows: ["makeCamp", "build:leanTo", "build:cabin", "build:turfHut", "build:snowShelter"] },
  { words: "tool gear", rows: ["craft", "sharpen", "hone"] },
  { words: "clothing clothes", rows: ["repair", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens"] },
  { words: "dark darkness", rows: ["lightTorch", "craft:torch"] },
];

/** Every row the vocabulary names, for the test that each one is a row that exists. */
export function keyedRows(): string[] {
  return [...new Set(VOCABULARY.flatMap((v) => v.rows))];
}

const KEYWORDS = new Map<string, string>();
for (const { words, rows } of VOCABULARY) {
  for (const row of rows) KEYWORDS.set(row, `${KEYWORDS.get(row) ?? ""} ${words}`);
}

/** A row's invisible keywords: the ones for the whole task, plus the ones for this recipe or structure. */
function keywordsFor(id: string | undefined, arg: string | undefined): string {
  if (!id) return "";
  return `${KEYWORDS.get(id) ?? ""} ${arg ? (KEYWORDS.get(`${id}:${arg}`) ?? "") : ""}`;
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

/**
 * Rows the filter finds, case-insensitive; an empty (or blank) filter keeps
 * everything. The match reads the whole row rather than the label alone, so a
 * word only the second line says - "firewood" under Gather dead wood, "axe"
 * under Open an ice hole - still finds the row it belongs to, and the
 * VOCABULARY above adds the words a row answers to but never says. Every word
 * in the filter has to land somewhere in that row, so a second word narrows
 * instead of widening.
 */
export function filterRows<T extends FilterableRow>(rows: T[], text: string): T[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = rowText(r);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Rows that cannot start now and whose skill sits more than a level under
 * the row's recommended rung: tucked behind "more" so the panel opens on
 * what a fresh survivor can actually reach for. A row with no
 * recommendation, or one within a level of it, is never far, whatever `ok`
 * says. `withProgression` already carries the gap on `recommended.short`.
 */
export function splitFar(rows: TaskOption[], _state: GameState): { near: TaskOption[]; far: TaskOption[] } {
  const near: TaskOption[] = [];
  const far: TaskOption[] = [];
  for (const o of rows) {
    (!o.ok && (o.recommended?.short ?? 0) > 1 ? far : near).push(o);
  }
  return { near, far };
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
    { label: "Gather", items: [{ id: "chop" }, { id: "deadwood" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }, { id: "eggs" }, { id: "innerBark" }, { id: "roots" }, { id: "tapSap" }, { id: "seaweed" }] },
    { label: "Hunt", items: [
      { id: "hunt" as TaskId, arg: "any" },
      ...huntedLand().filter((s) => r.capacity[s]).map((s) => ({ id: "hunt" as TaskId, arg: s })),
      { id: "fish" as TaskId, arg: "any" },
      ...fishSpecies().filter((s) => r.capacity[s]).map((s) => ({ id: "fish" as TaskId, arg: s })),
      { id: "read" as TaskId }, { id: "setTrap" as TaskId }, { id: "emptyTrap" as TaskId },
    ] },
    { label: "Camp", items: [{ id: "makeCamp" }, { id: "split" }, { id: "splitWedges" }, { id: "hang" }, { id: "cook", arg: "rawMeat" }, { id: "cook", arg: "fish" }, { id: "cook", arg: "oilyFish" }, { id: "cook", arg: "rawFat" }, { id: "cook", arg: "roots" }, { id: "crack" }, { id: "grindBark" }, { id: "light" }, { id: "lightIndoors" }, { id: "melt" }, { id: "thaw" }, { id: "fill", arg: "shore" }, { id: "fill", arg: "hole" }, { id: "fill", arg: "seep" }, { id: "iceHole" }, { id: "lightTorch" }, { id: "repair" }, { id: "sharpen" }, { id: "hone" }, { id: "night" }, { id: "rest" }, { id: "sleep" }] },
    { label: "Make", items: RECIPE_IDS.map((id) => ({ id: "craft" as TaskId, arg: id })) },
    { label: "Build", items: STRUCTURE_IDS.map((id) => ({ id: "build" as TaskId, arg: id })) },
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
  if (until === "times") return `${n} times`;
  if (until === "daily") return `${n} a day`;
  if (until === "campHas") return item ? `until camp has ${itemLabel(item, n)}` : "once";
  if (until === "keep") return item ? `keep camp at ${itemLabel(item, n)}` : id === "light" || id === "lightIndoors" ? "keep it lit" : "once";
  if (until === "forever") return "forever";
  return "once";
}

/**
 * The small print under a kind or a condition the row's skill has not
 * earned: the rung the gate stopped at, in the gate's own words, and about
 * how long to it.
 */
function kindNeeds(state: GameState, gate: Gate): string {
  if (gate.ok) return "";
  const xp = state.skills[gate.skill].xp;
  const hours = Math.max(1, Math.round((levelMinutes(gate.at) - xp) / 60));
  return `${plain(gate.why)}, about ${hours} h`;
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
    parts.push(`<small>${esc(kindNeeds(state, rungGate(state, o.id, arg, "condition")))}</small>`);
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
      : `<small>${esc(kindNeeds(state, rungGate(state, o.id, arg, "pace")))}</small>`);
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
    const km = kmBetween(world, here, s.cell);
    const label = `${SPOT_NAMES[s.id]}${km === null ? "" : ` ${fmtKm(km)}`}`;
    return `<option value="${s.id}"${ui.choice.where === s.id ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
  return `<select data-act="row-where" data-id="${o.id}" data-arg="${esc(arg)}"><option value="nearest"${ui.choice.where === "nearest" ? " selected" : ""}>nearest</option>${opts}</select>`;
}

/**
 * The open row's expansion: the six kinds as buttons (greyed with the rung
 * and about how many hours to it when the row's skill has not earned
 * them), the count, the deliver toggle, for a gather or a hunt the
 * where select, and under them the conditions the row's rungs have opened.
 * "once" leads them so a plain click's deliver and where can
 * be chosen deliberately too, through the same row-kind path every other
 * kind takes, rather than always falling back to the default choice.
 */
function rowExpandHtml(o: TaskOption, arg: string, ui: UiState, state: GameState, world: World): string {
  const kinds: RowChoice["until"][] = ["once", "times", "daily", "campHas", "keep", "forever"];
  const buttons = kinds.map((k) => {
    const { req, kind } = rowRequest({ ...ui.choice, until: k }, o.id, arg);
    const gate = orderGate(state, req, kind);
    const label = esc(kindLabel(o.id, arg, k, ui.choice.n));
    const needs = gate.ok ? "" : `<small>${esc(kindNeeds(state, gate))}</small>`;
    return `<span class="kind"><button data-act="row-kind" data-id="${o.id}" data-arg="${esc(arg)}" data-until="${k}" class="mini${gate.ok ? "" : " off"}" title="${label}">${label}</button>${needs}</span>`;
  }).join("");
  const n = `<input type="number" min="1" data-row-n value="${ui.choice.n}">`;
  const deliver = `<button class="mini" data-act="row-deliver" data-id="${o.id}" data-arg="${esc(arg)}">${ui.choice.deliver === "camp" ? "bring to camp" : "leave where it is"}</button>`;
  const where = rowHasWhere(o) ? rowWhereHtml(o, arg, ui, state, world) : "";
  return `<div class="expand">${buttons}${n}${deliver}${where}</div>${whenHtml(o, arg, ui, state)}`;
}

/**
 * A NOT_ORDERS task (rest, sleep, night, wait, a runner step) is a move the
 * Do panel starts directly, not something the ladder gates: rowRequest
 * always collapses its choice to a once job, so a kind button on such a row
 * would read "forever" and give a one-off rest. No more, no expansion.
 */
function intentRowHtml(o: TaskOption, ui: UiState, state: GameState, world: World): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(plain(o.recommended.text))}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  const canOpen = !NOT_ORDERS.includes(o.id);
  const open = canOpen && ui.open !== null && ui.open.id === o.id && ui.open.arg === arg;
  const more = canOpen ? `<button class="mini" data-act="row-more" data-id="${o.id}" data-arg="${esc(arg)}">${open ? "less" : "more"}</button>` : "";
  const expand = open ? rowExpandHtml(o, arg, ui, state, world) : "";
  const openCls = open ? " open" : "";
  if (!o.ok) {
    // Queuing a blocked makeCamp anyway would let the runner site the camp wherever the
    // body happens to be standing when the order starts, not the cell the click meant:
    // it gets no "add it anyway" queue path, only the reason it is grey.
    const queueable = o.id !== "makeCamp";
    const act = queueable ? ` data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}" title="Add it anyway; it waits until it can start"` : " disabled";
    return `<div class="opt off${openCls}" data-opt="intent:${o.id}:${esc(arg)}"><button class="act"${act}>${esc(o.label)}${rec}<small>${esc(plain(o.why))}${o.detail ? ` - ${esc(plain(o.detail))}` : ""}</small>${bar}</button>${more}${expand}</div>`;
  }
  const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const line = [time, o.detail ? plain(o.detail) : ""].filter(Boolean).join("; ");
  return `<div class="opt${openCls}" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${esc(line)}</small>${bar}</button>${more}${expand}</div>`;
}

/** A group's rows, built at the open row's own chosen spot (so its duration and ok reflect that spot), then narrowed by the filter. */
function groupOptions(g: { label: string; items: { id: TaskId; arg?: string }[] }, state: GameState, world: World, cal: Calendar, ui: UiState): TaskOption[] {
  const rows = g.items.map(({ id, arg }) => {
    const argKey = arg ?? "";
    const open = ui.open !== null && ui.open.id === id && ui.open.arg === argKey;
    const where = open ? ui.choice.where : "nearest";
    return withProgression(state, world, intentOption(state, world, cal, id, arg, where));
  });
  return filterRows(rows, ui.filter);
}

/**
 * One Do group: a folding heading, then its rows - Make's startable rows
 * first - with the far ones (cannot start, skill more than a level under
 * the rung) tucked behind a "more (N)" line until ui.moreOpen names the
 * group. Left out entirely once the filter empties it. A non-empty filter
 * skips the far fold outright: a match the reader typed for is never the
 * one row left hidden behind "more".
 */
function groupHtml(g: { label: string; items: { id: TaskId; arg?: string }[] }, state: GameState, world: World, cal: Calendar, ui: UiState, folds: Record<string, boolean>): string {
  const options = groupOptions(g, state, world, cal, ui);
  if (!options.length) return "";
  const open = folds[g.label] !== false;
  const heading = `<button class="fold" data-act="fold" data-group="${esc(g.label)}">${open ? "-" : "+"} ${esc(g.label)}</button>`;
  if (!open) return `<div class="grp">${heading}</div>`;
  const ordered = g.label === "Make" ? makeFirst(options) : options;
  const { near, far } = ui.filter.trim() ? { near: ordered, far: [] as TaskOption[] } : splitFar(ordered, state);
  const nearHtml = near.map((o) => intentRowHtml(o, ui, state, world)).join("");
  const moreOpen = ui.moreOpen.includes(g.label);
  const farHtml = !far.length ? "" : moreOpen
    ? `${far.map((o) => intentRowHtml(o, ui, state, world)).join("")}<button class="mini" data-act="more" data-group="${esc(g.label)}">less</button>`
    : `<button class="mini" data-act="more" data-group="${esc(g.label)}">more (${far.length})</button>`;
  return `<div class="grp">${heading}${nearHtml}${farHtml}</div>`;
}

export function doHtml(state: GameState, world: World, cal: Calendar, ui: UiState, folds: Record<string, boolean> = {}): string {
  const groups = intentGroups(regionAt(world, state.player.region))
    .map((g) => groupHtml(g, state, world, cal, ui, folds))
    .join("");
  const adv = `<div style="margin-top:8px"><button class="mini${ui.advanced ? " on" : ""}" data-act="advanced">advanced: ${ui.advanced ? "on" : "off"}</button></div>${ui.advanced ? actionsHtml(state, world, cal, ui, false) : ""}`;
  return `${instantHtml(state, world)}<div class="rows">${groups}</div>${adv}`;
}

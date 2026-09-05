import { itemLabel } from "../sim/actions";
import type { Calendar } from "../sim/calendar";
import { groundOf, intentOption, yieldItem } from "../sim/intent";
import { RECIPE_IDS, STRUCTURE_IDS } from "../sim/items";
import { NOT_ORDERS, orderGate, type Gate } from "../sim/ladder";
import { cellOf, kmBetween } from "../sim/position";
import { levelMinutes, SKILL_NAMES } from "../sim/skills";
import { fishSpecies, huntedLand } from "../sim/species";
import { SPOT_NAMES, type TaskOption, withProgression } from "../sim/tasks";
import type { GameState, TaskId } from "../sim/types";
import { fmtDuration, fmtKm, fmtReal } from "../units";
import { regionAt, type RegionDef, type World } from "../world/gen";
import { actionsHtml, instantHtml, masteryBar } from "./panels";
import { esc, rowRequest, type RowChoice, type UiState } from "./render";

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

/** Rows whose label contains the filter, case-insensitive; an empty (or blank) filter keeps everything. */
export function filterRows<T extends { label: string }>(rows: T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
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
    { label: "Gather", items: [{ id: "chop" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }] },
    { label: "Hunt", items: [
      { id: "hunt" as TaskId, arg: "any" },
      ...huntedLand().filter((s) => r.capacity[s]).map((s) => ({ id: "hunt" as TaskId, arg: s })),
      { id: "fish" as TaskId, arg: "any" },
      ...fishSpecies().filter((s) => r.capacity[s]).map((s) => ({ id: "fish" as TaskId, arg: s })),
      { id: "read" as TaskId }, { id: "setTrap" as TaskId }, { id: "emptyTrap" as TaskId },
    ] },
    { label: "Camp", items: [{ id: "makeCamp" }, { id: "split" }, { id: "hang" }, { id: "cook", arg: "rawMeat" }, { id: "cook", arg: "fish" }, { id: "light" }, { id: "lightIndoors" }, { id: "melt" }, { id: "thaw" }, { id: "fill" }, { id: "iceHole" }, { id: "lightTorch" }, { id: "repair" }, { id: "sharpen" }, { id: "night" }, { id: "rest" }, { id: "sleep" }] },
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
  if (until === "campHas") return item ? `until camp has ${itemLabel(item, n)}` : "once";
  if (until === "keep") return item ? `keep camp at ${itemLabel(item, n)}` : id === "light" ? "keep it lit" : "once";
  if (until === "forever") return "forever";
  return "once";
}

/** The small print under a kind the row's skill has not earned: what it needs and about how long. */
function kindNeeds(state: GameState, gate: Gate): string {
  if (gate.ok) return "";
  const xp = state.skills[gate.skill].xp;
  const hours = Math.max(1, Math.round((levelMinutes(gate.at) - xp) / 60));
  return `needs ${SKILL_NAMES[gate.skill]} ${gate.at}, about ${hours} h`;
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
 * The open row's expansion: the five kinds as buttons (greyed with the
 * level and about how many hours to it when the row's skill has not earned
 * them), the count, the deliver toggle and, for a gather or a hunt, the
 * where select. "once" leads them so a plain click's deliver and where can
 * be chosen deliberately too, through the same row-kind path every other
 * kind takes, rather than always falling back to the default choice.
 */
function rowExpandHtml(o: TaskOption, arg: string, ui: UiState, state: GameState, world: World): string {
  const kinds: RowChoice["until"][] = ["once", "times", "campHas", "keep", "forever"];
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
  return `<div class="expand">${buttons}${n}${deliver}${where}</div>`;
}

/**
 * A NOT_ORDERS task (rest, sleep, night, wait, a runner step) is a move the
 * Do panel starts directly, not something the ladder gates: rowRequest
 * always collapses its choice to a once job, so a kind button on such a row
 * would read "forever" and give a one-off rest. No more, no expansion.
 */
function intentRowHtml(o: TaskOption, ui: UiState, state: GameState, world: World): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(o.recommended.text)}</small>` : "";
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
    return `<div class="opt off${openCls}" data-opt="intent:${o.id}:${esc(arg)}"><button class="act"${act}>${esc(o.label)}${rec}<small>${esc(o.why)}${o.detail ? ` - ${esc(o.detail)}` : ""}</small>${bar}</button>${more}${expand}</div>`;
  }
  const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const line = [time, o.detail].filter(Boolean).join("; ");
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

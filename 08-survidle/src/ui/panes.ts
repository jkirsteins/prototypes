/**
 * The four panes that stand where the region panel stood, and the strips
 * that choose between them.
 *
 * All four exist in the markup at once and three are hidden. Rendering
 * one on demand would destroy the other three and the scroll position
 * each holds, which is the failure this whole pass is answering: a
 * tester scrolled his list out of sight and could not get back to it.
 *
 * Which pane, subtab and purpose a player was on is remembered across a
 * reload, because none of it is a decision worth making twice.
 */
import { PURPOSES, type SubtabId, SUBTABS } from "./purpose";
import { esc } from "./render";

export type PaneId = "do" | "camp" | "log" | "pack" | "gear" | "journal";

/**
 * Do first, then Pack.
 *
 * Pack is not only what the survivor carries: it draws the pile on the
 * ground under them as well, with the take and haul buttons. So it is the
 * other half of acting on the world, and it belongs beside the list of
 * things to do rather than behind the log.
 */
export const PANE_IDS: PaneId[] = ["do", "camp", "pack", "gear", "log", "journal"];

const PANE_LABEL: Record<PaneId, string> = { do: "Do", camp: "Camp", pack: "Inventory", gear: "Gear", log: "Log", journal: "Journal" };

export interface Panes {
  pane: PaneId;
  subtab: SubtabId;
  purpose: string;
}

export const PANES_KEY = "survidle.panes";

/**
 * Where a player who has expressed no preference should be standing.
 *
 * It used to be Gather > Woodcutting for every player, on every day, of
 * every run - while the game's own stated first job, making camp, sat in
 * Build > Site, the sixth subtab of six. Once rows are revealed a rung at
 * a time that default is worse than misleading: on a landing, Woodcutting
 * holds no rows at all, so the game opened on an empty panel.
 *
 * So it follows the current opportunity, which is the one thing the game
 * is actually asking for. `at` is where that opportunity's row lives; the
 * old default is the fallback for when there is no current opportunity.
 */
export function defaultPanes(at?: { subtab: SubtabId; purpose: string } | null): Panes {
  if (at) return { pane: "do", subtab: at.subtab, purpose: at.purpose };
  return { pane: "do", subtab: "Gather", purpose: PURPOSES.Gather[0] };
}

/**
 * What a reload returns to, clamped at every step: a stored pane naming a
 * subtab or a purpose that no longer exists reads as the default rather
 * than leaving the player looking at an empty pane and wondering what
 * they broke.
 */
export function loadPanes(storage: Storage, at?: { subtab: SubtabId; purpose: string } | null): Panes {
  const def = defaultPanes(at);
  try {
    const p = JSON.parse(storage.getItem(PANES_KEY) ?? "{}") as Partial<Panes>;
    const pane = PANE_IDS.includes(p.pane as PaneId) ? (p.pane as PaneId) : def.pane;
    const subtab = SUBTABS.includes(p.subtab as SubtabId) ? (p.subtab as SubtabId) : def.subtab;
    const purpose = PURPOSES[subtab].includes(p.purpose as string) ? (p.purpose as string) : PURPOSES[subtab][0];
    return { pane, subtab, purpose };
  } catch {
    return def;
  }
}

export function savePanes(storage: Storage, p: Panes): void {
  storage.setItem(PANES_KEY, JSON.stringify(p));
}

/** Moving to a subtab takes its own first purpose: the one showing may not exist there. */
export function toSubtab(p: Panes, subtab: SubtabId): Panes {
  return { ...p, subtab, purpose: PURPOSES[subtab][0] };
}

export function paneTabsHtml(p: Panes): string {
  return PANE_IDS.map(
    (id) => `<button class="tab${id === p.pane ? " on" : ""}" data-act="pane" data-pane="${id}">${PANE_LABEL[id]}</button>`,
  ).join("");
}

/**
 * The subtab strip, leaving out any subtab holding nothing.
 *
 * Rows are revealed a rung at a time, so most subtabs are empty on a
 * landing. Drawing six tabs where five open onto nothing advertises a game
 * that is not there yet - the same lie the eighty-four-row panel told. The
 * strip grows as the run does.
 *
 * The subtab being shown always draws, even at zero, so the strip cannot
 * lose the tab under the player while they are standing in it.
 */
export function subtabsHtml(p: Panes, counts?: Record<SubtabId, number>): string {
  return SUBTABS
    .filter((s) => counts === undefined || s === p.subtab || (counts[s] ?? 0) > 0)
    .map(
      (s) => `<button class="sub${s === p.subtab ? " on" : ""}" data-act="subtab" data-subtab="${esc(s)}">${esc(s)}</button>`,
    ).join("");
}

/** The left pane, each purpose carrying how many rows it holds so an empty one reads as empty rather than as a mistake. */
export function purposesHtml(p: Panes, counts: Record<string, number>): string {
  return PURPOSES[p.subtab]
    // A purpose holding nothing is left out for the same reason an empty
    // subtab is. The one being shown always draws, so the column cannot
    // lose the entry the player is standing in.
    .filter((q) => q === p.purpose || (counts[q] ?? 0) > 0)
    .map(
      (q) =>
        `<button class="grp${q === p.purpose ? " on" : ""}" data-act="purpose" data-purpose="${esc(q)}">${esc(q)} <small>${counts[q] ?? 0}</small></button>`,
    )
    .join("");
}

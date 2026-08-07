import { KEYBOARD_LABELS, resolveLabels } from "../input/scheme";
import { DRAW_MS } from "../scenes/arena";
import type { Labels } from "../input/scheme";

/**
 * The arena's "?" panel: two modes, one toggle. Kept to the help rule -
 * one sentence for what is happening, one for what to do - and every
 * duration derived from the shipping constants, never written twice.
 */
interface ArenaHelpEntry {
  label: string;
  what: string;
  player: string;
}

export const ARENA_HELP: Record<"sheathed" | "armed" | "edge", ArenaHelpEntry> = {
  sheathed: {
    label: "sheathed",
    what: "Parkour rules apply, and the enemy on the platform will strike any body in its reach.",
    player: `{jump} jumps, {dash} dashes, {grab} grabs; {drawSheathe} draws the sword (${DRAW_MS} ms, shown as a bar) - only while standing.`,
  },
  armed: {
    label: "armed",
    what: "The duel rules apply in full the moment both of you stand armed on the platform.",
    player: `{cut} cuts, {thrust} thrusts, {guard} guards, {void} voids; {drawSheathe} sheathes (${DRAW_MS} ms, same bar, and you are open).`,
  },
  edge: {
    label: "the edge",
    what: "The enemy never follows you off the platform; its feet refuse the lip.",
    player: "Backing past the lip is a fall, and falling sheathes - the ledge is your exit, not a safe zone.",
  },
};

/** Two legend lines for the canvas footer, mode-merged like the scene. */
export function arenaKeyGroups(labels: Labels): Array<Array<[string, string]>> {
  return [
    [
      [labels.moveLeft === labels.moveRight ? labels.moveLeft : `${labels.moveLeft}/${labels.moveRight}`, "move"],
      [labels.jump, "jump"], [labels.dash, "dash"], [labels.grab, "grab"],
      [labels.drawSheathe, "draw/sheathe"],
      [labels.cut, "cut*"], [labels.thrust, "thrust*"], [labels.guard, "guard*"],
    ],
    [
      [labels.rematch, "reset"], [labels.reselect, "scenes"],
      [labels.help, "help"], [labels.pause, "pause"], [labels.mute, "mute"],
    ],
  ];
}

export function arenaControlsLines(labels: Labels = KEYBOARD_LABELS): [string, string] {
  const groups = arenaKeyGroups(labels);
  const fmt = (g: Array<[string, string]>): string => g.map(([k, a]) => `${k} ${a}`).join(" ");
  return [`${fmt(groups[0])} (* armed)`, fmt(groups[1])];
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderArenaHelpHtml(labels: Labels = KEYBOARD_LABELS): string {
  const r = (text: string): string => resolveLabels(text, labels);
  const rows = Object.values(ARENA_HELP)
    .map((e) => `
      <tr>
        <td class="l">${esc(e.label)}</td>
        <td>${esc(r(e.what))}</td>
        <td class="p">${esc(r(e.player))}</td>
      </tr>`)
    .join("");
  const keys = arenaKeyGroups(labels).map(
    (g) => `<p class="keys">${g.map(([k, a]) => `<b>${esc(k)}</b> ${esc(a)}`).join(" &nbsp; ")}</p>`,
  ).join("");
  return `
    <h1>The arena <span class="close">(${esc(labels.reselect)} closes)</span></h1>
    <p>Climb the platform unarmed - jump at its face, catch the lip, pull up.
    Draw, and the duel's own rules take over; the "?" panel there explains them.</p>
    <table>
      <tr><th>mode</th><th>what is happening</th><th>you</th></tr>
      ${rows}
    </table>
    <h2>Keys</h2>
    ${keys}`;
}

import { KEYBOARD_LABELS, resolveLabels } from "../input/scheme";
import type { Labels } from "../input/scheme";
import type { MoveState } from "../movement/engine";

/** The movement scene's "?" panel: typed over the state union, so an
 *  undocumented state fails the build (the HELP trick, scene two). */
export interface MoveHelpEntry {
  label: string;
  what: string;
  player: string;
}

export const MOVE_HELP: Record<MoveState["kind"], MoveHelpEntry> = {
  idle:       { label: "idle",        what: "Standing free, every verb available.", player: "Hold {moveLeft}/{moveRight} to move, {walkMod} to walk." },
  walk:       { label: "walk",        what: "Slow travel; footfalls mark the strides.", player: "Release {walkMod} to run." },
  run:        { label: "run",         what: "Full ground speed.", player: "{crouch} at speed slides; {jump} jumps; {dash} dashes." },
  dash:       { label: "dash",        what: "A fixed burst at double run speed.", player: "{jump} during it carries the momentum into the air." },
  slide:      { label: "slide",       what: "A decaying slide at crouch height - it fits the tunnel.", player: "Steer nothing; it ends standing or crouched by headroom." },
  roll:       { label: "roll",        what: "A hard landing converted into travel.", player: "Automatic: hold a direction while landing from high up." },
  crouchIdle: { label: "crouch",      what: "Compact stance, one tile tall.", player: "Release {crouch} to stand - refused without headroom." },
  crouchWalk: { label: "crouch-walk", what: "Crouched travel, slow.", player: "The tunnel under the mid platform needs it." },
  jump:       { label: "jump",        what: "Rising; steering is live in the air.", player: "{jump} again mid-air spins for extra height, once per airtime." },
  airSpin:    { label: "air spin",    what: "The double jump's flourish and second rise.", player: "One per airtime; it resets on any landing or grab." },
  fall:       { label: "fall",        what: "Descending at up to terminal speed.", player: "Steer into a wall to wall-slide; height decides the landing." },
  land:       { label: "land",        what: "The touchdown absorbs the impact briefly.", player: "Hard landings without a direction held lock longer - roll instead." },
  wallLand:   { label: "wall land",   what: "A fast fall caught against a wall.", player: "Settles into the wall slide; {jump} leaps away." },
  wallSlide:  { label: "wall slide",  what: "Sliding down a wall at capped speed.", player: "Hold toward the wall to stay; {jump} wall-jumps away." },
  sideClimb:  { label: "side climb",  what: "Climbing the wall face while {grab} is held.", player: "{climbUp}/{climbDown} move; the top lip pulls you up." },
  ladderClimb:{ label: "ladder",      what: "On the ladder, gravity off.", player: "{climbUp}/{climbDown} climb; a side step or {jump} leaves it." },
  ledgeGrab:  { label: "ledge",       what: "Hanging on a lip, pulling up on top.", player: "Committed: it ends standing on the platform." },
  push:       { label: "push",        what: "Shoving the block at walk speed.", player: "Walk into it; a wall behind the block stops it." },
  pull:       { label: "pull",        what: "Dragging the block while gripping it.", player: "Hold {grab} beside it and move away - the pocket block must be pulled first." },
  pushIdle:   { label: "grip",        what: "Braced against the block, not moving.", player: "Hold {grab}; add a direction to push or pull." },
};

/** Two labels for one row, collapsed when a scheme gives them one name
 *  (the pad's movement stick covers both directions - src/ui/help.ts's
 *  own pair mirrors this for the duel panel). */
const pair = (a: string, b: string): string => (a === b ? a : `${a}/${b}`);

export function moveKeyGroups(labels: Labels): Array<Array<[string, string]>> {
  return [
    [
      [pair(labels.moveLeft, labels.moveRight), "move"], [labels.walkMod, "walk"],
      [labels.jump, "jump/spin"], [labels.dash, "dash"],
      [labels.crouch, "crouch"], [labels.grab, "grab"],
      [pair(labels.climbUp, labels.climbDown), "climb"],
    ],
    [
      [labels.resetScene, "reset"], [labels.reselect, "scenes"],
      [labels.overlay, "overlay"], [labels.help, "help"],
    ],
    [
      [labels.pause, "pause"], [labels.stepTick, "step"],
      [labels.speed, "speed"], [labels.mute, "mute"],
    ],
  ];
}

export function moveControlsLines(labels: Labels = KEYBOARD_LABELS): [string, string] {
  const groups = moveKeyGroups(labels);
  const fmt = (g: Array<[string, string]>): string => g.map(([k, a]) => `${k} ${a}`).join(" ");
  return [fmt(groups[0]), groups.slice(1).map(fmt).join(" | ")];
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderMoveHelpHtml(labels: Labels = KEYBOARD_LABELS): string {
  const r = (text: string): string => resolveLabels(text, labels);
  const rows = Object.values(MOVE_HELP)
    .map((e) => `
      <tr>
        <td class="l">${esc(e.label)}</td>
        <td>${esc(r(e.what))}</td>
        <td class="p">${esc(r(e.player))}</td>
      </tr>`)
    .join("");
  const keys = moveKeyGroups(labels).map(
    (g) => `<p class="keys">${g.map(([k, a]) => `<b>${esc(k)}</b> ${esc(a)}`).join(" &nbsp; ")}</p>`,
  ).join("");
  return `
    <h1>The movement yard <span class="close">(${esc(labels.reselect)} closes)</span></h1>
    <p>An animation test bed: every verb is a state, every state a sheet.
    Fixed 60Hz simulation; sounds follow the feet, never the keys.</p>
    <table>
      <tr><th>state</th><th>what is happening</th><th>you</th></tr>
      ${rows}
    </table>
    <h2>Keys</h2>
    ${keys}`;
}

import { BIND_LOSS_MS, HIT_STUN_MS } from "../combat/fighter";
import { BIND_TIME_LIMIT_MS } from "../combat/bind";
import { PARRYABLE_FRACTION, WEAPONS } from "../combat/weapons";
import type { FighterState } from "../combat/fighter";
import type { AttackPhase, WeaponProfile } from "../combat/types";

/**
 * The "?" panel: the player-facing statement of the engine's rules. HELP is
 * a Record over the state and phase unions, so adding a state without
 * documenting it fails the build - the same lesson as balticmap's
 * POLICY_COVERAGE: prose asking people to remember did not work, so the
 * requirement is a compile error. Durations are derived from WEAPONS via
 * the ms callback, never written as literals, so retuning a weapon cannot
 * strand an old number here; a test asserts the rendered panel cites the
 * current values.
 */
export interface HelpEntry {
  /** What the HUD calls it. */
  label: string;
  /** What is happening, one sentence. */
  what: string;
  /** What the player must or must not do now, one sentence. */
  player: string;
  /** Duration for a weapon - derived, so the panel can never go stale. */
  ms?: (w: WeaponProfile) => number;
}

export const HELP: Record<FighterState["kind"] | AttackPhase | "parry" | "stance", HelpEntry> = {
  ready: {
    label: "ready",
    what: "In stance, free to act; after a step a short settle runs first, during which new actions queue.",
    player: "Anything goes - and a parry may be raised even mid-settle.",
    ms: (w) => w.stepRecoveryMs,
  },
  step: {
    label: "step",
    what: "A committed step of fixed length; held keys chain steps.",
    player: "You cannot raise a parry mid-step, but one already up rides along - plan the defence, then move.",
    ms: (w) => w.stepDuration,
  },
  void: {
    label: "void",
    what: "A backward hop, longer and faster than a step, fully committed.",
    player: "Nothing can interrupt it; time it so the blade resolves while you are out of reach.",
    ms: (w) => w.voidDuration,
  },
  attack: {
    label: "attack",
    what: "A committed cut or thrust walking windup, strike, recovery; only the windup can be abandoned.",
    player: "Choose it when the opponent cannot answer in time - do not throw it into a waiting guard.",
  },
  windup: {
    label: "windup",
    what: "The blade rises and holds; AI attacks add a telegraph before the rise.",
    player: "Reading time: parry, void or counter - or F abandons your own windup (a feint) into a short recovery.",
    ms: (w) => w.attacks.thrust.windup,
  },
  strike: {
    label: "strike",
    what: "The blade travels and can be met in its first half (the bright bar segment), then is delivered.",
    player: "A parry only works if your guard overlaps the bright half - once the bar runs dark, only distance saves you.",
    ms: (w) => w.attacks.thrust.strike,
  },
  recovery: {
    label: "recovery",
    what: "The attack is spent and the body exposed; a whiff or a parried blade makes this much longer.",
    player: "This is the window to punish - or the price you are paying.",
    ms: (w) => w.attacks.thrust.recovery,
  },
  parry: {
    label: "guard",
    what: "Hold L: the guard rises, then stands for as long as you hold it; a tap against a visible attack waits for that attack and ends with it.",
    player: "Release, attack or void lowers it at full recovery. There is no timer - only lines: a held guard covers one, and feints move attacks to the others.",
    ms: (w) => w.parryRiseMs,
  },
  stance: {
    label: "stance",
    what: "Your held height: attacks launch from it and your parry covers it, so moving it also tells the opponent where you will defend.",
    player: "Move it with Up/Down before you need it - a stance in motion covers nothing until it arrives.",
    ms: (w) => w.heightChangeMs,
  },
  hitstun: {
    label: "hitstun",
    what: "A blade has landed; the fight is decided.",
    player: "Nothing - watch, then R to rematch.",
    ms: () => HIT_STUN_MS,
  },
  dead: {
    label: "dead",
    what: "One clean hit kills; there are no wounds and no second chances.",
    player: "R for a rematch, Esc to pick different swords.",
  },
  bind: {
    label: "bind",
    what: "Attacks CROSSING in matched steel lock (deep clang, time slows); a parry only deflects; the bind clock drains toward a shove-apart.",
    player: "J presses but spends your readiness; K yields committed pressure when your band lights - too early or unfed, it fails and costs.",
    ms: () => BIND_TIME_LIMIT_MS,
  },
  exposed: {
    label: "exposed",
    what: "The bind was lost: turned out of contact, unable to act, mortally open - a second clash sounded the break.",
    player: "The winner's immediate thrust kills; any other move or a moment's hesitation spends their advantage, and you are back.",
    ms: () => BIND_LOSS_MS,
  },
};

/** One source for the key list: the control line and the help panel both read it. */
export const KEY_GROUPS: Array<Array<[string, string]>> = [
  [["A/D", "step"], ["S", "void"], ["Up/Dn/LShift", "stance"], ["J", "cut"], ["K", "thrust"], ["L hold", "guard"], ["Lt/Rt/Caps", "re-aim"], ["F", "feint"]],
  [["0-4", "AI mode"], ["R", "rematch"], ["Esc", "select"], ["`", "overlay"], ["?", "help"]],
  [["space", "pause"], [".", "step"], ["[/]", "speed"], ["M", "mute"]],
];

/**
 * The bottom legend, split so every line FITS the 960px canvas: the
 * gameplay keys on one line, session and time control on the other. One
 * long line was silently clipped at both edges for as long as it
 * out-measured the canvas - instructions must always be visible, so a
 * test bounds each line's width now.
 */
export function controlsLines(): [string, string] {
  const fmt = (g: Array<[string, string]>): string => g.map(([k, a]) => `${k} ${a}`).join(" ");
  return [fmt(KEY_GROUPS[0]), KEY_GROUPS.slice(1).map(fmt).join(" | ")];
}

export function controlsLine(): string {
  return controlsLines().join(" | ");
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The panel body as HTML. Pure string building - no DOM - so the currency
 * test can assert against it without a browser.
 */
export function renderHelpHtml(): string {
  const ws = Object.values(WEAPONS);
  const times = (e: HelpEntry): string => {
    if (!e.ms) return "";
    const parts = ws.map((w) => `${w.name} ${e.ms?.(w)}ms`);
    const uniq = new Set(ws.map((w) => e.ms?.(w)));
    return uniq.size === 1 ? `${e.ms(ws[0])}ms` : parts.join(" / ");
  };
  const rows = Object.values(HELP)
    .map((e) => `
      <tr>
        <td class="l">${esc(e.label)}</td>
        <td>${esc(e.what)}</td>
        <td class="p">${esc(e.player)}</td>
        <td class="t">${esc(times(e))}</td>
      </tr>`)
    .join("");

  const parryRows = ws.map((w) => {
    const t = w.attacks.thrust;
    const meetable = t.strike * PARRYABLE_FRACTION;
    const deadline = w.parryRiseMs - meetable;
    return `<li>${esc(w.name)} thrust: the guard rises in ${w.parryRiseMs}ms and then stands as long as the key is held; the blade is meetable for the strike's first ${meetable}ms, so the last press that can catch it lands ${deadline}ms before the strike starts.</li>`;
  }).join("");

  const costs = ws.map((w) => {
    const t = w.attacks.thrust;
    return `<li>${esc(w.name)}: a whiffed thrust recovers ${t.recovery * w.whiffRecoveryFactor}ms (x${w.whiffRecoveryFactor}); a parried one ${t.recovery + w.parriedPenalty}ms (+${w.parriedPenalty}ms); a feint only ${w.feintRecoveryMs}ms - selling a threat is cheap, missing with one is not.</li>`;
  }).join("");

  const keys = KEY_GROUPS.map(
    (g) => `<p class="keys">${g.map(([k, a]) => `<b>${esc(k)}</b> ${esc(a)}`).join(" &nbsp; ")}</p>`,
  ).join("");

  return `
    <h1>How the duel works <span class="close">(Esc closes)</span></h1>
    <p>Fixed 60Hz simulation, single-hit lethality. Every action commits you;
    the game is choosing the right one while reading the opponent's.</p>

    <table>
      <tr><th>state</th><th>what is happening</th><th>you</th><th>time</th></tr>
      ${rows}
    </table>

    <h2>Meeting the blade</h2>
    <p>A parry meets the blade when the blade <b>reaches</b> it: the farther
    the attacker, the later in the strike that is (at most the first
    ${PARRYABLE_FRACTION * 100}%). A press against a visible attack
    <b>latches</b> onto that attack - the guard will not lapse while it is
    still coming, and ends with it, met, missed or abandoned. It never
    retargets: the guard covers the one line it snapshotted, height and side
    both, so an attack that arrives elsewhere walks past it. A parry is never
    queued, so a press mid-step is simply lost.</p>
    <ul>${parryRows}</ul>

    <h2>Lies and answers</h2>
    <p>During a windup an attack may be re-aimed <b>once</b>: an arrow
    changes its height, the other attack key its kind and side. The
    blade arrives later for it - a feint into empty air is a lost tempo. A
    held guard answers as often as it can travel - one shift at a time, each
    at full cost: up/down arrows shift its height, left/right or Caps Lock
    re-aim its side at the visible attack, or flip it when nothing shows.
    The guard never follows the blade on its own.</p>
    <ul>${ws.map((w) => `<li>${esc(w.name)}: height feint ${w.redirectHeightMs}ms, side feint ${w.redirectSideMs}ms; your guard shifts height in ${w.guardShiftMs}ms, re-aims side in ${w.sideChangeMs}ms.</li>`).join("")}</ul>

    <h2>Measure</h2>
    <p>Three zones per weapon: out (nothing lands), wide (one step from
    danger), narrow (a strike can land). A strike connects only if the gap at
    its resolution is within the attacker's reach - attacks from out of
    measure whiff, and whiffing is expensive:</p>
    <ul>${costs}</ul>

    <h2>Keys</h2>
    ${keys}`;
}

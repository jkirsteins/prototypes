import { HIT_STUN_MS } from "../combat/fighter";
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

export const HELP: Record<FighterState["kind"] | AttackPhase | "parry", HelpEntry> = {
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
    label: "parry",
    what: "The guard rises first and only the formed guard meets a blade; raised while standing it persists through a step, dropped at full cost by attacking or voiding.",
    player: "Press early enough for the rise to finish while the blade still travels - a late press is a guard that forms over a wound.",
    ms: (w) => w.parryRiseMs,
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
};

/** One source for the key list: the control line and the help panel both read it. */
export const KEY_GROUPS: Array<Array<[string, string]>> = [
  [["A/D", "step"], ["S", "void"], ["J", "cut"], ["K", "thrust"], ["L", "parry"], ["F", "feint"]],
  [["0-3", "AI mode"], ["R", "rematch"], ["Esc", "select"], ["`", "overlay"], ["?", "help"]],
  [["space", "pause"], [".", "step"], ["[/]", "speed"], ["M", "mute"]],
];

export function controlsLine(): string {
  return KEY_GROUPS.map((g) => g.map(([k, a]) => `${k} ${a}`).join(" ")).join(" | ");
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
    return `<li>${esc(w.name)} thrust: the guard rises in ${w.parryRiseMs}ms and holds for ${w.parryWindowMs - w.parryRiseMs}ms; the blade is meetable for the strike's first ${meetable}ms, so the last press that can catch it lands ${deadline}ms before the strike starts.</li>`;
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
    <p>A parry succeeds by meeting the blade while it travels: <b>any overlap</b>
    between your <b>formed</b> guard and the first ${PARRYABLE_FRACTION * 100}%
    of the strike counts - and the guard only forms once its rise completes.
    Pressing early is the safe error; a parry is never queued, so a press
    mid-step is simply lost.</p>
    <ul>${parryRows}</ul>

    <h2>Measure</h2>
    <p>Three zones per weapon: out (nothing lands), wide (one step from
    danger), narrow (a strike can land). A strike connects only if the gap at
    its resolution is within the attacker's reach - attacks from out of
    measure whiff, and whiffing is expensive:</p>
    <ul>${costs}</ul>

    <h2>Keys</h2>
    ${keys}`;
}

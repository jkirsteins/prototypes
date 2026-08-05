import { aiDecide, createAiState } from "./combat/ai";
import { TICK } from "./combat/fighter";
import { createDuel, tickDuel } from "./combat/engine";
import { WEAPONS } from "./combat/weapons";
import { createAudioEngine } from "./audio/audio";
import { advanceBulletTime, bulletTimePhase, bulletTimeScale, createBulletTime } from "./ui/bullettime";
import { HELP_BUTTON, drawFrame } from "./render/draw";
import { loadImages } from "./render/loader";
import { renderHelpHtml } from "./ui/help";
import { handleSelectAction, isSelectOpen, showSelect } from "./ui/select";
import { createPadSnapshot, discardPadSnapshot, readPads } from "./input/gamepad";
import {
  activeLabels, noteGamepadInput, noteKeyboardInput, notePadGone,
  onControlsChange, resolvePadEdge,
} from "./input/scheme";
import type { ActionId, UiSnapshot } from "./input/scheme";
import type { AiMode } from "./combat/ai";
import type { Duel, DuelEvent } from "./combat/engine";
import type { Intent, WeaponId } from "./combat/types";
import type { View } from "./render/draw";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("no 2d context");

const params = new URLSearchParams(location.search);
const pick = (key: string, fallback: WeaponId): WeaponId => {
  const v = params.get(key);
  return v === "longsword" || v === "rapier" ? v : fallback;
};
// Browser-check convention: a p or e param means the URL is asking for a
// specific matchup, so boot straight into the duel instead of the picker.
const bootStraightIn = params.has("p") || params.has("e");

const SPEEDS = [0.25, 0.5, 1, 2, 4];

const state = {
  pWeapon: pick("p", "longsword"),
  eWeapon: pick("e", "rapier"),
  aiMode: (["0", "1", "2", "3", "4"].includes(params.get("mode") ?? "") ? Number(params.get("mode")) : 0) as AiMode,
  overlay: params.get("overlay") !== "0",
  // A ?seed= pins the AI's jitter so an interesting fight can be replayed.
  seed: Number.isFinite(Number(params.get("seed"))) && params.get("seed") !== null
    ? Number(params.get("seed"))
    : undefined,
  activeSeed: 0,
  duel: null as Duel | null,
  ai: createAiState(),
  // Held actions are owned per SOURCE and consumed as one effective
  // level, so one device releasing can never lower what the other still
  // holds; every edge-triggered consequence (the parry press, the
  // release, the buffered-step drop) keys off the EFFECTIVE level's
  // transitions (gamepad-support §7.1).
  held: {
    keyboard: { advance: false, retreat: false, guard: false },
    pad: { advance: false, retreat: false, guard: false },
  },
  pending: null as Intent | null,
  // Time control: pause freezes the accumulator, step injects exactly one
  // tick, timescale stretches or compresses wall time. The simulation is a
  // pure function of ticks, so none of this can change an outcome - only
  // when you get to watch it.
  paused: params.get("paused") === "1",
  timescale: SPEEDS.includes(Number(params.get("speed"))) ? Number(params.get("speed")) : 1,
  stepOnce: false,
  // Bullet time: while a bind runs, the accumulator's wall-time feed is
  // eased down so the pressure contest is readable at human speed. Pure
  // presentation - the simulation stays a fixed-tick function and never
  // learns about it; see src/ui/bullettime.ts.
  bullet: createBulletTime(),
  // The "?" panel. Its own flag rather than state.paused, so opening and
  // closing help can never silently clear a manual pause; it gates the
  // accumulator only, like all time control.
  helpOpen: false,
};

const helpEl = document.getElementById("help") as HTMLElement;
const helpPanel = helpEl.querySelector(".panel") as HTMLElement;

function setHelp(open: boolean): void {
  state.helpOpen = open;
  helpEl.hidden = !open;
  // Rendered on open (and re-rendered on a scheme change while open), so
  // the panel always speaks the active device's language.
  if (open) helpPanel.innerHTML = renderHelpHtml(activeLabels());
}
onControlsChange(() => {
  if (state.helpOpen) helpPanel.innerHTML = renderHelpHtml(activeLabels());
});
// A reference you cannot read without dying is useless: clicking outside
// the panel closes it, clicks inside stay inside (text selection etc).
helpEl.addEventListener("click", (e) => {
  if (e.target === helpEl) setHelp(false);
});
canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  const y = (e.clientY - r.top) * (canvas.height / r.height);
  const b = HELP_BUTTON;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) setHelp(true);
});

type HeldAction = "advance" | "retreat" | "guard";
const effective = (a: HeldAction): boolean => state.held.keyboard[a] || state.held.pad[a];

/** Write one source's level and emit the effective transition's
 *  consequences: guard rise -> parry press, guard fall -> release,
 *  movement fall -> buffered-step drop. */
function setHeld(source: "keyboard" | "pad", action: HeldAction, value: boolean): void {
  const before = effective(action);
  state.held[source][action] = value;
  const after = effective(action);
  if (before === after) return;
  if (action === "guard") {
    state.pending = after ? "parry" : "parryRelease";
  } else if (!after && state.duel) {
    const dir = action === "advance" ? "advance" : "retreat";
    if (state.duel.f[0].buffered === dir) state.duel.f[0].buffered = null;
  }
}

function clearHeldSource(source: "keyboard" | "pad"): void {
  setHeld(source, "advance", false);
  setHeld(source, "retreat", false);
  setHeld(source, "guard", false);
}

let padSnap = createPadSnapshot();

function uiSnapshot(): UiSnapshot {
  return {
    helpOpen: state.helpOpen,
    selectOpen: isSelectOpen(),
    duelLive: state.duel !== null && !state.duel.over,
    paused: state.paused,
    decided: state.duel?.over === true,
  };
}

/** Apply one resolved pad action - the resolver decided the meaning, this
 *  only routes it onto the same paths the keyboard writes. Movement and
 *  guard are levels (section 7.1), never edge-applied here. */
function applyPadAction(a: ActionId): void {
  switch (a) {
    case "void": case "cut": case "thrust": case "feint":
    case "stanceUp": case "stanceDown": case "sideShift": case "disarm":
      state.pending = a;
      break;
    case "pause":
      state.paused = !state.paused;
      break;
    case "rematch":
      startDuel();
      break;
    case "reselect":
      state.duel = null;
      openSelect();
      break;
    case "help":
      setHelp(!state.helpOpen);
      break;
    case "selLeft": case "selRight": case "selToggle": case "selConfirm":
    case "selPickFirst": case "selPickSecond":
      handleSelectAction(a);
      break;
    default:
      break; // movement/guard levels, debug verbs: not edge-driven
  }
}

function startDuel(): void {
  // Without ?seed each duel draws a fresh one so rematches are not replays.
  // The draw happens here, outside the simulation, and the overlay shows it
  // so a fight worth repeating can be recovered with ?seed=.
  state.activeSeed = state.seed ?? Math.floor(Math.random() * 0xffffffff);
  state.duel = createDuel(WEAPONS[state.pWeapon], WEAPONS[state.eWeapon]);
  state.ai = createAiState(state.activeSeed);
  state.pending = null;
}

function openSelect(): void {
  // Entering selection ends a fight rather than pausing one: no hold may
  // survive into the next duel, on either device - the pad snapshot is
  // discarded (everything still engaged goes stale until released) and
  // BOTH held sources clear, fixing the old wart where a D held across
  // the select screen entered the new duel already advancing.
  discardPadSnapshot(padSnap);
  clearHeldSource("keyboard");
  clearHeldSource("pad");
  showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => {
    state.pWeapon = p;
    state.eWeapon = e;
    startDuel();
  });
}

const audio = createAudioEngine();
// Browsers gate audio behind a user gesture; any keypress or click
// (select screen or duel) unlocks the context. Idempotent after the
// first. A gamepad press is NOT a user activation in any browser, so a
// purely pad-driven session plays silent until the player clicks or
// presses a key once - a stated limitation, not a bug to chase.
document.addEventListener("keydown", () => audio.unlock());
document.addEventListener("pointerdown", () => audio.unlock());

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  noteKeyboardInput();
  // Help owns the keyboard while open: only its own toggles and Escape do
  // anything, so a stray game key cannot act under the panel.
  if (state.helpOpen) {
    if (e.key === "Escape" || e.key === "?" || e.key.toLowerCase() === "h") setHelp(false);
    return;
  }
  if (e.key === "?" || (e.key.toLowerCase() === "h" && state.duel !== null)) {
    setHelp(true);
    return;
  }
  // The select screen owns the keyboard while no duel is running; it adds
  // and removes its own listener via showSelect/hideSelect.
  if (state.duel === null) return;
  switch (e.key.toLowerCase()) {
    case "a": setHeld("keyboard", "retreat", true); break;
    case "d": setHeld("keyboard", "advance", true); break;
    case "s": state.pending = "void"; break;
    case "j": state.pending = "cut"; break;
    case "k": state.pending = "thrust"; break;
    case "i": state.pending = "disarm"; break;
    case "l":
      // Hold to keep the guard up; the keyup lowers it. The global e.repeat
      // guard above keeps auto-repeat from restarting anything. The press
      // fires through the effective level's rise (a pad-held guard means
      // no transition, so nothing fires - which is the point).
      setHeld("keyboard", "guard", true);
      break;
    case "arrowleft":
    case "arrowright":
    // Caps Lock is the side axis's Left Shift: with a threat visible the
    // shift re-aims at it, without one it flips to the other side. macOS
    // fires keydown only when the lock turns ON - the OFF edge arrives as
    // a keyup, handled below - so both edges must count as a press.
    case "capslock": state.pending = "sideShift"; break;
    case "f": state.pending = "feint"; break;
    case "arrowup": state.pending = "stanceUp"; break;
    case "arrowdown": state.pending = "stanceDown"; break;
    case "shift": {
      // Left shift cycles the stance: with two reachable heights that is a
      // toggle away from wherever the stance is, or is heading. Input sugar
      // only - it resolves to the same stance intents the arrows send, so
      // the simulation never learns a new verb. Arrows stay for aiming at
      // a specific height once `middle` exists.
      if (e.code !== "ShiftLeft") break;
      const f = state.duel.f[0];
      const target = f.heightTo ?? f.height;
      state.pending = target === "high" ? "stanceDown" : "stanceUp";
      break;
    }
    case "0": state.aiMode = 0; break;
    case "1": state.aiMode = 1; break;
    case "2": state.aiMode = 2; break;
    case "3": state.aiMode = 3; break;
    case "4": state.aiMode = 4; break;
    case "r": startDuel(); break;
    case "m": audio.toggleMute(); break;
    case "`": state.overlay = !state.overlay; break;
    case "escape": state.duel = null; openSelect(); break;
    case " ":
      e.preventDefault();
      state.paused = !state.paused;
      break;
    case ".":
      // Always "advance exactly one tick from a frozen state": pause first
      // if running, then arm the one-shot step.
      state.paused = true;
      state.stepOnce = true;
      break;
    case "[":
    case "]": {
      const at = SPEEDS.indexOf(state.timescale);
      const next = at + (e.key === "]" ? 1 : -1);
      state.timescale = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, next))];
      break;
    }
  }
});
document.addEventListener("keyup", (e) => {
  switch (e.key.toLowerCase()) {
    case "a":
      // The buffered-step drop keys off the EFFECTIVE fall inside
      // setHeld: a tap is one step, not two, and a direction the pad
      // still holds drops nothing.
      setHeld("keyboard", "retreat", false);
      break;
    case "d":
      setHeld("keyboard", "advance", false);
      break;
    case "l":
      // The release fires through the effective fall - a tap must never
      // leave a guard its vanished key can no longer lower, and a
      // pad-held guard survives a keyboard tap untouched.
      setHeld("keyboard", "guard", false);
      break;
    case "capslock":
      // The lock's OFF edge (see the keydown case): also a press.
      if (state.duel !== null && !state.helpOpen) state.pending = "sideShift";
      break;
  }
});

// A key let go on another window sends no keyup here: lower everything,
// both sources - and discard the pad snapshot, so the next focused poll
// only seeds (a button held across the blur reads as nothing until it is
// released and pressed afresh, exactly like the keyboard).
window.addEventListener("blur", () => {
  clearHeldSource("keyboard");
  clearHeldSource("pad");
  discardPadSnapshot(padSnap);
});

loadImages().then((images) => {
  const view: View = { ctx, images, overlay: state.overlay, labels: activeLabels() };
  if (bootStraightIn) startDuel();
  else openSelect();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    // The bullet-time curve advances on raw wall time, whatever the other
    // time controls are doing; the transition cues fire exactly at the
    // edges - the bind forming and its aftermath ending are simulation
    // moments, the eased clock that follows them is not.
    const wallDt = Math.min(now - last, 250);
    // The pad poll, before the accumulator drains, so pad intents enter
    // ticks with the same latency as key events (gamepad-support §7.2).
    const gate = state.helpOpen || isSelectOpen();
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pf = readPads(padSnap, pads, gate);
    padSnap = pf.next;
    if (pf.frame.padGone) {
      notePadGone();
      clearHeldSource("pad");
      // The hands just left the controls: pause a live, undecided duel.
      if (state.duel !== null && !state.duel.over) state.paused = true;
    }
    if (pf.frame.activity && pf.frame.activePadId !== null) noteGamepadInput(pf.frame.activePadId);
    setHeld("pad", "advance", pf.frame.held.advance);
    setHeld("pad", "retreat", pf.frame.held.retreat);
    setHeld("pad", "guard", pf.frame.held.guard);
    for (const padEdge of pf.frame.pressed) {
      const action = resolvePadEdge(uiSnapshot(), padEdge);
      if (action !== null) applyPadAction(action);
    }
    const edge = advanceBulletTime(state.bullet, wallDt, bulletTimePhase(state.duel));
    if (edge === "enter") audio.cue("bulletIn");
    else if (edge === "exit") audio.cue("bulletOut");
    if (state.helpOpen) {
      // Reading time: the sim freezes, and even a queued single-step waits.
      acc = 0;
    } else if (state.paused) {
      // Frozen: no wall time enters the accumulator, and any fractional
      // leftover is dropped so the next step is exactly one tick.
      acc = 0;
      if (state.stepOnce) {
        acc = TICK;
        state.stepOnce = false;
      }
    } else {
      acc += wallDt * state.timescale * bulletTimeScale(state.bullet);
    }
    last = now;
    const d = state.duel;
    if (d) {
      const frameEvents: DuelEvent[] = [];
      while (acc >= TICK) {
        acc -= TICK;
        let ia: Intent | null = state.pending;
        state.pending = null;
        if (ia === null && effective("advance")) ia = "advance";
        if (ia === null && effective("retreat")) ia = "retreat";
        const ib = aiDecide(d, state.aiMode, state.ai, TICK);
        frameEvents.push(...tickDuel(d, ia, ib));
      }
      audio.frame(frameEvents);
      view.overlay = state.overlay;
      view.labels = activeLabels();
      drawFrame(view, d, state.aiMode, state.activeSeed, {
        paused: state.paused,
        timescale: state.timescale,
        bulletScale: bulletTimeScale(state.bullet),
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}).catch((err: Error) => {
  ctx.fillStyle = "#d64541";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText(`sprite load failed: ${err.message}`, 20, 30);
});

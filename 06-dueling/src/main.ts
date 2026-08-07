import { TICK } from "./combat/fighter";
import { createAudioEngine } from "./audio/audio";
import { HELP_BUTTON } from "./render/draw";
import { loadImages, loadTileAtlas } from "./render/loader";
import { renderHelpHtml } from "./ui/help";
import { renderMoveHelpHtml } from "./ui/movehelp";
import { handleSelectAction, isSelectOpen, showSelect } from "./ui/select";
import { handleScenesAction, isScenesOpen, showScenes } from "./ui/scenes";
import { createPadSnapshot, discardPadSnapshot, readPads } from "./input/gamepad";
import {
  activeLabels, noteGamepadInput, noteKeyboardInput, notePadGone,
  onControlsChange, resolvePadEdge,
} from "./input/scheme";
import { createArenaScene } from "./scenes/arena";
import { createDuelScene } from "./scenes/duel";
import { createMoveScene } from "./scenes/move";
import { renderArenaHelpHtml } from "./ui/arenahelp";
import type { ActionId, UiSnapshot } from "./input/scheme";
import type { AiMode } from "./combat/ai";
import type { WeaponId } from "./combat/types";
import type { HeldAction, HeldLevels, Scene } from "./scenes/scene";

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
const sceneParam = params.get("scene"); // "duel" | "move" | null

const SPEEDS = [0.25, 0.5, 1, 2, 4];

const state = {
  pWeapon: pick("p", "longsword"),
  eWeapon: pick("e", "rapier"),
  overlay: params.get("overlay") !== "0",
  // Held actions are owned per SOURCE and consumed as one effective
  // level, so one device releasing can never lower what the other still
  // holds; every edge-triggered consequence (the parry press, the
  // release, the buffered-step drop) keys off the EFFECTIVE level's
  // transitions (gamepad-support §7.1).
  held: {
    keyboard: { advance: false, retreat: false, guard: false, up: false, down: false, walk: false },
    pad: { advance: false, retreat: false, guard: false, up: false, down: false, walk: false },
  },
  // The active pad's stick magnitude, fed into the active scene's tick -
  // 0 when keyboard-driven or no pad engaged.
  padMoveMag: 0,
  // Time control: pause freezes the accumulator, step injects exactly one
  // tick, timescale stretches or compresses wall time. The simulation is a
  // pure function of ticks, so none of this can change an outcome - only
  // when you get to watch it.
  paused: params.get("paused") === "1",
  timescale: SPEEDS.includes(Number(params.get("speed"))) ? Number(params.get("speed")) : 1,
  stepOnce: false,
  // The "?" panel. Its own flag rather than state.paused, so opening and
  // closing help can never silently clear a manual pause; it gates the
  // accumulator only, like all time control.
  helpOpen: false,
};

const helpEl = document.getElementById("help") as HTMLElement;
const helpPanel = helpEl.querySelector(".panel") as HTMLElement;

// Which panel body to render is the active SCENE's call, not a static
// pick: the move scene states its own rules, the duel its own.
function helpHtml(): string {
  if (active?.id === "move") return renderMoveHelpHtml(activeLabels());
  if (active?.id === "arena") return renderArenaHelpHtml(activeLabels());
  return renderHelpHtml(activeLabels());
}

function setHelp(open: boolean): void {
  state.helpOpen = open;
  helpEl.hidden = !open;
  // Rendered on open (and re-rendered on a scheme change while open), so
  // the panel always speaks the active device's language.
  if (open) helpPanel.innerHTML = helpHtml();
}
onControlsChange(() => {
  if (state.helpOpen) helpPanel.innerHTML = helpHtml();
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

type Source = "keyboard" | "pad";
const effective = (a: HeldAction): boolean => state.held.keyboard[a] || state.held.pad[a];
const effectiveLevels = (): HeldLevels => ({
  advance: effective("advance"), retreat: effective("retreat"), guard: effective("guard"),
  up: effective("up"), down: effective("down"), walk: effective("walk"),
});

/** Write one source's level and route the effective transition's
 *  consequences to the active scene's heldEdge (the parry press/release,
 *  the buffered-step drop, whatever a future scene wants a level edge
 *  to mean). */
function setHeld(source: Source, action: HeldAction, value: boolean): void {
  const before = effective(action);
  state.held[source][action] = value;
  const after = effective(action);
  if (before !== after) active?.heldEdge(action, after);
}

function clearHeldSource(source: Source): void {
  for (const a of Object.keys(state.held[source]) as HeldAction[]) setHeld(source, a, false);
}

let padSnap = createPadSnapshot();

let active: Scene | null = null;
// Created once images are loaded (createDuelScene/createMoveScene bake
// them into their deps); referenced by startDuel/startMove/openSelect
// below, all of which are only ever invoked after that happens.
let duelScene: (Scene & { setWeapons(p: WeaponId, e: WeaponId): void; start(): void }) | null = null;
let moveScene: Scene | null = null;
let arenaScene: Scene | null = null;

function uiSnapshot(): UiSnapshot {
  const snap = active?.snapshot() ?? { live: false, decided: false };
  return {
    helpOpen: state.helpOpen,
    selectOpen: isSelectOpen() || isScenesOpen(),
    simLive: snap.live,
    paused: state.paused,
    decided: snap.decided,
    scene: active?.id ?? "duel",
    armed: snap.armed ?? false,
  };
}

/** Apply one resolved pad action - the resolver decided the meaning, this
 *  only routes it onto the same paths the keyboard writes. Movement and
 *  guard are levels (section 7.1), never edge-applied here. Session verbs
 *  (pause/rematch/reselect/help/select) stay owned here; everything else
 *  forwards to the active scene. */
function applyPadAction(a: ActionId): void {
  switch (a) {
    case "pause":
      state.paused = !state.paused;
      break;
    case "rematch":
      active?.reset();
      break;
    case "reselect":
      goBack();
      break;
    case "help":
      setHelp(!state.helpOpen);
      break;
    case "selLeft": case "selRight": case "selToggle": case "selConfirm":
    case "selPickFirst": case "selPickSecond": case "selPickThird":
      if (isScenesOpen()) handleScenesAction(a);
      // The sword select has no third column; the pick is scenes-only.
      else if (a !== "selPickThird") handleSelectAction(a);
      break;
    case "selBack":
      // The scene selector is the root screen - it has nothing to go
      // back to, so Back is ignored there and only unwinds the sword pick.
      if (!isScenesOpen()) handleSelectAction(a);
      break;
    default:
      active?.padAction(a);
      break;
  }
}

function startDuel(): void {
  duelScene?.setWeapons(state.pWeapon, state.eWeapon);
  duelScene?.start();
  active = duelScene;
}

function startMove(): void {
  moveScene?.reset();
  active = moveScene;
}

function startArena(): void {
  arenaScene?.reset();
  active = arenaScene;
}

function openScenes(): void {
  // Same discard/clear as openSelect below: no hold may survive a
  // navigation, on either device.
  discardPadSnapshot(padSnap);
  clearHeldSource("keyboard");
  clearHeldSource("pad");
  active = null;
  showScenes((s) => {
    if (s === "duel") openSelect();
    else if (s === "move") startMove();
    else startArena();
  });
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
  active = null;
  showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => {
    state.pWeapon = p;
    state.eWeapon = e;
    startDuel();
  }, () => openScenes());
}

function goBack(): void {
  if (active?.id === "duel") { active = null; openSelect(); }
  else if (active !== null) { active = null; openScenes(); }
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
  if (e.key === "?" || (e.key.toLowerCase() === "h" && active !== null)) {
    setHelp(true);
    return;
  }
  // An overlay (the scene selector or the sword select) owns the keyboard
  // while no scene is active; each adds and removes its own listener via
  // its own show/hide.
  if (active === null) return;
  const k = e.key.toLowerCase();
  const hold = active.holdKeys[k];
  if (hold !== undefined) { setHeld("keyboard", hold, true); return; }
  switch (k) {
    case "r": active.reset(); return;
    case "m": audio.toggleMute(); return;
    case "`": state.overlay = !state.overlay; return;
    case "escape": goBack(); return;
    case " ":
      e.preventDefault();
      state.paused = !state.paused;
      return;
    case ".":
      // Always "advance exactly one tick from a frozen state": pause first
      // if running, then arm the one-shot step.
      state.paused = true;
      state.stepOnce = true;
      return;
    case "[":
    case "]": {
      const at = SPEEDS.indexOf(state.timescale);
      const next = at + (k === "]" ? 1 : -1);
      state.timescale = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, next))];
      return;
    }
  }
  active.press(e);
});
document.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  const hold = active?.holdKeys[k];
  if (hold !== undefined) setHeld("keyboard", hold, false);
  // keyRelease carries the duel's Caps Lock OFF-edge quirk (a press, not a
  // level): gated on !helpOpen exactly like every other press, so a stray
  // release under the panel cannot queue an intent for the tick after it
  // closes.
  if (!state.helpOpen) active?.keyRelease(e);
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

Promise.all([loadImages(), loadTileAtlas()]).then(([images, tiles]) => {
  const initialAiMode = (["0", "1", "2", "3", "4"].includes(params.get("mode") ?? "")
    ? Number(params.get("mode"))
    : 0) as AiMode;
  // A ?seed= pins the AI's jitter so an interesting fight can be replayed.
  const seedPin = Number.isFinite(Number(params.get("seed"))) && params.get("seed") !== null
    ? Number(params.get("seed"))
    : undefined;
  duelScene = createDuelScene({ ctx, images, audio, seedPin, initialAiMode });
  moveScene = createMoveScene({ ctx, images, tiles, audio });
  arenaScene = createArenaScene({
    ctx, images, tiles, audio, seedPin, initialAiMode,
    pWeapon: state.pWeapon, eWeapon: state.eWeapon,
  });
  if (sceneParam === "arena") startArena();
  else if (bootStraightIn) startDuel();
  else if (sceneParam === "move") startMove();
  else if (sceneParam === "duel") openSelect();
  else openScenes();
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
    // A stick used to navigate an overlay must not become a live movement
    // hold the instant the overlay closes onto a scene.
    const gate = state.helpOpen || isSelectOpen() || isScenesOpen();
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pf = readPads(padSnap, pads, gate);
    padSnap = pf.next;
    if (pf.frame.padGone) {
      notePadGone();
      clearHeldSource("pad");
      // The hands just left the controls: pause a live, undecided scene.
      if (active?.snapshot().live === true) state.paused = true;
    }
    if (pf.frame.activity && pf.frame.activePadId !== null) noteGamepadInput(pf.frame.activePadId);
    setHeld("pad", "advance", pf.frame.held.advance);
    setHeld("pad", "retreat", pf.frame.held.retreat);
    setHeld("pad", "guard", pf.frame.held.guard);
    setHeld("pad", "up", pf.frame.held.up);
    setHeld("pad", "down", pf.frame.held.down);
    state.padMoveMag = pf.frame.moveMag;
    for (const padEdge of pf.frame.pressed) {
      const action = resolvePadEdge(uiSnapshot(), padEdge);
      if (action !== null) applyPadAction(action);
    }
    const scale = active !== null ? active.frameScale(wallDt) : 1;
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
      acc += wallDt * state.timescale * scale;
    }
    last = now;
    if (active !== null) {
      while (acc >= TICK) {
        acc -= TICK;
        active.tickOnce(effectiveLevels(), state.padMoveMag);
      }
      active.audioFrame();
      active.draw(state.overlay, activeLabels(), { paused: state.paused, timescale: state.timescale, bulletScale: 1 });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}).catch((err: Error) => {
  ctx.fillStyle = "#d64541";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText(`sprite load failed: ${err.message}`, 20, 30);
});

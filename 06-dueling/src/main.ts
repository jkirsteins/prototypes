import { aiDecide, createAiState } from "./combat/ai";
import { TICK } from "./combat/fighter";
import { createDuel, tickDuel } from "./combat/engine";
import { WEAPONS } from "./combat/weapons";
import { createAudioEngine } from "./audio/audio";
import { drawFrame } from "./render/draw";
import { loadImages } from "./render/loader";
import { showSelect } from "./ui/select";
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
  aiMode: (["0", "1", "2", "3"].includes(params.get("mode") ?? "") ? Number(params.get("mode")) : 0) as AiMode,
  overlay: params.get("overlay") !== "0",
  // A ?seed= pins the AI's jitter so an interesting fight can be replayed.
  seed: Number.isFinite(Number(params.get("seed"))) && params.get("seed") !== null
    ? Number(params.get("seed"))
    : undefined,
  activeSeed: 0,
  duel: null as Duel | null,
  ai: createAiState(),
  held: { advance: false, retreat: false },
  pending: null as Intent | null,
  // Time control: pause freezes the accumulator, step injects exactly one
  // tick, timescale stretches or compresses wall time. The simulation is a
  // pure function of ticks, so none of this can change an outcome - only
  // when you get to watch it.
  paused: params.get("paused") === "1",
  timescale: SPEEDS.includes(Number(params.get("speed"))) ? Number(params.get("speed")) : 1,
  stepOnce: false,
};

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
  showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => {
    state.pWeapon = p;
    state.eWeapon = e;
    startDuel();
  });
}

const audio = createAudioEngine();
// Browsers gate audio behind a user gesture; any keypress (select screen or
// duel) unlocks the context. Idempotent after the first.
document.addEventListener("keydown", () => audio.unlock());

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  // The select screen owns the keyboard while no duel is running; it adds
  // and removes its own listener via showSelect/hideSelect.
  if (state.duel === null) return;
  switch (e.key.toLowerCase()) {
    case "a": state.held.retreat = true; break;
    case "d": state.held.advance = true; break;
    case "s": state.pending = "void"; break;
    case "j": state.pending = "cut"; break;
    case "k": state.pending = "thrust"; break;
    case "l": state.pending = "parry"; break;
    case "0": state.aiMode = 0; break;
    case "1": state.aiMode = 1; break;
    case "2": state.aiMode = 2; break;
    case "3": state.aiMode = 3; break;
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
      state.held.retreat = false;
      // A tap buffers a step while the previous one is still playing; if the
      // key comes up before that buffered step fires, drop it so a tap is
      // one step, not two. Holding still chains steps because the buffer is
      // refreshed every tick while the key is down.
      if (state.duel && state.duel.f[0].buffered === "retreat") state.duel.f[0].buffered = null;
      break;
    case "d":
      state.held.advance = false;
      if (state.duel && state.duel.f[0].buffered === "advance") state.duel.f[0].buffered = null;
      break;
  }
});

loadImages().then((images) => {
  const view: View = { ctx, images, overlay: state.overlay };
  if (bootStraightIn) startDuel();
  else openSelect();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    if (state.paused) {
      // Frozen: no wall time enters the accumulator, and any fractional
      // leftover is dropped so the next step is exactly one tick.
      acc = 0;
      if (state.stepOnce) {
        acc = TICK;
        state.stepOnce = false;
      }
    } else {
      acc += Math.min(now - last, 250) * state.timescale;
    }
    last = now;
    const d = state.duel;
    if (d) {
      const frameEvents: DuelEvent[] = [];
      while (acc >= TICK) {
        acc -= TICK;
        let ia: Intent | null = state.pending;
        state.pending = null;
        if (ia === null && state.held.advance) ia = "advance";
        if (ia === null && state.held.retreat) ia = "retreat";
        const ib = aiDecide(d, state.aiMode, state.ai, TICK);
        frameEvents.push(...tickDuel(d, ia, ib));
      }
      audio.frame(frameEvents, state.paused);
      view.overlay = state.overlay;
      drawFrame(view, d, state.aiMode, state.activeSeed, {
        paused: state.paused,
        timescale: state.timescale,
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

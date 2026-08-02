import { aiDecide, createAiState } from "./combat/ai";
import { TICK } from "./combat/fighter";
import { createDuel, tickDuel } from "./combat/engine";
import { WEAPONS } from "./combat/weapons";
import { drawFrame } from "./render/draw";
import { loadImages } from "./render/loader";
import type { AiMode } from "./combat/ai";
import type { Duel } from "./combat/engine";
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

const state = {
  pWeapon: pick("p", "longsword"),
  eWeapon: pick("e", "rapier"),
  aiMode: (["0", "1", "2"].includes(params.get("mode") ?? "") ? Number(params.get("mode")) : 0) as AiMode,
  overlay: params.get("overlay") !== "0",
  duel: null as Duel | null,
  ai: createAiState(),
  held: { advance: false, retreat: false },
  pending: null as Intent | null,
};

function startDuel(): void {
  state.duel = createDuel(WEAPONS[state.pWeapon], WEAPONS[state.eWeapon]);
  state.ai = createAiState();
  state.pending = null;
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
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
    case "r": startDuel(); break;
    case "`": state.overlay = !state.overlay; break;
  }
});
document.addEventListener("keyup", (e) => {
  switch (e.key.toLowerCase()) {
    case "a": state.held.retreat = false; break;
    case "d": state.held.advance = false; break;
  }
});

loadImages().then((images) => {
  const view: View = { ctx, images, overlay: state.overlay };
  startDuel();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    acc += Math.min(now - last, 250);
    last = now;
    const d = state.duel;
    if (d) {
      while (acc >= TICK) {
        acc -= TICK;
        let ia: Intent | null = state.pending;
        state.pending = null;
        if (ia === null && state.held.advance) ia = "advance";
        if (ia === null && state.held.retreat) ia = "retreat";
        const ib = aiDecide(d, state.aiMode, state.ai, TICK);
        tickDuel(d, ia, ib);
      }
      view.overlay = state.overlay;
      drawFrame(view, d, state.aiMode);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}).catch((err: Error) => {
  ctx.fillStyle = "#d64541";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText(`sprite load failed: ${err.message}`, 20, 30);
});

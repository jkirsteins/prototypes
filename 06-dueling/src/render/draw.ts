import { ARENA, gapOf } from "../combat/engine";
import { lastLines } from "../combat/log";
import { zoneFor } from "../combat/measure";
import { pickFrame } from "./frames";
import { SHEETS } from "./sheets";
import type { AiMode } from "../combat/ai";
import type { Duel } from "../combat/engine";
import type { Fighter } from "../combat/fighter";
import type { SheetName } from "./sheets";

export const SCALE = 3;
/**
 * Horizontal world units are centimeters (a ~175 cm fighter). At sprite
 * scale 3 one canvas px covers 2 cm, so positions and reaches convert to
 * screen space through this factor.
 */
export const PX_PER_CM = 0.5;

export interface View {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  overlay: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  pretempo: "#8a8f98", windup: "#e6c229", beat: "#e6c229", strike: "#d64541",
  recovery: "#57a55a", void: "#4aa3df", parry: "#9b8cff", step: "#cfd3da",
  pause: "#cfd3da", hitstun: "#d64541", dead: "#555a63", idle: "#8a8f98",
};

/** cut/thrust tempo cost per weapon, shown on the HUD cards. */
const ATTACK_LISTING: Record<string, string> = {
  longsword: "cut: 2 tempi / thrust: 1 tempo",
  rapier: "thrust: 1 tempo / cut: poor",
};

const CONTROLS_LINE =
  "A/D step S void J cut K thrust L parry | 0-3 AI mode R rematch Esc select ` overlay";

export function drawFrame(v: View, d: Duel, aiMode: AiMode, seed: number): void {
  const { ctx } = v;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 960, 540);
  // floor
  ctx.fillStyle = "#2a2e36";
  ctx.fillRect(0, ARENA.floorY, 960, 540 - ARENA.floorY);

  if (v.overlay) drawMeasureBands(v, d);
  drawFighter(v, d.f[0], d.time);
  drawFighter(v, d.f[1], d.time);
  if (v.overlay) {
    drawPhaseLabel(v, d.f[0]);
    drawPhaseLabel(v, d.f[1]);
    drawLog(v, d);
    drawSeed(v, seed);
  }
  drawHud(v, d, aiMode);
  if (d.over) drawBanner(v, d);
}

function drawFighter(v: View, f: Fighter, time: number): void {
  const { ctx } = v;
  const pick = pickFrame(f, time);
  const meta = SHEETS[pick.sheet];
  const img = v.images[pick.sheet];
  const sx = pick.frame * meta.frameW;
  const dy = ARENA.floorY - meta.feetY * SCALE;
  ctx.save();
  ctx.translate(f.x * PX_PER_CM, 0);
  if (pick.flip) ctx.scale(-1, 1);
  ctx.drawImage(
    img, sx, 0, meta.frameW, meta.frameH,
    -meta.originX * SCALE, dy, meta.frameW * SCALE, meta.frameH * SCALE,
  );
  ctx.restore();
}

function drawMeasureBands(v: View, d: Duel): void {
  const { ctx } = v;
  const tints = ["#c9a227", "#4aa3df"]; // fighter 0 gold, fighter 1 blue
  d.f.forEach((f, i) => {
    const y = ARENA.floorY + 14 + i * 12;
    const dir = f.facing;
    const px = f.x * PX_PER_CM;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = tints[i];
    ctx.fillRect(px, y, dir * f.weapon.reach * PX_PER_CM, 5); // narrow
    ctx.globalAlpha = 0.18;
    ctx.fillRect(px + dir * f.weapon.reach * PX_PER_CM, y, dir * f.weapon.stepDistance * PX_PER_CM, 5); // wide
    ctx.globalAlpha = 1;
    ctx.fillStyle = tints[i];
    ctx.font = "10px ui-monospace, monospace";
    const zone = zoneFor(gapOf(d), f.weapon);
    ctx.fillText(`${f.weapon.name}: ${zone}`, px + (dir === 1 ? 4 : -70), y + 14);
  });
}

/** Label above a fighter naming their current state (attack states show the phase, not "attack"). */
function drawPhaseLabel(v: View, f: Fighter): void {
  const { ctx } = v;
  const s = f.state;
  const label = s.kind === "attack" ? s.phase : s.kind;
  ctx.fillStyle = PHASE_COLORS[label] ?? "#cfd3da";
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, f.x * PX_PER_CM, ARENA.floorY - 180);
  ctx.textAlign = "left";
}

/** Right-aligned scrolling combat log, most recent line last. */
function drawLog(v: View, d: Duel): void {
  const { ctx } = v;
  const lines = lastLines(d.log, 8);
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "#8a8f98";
  ctx.textAlign = "right";
  lines.forEach((line, i) => {
    ctx.fillText(line, 952, 108 + i * 14);
  });
  ctx.textAlign = "left";
}

/** The AI's jitter seed, so a fight worth repeating can be replayed with ?seed=. */
function drawSeed(v: View, seed: number): void {
  const { ctx } = v;
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "#8a8f98";
  ctx.textAlign = "left";
  ctx.fillText(`seed ${seed}`, 8, 512);
}

/** Per-fighter cards (weapon, reach, attack tempo) plus the bottom controls line. */
function drawHud(v: View, d: Duel, aiMode: AiMode): void {
  const { ctx } = v;
  const cards: Array<{ x: number; f: Fighter; label: string; tint: string }> = [
    { x: 8, f: d.f[0], label: "you", tint: "#c9a227" },
    { x: 662, f: d.f[1], label: `AI mode ${aiMode}`, tint: "#4aa3df" },
  ];
  ctx.textAlign = "left";
  for (const card of cards) {
    ctx.fillStyle = "rgba(35, 40, 48, 0.75)";
    ctx.fillRect(card.x, 8, 290, 84);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#cfd3da";
    ctx.fillText(`${card.f.weapon.name} - ${card.label}`, card.x + 10, 26);
    ctx.fillText(`effective reach ${card.f.weapon.reach} cm`, card.x + 10, 46);
    ctx.fillStyle = card.tint;
    ctx.fillRect(card.x + 10, 52, card.f.weapon.reach * 0.3, 4);
    ctx.fillStyle = "#cfd3da";
    ctx.fillText(ATTACK_LISTING[card.f.weapon.id] ?? "", card.x + 10, 74);
  }
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "#8a8f98";
  ctx.textAlign = "center";
  ctx.fillText(CONTROLS_LINE, 480, 530);
  ctx.textAlign = "left";
}

/** End-of-duel banner: who killed whom, or a mutual-strike draw. */
function drawBanner(v: View, d: Duel): void {
  const { ctx } = v;
  const winner = d.winner;
  const text =
    winner === "draw"
      ? "MUTUAL DEATH - draw"
      : `${d.f[winner ?? 0].weapon.name.toUpperCase()} KILLS - R to rematch, Esc to reselect`;
  ctx.fillStyle = "#e8eaed";
  ctx.font = "28px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 480, 240);
  ctx.textAlign = "left";
}

import { ARENA, gapOf } from "../combat/engine";
import { HIT_STUN_MS } from "../combat/fighter";
import { lastLines } from "../combat/log";
import { zoneFor } from "../combat/measure";
import { pickFrame } from "./frames";
import { SHEETS } from "./sheets";
import type { AiMode } from "../combat/ai";
import type { Duel } from "../combat/engine";
import type { Fighter, FighterState } from "../combat/fighter";
import type { AttackPhase, WeaponId } from "../combat/types";
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

/**
 * Keyed over the state and phase unions (the attack kind always shows its
 * phase, so it is excluded): a renamed or added state is a compile error
 * here, never a silently grey label.
 */
const PHASE_COLORS: Record<AttackPhase | Exclude<FighterState["kind"], "attack">, string> = {
  windup: "#e6c229", strike: "#d64541", recovery: "#57a55a",
  void: "#4aa3df", parry: "#9b8cff", step: "#cfd3da",
  hitstun: "#d64541", dead: "#555a63", ready: "#8a8f98",
};

/** cut/thrust tempo cost per weapon, shown on the HUD cards. */
const ATTACK_LISTING: Record<WeaponId, string> = {
  longsword: "cut: 2 tempi / thrust: 1 tempo",
  rapier: "thrust: 1 tempo / cut: poor",
};

const CONTROLS_LINE =
  "A/D step S void J cut K thrust L parry | 0-3 AI mode R rematch Esc select ` overlay | space pause . step [/] speed";

export interface TimeControl {
  paused: boolean;
  timescale: number;
}

export function drawFrame(v: View, d: Duel, aiMode: AiMode, seed: number, time: TimeControl): void {
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
    drawBodyTrack(v, d.f[0]);
    drawBodyTrack(v, d.f[1]);
    drawParryTrack(v, d.f[0]);
    drawParryTrack(v, d.f[1]);
    drawLog(v, d);
    drawSeed(v, seed);
  }
  drawHud(v, d, aiMode);
  drawTimeControl(v, d, time);
  if (d.over) drawBanner(v, d);
}

/**
 * Pause/step/speed indicator. Not overlay-gated: when the game is frozen or
 * running off-speed the player must be able to see why.
 */
function drawTimeControl(v: View, d: Duel, time: TimeControl): void {
  const { ctx } = v;
  if (!time.paused && time.timescale === 1) return;
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  if (time.paused) {
    const tick = Math.round(d.time / (1000 / 60));
    ctx.fillStyle = "#e6c229";
    ctx.fillText(
      `PAUSED  t=${(d.time / 1000).toFixed(2)}s  tick ${tick}  (. step, space resume)`,
      480,
      112,
    );
  } else {
    ctx.fillStyle = "#8a8f98";
    ctx.fillText(`${time.timescale}x speed`, 480, 112);
  }
  ctx.textAlign = "left";
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

/**
 * One presentation idiom per track: a label plus a progress bar in the same
 * style, so a thrust's recovery and a step's settle read the same way. Row 1
 * is the body-action track (while its bar runs, non-parry actions are
 * deferred or refused); row 2 is the parry track (it alone gates the parry).
 */
const TRACK_BAR_W = 70;
const TRACK_BAR_H = 5;
const ROW1_LABEL_Y = -184;
const ROW1_BAR_Y = -178;
const ROW2_LABEL_Y = -165;
const ROW2_BAR_Y = -159;

function drawTrackRow(
  v: View, cx: number, labelY: number, barY: number,
  label: string, color: string, frac: number | null,
): void {
  const { ctx } = v;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.fillText(label, cx, ARENA.floorY + labelY);
  ctx.textAlign = "left";
  if (frac === null) return;
  const x = cx - TRACK_BAR_W / 2;
  const y = ARENA.floorY + barY;
  ctx.fillStyle = "#2c313a";
  ctx.fillRect(x, y, TRACK_BAR_W, TRACK_BAR_H);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TRACK_BAR_W * Math.max(0, Math.min(1, frac)), TRACK_BAR_H);
}

/** Row 1: current state or attack phase, with progress through it. */
function drawBodyTrack(v: View, f: Fighter): void {
  const { ctx } = v;
  const s = f.state;
  const cx = f.x * PX_PER_CM;
  const label = s.kind === "attack" ? s.phase : s.kind;
  const color = PHASE_COLORS[label];

  if (s.kind === "attack" && s.phase === "strike") {
    // The one bar with internal structure: meetable / delivered, split at
    // the timeline's parryable mark, cursor riding the elapsed time.
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(label, cx, ARENA.floorY + ROW1_LABEL_Y);
    ctx.textAlign = "left";
    drawCommitCue(v, f, cx);
    const tl = s.timeline;
    const strike = tl.strikeEnd - tl.strikeStart;
    const meetable = (tl.parryableUntil - tl.strikeStart) / strike;
    const x = cx - TRACK_BAR_W / 2;
    const y = ARENA.floorY + ROW1_BAR_Y;
    ctx.fillStyle = "#e6c229"; // meetable
    ctx.fillRect(x, y, TRACK_BAR_W * meetable, TRACK_BAR_H);
    ctx.fillStyle = "#6b2f2c"; // delivered: too late to parry
    ctx.fillRect(x + TRACK_BAR_W * meetable, y, TRACK_BAR_W * (1 - meetable), TRACK_BAR_H);
    ctx.fillStyle = "#e8eaed";
    ctx.fillRect(x + Math.min(1, (s.elapsedMs - tl.strikeStart) / strike) * TRACK_BAR_W - 1, y - 2, 2, TRACK_BAR_H + 4);
    return;
  }

  drawTrackRow(v, cx, ROW1_LABEL_Y, ROW1_BAR_Y, label, color, bodyFraction(f));
  drawCommitCue(v, f, cx);

  // Presentation marks inside the windup: where the rise starts (end of an
  // AI telegraph) and where the stillness begins.
  if (s.kind === "attack" && s.phase === "windup") {
    const tl = s.timeline;
    const x = cx - TRACK_BAR_W / 2;
    const y = ARENA.floorY + ROW1_BAR_Y;
    ctx.fillStyle = "#1b1e24";
    for (const mark of [tl.riseStart, tl.riseEnd]) {
      if (mark > 0 && mark < tl.strikeStart) {
        ctx.fillRect(x + (mark / tl.strikeStart) * TRACK_BAR_W, y, 1, TRACK_BAR_H);
      }
    }
  }
}

/**
 * Derived commitment cue, visual only: the windup -> strike transition is
 * the single source of truth, never stored. Underlines the label once the
 * attack can no longer be abandoned.
 */
function drawCommitCue(v: View, f: Fighter, cx: number): void {
  const s = f.state;
  if (s.kind !== "attack" || s.phase === "windup") return;
  v.ctx.fillStyle = PHASE_COLORS[s.phase];
  v.ctx.fillRect(cx - 14, ARENA.floorY + ROW1_LABEL_Y + 3, 28, 1);
}

/** Progress through the current body action, or null for no bar. */
function bodyFraction(f: Fighter): number | null {
  const s = f.state;
  switch (s.kind) {
    case "ready":
      // Settling after a step: the same track being unavailable, so it
      // gets the same bar - filling toward being free.
      return f.stepRecoveryMs > 0 ? 1 - f.stepRecoveryMs / f.weapon.stepRecoveryMs : null;
    case "step":
      return s.t / f.weapon.stepDuration;
    case "void":
      return s.t / f.weapon.voidDuration;
    case "hitstun":
      return s.t / HIT_STUN_MS;
    case "attack": {
      const tl = s.timeline;
      if (s.phase === "windup") return s.elapsedMs / tl.strikeStart;
      // Recovery reads the resolved timeline, so a whiff visibly shows its
      // longer exposure and a parried attack its penalty.
      return (s.elapsedMs - tl.recoveryStart) / (tl.recoveryEnd - tl.recoveryStart);
    }
    case "parry": // row 2's business
    case "dead":
      return null;
  }
}

/** Row 2: the parry track - window while up, recovery while spent. */
function drawParryTrack(v: View, f: Fighter): void {
  const cx = f.x * PX_PER_CM;
  const cooling = f.parryRecoveryMs > 0;
  if (f.state.kind === "parry") {
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "parry up", "#9b8cff", f.state.t / f.weapon.parryWindowMs);
  } else if (cooling) {
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "recovering", "#6b6675", 1 - f.parryRecoveryMs / f.weapon.parryRecoveryMs);
  } else {
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "parry ready", "#5a6070", null);
  }
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
    ctx.fillText(ATTACK_LISTING[card.f.weapon.id], card.x + 10, 74);
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

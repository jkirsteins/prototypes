import { ARENA, BIND_MS, FIRMNESS_EPSILON, gapOf } from "../combat/engine";
import { BIND_LOSS_MS } from "../combat/fighter";
import { HIT_STUN_MS, guardEffective, lineOf } from "../combat/fighter";
import { controlsLine } from "../ui/help";
import { lastLines } from "../combat/log";
import { zoneFor } from "../combat/measure";
import { pickBindFrame, pickFrame } from "./frames";
import { SHEETS } from "./sheets";
import type { AiMode } from "../combat/ai";
import type { BindState, Duel } from "../combat/engine";
import type { Fighter, FighterState } from "../combat/fighter";
import type { AttackPhase, Height, WeaponId, Zone } from "../combat/types";
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
  void: "#4aa3df", step: "#cfd3da",
  hitstun: "#d64541", dead: "#555a63", ready: "#8a8f98",
  bind: "#c9822f", exposed: "#d64541",
};

/** cut/thrust tempo cost per weapon, shown on the HUD cards. */
const ATTACK_LISTING: Record<WeaponId, string> = {
  longsword: "cut: 2 tempi / thrust: 1 tempo",
  rapier: "thrust: 1 tempo / cut: poor",
};

/** Built from the same table the help panel lists, so the two cannot drift. */
const CONTROLS_LINE = controlsLine();

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
  drawLineBar(v, d.f[0], 0);
  drawLineBar(v, d.f[1], 1);
  drawFighter(v, d.f[0], d.time, d.bind, 0);
  drawFighter(v, d.f[1], d.time, d.bind, 1);
  if (v.overlay) {
    drawBodyTrack(v, d.f[0], d.bind);
    drawBodyTrack(v, d.f[1], d.bind);
    drawParryTrack(v, d.f[0], d.bind, 0);
    drawParryTrack(v, d.f[1], d.bind, 1);
    drawLineTrack(v, d.f[0], d.bind);
    drawLineTrack(v, d.f[1], d.bind);
    drawLog(v, d);
    drawSeed(v, seed);
  }
  drawHud(v, d, aiMode);
  drawTimeControl(v, d, time);
  drawHelpButton(v);
  if (d.over) drawBanner(v, d);
}

/** Hit box for the help button; main.ts tests canvas clicks against it. */
export const HELP_BUTTON = { x: 928, y: 504, w: 24, h: 22 };

/** Always visible, not overlay-gated: the rules must be findable. */
function drawHelpButton(v: View): void {
  const { ctx } = v;
  const b = HELP_BUTTON;
  ctx.strokeStyle = "#3a404c";
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("?", b.x + b.w / 2, b.y + 16);
  ctx.textAlign = "left";
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

/**
 * The bind strain: a small deterministic horizontal offset, opposite in
 * phase between the two fighters, so a frozen bind reads as two bodies
 * pushing on each other rather than a screenshot. Renderer-only - it reads
 * d.time and never enters the simulation, so replays cannot see it.
 */
export function bindStrainOffset(timeMs: number, side: 0 | 1, firm?: [number, number]): number {
  // The amplitude term: a lopsided bind visibly leans - the softer fighter
  // is shoved harder. Derived from the stored firmness pair, still pure in
  // its inputs and still outside the simulation.
  const lean = firm ? Math.max(0.4, 1 + (firm[1 - side] - firm[side])) : 1;
  const a = Math.sin(timeMs / 45) * 0.9 * lean;
  return side === 0 ? a : -a;
}

function drawFighter(v: View, f: Fighter, time: number, bind: BindState | null, side: 0 | 1): void {
  const { ctx } = v;
  const bound = f.state.kind === "bind" && bind !== null;
  const pick = bound && bind !== null
    ? pickBindFrame(f, bind.contact[side], bind.line.side)
    : pickFrame(f, time);
  const meta = SHEETS[pick.sheet];
  const img = v.images[pick.sheet];
  const sx = pick.frame * meta.frameW;
  const dy = ARENA.floorY - meta.feetY * SCALE;
  ctx.save();
  ctx.translate(f.x * PX_PER_CM + (bound && bind !== null ? bindStrainOffset(time, side, bind.firmness) : 0), 0);
  if (pick.flip) ctx.scale(-1, 1);
  ctx.drawImage(
    img, sx, 0, meta.frameW, meta.frameH,
    -meta.originX * SCALE, dy, meta.frameW * SCALE, meta.frameH * SCALE,
  );
  ctx.restore();
}

/**
 * "narrow" is the engine's landing predicate (gap <= reach), so it gets a
 * verdict color: green on the player's row (your attack lands), strike red
 * on the AI's (theirs lands on you). Other zones keep the identity tint.
 */
export function zoneLabelStyle(zone: Zone, fighterIndex: number, tint: string): { color: string; bold: boolean } {
  if (zone !== "narrow") return { color: tint, bold: false };
  return { color: fighterIndex === 0 ? "#57a55a" : "#d64541", bold: true };
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
    const zone = zoneFor(gapOf(d), f.weapon);
    const style = zoneLabelStyle(zone, i, tints[i]);
    ctx.fillStyle = style.color;
    ctx.font = `${style.bold ? "bold " : ""}10px ui-monospace, monospace`;
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
function drawBodyTrack(v: View, f: Fighter, bind: BindState | null): void {
  const { ctx } = v;
  const s = f.state;
  const cx = f.x * PX_PER_CM;
  const label = s.kind === "attack" ? s.phase : s.kind;
  const color = PHASE_COLORS[label];

  if (s.kind === "bind") {
    // Both fighters show the one shared clock filling together - the same
    // timed-state idiom as everything else, driven by the duel's BindState.
    drawTrackRow(v, cx, ROW1_LABEL_Y, ROW1_BAR_Y, label, color, bind === null ? null : bind.t / BIND_MS);
    return;
  }

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
    case "dead":
      return null;
    case "bind":
      // Unreachable from drawBodyTrack (the bind bar returns early with
      // the shared clock, which a lone fighter cannot supply); no bar.
      return null;
    case "exposed":
      return s.t / BIND_LOSS_MS;
  }
}

/**
 * The pressure bars: during a bind, row 2 becomes each fighter's firmness -
 * making a tactile sense visible is the honest way to model Fuehlen; hiding
 * it would not simulate feel, it would remove it. The OPPONENT'S bar is
 * bright because their firmness is what sets your incentives; yours is
 * dimmed. The lighter band on each bar spans the opponent's value plus and
 * minus FIRMNESS_EPSILON: the zone where a press-war grinds neutral. What
 * stays hidden is intent, never pressure.
 */
function drawPressureBar(v: View, f: Fighter, bind: BindState, side: 0 | 1): void {
  const { ctx } = v;
  const cx = f.x * PX_PER_CM;
  const mine = bind.firmness[side];
  const theirs = bind.firmness[1 - side];
  const bright = side === 1; // the player reads the opponent's row
  const label = !bright
    ? "bind"
    : mine > theirs + FIRMNESS_EPSILON ? "bind: they are hard"
    : mine < theirs - FIRMNESS_EPSILON ? "bind: they are soft"
    : "bind: even grind";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = bright ? "#e6c229" : "#6b6675";
  ctx.fillText(label, cx, ARENA.floorY + ROW2_LABEL_Y);
  ctx.textAlign = "left";
  const x = cx - TRACK_BAR_W / 2;
  const y = ARENA.floorY + ROW2_BAR_Y;
  ctx.fillStyle = "#2a2e36";
  ctx.fillRect(x, y, TRACK_BAR_W, TRACK_BAR_H);
  // The epsilon band around the OPPONENT's firmness.
  const lo = Math.max(0, theirs - FIRMNESS_EPSILON);
  const hi = Math.min(1, theirs + FIRMNESS_EPSILON);
  ctx.fillStyle = bright ? "#4a4436" : "#343841";
  ctx.fillRect(x + lo * TRACK_BAR_W, y, (hi - lo) * TRACK_BAR_W, TRACK_BAR_H);
  ctx.fillStyle = bright ? "#e6c229" : "#6b6675";
  ctx.fillRect(x, y, mine * TRACK_BAR_W, TRACK_BAR_H);
}

/** Row 2: the parry track - rise then window while up, recovery while spent. */
function drawParryTrack(v: View, f: Fighter, bind: BindState | null, side: 0 | 1): void {
  if (f.state.kind === "bind" && bind !== null) {
    drawPressureBar(v, f, bind, side);
    return;
  }
  const cx = f.x * PX_PER_CM;
  const cooling = f.parryRecoveryMs > 0;
  if (f.parry !== null) {
    // The held-guard lifecycle: a bar only where a duration exists. The
    // held state deliberately has none - a full static bar would imply a
    // deadline the guard no longer has.
    const p = f.parry;
    if (p.phase === "held") {
      drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "guard held", "#9b8cff", null);
    } else {
      const label = p.phase === "rising" ? "guard rising" : "guard shifting";
      drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, label, p.phase === "rising" ? "#6f66a8" : "#9b8cff",
        p.phaseMs / p.phaseDurationMs);
    }
  } else if (cooling) {
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "recovering", "#6b6675", 1 - f.parryRecoveryMs / f.weapon.parryRecoveryMs);
  } else {
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, "parry ready", "#5a6070", null);
  }
}

const ROW3_LABEL_Y = -146;

/**
 * Row 3: the line - a value, not a duration, so a label with no bar. It
 * always says which thing it describes: the attack's snapshotted line, the
 * parry's target line (exactly what the contact rule will consult), or the
 * stance, including its motion. The AI's line must be as legible as the
 * player's or none of the reads exist.
 */
export function lineLabel(f: Fighter, bind: BindState | null = null): string {
  const H = (h: Height): string => h.toUpperCase();
  if (f.state.kind === "bind" && bind !== null) {
    // The saved contact line, never a live recomputation: the states that
    // formed the contact are gone. Both fighters are on it by definition,
    // so both rows read the same - the visual statement that two blades
    // are in one place.
    const l = bind.line;
    return `${H(l.height)} ${l.side.toUpperCase()} (bind)`;
  }
  if (f.state.kind === "attack") {
    const l = lineOf(f);
    return `${H(l.height)} ${l.side.toUpperCase()} (attack)`;
  }
  if (f.parry !== null) {
    const t = f.parry.targetLine;
    return `${H(t.height)} ${t.side.toUpperCase()} (parry)`;
  }
  if (f.heightTo !== null) return `${H(f.height)} to ${H(f.heightTo)} (stance)`;
  return `${H(f.height)} (stance)`;
}

function drawLineTrack(v: View, f: Fighter, bind: BindState | null): void {
  const { ctx } = v;
  const active = f.state.kind === "attack" || f.state.kind === "bind" || f.parry !== null;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = active ? "#cfd3da" : "#5a6070";
  ctx.fillText(lineLabel(f, bind), f.x * PX_PER_CM, ARENA.floorY + ROW3_LABEL_Y);
  ctx.textAlign = "left";
}

/**
 * The line bar: a short vertical bar behind the fighter whose centre is the
 * height band - the always-on spatial read of where the blade threatens or
 * guards. Bands are fractions of body height, derived once, so `middle`
 * slots in with no renderer change. Its slide during a stance transition is
 * the tell the whole chain of reads builds on.
 */
export const HEIGHT_BAND_FRAC: Record<Height, number> = { high: 0.8, middle: 0.55, low: 0.3 };
// Clear of the sprite: the body spans ~28px behind centre at SCALE 2, and a
// bar overlapping the shoulder was unreadable exactly when it mattered.
const LINE_BAR_OFFSET_PX = 46;
const LINE_BAR_H = 18;
const BODY_PX = 80; // 40 sheet rows of body at SCALE 2

/** The band fraction the bar sits at now, interpolating through a transition. */
export function lineBarFrac(f: Fighter): number {
  if (f.state.kind === "attack") return HEIGHT_BAND_FRAC[f.state.height];
  const from = HEIGHT_BAND_FRAC[f.height];
  if (f.heightTo === null) return from;
  const p = Math.min(1, f.heightT / f.weapon.heightChangeMs);
  return from + (HEIGHT_BAND_FRAC[f.heightTo] - from) * p;
}

function drawLineBar(v: View, f: Fighter, i: 0 | 1): void {
  const { ctx } = v;
  const tints = ["#c9a227", "#4aa3df"]; // the measure bands' fighter tints
  const x = f.x * PX_PER_CM - f.facing * LINE_BAR_OFFSET_PX;
  const yMid = ARENA.floorY - lineBarFrac(f) * BODY_PX;
  const live =
    (f.state.kind === "attack" && f.state.phase !== "recovery") || guardEffective(f);
  ctx.globalAlpha = live ? 1 : 0.35;
  ctx.fillStyle = tints[i];
  ctx.fillRect(x - 2, yMid - LINE_BAR_H / 2, 4, LINE_BAR_H);
  ctx.globalAlpha = 1;
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

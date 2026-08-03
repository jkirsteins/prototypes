import { ARENA, BIND_ADVANTAGE_MS, gapOf } from "../combat/engine";
import { bindTimerFrac, netBindForce, yieldOpportunity, yieldThreat } from "../combat/bind";
import { BIND_LOSS_MS } from "../combat/fighter";
import { HIT_STUN_MS, guardEffective, lineOf } from "../combat/fighter";
import { controlsLines } from "../ui/help";
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

/** Built from the same table the help panel lists, so the two cannot drift.
 *  Two lines, each narrower than the canvas: instructions clip nowhere. */
const CONTROLS_LINES = controlsLines();

export interface TimeControl {
  paused: boolean;
  timescale: number;
  /** The bullet-time controller's current eased scale (1 = real time). */
  bulletScale: number;
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
    drawBodyTrack(v, d.f[0]);
    drawBodyTrack(v, d.f[1]);
    drawParryTrack(v, d.f[0], d.bind, 0);
    drawParryTrack(v, d.f[1], d.bind, 1);
    drawLineTrack(v, d.f[0], d.bind);
    drawLineTrack(v, d.f[1], d.bind);
    drawLog(v, d);
    drawSeed(v, seed);
  }
  drawHud(v, d, aiMode);
  drawBindBar(v, d); // not overlay-gated: it is the contest's control surface
  drawOpeningPrompt(v, d); // nor this: the reward has a deadline
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
  } else if (time.timescale !== 1) {
    ctx.fillStyle = "#8a8f98";
    ctx.fillText(`${time.timescale}x speed`, 480, 112);
  }
  // The slowed clock announces itself: without a label, bullet time reads
  // as the game acting strangely rather than as a granted beat of time.
  if (!time.paused && time.bulletScale < 0.995) {
    ctx.fillStyle = "#4aa3df";
    ctx.fillText(`BULLET TIME ${time.bulletScale.toFixed(2)}x`, 480, 126);
  }
  ctx.textAlign = "left";
}

/**
 * The instruction line over the shared bar: ALWAYS instructions, never a
 * status readout - an earlier cut swapped it for the player's current
 * action ("pressing", "press recovery"), which hid the instructions for
 * exactly as long as the player acted. The action already reads from the
 * PLAYER label under the bar; this line only ever teaches: the yield call
 * when the player's own window is live, the flurry warning when the
 * player's pressure is feeding the OPPONENT'S window (sustained mash
 * into a deep opponent is exactly what a yield turns), the keys
 * otherwise.
 */
export function bindPrompt(ownWindow: boolean, feedingTheirs: boolean): string {
  if (ownWindow) return "BIND - YIELD NOW: tap K to turn their pressure";
  if (feedingTheirs) return "BIND - they can turn your flurry: SPACE your taps";
  return "BIND - J presses, K yields when your band lights";
}

/**
 * Where the marker renders, in [-1, +1] of the bar's half-width (negative
 * = left). Pressure shoves the marker in the PRESSER'S facing direction -
 * the enemy pressing drives the blades toward the player, so the marker
 * travels toward the player's side of the bar, and symmetrically the
 * other way. Derived from the enemy's facing, so if the fighters ever
 * stood swapped the bar would follow the world, not a convention.
 */
export function bindMarkerOffset(control: number, enemyFacing: 1 | -1): number {
  return control * enemyFacing;
}

/**
 * One side's status label and recovery fraction for the shared bar,
 * straight off the live action track - no presentation-only copy.
 */
export function bindSideStatus(
  bind: BindState, side: 0 | 1,
): { label: string; recovery: number | null } {
  const a = bind.action[side];
  switch (a.kind) {
    case "ready": {
      if (yieldOpportunity(bind, side)) return { label: "YIELD NOW", recovery: null };
      // The beat is theirs: a press OR a yield right now is a LOST turn -
      // they pressed first. "READY" here would lie; the bar fills through
      // their claim so the answer (J to counter-claim, K to turn the
      // spent force) can be TIMED into the gap instead of sprayed into
      // the lockout.
      const opp = bind.action[1 - side];
      if (opp.kind === "pressCommit" || opp.kind === "pressActive") {
        const claimMs = opp.pulse.commitMs + opp.pulse.activeMs;
        const at = opp.kind === "pressCommit" ? opp.t : opp.pulse.commitMs + opp.t;
        return { label: "THEIR BEAT", recovery: at / claimMs };
      }
      return { label: side === 0 ? "READY" : "HOLDING", recovery: null };
    }
    case "pressCommit":
      return { label: "PRESSING", recovery: a.t / a.pulse.commitMs };
    case "pressActive":
      return { label: "PRESSING", recovery: a.t / a.pulse.activeMs };
    case "pressRecover":
      return { label: side === 0 ? "PRESS RECOVERY" : "RECOVERING", recovery: a.t / a.durationMs };
    case "yielding":
      return { label: "YIELDING", recovery: a.t / a.durationMs };
    case "yieldFailRecover":
      return { label: "YIELD FAILED", recovery: a.t / a.durationMs };
  }
}

/** The headline over the bar: which way the pulse forces push right now. */
export function bindHeadline(bind: BindState): string {
  const net = netBindForce(bind.action);
  if (net < -0.01) return "BIND: PLAYER PRESSURE";
  if (net > 0.01) return "BIND: ENEMY PRESSURE";
  return "BIND: NEUTRAL";
}

/**
 * The shared control bar, mapped to the WORLD: pressure moves the marker
 * in the presser's facing direction, so the enemy pressing drives the
 * marker toward the player's side of the bar - being pushed into your own
 * territory is losing. Each fighter's yield band therefore sits on their
 * OWN side (it lights as the marker is shoved into it), and the cap at
 * each end is tinted by the fighter who WINS there - the far cap, whose
 * territory you drove the marker through. Everything is derived from the
 * enemy's facing (bindMarkerOffset), never from a screen convention, and
 * everything drawn reads live simulation values.
 */
const BIND_BAR = { cx: 480, y: 168, halfW: 170, h: 8 };

function drawBindBar(v: View, d: Duel): void {
  const bind = d.bind;
  if (bind === null) return;
  const { ctx } = v;
  const b = BIND_BAR;
  const net = netBindForce(bind.action);
  const enemyFacing = d.f[1].facing;
  const tints = ["#c9a227", "#4aa3df"] as const; // fighter 0 gold, fighter 1 blue

  ctx.textAlign = "center";
  ctx.font = "bold 15px ui-monospace, monospace";
  ctx.fillStyle = "#c9822f";
  ctx.fillText(bindHeadline(bind), b.cx, b.y - 22);
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText(bindPrompt(yieldOpportunity(bind, 0), yieldThreat(bind, 1)), b.cx, b.y - 8);

  // The range, the neutral mark, the win caps (tinted by their winner:
  // side 0 wins where control -1 renders, side 1 where +1 renders).
  const x0 = b.cx - b.halfW;
  ctx.fillStyle = "#2c313a";
  ctx.fillRect(x0, b.y, 2 * b.halfW, b.h);
  ctx.fillStyle = "#8a8f98";
  ctx.fillRect(b.cx - 1, b.y - 2, 2, b.h + 4);
  const leftWinner: 0 | 1 = bindMarkerOffset(-1, enemyFacing) < 0 ? 0 : 1;
  ctx.fillStyle = tints[leftWinner];
  ctx.fillRect(x0 - 5, b.y - 2, 5, b.h + 4);
  ctx.fillStyle = tints[1 - leftWinner];
  ctx.fillRect(b.cx + b.halfW, b.y - 2, 5, b.h + 4);

  // Yield bands: side s's zone sits where s's LOSS endpoint renders -
  // their own side of the bar, the territory they are pushed back into.
  const band = (side: 0 | 1): void => {
    const w = bind.yieldZone[side] * b.halfW;
    const lit = yieldOpportunity(bind, side);
    ctx.fillStyle = lit ? "#e6c229" : "#4a4436";
    const lossOffset = bindMarkerOffset(side === 0 ? 1 : -1, enemyFacing);
    if (lossOffset > 0) ctx.fillRect(b.cx + b.halfW - w, b.y, w, b.h);
    else ctx.fillRect(x0, b.y, w, b.h);
  };
  band(0);
  band(1);

  // The bind clock, draining under the range: when it empties the bind
  // breaks neutral and both fighters are shoved apart.
  const frac = bindTimerFrac(bind);
  ctx.fillStyle = "#2c313a";
  ctx.fillRect(x0, b.y + b.h + 3, 2 * b.halfW, 3);
  // Drains symmetrically toward the centre, echoing the shove-apart.
  ctx.fillStyle = frac < 0.25 ? "#d64541" : "#8a8f98";
  ctx.fillRect(b.cx - frac * b.halfW, b.y + b.h + 3, 2 * frac * b.halfW, 3);

  // The marker, riding the live control value through the world mapping.
  const mx = b.cx + bindMarkerOffset(bind.control, enemyFacing) * b.halfW;
  ctx.fillStyle = "#e8eaed";
  ctx.beginPath();
  ctx.arc(mx, b.y + b.h / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // Net-force chevrons beside the marker, pointing where the marker is
  // actually being pushed on screen - the presser's facing direction.
  if (Math.abs(net) > 0.01) {
    const dir = bindMarkerOffset(net, enemyFacing) > 0 ? 1 : -1;
    ctx.fillStyle = "#e6c229";
    ctx.font = "bold 12px ui-monospace, monospace";
    const glyph = dir > 0 ? ">>" : "<<";
    ctx.fillText(glyph, mx + dir * 20, b.y + b.h);
  }

  // Per-side status and recovery bars, each under its fighter's own side
  // of the bar - the same side their yield band lives on.
  const status = [bindSideStatus(bind, 0), bindSideStatus(bind, 1)] as const;
  for (const side of [0, 1] as const) {
    const s = status[side];
    const onLeft = bindMarkerOffset(side === 0 ? 1 : -1, enemyFacing) < 0;
    const labelX = onLeft ? x0 + 40 : b.cx + b.halfW - 40;
    ctx.fillStyle = s.label === "YIELD NOW" ? "#e6c229" : "#cfd3da";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`${side === 0 ? "PLAYER" : "ENEMY"}: ${s.label}`, labelX, b.y + 22);
    if (s.recovery !== null) {
      const w = 60;
      const x = labelX - w / 2;
      ctx.fillStyle = "#2c313a";
      ctx.fillRect(x, b.y + 27, w, 4);
      ctx.fillStyle = "#8a8f98";
      ctx.fillRect(x, b.y + 27, w * Math.max(0, Math.min(1, s.recovery)), 4);
    }
  }
  ctx.textAlign = "left";
}

/**
 * The winner's conversion command, honest to the geometry: the advantage
 * thrust kills only if the frozen gap is inside the winner's reach.
 * Parry-entry binds always are; a CROSSING bind can latch far wider (the
 * reach SUM covers the gap), and there the thrust would whiff into a
 * brutal recovery - the prompt must never command it.
 */
export function openingPromptText(inReach: boolean): string {
  return inReach ? "OPENING - K thrusts, NOW" : "OPENING - too wide: step out";
}

/**
 * The bind winner's conversion window, spelled out while it runs: the
 * advantage timer is sized so ANY in-reach thrust launched inside it
 * kills, but only if the player knows K is the button - playtest showed a
 * won bind converted with a cut (worthless from the contact, by design)
 * and read as a broken reward. Draws where the bind bar stood, from live
 * state.
 */
function drawOpeningPrompt(v: View, d: Duel): void {
  if (d.bind !== null || d.over) return;
  const adv = d.f[0].bindAdvantageMs;
  if (adv <= 0) return;
  const { ctx } = v;
  const b = BIND_BAR;
  ctx.textAlign = "center";
  ctx.font = "bold 15px ui-monospace, monospace";
  ctx.fillStyle = "#e6c229";
  ctx.fillText(openingPromptText(gapOf(d) <= d.f[0].weapon.reach), b.cx, b.y - 22);
  const frac = Math.max(0, Math.min(1, adv / BIND_ADVANTAGE_MS));
  ctx.fillStyle = "#2c313a";
  ctx.fillRect(b.cx - b.halfW, b.y - 14, 2 * b.halfW, 4);
  ctx.fillStyle = "#e6c229";
  ctx.fillRect(b.cx - frac * b.halfW, b.y - 14, 2 * frac * b.halfW, 4);
  ctx.textAlign = "left";
}

/**
 * The bind strain: a small deterministic horizontal offset, opposite in
 * phase between the two fighters, so a frozen bind reads as two bodies
 * pushing on each other rather than a screenshot. Renderer-only - it reads
 * d.time and the live net force and never enters the simulation, so
 * replays cannot see it.
 */
export function bindStrainOffset(timeMs: number, side: 0 | 1, net = 0): number {
  // The amplitude term: a pulsing bind visibly strains harder, and both
  // bodies shift toward the side being pushed. Pure in its inputs and
  // still outside the simulation.
  const a = Math.sin(timeMs / 45) * 0.9 * (1 + 0.8 * Math.abs(net));
  return (side === 0 ? a : -a) + net * 2;
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
  // The strain's shove direction follows the presser's facing in the
  // world, the same mapping the bar's marker uses.
  const enemyFacing = side === 1 ? f.facing : (-f.facing as 1 | -1);
  ctx.save();
  ctx.translate(f.x * PX_PER_CM + (bound && bind !== null ? bindStrainOffset(time, side, netBindForce(bind.action) * enemyFacing) : 0), 0);
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
function drawBodyTrack(v: View, f: Fighter): void {
  const { ctx } = v;
  const s = f.state;
  const cx = f.x * PX_PER_CM;
  const label = s.kind === "attack" ? s.phase : s.kind;
  const color = PHASE_COLORS[label];

  if (s.kind === "bind") {
    // A label with no bar: the bind has no fixed duration to fill toward.
    // The contest itself renders on the shared control bar.
    drawTrackRow(v, cx, ROW1_LABEL_Y, ROW1_BAR_Y, label, color, null);
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

/** Row 2: the parry track - rise then window while up, recovery while spent.
 *  During a bind it mirrors that fighter's live action track, the same
 *  status the shared bar shows, so the read works at either glance. */
function drawParryTrack(v: View, f: Fighter, bind: BindState | null, side: 0 | 1): void {
  if (f.state.kind === "bind" && bind !== null) {
    const cx = f.x * PX_PER_CM;
    const s = bindSideStatus(bind, side);
    const color = s.label === "YIELD NOW" ? "#e6c229" : "#c9822f";
    drawTrackRow(v, cx, ROW2_LABEL_Y, ROW2_BAR_Y, s.label.toLowerCase(), color, s.recovery);
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

/** Right-aligned scrolling combat log, most recent line last. Each line
 *  is tinted by its actor (the fighter cards' colors), so attribution
 *  reads at a glance even in a mirror match where the names are equal. */
function drawLog(v: View, d: Duel): void {
  const { ctx } = v;
  const events = d.log.slice(-8);
  const lines = lastLines(d.log, 8);
  const tints = ["#b5a06b", "#7d9fb8"]; // muted fighter tints: log, not HUD
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "right";
  lines.forEach((line, i) => {
    ctx.fillStyle = tints[events[i].side];
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
  ctx.fillText(CONTROLS_LINES[0], 480, 517);
  ctx.fillText(CONTROLS_LINES[1], 480, 531);
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

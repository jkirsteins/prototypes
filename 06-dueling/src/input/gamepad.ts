import type { PadControl } from "./scheme";

/**
 * gamepad-support: polling and edges. The Gamepad API has no button
 * events - state is snapshots from navigator.getGamepads() - so this
 * module diffs consecutive snapshots into press/release edges, held
 * levels and ACTIVITY (the scheme-switching signal), entirely as a pure
 * function: previous snapshot + current pads in, frame + next snapshot
 * out. Nothing here touches navigator, so every rule is testable
 * without a browser.
 */

/** Radial deadzone for ACTIVITY detection (scheme switching, active-pad
 *  election). Below it a stick is noise, never input. */
export const DEADZONE = 0.25;
/** Per-frame axis change that counts as activity for a stick already
 *  outside the deadzone: a re-grip is input, a rest is not. */
export const ACTIVITY_DELTA = 0.1;
/** Hysteresis for the movement axis becoming a held direction: on at
 *  0.5, off at 0.35, so a stick resting near threshold cannot
 *  machine-gun step intents. */
export const MOVE_ON = 0.5;
export const MOVE_OFF = 0.35;

/** One pad's raw state, kept per pad so election can see every pad's
 *  activity, not only the active one's. */
interface PadRaw {
  id: string;
  buttons: boolean[];
  axes: number[];
}

export interface PadSnapshot {
  /** Per-index raw state from the last valid poll; missing = not seen. */
  pads: Record<number, PadRaw>;
  /** The elected active pad, or null while no pad has ever shown activity. */
  activePadIndex: number | null;
  /** Controls found already engaged on a seed poll (or engaged under the
   *  hold gate): no level and no edge until observed released. Keys are
   *  `b<i>` and `a<i>+`/`a<i>-`. */
  stale: Record<string, true>;
  /** Movement-axis engagement (hysteresis state) per direction. */
  moveEngaged: { pos: boolean; neg: boolean };
  /** Vertical-axis engagement (axis 1; pos = down on the W3C layout). */
  vertEngaged: { pos: boolean; neg: boolean };
  /** False until the first valid poll after creation or a discard: that
   *  poll only SEEDS the snapshot and returns an empty frame - a button
   *  held across a blur must not diff against "unpressed" and read as a
   *  fresh press. */
  seeded: boolean;
}

export function createPadSnapshot(): PadSnapshot {
  return {
    pads: {}, activePadIndex: null, stale: {},
    moveEngaged: { pos: false, neg: false }, vertEngaged: { pos: false, neg: false },
    seeded: false,
  };
}

/** Blur, select-screen entry: discard rather than zero - the next poll
 *  re-seeds, and every control still engaged goes stale until released. */
export function discardPadSnapshot(s: PadSnapshot): void {
  s.pads = {};
  s.moveEngaged = { pos: false, neg: false };
  s.vertEngaged = { pos: false, neg: false };
  s.seeded = false;
  // stale survives the discard and is re-derived at the seed poll anyway;
  // clearing it here would erase nothing the seed does not re-mark.
  s.stale = {};
}

export interface PadFrame {
  activePadIndex: number | null;
  /** The active pad's id (for PadKind), or null. */
  activePadId: string | null;
  /** Physical controls that went down this frame on the active pad. */
  pressed: PadControl[];
  /** Physical controls that came up this frame on the active pad. */
  released: PadControl[];
  /** Post-combine level per held action: every control bound to the
   *  action ORed together, stale controls contributing nothing. */
  held: { advance: boolean; retreat: boolean; guard: boolean; up: boolean; down: boolean };
  /** The active pad's |axes[0]| when engaged (0 otherwise): the walk/run
   *  threshold is the consumer's business. */
  moveMag: number;
  /** True when the active pad showed ACTIVITY as the scheme rules define
   *  it - edges and meaningful axis motion, never held levels. */
  activity: boolean;
  /** The active pad vanished this frame. */
  padGone: boolean;
}

const EMPTY_FRAME = (idx: number | null, id: string | null): PadFrame => ({
  activePadIndex: idx,
  activePadId: id,
  pressed: [],
  released: [],
  held: { advance: false, retreat: false, guard: false, up: false, down: false },
  moveMag: 0,
  activity: false,
  padGone: false,
});

const keyOf = (c: PadControl): string =>
  c.kind === "button" ? `b${c.index}` : `a${c.index}${c.sign > 0 ? "+" : "-"}`;

function rawOf(p: Gamepad): PadRaw {
  return {
    id: p.id,
    buttons: p.buttons.map((b) => b.pressed),
    axes: p.axes.slice(),
  };
}

/** A pad's ACTIVITY between two raws: a button press edge, an axis
 *  crossing out of the deadzone, or an engaged axis moving by
 *  ACTIVITY_DELTA. A stick merely held past the deadzone is not
 *  activity - without that rule a resting stick would reclaim the
 *  scheme every frame. */
function activityOf(prev: PadRaw | undefined, cur: PadRaw): boolean {
  if (prev === undefined) return false; // first sight seeds, never acts
  for (let i = 0; i < cur.buttons.length; i++) {
    if (cur.buttons[i] && !prev.buttons[i]) return true;
  }
  for (let i = 0; i < cur.axes.length; i++) {
    const was = Math.abs(prev.axes[i] ?? 0);
    const now = Math.abs(cur.axes[i] ?? 0);
    if (now > DEADZONE && was <= DEADZONE) return true;
    if (now > DEADZONE && Math.abs(now - was) >= ACTIVITY_DELTA - 1e-9) return true;
  }
  return false;
}

/**
 * Pure: previous snapshot + current pads -> election, then edges. `pads`
 * is what getGamepads() returned, nulls included. `gateNewHolds` is true
 * whenever a UI layer owns combat input (help open, select screen
 * showing): a held-action control that becomes engaged under the gate is
 * marked stale exactly as at a seed poll - no hold contribution until
 * observed released - while the physical edge still reports in
 * `pressed`, because on the select screen the same stick that must not
 * carry an advance hold IS the navigation control.
 */
export function readPads(
  prev: PadSnapshot,
  pads: (Gamepad | null)[],
  gateNewHolds: boolean,
): { frame: PadFrame; next: PadSnapshot } {
  const next: PadSnapshot = {
    pads: {},
    activePadIndex: prev.activePadIndex,
    stale: { ...prev.stale },
    moveEngaged: { ...prev.moveEngaged },
    vertEngaged: { ...prev.vertEngaged },
    seeded: true,
  };
  const present: Record<number, PadRaw> = {};
  for (const p of pads) {
    if (p !== null && p.connected !== false) present[p.index] = rawOf(p);
  }
  next.pads = present;

  // Seed poll: adopt the world as-is, no edges, no activity, no holds -
  // and everything already engaged is stale until released.
  if (!prev.seeded) {
    next.activePadIndex = prev.activePadIndex;
    for (const [idxStr, raw] of Object.entries(present)) {
      void idxStr;
      raw.buttons.forEach((down, i) => {
        if (down) next.stale[`b${i}`] = true;
      });
      raw.axes.forEach((v, i) => {
        if (Math.abs(v) > MOVE_OFF) next.stale[`a${i}${v > 0 ? "+" : "-"}`] = true;
      });
    }
    return { frame: EMPTY_FRAME(next.activePadIndex, null), next };
  }

  // Stale controls clear the moment they are OBSERVED released, whether
  // or not any pad is elected yet - a control held from a seed poll on a
  // never-active pad must still come home before it can act.
  for (const key of Object.keys(next.stale)) {
    const btn = /^b(\d+)$/.exec(key);
    const ax = /^a(\d+)([+-])$/.exec(key);
    let engaged = false;
    for (const raw of Object.values(present)) {
      if (btn !== null && raw.buttons[Number(btn[1])] === true) engaged = true;
      if (ax !== null) {
        const v = (raw.axes[Number(ax[1])] ?? 0) * (ax[2] === "+" ? 1 : -1);
        if (v > DEADZONE) engaged = true;
      }
    }
    if (!engaged) delete next.stale[key];
  }

  // Election: the pad whose activity arrived most recently is active;
  // same-frame ties go to the lowest index, deterministically.
  let electee: number | null = null;
  for (const idxStr of Object.keys(present).sort((a, b) => Number(a) - Number(b))) {
    const idx = Number(idxStr);
    if (activityOf(prev.pads[idx], present[idx])) {
      electee = idx;
      break;
    }
  }
  let handoff = false;
  if (electee !== null && electee !== next.activePadIndex) {
    handoff = next.activePadIndex !== null;
    next.activePadIndex = electee;
  }

  // Active pad disconnect: no other pad is promoted without activity.
  let padGone = false;
  if (next.activePadIndex !== null && present[next.activePadIndex] === undefined) {
    next.activePadIndex = null;
    next.moveEngaged = { pos: false, neg: false };
    next.vertEngaged = { pos: false, neg: false };
    padGone = true;
  }

  const activeIdx = next.activePadIndex;
  if (activeIdx === null) {
    const f = EMPTY_FRAME(null, null);
    f.padGone = padGone;
    return { frame: f, next };
  }
  const cur = present[activeIdx];
  const was = handoff ? undefined : prev.pads[activeIdx];

  const frame = EMPTY_FRAME(activeIdx, cur.id);
  frame.padGone = padGone;
  frame.activity = activityOf(prev.pads[activeIdx], cur);

  // A handoff replaces the pad source's levels wholesale: pad B's holds
  // are adopted as LEVELS (no press edges except the electing one), and
  // the stale suppression deliberately does not apply - a handoff is
  // live input from hands currently on the device.
  if (handoff) {
    next.moveEngaged = { pos: false, neg: false };
    // The electing edge itself: find it against pad B's own previous raw.
    const prevRaw = prev.pads[activeIdx];
    if (prevRaw !== undefined) {
      cur.buttons.forEach((down, i) => {
        if (down && !prevRaw.buttons[i]) frame.pressed.push({ kind: "button", index: i });
      });
    }
    // Adopt levels below via the shared hold computation; clear stale for
    // this pad so the adoption is unsuppressed.
    for (const k of Object.keys(next.stale)) delete next.stale[k];
  }

  // Edges on the active pad.
  if (!handoff && was !== undefined) {
    cur.buttons.forEach((down, i) => {
      const key = `b${i}`;
      if (down && !was.buttons[i]) {
        if (gateNewHolds && isHoldControl({ kind: "button", index: i })) {
          next.stale[key] = true; // engaged under the gate: no hold until released
        }
        frame.pressed.push({ kind: "button", index: i });
      } else if (!down && was.buttons[i]) {
        frame.released.push({ kind: "button", index: i });
        delete next.stale[key];
      } else if (!down) {
        delete next.stale[key];
      }
    });
    cur.axes.forEach((v, i) => {
      for (const sign of [1, -1] as const) {
        const key = `a${i}${sign > 0 ? "+" : "-"}`;
        const now = v * sign;
        const before = (was.axes[i] ?? 0) * sign;
        if (now > MOVE_ON && before <= MOVE_ON) {
          if (gateNewHolds && isHoldControl({ kind: "axis", index: i, sign })) {
            next.stale[key] = true;
          }
          frame.pressed.push({ kind: "axis", index: i, sign });
        } else if (now < MOVE_OFF && before >= MOVE_OFF) {
          frame.released.push({ kind: "axis", index: i, sign });
        }
        if (now <= DEADZONE) delete next.stale[key]; // observed released: stale clears
      }
    });
  }

  // Held levels, hysteresis on the movement axis, stale contributing
  // nothing. Buttons: d-pad 14/15 and the guard bumper 5.
  const live = (c: PadControl): boolean => next.stale[keyOf(c)] !== true;
  const btnHeld = (i: number): boolean => cur.buttons[i] === true && live({ kind: "button", index: i });
  for (const sign of [1, -1] as const) {
    const v = (cur.axes[0] ?? 0) * sign;
    const k = sign > 0 ? "pos" : "neg";
    const engaged = next.moveEngaged[k];
    next.moveEngaged[k] = engaged ? v >= MOVE_OFF : v >= MOVE_ON;
    if (next.stale[`a0${sign > 0 ? "+" : "-"}`] === true) next.moveEngaged[k] = false;
  }
  frame.held.advance = next.moveEngaged.pos || btnHeld(15);
  frame.held.retreat = next.moveEngaged.neg || btnHeld(14);
  frame.held.guard = btnHeld(5);
  for (const sign of [1, -1] as const) {
    const v = (cur.axes[1] ?? 0) * sign;
    const k = sign > 0 ? "pos" : "neg";
    const engaged = next.vertEngaged[k];
    next.vertEngaged[k] = engaged ? v >= MOVE_OFF : v >= MOVE_ON;
    if (next.stale[`a1${sign > 0 ? "+" : "-"}`] === true) next.vertEngaged[k] = false;
  }
  frame.held.up = next.vertEngaged.neg || btnHeld(12);
  frame.held.down = next.vertEngaged.pos || btnHeld(13);
  frame.moveMag = next.moveEngaged.pos || next.moveEngaged.neg ? Math.min(1, Math.abs(cur.axes[0] ?? 0)) : 0;

  return { frame, next };
}

/** The controls whose LEVEL matters (movement and guard): the ownership
 *  gate stales exactly these when they engage under it. */
function isHoldControl(c: PadControl): boolean {
  if (c.kind === "axis") return c.index === 0 || c.index === 1;
  return c.index === 5 || c.index === 12 || c.index === 13 || c.index === 14 || c.index === 15;
}

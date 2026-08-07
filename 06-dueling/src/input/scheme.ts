/**
 * gamepad-support: one action table both control schemes resolve through.
 * Every control the game has is an ActionId; UI strings reference actions
 * (via {action} tokens resolved at render time), never a key or button
 * name, so whichever device the player touched last decides what every
 * piece of on-screen text says. The engine never hears of any of this:
 * both devices produce the same Intents.
 */

/** Every control the game has, as a semantic verb. The typed Records
 *  below make a scheme missing a label a build error - the same
 *  enforcement trick as HELP in src/ui/help.ts. */
export type ActionId =
  // duel verbs (become Intents)
  | "advance" | "retreat" | "void" | "cut" | "thrust" | "guard"
  | "feint" | "stanceUp" | "stanceDown" | "sideShift"
  | "disarm" // the disarming spec's advantage conversion (keyboard I)
  // session verbs
  | "pause" | "rematch" | "reselect" | "help"
  // select-screen verbs (the direct picks are keyboard-only, like debug)
  | "selLeft" | "selRight" | "selToggle" | "selConfirm"
  | "selPickFirst" | "selPickSecond" | "selPickThird" | "selBack"
  // keyboard-only debug verbs (labels exist for the legend; no pad binding)
  | "aiMode" | "overlay" | "stepTick" | "speed" | "mute"
  // movement-scene verbs (the parkour test bed and the arena's sheathed mode)
  | "moveLeft" | "moveRight" | "jump" | "dash" | "crouch" | "grab"
  | "climbUp" | "climbDown" | "walkMod" | "resetScene"
  // the arena's mode toggle: draw when sheathed, sheathe when armed
  | "drawSheathe";

export type Scheme = "keyboard" | "pad";

/** Pad label flavour, from Gamepad.id. Affects label text only. */
export type PadKind = "xbox" | "ps";

/** One label per action per scheme. A missing entry is a build error. */
export type Labels = Record<ActionId, string>;

export const KEYBOARD_LABELS: Labels = {
  advance: "D", retreat: "A", void: "S", cut: "J", thrust: "K",
  guard: "L", feint: "F", stanceUp: "Up", stanceDown: "Dn",
  sideShift: "Lt/Rt/Caps", disarm: "I",
  pause: "space", rematch: "R", reselect: "Esc", help: "?",
  selLeft: "A/Left", selRight: "D/Right", selToggle: "W/S",
  selConfirm: "Enter", selPickFirst: "1", selPickSecond: "2", selPickThird: "3", selBack: "Esc",
  aiMode: "0-4", overlay: "`", stepTick: ".", speed: "[/]", mute: "M",
  moveLeft: "A", moveRight: "D", jump: "K", dash: "J", crouch: "S",
  grab: "L", climbUp: "W", climbDown: "S", walkMod: "Shift",
  resetScene: "R", drawSheathe: "E",
};

/** For actions with no pad binding (the debug verbs, the select direct
 *  picks) the pad tables carry the keyboard string: the Record stays
 *  total without inventing bindings, and the legend marks those groups
 *  as keyboard (src/ui/help.ts). */
export const PAD_LABELS: Record<PadKind, Labels> = {
  xbox: {
    advance: "Stick/Dpad", retreat: "Stick/Dpad", void: "Y", cut: "X",
    thrust: "A", guard: "RB", feint: "B", stanceUp: "D-up",
    stanceDown: "D-dn", sideShift: "LB", disarm: "RT",
    pause: "Start", rematch: "Start", reselect: "Back", help: "Back",
    selLeft: "Dpad/Stick", selRight: "Dpad/Stick", selToggle: "Dpad/Stick",
    selConfirm: "A / Start", selPickFirst: "1", selPickSecond: "2", selPickThird: "3", selBack: "Back",
    aiMode: "0-4", overlay: "`", stepTick: ".", speed: "[/]", mute: "M",
    moveLeft: "Stick/Dpad", moveRight: "Stick/Dpad", jump: "A", dash: "X",
    crouch: "Stick dn", grab: "RB", climbUp: "Stick up", climbDown: "Stick dn",
    walkMod: "Stick soft", resetScene: "Y", drawSheathe: "LT",
  },
  // PS face buttons render as their glyphs to keep the legend narrow.
  ps: {
    advance: "Stick/Dpad", retreat: "Stick/Dpad", void: "\u25b3", cut: "\u25a1",
    thrust: "\u2715", guard: "R1", feint: "\u25cb", stanceUp: "D-up",
    stanceDown: "D-dn", sideShift: "L1", disarm: "R2",
    pause: "Options", rematch: "Options", reselect: "Share", help: "Share",
    selLeft: "Dpad/Stick", selRight: "Dpad/Stick", selToggle: "Dpad/Stick",
    selConfirm: "\u2715 / Options", selPickFirst: "1", selPickSecond: "2", selPickThird: "3", selBack: "Share",
    aiMode: "0-4", overlay: "`", stepTick: ".", speed: "[/]", mute: "M",
    moveLeft: "Stick/Dpad", moveRight: "Stick/Dpad", jump: "\u2715", dash: "\u25a1",
    crouch: "Stick dn", grab: "R1", climbUp: "Stick up", climbDown: "Stick dn",
    walkMod: "Stick soft", resetScene: "\u25b3", drawSheathe: "L2",
  },
};

/** Where a pad action physically lives: a standard-mapping button index,
 *  or an axis with a signed direction. */
export type PadControl =
  | { kind: "button"; index: number }
  | { kind: "axis"; index: number; sign: 1 | -1 };

/** Only the actions a pad can produce. Partial on purpose: debug verbs
 *  and the select direct picks have no entry - keyboard-only by design.
 *  Standard-mapping indices (W3C layout). The right trigger binds the
 *  disarm as a digital press (GamepadButton.pressed, like every button
 *  here): the squeeze reads as the grab that takes the sword, and like
 *  the I key it is inert outside the advantage window. The thrust rides
 *  the BOTTOM face button and the void the top (playtest override of
 *  the first draft's pairing): the kill and the bind's yield live on
 *  the easiest reach, and button 0 still confirms on the select screen
 *  - the resolver keeps one meaning per context. */
export const PAD_BINDINGS: Partial<Record<ActionId, PadControl[]>> = {
  advance: [{ kind: "axis", index: 0, sign: 1 }, { kind: "button", index: 15 }],
  retreat: [{ kind: "axis", index: 0, sign: -1 }, { kind: "button", index: 14 }],
  void: [{ kind: "button", index: 3 }],
  feint: [{ kind: "button", index: 1 }],
  cut: [{ kind: "button", index: 2 }],
  thrust: [{ kind: "button", index: 0 }],
  sideShift: [{ kind: "button", index: 4 }],
  guard: [{ kind: "button", index: 5 }],
  disarm: [{ kind: "button", index: 7 }],
  stanceUp: [{ kind: "button", index: 12 }],
  stanceDown: [{ kind: "button", index: 13 }],
  pause: [{ kind: "button", index: 9 }],
  rematch: [{ kind: "button", index: 9 }],
  help: [{ kind: "button", index: 8 }],
  reselect: [{ kind: "button", index: 8 }],
  selLeft: [{ kind: "button", index: 14 }, { kind: "axis", index: 0, sign: -1 }],
  selRight: [{ kind: "button", index: 15 }, { kind: "axis", index: 0, sign: 1 }],
  selToggle: [
    { kind: "button", index: 12 }, { kind: "button", index: 13 },
    { kind: "axis", index: 1, sign: -1 }, { kind: "axis", index: 1, sign: 1 },
  ],
  selConfirm: [{ kind: "button", index: 0 }, { kind: "button", index: 9 }],
  // moveLeft/moveRight/crouch/grab/climbUp/climbDown/walkMod have no entry
  // here on purpose: they ride the held-level path in src/input/gamepad.ts
  // (the advance/retreat/up/down/guard levels and the analog moveMag), not
  // this table's edge resolver, so they need no PadControl binding.
  jump: [{ kind: "button", index: 0 }],
  dash: [{ kind: "button", index: 2 }],
  resetScene: [{ kind: "button", index: 3 }],
  // The left trigger: unused by every other verb, so the mode toggle
  // cannot collide with either mode's own table.
  drawSheathe: [{ kind: "button", index: 6 }],
};

/** `/playstation|dualshock|dualsense|054c/i` gives "ps"; everything else
 *  "xbox", because Xbox names match the W3C standard-mapping vocabulary. */
export function padKindOf(id: string): PadKind {
  return /playstation|dualshock|dualsense|054c/i.test(id) ? "ps" : "xbox";
}

// ---------------------------------------------------------------------------
// The active-scheme store: module state, session-local, nothing persists.

let scheme: Scheme = "keyboard";
let padKind: PadKind = "xbox";
const listeners: Array<() => void> = [];

function fire(): void {
  for (const cb of listeners) cb();
}

export function activeScheme(): Scheme {
  return scheme;
}

export function activeLabels(): Labels {
  return scheme === "keyboard" ? KEYBOARD_LABELS : PAD_LABELS[padKind];
}

/** A fresh keydown (!e.repeat - the gate travels with the call, since not
 *  every listener filters repeats itself). */
export function noteKeyboardInput(): void {
  if (scheme !== "keyboard") {
    scheme = "keyboard";
    fire();
  }
}

/** Pad ACTIVITY (edge-shaped, per src/input/gamepad.ts - never a held
 *  level). Re-derives PadKind: an Xbox-to-PS handoff changes every label
 *  while the scheme stays "pad", so the change callback fires either way. */
export function noteGamepadInput(id: string): void {
  const kind = padKindOf(id);
  if (scheme !== "pad" || kind !== padKind) {
    scheme = "pad";
    padKind = kind;
    fire();
  }
}

/** The active pad disconnected: labels revert to keyboard at once. */
export function notePadGone(): void {
  if (scheme === "pad") {
    scheme = "keyboard";
    fire();
  }
}

/** Fires when anything label-affecting changes: the scheme OR the active
 *  pad's kind. Consumers re-render on the callback and never compare
 *  schemes themselves. */
export function onControlsChange(cb: () => void): void {
  listeners.push(cb);
}

/** Test hook: the store is module state and tests need a known start.
 *  Listeners survive - they are module-lifetime registrations (the
 *  legend cache, the select hint), not per-scheme state. */
export function resetSchemeForTest(): void {
  scheme = "keyboard";
  padKind = "xbox";
}

// ---------------------------------------------------------------------------

/** Substitute {action} tokens with the given scheme's labels. */
export function resolveLabels(text: string, labels: Labels): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) =>
    name in labels ? labels[name as ActionId] : whole,
  );
}

/** The UI-state snapshot the contextual resolver reads. */
export interface UiSnapshot {
  helpOpen: boolean;
  selectOpen: boolean;
  /** The active scene's simulation is live (running, not over). */
  simLive: boolean;
  paused: boolean;
  decided: boolean;
  /** Which scene owns the duel/move verb tables. */
  scene: "duel" | "move" | "arena";
  /** Arena only: the weapon is out, so the duel verbs own the pad.
   *  False everywhere else. */
  armed: boolean;
}

const controlEq = (a: PadControl, b: PadControl): boolean =>
  a.kind === "button"
    ? b.kind === "button" && a.index === b.index
    : b.kind === "axis" && a.index === b.index && a.sign === b.sign;

function boundAction(edge: PadControl, actions: ActionId[]): ActionId | null {
  for (const a of actions) {
    const controls = PAD_BINDINGS[a];
    if (controls?.some((c) => controlEq(c, edge))) return a;
  }
  return null;
}

const DUEL_VERBS: ActionId[] = [
  "advance", "retreat", "void", "cut", "thrust", "guard",
  "feint", "stanceUp", "stanceDown", "sideShift", "disarm",
];
const SELECT_VERBS: ActionId[] = ["selLeft", "selRight", "selToggle", "selConfirm"];
const MOVE_VERBS: ActionId[] = ["jump", "dash", "resetScene"];
const ARENA_SHEATHED_VERBS: ActionId[] = [...MOVE_VERBS, "drawSheathe"];
const ARENA_ARMED_VERBS: ActionId[] = [...DUEL_VERBS, "drawSheathe"];

/**
 * One physical edge resolves to at most ONE action, because the
 * contextual meaning is decided here, in a single pure function over a
 * UI-state snapshot - never in scattered guards. Start, Back and B are
 * the contextual buttons; everything else is its table binding for the
 * surface that owns the moment (help owns everything while open).
 */
export function resolvePadEdge(ui: UiSnapshot, edge: PadControl): ActionId | null {
  const isBtn = (i: number): boolean => edge.kind === "button" && edge.index === i;
  if (isBtn(9)) {
    if (ui.helpOpen) return "help";
    if (ui.selectOpen) return "selConfirm";
    if (ui.decided) return "rematch"; // decided outranks paused
    if (ui.simLive) return "pause"; // a toggle: paused-live resumes
    return null;
  }
  if (isBtn(8)) {
    if (ui.helpOpen) return "help";
    if (ui.selectOpen) return "selBack";
    if (ui.paused || ui.decided) return "reselect";
    if (ui.simLive) return "help";
    return null;
  }
  if (isBtn(1)) {
    if (ui.helpOpen) return "help";
    if (ui.selectOpen) return null;
    const fencing = ui.scene === "duel" || (ui.scene === "arena" && ui.armed);
    if (fencing && (ui.simLive || ui.decided)) return "feint";
    return null;
  }
  if (ui.helpOpen) return null;
  if (ui.selectOpen) return boundAction(edge, SELECT_VERBS);
  if (ui.simLive || ui.decided) {
    const verbs =
      ui.scene === "move" ? MOVE_VERBS
      : ui.scene === "arena" ? (ui.armed ? ARENA_ARMED_VERBS : ARENA_SHEATHED_VERBS)
      : DUEL_VERBS;
    return boundAction(edge, verbs);
  }
  return null;
}

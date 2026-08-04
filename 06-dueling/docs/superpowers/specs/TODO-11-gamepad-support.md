# gamepad support: the pad as a second first-class device

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

The duel is keyboard-only, and every piece of on-screen instruction says so
in hardcoded letters: the legend under the bar, the "?" panel's prose, the
bind prompts, the kill banner, the select screen hint. This spec adds a
gamepad as a second first-class input device. Whichever device the player
touched last is the **active scheme**, and every control reference on screen
follows it within a frame: a keyboard player reads "K thrusts, NOW", a pad
player reads "Y thrusts, NOW". Pads connect and disconnect live; a
disconnect mid-fight is treated as the player's hands leaving the controls.

No remapping. One fixed binding table per device, chosen here and retuned by
playtest like everything else.

**Delivers:** pad play for the whole loop (select screen, duel, bind, death,
rematch), a single action table both schemes resolve through, and a sweep
that removes every literal key name from UI strings.

**Depends on:** `help-overlay` (the panel and legend this spec parameterizes).
Touches presentation and input only - `src/combat/` does not change.

---

## 1. Doctrine: the pad is only input

The engine consumes `Intent`s and has never heard of a keyboard; it will not
hear of a gamepad either. The pad layer translates button edges and stick
positions into the same `state.pending` writes and held levels the keydown
and keyup handlers in `src/main.ts` produce today (held state splits per
source - section 7.1), on the same frame loop, before the tick accumulator
drains. Nothing downstream of the intent can
tell which device produced it, so the golden replay, every combat test and
every audio cue rule in CLAUDE.md are untouched by construction.

Both devices stay live at all times. The active scheme decides what the
**labels** say, never whose input counts: a player may hold advance on the
stick and tap L on the keyboard, and both land. When both devices write
the single `pending` slot in the same rendered frame, the pad wins by
fixed ordering - keyboard events dispatch between frames, the pad poll
runs inside the frame callback after them - which is deterministic
scheduling, not real-time "last writer" semantics, and is stated as such.
Held actions are owned per source and consumed as one combined level, so
one device releasing can never lower what the other still holds
(section 7.1).

## 2. Data models

All in a new `src/input/scheme.ts` (types, tables, the active-scheme store)
and `src/input/gamepad.ts` (polling and edges). `src/ui/` and
`src/render/` import labels from scheme.ts; nothing imports gamepad.ts
except `src/main.ts`.

```ts
/** Every control the game has, as a semantic verb. UI strings reference
 *  these - never a key or button name - so a scheme is a total function
 *  from action to label, and the compiler enforces totality. */
export type ActionId =
  // duel verbs (become Intents)
  | "advance" | "retreat" | "void" | "cut" | "thrust" | "guard"
  | "feint" | "stanceUp" | "stanceDown" | "sideShift"
  // session verbs
  | "pause" | "rematch" | "reselect" | "help"
  // select-screen verbs (the direct picks are keyboard-only, like debug)
  | "selLeft" | "selRight" | "selToggle" | "selConfirm"
  | "selPickFirst" | "selPickSecond"
  // keyboard-only debug verbs (labels exist for the legend; no pad binding)
  | "aiMode" | "overlay" | "stepTick" | "speed" | "mute";

export type Scheme = "keyboard" | "pad";

/** Pad label flavour, from Gamepad.id. Affects label text only. */
export type PadKind = "xbox" | "ps";

/** One label per action per scheme. A missing entry is a build error -
 *  the same enforcement trick as HELP in src/ui/help.ts. */
export type Labels = Record<ActionId, string>;
export const KEYBOARD_LABELS: Labels;             // "A/D", "K", "L hold", ...
export const PAD_LABELS: Record<PadKind, Labels>; // "X"/"Square", "RB"/"R1", ...
// For actions with no pad binding (the debug verbs, the select direct
// picks) the pad tables carry the keyboard string: the Record stays total
// without inventing bindings, and the legend marks those groups as
// keyboard (section 6).

/** Where a pad action physically lives: a standard-mapping button index,
 *  or an axis with a signed direction. */
export type PadControl =
  | { kind: "button"; index: number }
  | { kind: "axis"; index: number; sign: 1 | -1 };

/** Only the actions a pad can produce. Partial on purpose: debug verbs
 *  have no entry, and the table below in section 5 is the whole contents. */
export const PAD_BINDINGS: Partial<Record<ActionId, PadControl[]>>;
```

The active-scheme store is module state in scheme.ts:

```ts
export function activeScheme(): Scheme;            // starts "keyboard"
export function activeLabels(): Labels;            // resolves PadKind too
export function noteKeyboardInput(): void;         // fresh keydown, !e.repeat
export function noteGamepadInput(pad: Gamepad): void; // pad ACTIVITY (section 3)
export function notePadGone(): void;               // active pad disconnected
/** Fires when anything label-affecting changes: the scheme, OR the active
 *  pad's PadKind - an Xbox-to-PS handoff changes every label while the
 *  scheme stays "pad". Consumers re-render on the callback and never
 *  compare schemes themselves. */
export function onControlsChange(cb: () => void): void;
```

`PadKind` derivation: `/playstation|dualshock|dualsense|054c/i.test(id)`
gives `"ps"`, everything else `"xbox"`. Xbox names are the default because
they match the W3C standard-mapping's own vocabulary.

## 3. The scheme state machine

Two states, `keyboard` (initial) and `pad`. Transitions:

| From     | Trigger                            | To       |
|----------|------------------------------------|----------|
| any      | a fresh `keydown` (`!e.repeat`)    | keyboard |
| any      | pad ACTIVITY (defined below)       | pad      |
| pad      | the active pad disconnects         | keyboard |

Keyboard freshness is the mirror of the pad's activity rule: OS auto-repeat
is a held level wearing an event costume, and a key held down must not
steal the scheme back every repeat interval while the player is using the
pad. Every listener that calls `noteKeyboardInput()` gates on `!e.repeat` -
the duel handler already filters repeats for its own reasons, but the
select screen's listener does not, so the gate lives with the call, not
with the handler.

**Pad ACTIVITY is edge-shaped, never level-shaped.** It is exactly one of:

- a button press edge (up last frame, down this frame);
- an axis crossing out of the deadzone (|v| <= DEADZONE last frame,
  |v| > DEADZONE this frame);
- an axis already outside the deadzone moving by at least ACTIVITY_DELTA
  since last frame - a re-grip is input, a rest is not.

A stick merely *held* past the deadzone is not activity. Without this rule
a resting stick would reclaim the scheme every frame and a keyboard press
could never take the labels back:

```text
stick held -> keydown -> keyboard scheme -> next frame the same held
stick flips it straight back to pad          (forbidden)
```

Rules that make this feel right, all standard practice:

- **Connection alone never switches.** A pad plugged in (or waking a
  wireless one) changes nothing until it shows activity. Idle pads must
  not hijack the labels.
- **Any activity switches, immediately.** The switch is observable on the
  next rendered frame. There is no debounce and no minimum dwell; flapping
  is the player's own doing and harmless.
- **Multiple pads:** the pad whose activity arrived most recently is the
  *active pad*; only the active pad is translated into game input. When
  two pads show activity on the same frame, the lowest index wins,
  deterministically. Activity on another pad hands control over from that
  frame on - the handoff contract is in section 4.
- **Active pad disconnects:** labels revert to keyboard at once (no other
  pad is promoted without activity, per the first rule), the pad source's
  held levels are cleared - the effective-level rule in section 7.1 turns
  any resulting fall into `parryRelease` and buffered-step drops, exactly
  like the existing `blur` handler's releases - and if a duel is live and
  undecided, `state.paused` is set: the hands just left the controls. The
  pause is silent, as pause already is; the paused banner is the
  notification.

The scheme is session-local. Nothing persists.

## 4. Polling, edges and quirks - `src/input/gamepad.ts`

The Gamepad API has no button events; state is snapshots from
`navigator.getGamepads()`. Poll once per rAF frame in `src/main.ts`, before
the accumulator drains, so pad intents enter ticks with the same latency as
key events.

```ts
export interface PadFrame {
  /** The elected active pad, or null while no pad has ever shown
   *  activity. Election happens BEFORE edge extraction: everything
   *  below is the active pad's alone, other pads' input is dropped. */
  activePadIndex: number | null;
  /** Physical controls that went down this frame on the active pad:
   *  button indices and axis-direction engagements, NOT actions. One
   *  physical edge can correspond to several PAD_BINDINGS entries -
   *  Start is pause, rematch AND selConfirm - and translating an edge
   *  into its one action takes UI state the poller must not know. The
   *  contextual resolver in section 7.2 does it, downstream. */
  pressed: PadControl[];
  /** Physical controls that came up this frame on the active pad. */
  released: PadControl[];
  /** Post-combine level per held action: every control bound to the
   *  action (stick AND d-pad for a direction) ORed together first, so
   *  releasing one control while another still holds is not a release. */
  held: { advance: boolean; retreat: boolean; guard: boolean };
  /** True when the active pad showed ACTIVITY as section 3 defines it
   *  (edges and meaningful axis motion, never held levels). Drives the
   *  scheme store. */
  activity: boolean;
}

/** Pure: previous snapshot + current pads -> election, then edges. All
 *  testable without a browser. `pads` is what getGamepads() returned,
 *  nulls included. `gateNewHolds` is true whenever a UI layer owns
 *  combat input (help open, select screen showing) - see the ownership
 *  gating rule below. */
export function readPads(
  prev: PadSnapshot, pads: (Gamepad | null)[], gateNewHolds: boolean,
): { frame: PadFrame; next: PadSnapshot };
```

**The handoff contract.** When activity elects pad B while pad A was
active (ties on the same frame go to the lowest index):

- Pad A's held contributions vanish this frame: `frame.held` is computed
  from pad B alone, and the effective-level rule in section 7 turns any
  resulting fall into the proper releases (`parryRelease`, buffered-step
  drop). No bespoke release path exists - replacement of the pad source's
  levels IS the release.
- Pad B's current held levels are adopted as levels, not edges: a stick
  B already held sideways becomes `held.advance` without emitting a
  press edge. The stale-control suppression of the focus rule does NOT
  apply here, deliberately: a handoff is live input from hands currently
  on the device - the player holding B's controls while electing it
  means those holds now - whereas refocus resumes after an interruption
  that already ended the game-side holds.
- The electing edge itself lands in `frame.pressed` exactly once, on the
  election frame.
- `PadKind` is re-derived from pad B's id. If it differs (Xbox handed to
  PS), `onControlsChange` fires even though the scheme is still "pad" -
  every label on screen just changed vocabulary.

Constants, in gamepad.ts beside their use:

- `DEADZONE = 0.25` - radial, for *activity detection* (scheme switching,
  active-pad election). Below it a stick is noise, never input.
- `ACTIVITY_DELTA = 0.10` - the per-frame axis change that counts as
  activity for a stick already outside the deadzone (section 3). Held
  still, an engaged stick generates no activity.
- `MOVE_ON = 0.5`, `MOVE_OFF = 0.35` - hysteresis for the movement axis
  becoming a held direction. On at 0.5, off at 0.35, so a stick resting
  near threshold cannot machine-gun step intents.
- Buttons use `GamepadButton.pressed` (the browser's own digital view),
  never raw `value`. No triggers are bound, so no analog threshold exists.

Browser quirks the module must absorb:

- **Chrome gates pads behind a gesture:** `getGamepads()` returns nulls and
  `gamepadconnected` stays silent until the first button press. Therefore
  discovery is *poll-driven* - a non-null entry appearing in the array IS
  the connection; the `gamepadconnected` / `gamepaddisconnected` events are
  listened to only as accelerants and for the disconnect path.
- **Nulls and holes:** the array is fixed-length with nulls; iterate
  defensively.
- **Focus:** browsers freeze pad state for blurred pages. On `blur` the
  previous snapshot is *discarded*, not zeroed - after blur, and equally
  on the very first poll ever, the next valid poll only SEEDS the
  snapshot and returns an empty frame: no edges, no activity, `held` all
  false. A reset to neutral would do the opposite of its purpose: a
  button held across the blur would diff against "unpressed" and read as
  a fresh press on the first focused poll.
- **Stale controls:** every control found already engaged on the seed
  poll is marked STALE and contributes no level and no edge until it is
  observed physically released - a button until `pressed` goes false, a
  movement axis until it returns inside MOVE_OFF, an activity axis until
  it returns inside DEADZONE. Only a later fresh press or movement acts.
  This is not caution for its own sake: blur lowered the guard through
  the effective fall, and `held-guard` rules that a guard, once ended,
  re-forms only through release and a fresh press ("a consumed guard
  does not re-form from the held key"). A still-held RB re-raising the
  guard on refocus would break that rule and diverge from the keyboard,
  where a key held across blur can send no new keydown. Suppression
  makes the two devices identical across a focus loss: release, then
  press, on both.
- **Ownership gating, two strengths.** Help and the select screen own
  combat input differently, because they differ in what may survive
  them:
  - **Help opens: preserve existing holds, block new ones.** While
    `gateNewHolds` is true, a held-action control - the movement axis,
    a d-pad direction, the guard bumper - that becomes engaged is
    marked stale exactly as at a seed poll: no hold contribution until
    observed released. Controls engaged from before keep reporting
    their level, so releases still fall through. This mirrors the
    keyboard: keyups clear holds under help (the keyup handler has no
    `helpOpen` guard), new keydowns are ignored there, and a hold from
    before help opened resumes when it closes - help is a pause in the
    fight, and the fight continues where it froze.
  - **The select screen opens: clear everything, stale the engaged.**
    Entering selection - by any route: keyboard Esc, paused Back,
    decided Back - ends a fight rather than pausing one, so no hold may
    survive into the next duel. On entry the pad snapshot is discarded
    exactly as on blur (the next poll seeds; every control still
    engaged is stale until released) and BOTH held sources are cleared,
    keyboard included. `gateNewHolds` then stays true for the screen's
    lifetime. Clearing the keyboard source too is deliberate: it fixes
    an existing wart where a D held across the select screen enters the
    new duel already advancing, and it keeps the two devices on one
    rule - release, then press, to carry anything into a new fight.
  Staleness touches only the HOLD contribution: the physical edge still
  reports in `frame.pressed`, because on the select screen the same
  stick that must not carry an advance hold into the duel IS the
  navigation control, and the resolver decides what the edge means.
- **happy-dom / tests:** `navigator.getGamepads` may not exist. The browser
  shell guards for it; the pure `readPads` core never touches `navigator`.

## 5. The binding table - the whole of it

Standard-mapping indices (W3C layout). This table is `PAD_BINDINGS`,
complete; anything absent from it is keyboard-only by design.

| Action     | Control                        | Index      | Xbox label | PS label   |
|------------|--------------------------------|------------|------------|------------|
| advance    | left stick right, d-pad right  | axis 0 +, btn 15 | Stick/Dpad | Stick/Dpad |
| retreat    | left stick left, d-pad left    | axis 0 -, btn 14 | Stick/Dpad | Stick/Dpad |
| void       | south face button              | 0          | A          | Cross      |
| feint      | east face button               | 1          | B          | Circle     |
| cut        | west face button               | 2          | X          | Square     |
| thrust     | north face button              | 3          | Y          | Triangle   |
| sideShift  | left bumper                    | 4          | LB         | L1         |
| guard      | right bumper, hold             | 5          | RB hold    | R1 hold    |
| stanceUp   | d-pad up                       | 12         | Dpad up    | Dpad up    |
| stanceDown | d-pad down                     | 13         | Dpad dn    | Dpad dn    |
| pause      | start (live duel; resumes when paused) | 9  | Start      | Options    |
| rematch    | start (decided duel only)      | 9          | Start      | Options    |
| help       | back (live unpaused duel; closes too) | 8   | Back       | Share      |
| reselect   | back (paused or decided duel)  | 8          | Back       | Share      |
| selLeft    | d-pad/stick left (select scr.) | 14, axis 0 - | Dpad/Stick | Dpad/Stick |
| selRight   | d-pad/stick right (select scr.)| 15, axis 0 + | Dpad/Stick | Dpad/Stick |
| selToggle  | d-pad/stick up or down         | 12, 13, axis 1 -, axis 1 + | Dpad/Stick | Dpad/Stick |
| selConfirm | south face or start            | 0, 9       | A / Start  | Cross / Options |

Rationale, brief:

- **Cut and thrust on the two upper face buttons** keeps the bind's two
  verbs (`pressure-and-winding`: J presses, K yields) on the same physical
  pair - the pad player's bind reads "X presses, Y yields when your band
  lights" with zero new engine plumbing, because J and K already resolve to
  the plain `cut` and `thrust` intents.
- **Guard on a held bumper** because the guard is the one held control
  (`held-guard`), and a bumper is the button a finger rests on.
- **Start and Back are contextual on duel state** (live-unpaused, paused,
  decided) - three branches in main.ts, not a mode system: live and
  unpaused, Start pauses and Back opens help; paused, Start resumes and
  Back returns to the select screen - the pad's way OUT of a live duel,
  and it costs no new button: pause, then Back; decided, Start rematches
  and Back returns to the select screen. When a decided duel is also
  paused (keyboard space works anytime), decided wins: Start means
  rematch. While help is open, Back, Start or B closes it (help owns the
  pad while open, exactly as it owns the keyboard), and an edge consumed
  by help never doubles as a combat or session action - structural, via
  the section 7.2 resolver: with help open those edges resolve to `help`
  and everything else resolves to null.
- **Accepted gaps, stated so nobody hunts for bugs:** a pad cannot open
  help while paused or on a *decided* duel (Back means reselect in both;
  from paused, resume first - help itself freezes the sim, so nothing is
  lost), and the debug set - AI mode 0-4, overlay backtick, single-step
  dot, speed brackets, mute M - stays keyboard-only. Debug tools live
  where the developer sits. The select screen's direct picks
  (`selPickFirst`/`selPickSecond`, keys 1 and 2) are also keyboard-only:
  with two swords, toggle already reaches everything in one press.
- Left-shift stance-toggle sugar gets no pad equivalent; d-pad up/down is
  already direct.

Movement release mirrors the keyup rule in main.ts, applied to the
*effective* level of section 7: only when every control feeding a direction
has let go - stick, d-pad and the keyboard key together - is a step still
buffered for that direction dropped (`fighter.buffered = null`), so a flick
is one step, not two. One control releasing while another still holds the
direction drops nothing and keeps chaining steps.

## 6. The sweep: every literal key name, and where it goes

The principle: **UI strings never spell a key or button.** They reference
actions, and the active scheme's `Labels` resolves them at render time.
Prose templates write `{action}` tokens; `resolveLabels(text, labels)`
substitutes them. The complete inventory of today's offenders:

| Site | Today | Becomes |
|------|-------|---------|
| `src/ui/help.ts` `KEY_GROUPS` | hardcoded key/action pairs | built from `activeLabels()`: `keyGroups(labels)` returning the same three-group shape; group 3 (debug) always renders keyboard labels, with a `kbd:` note in the pad scheme |
| `src/ui/help.ts` `controlsLines()` / `controlsLine()` | read `KEY_GROUPS` | take `labels` as a parameter |
| `src/ui/help.ts` `HELP.parry.what` | "Hold L: ..." | "Hold {guard}: ..." |
| `src/ui/help.ts` `HELP.stance.player` | "Move it with Up/Down ..." | "{stanceUp}/{stanceDown}" |
| `src/ui/help.ts` `HELP.windup.player` | "... or F abandons ..." | "{feint}" |
| `src/ui/help.ts` `HELP.hitstun.player` | "... then R to rematch." | "{rematch}" |
| `src/ui/help.ts` `HELP.dead.player` | "R for a rematch, Esc ..." | "{rematch}", "{reselect}" |
| `src/ui/help.ts` `HELP.bind.player` | "J presses ... K yields ..." | "{cut}", "{thrust}" |
| `src/ui/help.ts` `renderHelpHtml()` h1 | "(Esc closes)" | "({help} closes)" - keyboard says Esc, pad says Back |
| `src/ui/help.ts` `renderHelpHtml()` feint paragraph | "an arrow changes its height, the other attack key ..." | "{stanceUp}/{stanceDown} change its height, the other attack key ..." |
| `src/ui/help.ts` `renderHelpHtml()` guard paragraph | "up/down arrows shift ... left/right or Caps Lock re-aim ..." | "{stanceUp}/{stanceDown} shift ... {sideShift} re-aims ..." |
| `src/render/draw.ts` `CONTROLS_LINES` module const | computed once at import | cached, recomputed via `onControlsChange`; `drawFrame` reads the cache |
| `src/render/draw.ts` `bindPrompt()` | "tap K", "J presses, K yields" | takes `labels`, uses `{cut}`/`{thrust}` resolution |
| `src/render/draw.ts` `openingPromptText()` | "OPENING - K thrusts, NOW" | takes `labels` |
| `src/render/draw.ts` `drawBanner()` | "R to rematch, Esc to reselect" | via `labels` on the `View` |
| `src/main.ts` boot | `helpPanel.innerHTML = renderHelpHtml()` once | render on every `setHelp(true)` and on `onControlsChange` while open |
| `index.html` `.hint` | "A/D switch column - W/S switch sword - 1/2 direct pick - Enter to duel" | emptied; `src/ui/select.ts` `render()` owns the hint text and re-renders on `onControlsChange`: pad reads "Left/Right switch column - Up/Down switch sword - A or Start to duel" (no direct-pick clause; that control is keyboard-only) |

Non-offender, checked and kept: `bindPrompt`'s "SPACE your taps" is the verb
*to space*, not the space bar. It stays, because renaming it would trade a
good instruction for a lint.

`View` (in draw.ts) gains a `labels: Labels` field; `src/main.ts` refreshes
it each frame from `activeLabels()`. That is one field, and it keeps draw.ts
free of scheme-store imports in its pure text helpers - they take what they
are given, which is what makes them testable per scheme.

Select-screen navigation refactor: `src/ui/select.ts` extracts its `onKey`
switch bodies into an exported `handleSelectAction(a: "selLeft" | "selRight"
| "selToggle" | "selConfirm" | "selPickFirst" | "selPickSecond")`; the key
handler and the pad path in main.ts both call it, so the two devices cannot
drift. The direct picks have no pad binding; on the pad they are simply
never dispatched.

## 7. Dispatch and held-state ownership in main.ts

### 7.1 Held actions are owned per source, consumed as one level

Both devices stay live at once, so the single booleans in `state.held`
cannot survive: a pad guard tap-and-release must not lower a keyboard-held
guard. `state.held` splits into two source records and a derived effective
level:

```ts
held: {
  keyboard: { advance: false, retreat: false, guard: false },
  pad:      { advance: false, retreat: false, guard: false },
}
// effective(action) = held.keyboard[action] || held.pad[action]
```

- The keyboard handlers write `held.keyboard` exactly where they write
  `state.held` today; the pad path overwrites `held.pad` wholesale from
  `frame.held` each frame (which has already ORed stick and d-pad, per
  section 4).
- **Every edge-triggered consequence keys off the EFFECTIVE level's
  transitions, never a single source's:** the `parry` intent fires when
  effective guard rises from false, `parryRelease` when it falls to false,
  and a buffered step is dropped when a direction's effective level falls.
  Keyboard holding L through a pad guard tap sees no transition, so
  nothing fires - which is the point.
- The existing `blur` handler clears BOTH sources (the pad snapshot reset
  in section 4 already guarantees no stale pad edges on refocus); the
  fall of the effective level then emits `parryRelease` at most once,
  same as today.

### 7.2 Frame order

Order inside the rAF callback, before the accumulator drains:

1. `readPads(prev, navigator.getGamepads?.() ?? [], gateNewHolds)` ->
   `PadFrame`, with `gateNewHolds` true whenever help is open or the
   select screen is showing (section 4's ownership gating).
2. If `frame.activity`, `noteGamepadInput(pads[frame.activePadIndex])`
   (scheme store; PadKind re-derivation and `onControlsChange` live
   behind it).
3. Overwrite `held.pad` from `frame.held`; derive effective transitions
   and emit their consequences (7.1). Under the gate a frame's holds can
   only persist or fall, never newly rise, so this step cannot start a
   combat hold the keyboard path would have ignored.
4. Resolve each physical edge in `frame.pressed` to its one action, then
   apply that action's effect. `resolvePadEdge(ui, edge) -> ActionId |
   null` is an exported pure function over a UI-state snapshot
   `{helpOpen, selectOpen, duelLive, paused, decided}`; main.ts only
   applies the result. The resolver makes the exactly-once claim
   structural: one physical edge maps to at most ONE action because the
   contextual meaning is decided in a single function, never in
   scattered guards. Its table:
   - button 9 (Start): help open -> `help` (closes); select ->
     `selConfirm`; decided -> `rematch` (decided outranks paused);
     live -> `pause` (a toggle, so paused-live resumes);
   - button 8 (Back): help open -> `help` (closes); select -> null;
     paused or decided -> `reselect`; live unpaused -> `help` (opens);
   - button 1 (B): help open -> `help` (closes); select -> null;
     duel -> `feint`;
   - every other control: help open -> null; select -> its sel* action
     per `PAD_BINDINGS` (button 0 confirms here, voids in a duel);
     duel -> its combat verb per `PAD_BINDINGS`.
5. Keyboard listeners (duel, select, help) additionally call
   `noteKeyboardInput()` on every keydown with `e.repeat === false` -
   the gate travels with the call, since not every listener filters
   repeats for itself.

Two transitions are event-driven rather than per-frame, and both live in
the functions main.ts already owns:

- `openSelect()` applies section 4's select rule at the moment of entry:
  discard the pad snapshot, clear both held sources.
- `startDuel()` keeps `pending = null` (already true today) and inherits
  no holds by construction: both sources were cleared at select entry,
  and anything still physically engaged is stale until released - a
  duel begins stationary with the guard down, whatever the hands are
  doing. (Rematch by Start or R is deliberately different: it restarts
  without passing through selection, and holds carry over on both
  devices alike - a player holding advance at the rematch press means
  it.)

### 7.3 Paused routing is keyboard parity, not a gate

While paused, pad input routes exactly as unpaused - deliberately NOT the
common "ignore combat input while paused" convention, because the keyboard
already works the other way: pause freezes the accumulator, not the
handlers, so a queued intent lands on the first tick after resume, and
pause-queue-step (space, an attack key, then `.`) is a working debugging
pattern today. The pad must not acquire different semantics than the
keyboard for the same verb. Combat verbs therefore queue identically while
paused; the session pair keeps working with one contextual shift from
section 5: Start resumes, and Back - not needed for help while frozen -
returns to the weapon select.

## 8. Audio unlock - a stated limitation

Browsers do not count gamepad input as a user activation, so a pad press can
never resume the AudioContext. The existing keydown unlock stays and a
`pointerdown` unlock is added (one listener beside it), but a purely
pad-driven session plays silent until the player clicks or presses any key
once. No workaround exists; the limitation is documented in a comment at the
unlock site so nobody chases it as a bug.

## 9. Non-functional requirements

- Steady-state polling reuses the snapshot buffers; the only per-frame
  allocation is the returned `PadFrame` - one small object and two
  usually-empty arrays - accepted deliberately rather than hidden behind
  an "allocates nothing" claim the API visibly contradicts. Caller-owned
  out-buffers would tax the pure function and every test for a saving
  below measurement; the render layer already allocates more than this
  per frame in template strings. The 60 Hz frame budget is unchanged.
- With no pad ever connected the whole path is one guarded
  `getGamepads` call per frame and zero behavioural change.
- Scheme switch reflects in rendered text on the next frame.
- Works in happy-dom tests without `navigator.getGamepads` present.

## 10. Testing strategy

Compile-time guards first, in the house style (`HELP`'s Record trick):

- `Labels = Record<ActionId, string>` makes a scheme missing a label a
  build failure, for keyboard and for both pad kinds.

Unit tests, all pure, no browser:

- **Edges:** `readPads` derives press/release edges from snapshot pairs;
  a held button yields one press, no repeats.
- **Seed poll and stale controls:** the first poll ever, and the first
  valid poll after a blur, returns an empty frame (no edges, no activity,
  held all false) and only seeds the snapshot. A button held across the
  blur produces no press edge AND no held level on any later poll until
  it is first observed released; a stick past MOVE_ON at the seed
  contributes no movement until it returns inside MOVE_OFF and engages
  afresh; after the release, a fresh press acts normally. Holding guard
  across a focus loss therefore requires release and re-press to raise
  it again, on pad exactly as on keyboard.
- **Deadzone and hysteresis:** axis at 0.45 engages nothing; 0.5 engages;
  0.4 keeps holding; 0.35 releases and drops a buffered step.
- **Scheme store:** keydown flips to keyboard; pad activity flips to pad;
  connection alone does not; active-pad disconnect flips to keyboard,
  releases holds, pauses a live duel, does not pause a decided one. A
  stick held past the deadzone does NOT reclaim the scheme after a
  keydown; a fresh deadzone crossing or an ACTIVITY_DELTA move does.
  Symmetrically, a keyboard key held down through OS auto-repeat does not
  steal the scheme back while the player uses the pad - only a fresh
  keydown (`e.repeat === false`) does.
- **Held ownership:** a keyboard-held guard survives a pad guard press
  and release with no `parryRelease`; the release fires exactly once when
  the last holder lets go; stick and d-pad on the same direction OR
  together, releasing one keeps the direction held; the buffered-step
  drop keys off the effective fall, not a single control's.
- **Multi-pad:** activity elects the active pad; the other pad's buttons
  do not reach the game; a same-frame tie elects the lowest index; a
  handoff replaces the pad source's held levels (releases derive from the
  effective fall, the electing edge fires once); an Xbox-to-PS handoff
  fires `onControlsChange` with the scheme still "pad", and the labels
  swap vocabulary.
- **PadKind:** id strings for DualSense/DualShock/054c resolve "ps",
  an Xbox id and an unknown id resolve "xbox".
- **Labels sweep:** for each scheme, `renderHelpHtml(labels)` and
  `controlsLines(labels)` contain no unresolved `{` token; the existing
  help currency test (ms values from `WEAPONS`) runs against both schemes;
  the existing per-line width bound in `test/help.test.ts` runs against
  both schemes' legends.
- **Prompt texts:** `bindPrompt` / `openingPromptText` / banner text cite
  the scheme's own cut/thrust/rematch labels. `test/pressure-winding.test.ts`
  currently pins the literals "J" and "K" - it changes to assert against
  `KEYBOARD_LABELS.cut` / `.thrust`, plus a pad-scheme case asserting
  `PAD_LABELS.xbox.cut` / `.thrust`.
- **Select actions:** `handleSelectAction` moves columns, toggles swords,
  direct-picks (`selPickFirst`/`selPickSecond`, matching keys 1/2 exactly)
  and confirms identically to the key path (call both, compare state).
- **Contextual resolution (via `resolvePadEdge`):** every (UI state,
  physical edge) pair yields at most one action - Start resolves to
  exactly one of help-close, `selConfirm`, `rematch` or `pause` in any
  state, never several; Back to exactly one of help-close, `reselect`,
  `help` or null; B closes help when open and feints in a duel; every
  combat control resolves to null while help is open; button 0 confirms
  on the select screen and voids in a duel.
- **Paused routing (via `resolvePadEdge`):** a combat edge while paused
  lands in `pending` and fires on the first resumed tick; Start pauses
  live and resumes paused; Back opens help live-unpaused, reselects
  paused, reselects decided; on a decided-and-paused duel Start means
  rematch; the edge that opens or closes help is consumed by help alone
  and never doubles as a combat or session action.
- **Ownership gating:** a stick held on the select screen navigates but
  starts the duel stationary - the movement hold stays stale until the
  stick returns inside MOVE_OFF and engages afresh; a guard pressed
  while help is open raises nothing when help closes, until released
  and pressed again; a guard held from BEFORE help opened still lowers
  when released under help (falls pass the gate, rises do not); a hold
  from before help opened that is still down when help closes resumes
  (help preserves, selection clears).
- **Select-entry clearing:** hold the stick in a duel -> exit to
  selection (keyboard Esc and paused Back, both routes) -> confirm while
  still holding -> the new duel starts stationary and moves only after
  the stick returns inside MOVE_OFF and engages afresh. The keyboard
  twin - hold D across Esc, select, Enter - also starts stationary,
  pinning the wart fix. Rematch is the stated exception: holds carry
  across Start-rematch and R-rematch alike.

Nothing in `test/golden-replay.test.ts` or the engine suites changes: the
translation happens before intents exist.

## 11. AGENTS.md guidance for future control changes

`AGENTS.md` and `CLAUDE.md` are identical files and both get this, appended
after the "?" panel section, verbatim:

```markdown
## Two control schemes, one action table

Keyboard and gamepad are both first-class; on-screen text follows whichever
was touched last. Every control is an `ActionId` in `src/input/scheme.ts`
with a label per scheme, and UI strings never spell a key or button - they
reference actions via {action} tokens resolved through the active scheme.
Adding or changing a control means: extend the union, add labels to every
scheme table, bind it in `PAD_BINDINGS` (or state why it is keyboard-only),
and write prose with tokens. The typed Records fail the build on a missing
label; the help tests catch unresolved tokens and stale legends.
```

## 12. Out of scope, deliberately

- **Remapping** - explicitly excluded by this spec's brief.
- **Haptics** (`Gamepad.vibrationActuator`) - a natural fit for the bind's
  pulse thud someday, but it is a presentation cue and must obey the same
  simulation-tick discipline as audio; its own small spec when wanted.
- **Non-standard mappings** (`Gamepad.mapping !== "standard"`) - the
  standard indices are used regardless; exotic pads may misbehave and that
  is accepted until remapping exists.
- **A second local player** - the active-pad election assumes one player.
- **Button glyph icons** - labels are text in the existing HUD font.

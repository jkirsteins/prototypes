# The round replays itself at the player's turn start

2026-08-10. Prompted by the wild-lands question: a 10% regrowth at the round
wrap undid a walk-in capture while the raid was in flight, and nothing on
screen said so - `healed` is a silent notice charged to the wild land's own
seat, so with "Targeting me" on, the player's failed capture had no visible
cause. The rule stays as it is; the fix is legibility. Everything that
resolved since the player last held the map is now SHOWN, one thing at a
time: camera on the land, a label saying what happened, a sound that fits.

## Shape

- **One queue, no timers.** Every replay step is one `animations.push` on the
  singleton in `src/animate.ts`, after the draw/play flights and before the
  round-summary modal. No step waits on a copied duration; each chains
  camera -> label -> done through callbacks.
- **`src/replay.ts` is the classification.** `REPLAY_RULES` is an exhaustive
  `Record<GameEventType, ReplayRule>` - the `NOTICE_RULES` shape. A type is
  either `shown` (which land the camera frames, what the label says) or
  `passed-over` with a written sentence saying why and where its sound plays
  instead. A new event type does not compile until classified.
  `buildReplaySteps` walks a fresh batch, tracks the play or passive that
  caused each consequence (the batch-shape rule from `appendEvents`), and
  hands back plain data. No DOM.
- **Who earns a step:** marches touching the local human's full realm (either
  end - the old `flashResolutions` gate); everything else only when it was NOT
  caused by the local player's own play (they watched it live), and is either
  notice-worthy (`isNoticeWorthy`, the modal's own gate) or moves a score on a
  land in the interest set - the full realm plus `attackReach`. A wild land
  regrowing next door replays; one across the map stays a log line.
- **Camera** is `focusOn(point, onDone)` on `InteractionHandle` - a rAF tween
  of the closure-private `view`, clamped by `clampView`, pan only (zoom is the
  player's), cancelled by any pointer/wheel input, reporting through one
  `onDone`. `regionCenter` supplies the point.
- **Labels** are segments (`t()`/`card()`/`faction()`/`passive()`), rendered
  by `renderSegments` into a fixed overlay pill above screen center - never a
  template literal, per the rich-text rule. The score suffix is `impactText`
  on the same walk the log and modal use, so all three quote one number.
- **The modal comes last.** `showRoundSummaryIfAny` parks the summary while
  the queue is busy and `settleTurn` re-arms on `animations.onIdle`, so the
  epilogue never covers the events it summarizes. The continuation gating
  (AI-behind-modal) is untouched.
- **Sound** is `src/audio.ts` + `src/audio-manifest.ts`, the 06-dueling
  pattern: nothing constructed until a user gesture (`unlock()` on
  pointerdown/keydown), every call a no-op without a context - which is why
  the suite needs no mocks. `EVENT_SOUNDS` is an exhaustive
  `Record<GameEventType, SoundName | null>`; a null writes its reason in
  `REPLAY_RULES`. Files are CC0, mp3, in `public/audio/` (see its
  manifest.md), fetched via `import.meta.env.BASE_URL`. The "Sound" checkbox
  rides `MetaStorage` under its own key, the `RULES_PREFS_KEY` pattern.
- **Both seats.** The replay hooks `hud.update`'s animate branch
  (`cb.replayRound`), which the guest's `update` path already runs; a
  snapshot paints with `animate: false` and replays nothing. Events cross the
  wire whole, so no protocol change.

## What replaced what

`flashResolutions` (concurrent march flashes, own `animatedLog` cursor) is
folded into the replay: `flashMarchResolution` still draws the ghost arrow,
but as the body of a queued step, camera first. The claim that those flashes
were "on the queue" in AGENTS.md was ahead of the code; now it is true. The
`+N/-N` score floats skip events that got a replay step - one motion per
fact - and still rise for everything else (the human's own play, above all).

## What would look wrong in play

A camera that jumps while you drag it; a label naming a card as dead text
(hover it - it must tip); the modal rising over a moving camera; a wild-lands
regrowth replaying from across the map; twenty arrows replaying when a guest
rejoins; any sound before the first click (autoplay policy makes that a
console error).

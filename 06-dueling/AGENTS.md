# 06-dueling

A 1v1 HEMA fencing duel: canvas 2D, fixed 60 Hz tick, single-hit lethality.
The combat engine (`src/combat/`) is pure and DOM-free; `src/main.ts` feeds
it intents and hands its returned events to the renderer and audio. Design
docs live in `docs/` and `hema-2d-fencing-design-doc.md`.

## All contact is emergent from the simulation - input is only input

A keypress in a valid window is never the finished endstate. It is only
ever *input to the simulation*; whether and when anything physically
happens - a blade meeting a guard, a strike landing, a foot planting - is
decided by the engine ticking the fight forward, and presentation (sound,
animation cues, effects) must key off the simulation reaching that moment,
never off the input arriving.

Concretely, every cue fires on the tick the engine says the thing occurs,
and every attack resolves to exactly one sound - a readable outcome, never
a layer:

- a footstep when the step or void hop *finishes* its travel, not when the
  intent is accepted;
- the low rising tone when the blade starts rising - the riseStart mark on
  the attack's timeline (which for tell-less player attacks coincides with
  acceptance, legitimately; telegraphed AI attacks rise only after their
  telegraph, and buffered attacks when the buffer fires), choked early if
  the attacker is struck mid-windup;
- the whoosh when the arc *resolves* having found nothing (whiff) - not
  earlier, because a defender can still step into the blade late in the
  strike, so a miss is only knowable at resolution;
- the clash on the *contact tick* - the first tick the blades occupy the
  same place. For a parry that is the travelling blade's arrival at the
  formed guard: its extension covering the gap, which at maximum range is
  the end of the parryable interval and earlier at any closer gap. For two
  crossing attacks it is the tick their extensions together cover the gap,
  and a crossing is ONE clash, never one per side;
- the hit when the strike *resolves* into a wound.

The engine also emits an unmapped `swing` event (blade starts travelling);
it is deliberately silent - sounding every attack would make the whoosh
carry no information.

This was gotten wrong twice in one day (footsteps at step start, the clash
at the parry press) and both were audible immediately.

The pattern that holds up: the fighter state machine emits `FighterEvent`s
at its physical transitions, the engine translates them into `DuelEvent`s
(unlogged when presentation-only: `step`, `swing`, `met`), and the audio
layer keys exclusively off those events. The describe block "presentation
events follow the simulation, not the input" in `test/engine.test.ts` pins
the exact timings - extend it whenever a new cue is added.

## The "?" panel is the rules, and it must not go stale

The help overlay (`src/ui/help.ts`) is the player-facing statement of the
engine's rules. It must stay **concise** and **current**. Any change to a
state, phase, timing, acceptance rule or the parryable interval updates
`HELP` in the same commit. `HELP` is typed as a `Record` over the state and
phase unions, so an undocumented state fails the build; a rule change that
does not alter the union will not, and is on you. Durations are derived
from `WEAPONS` via callbacks, never written as literals - a test asserts
the rendered panel cites the shipping values.

Concise means: one sentence for what is happening, one for what the player
must or must not do (a test bounds the length). If an entry needs a
paragraph, the mechanic is too complicated, not the explanation.

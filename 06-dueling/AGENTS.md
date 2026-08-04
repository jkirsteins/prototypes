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
- the bind clang (the clash samples pitched down) on that same contact
  tick when matched steel CROSSES and locks instead of deflecting - it
  REPLACES the clash as the contact's one sound, never layers on it, so a
  deflection and a bind are audibly different outcomes. Only a crossing
  of two attacks can lock (force into force); a parried blade always
  deflects with the met's ring, whatever the steel;
- the bindBreak ring on the tick the bind's control contest RESOLVES
  decisively - pressure reaching an endpoint or a yield completing - never
  on the keypress that started a pulse or a yield attempt. The bind
  clock's expiry breaks NEUTRAL and is deliberately silent: no ring means
  nobody won, and the shove-apart steps (whose footfalls sound when the
  feet plant, as always) plus the bullet-time exit sweep carry the rest;
- the hit when the strike *resolves* into a wound. The bind winner's
  thrust launches with no windup interval to cross, so no rise cue plays -
  not an audio special case, there is simply no mark to hit.

- the pulse thud (clash pitched far down, quiet) when a bind shove's
  FORCE lands - the commit-to-active transition, never the J keypress.
  The bind is a rhythm contest and the thud is its beat: the silence
  after each thud is the yield gap, so the rhythm itself is the
  information that earns pulses a sound.

The engine also emits an unmapped `swing` event (blade starts travelling);
it is deliberately silent - sounding every attack would make the whoosh
carry no information.

One pair of cues lives OUTSIDE the DuelEvent mapping on purpose: the
bullet-time in/out sweeps. Bullet time (src/ui/bullettime.ts) is a
presentation effect - main.ts eases the wall-clock feed into the tick
accumulator while a bind runs - so its cues are played by main.ts at the
easing's own transitions, the same layer that owns pause and the speed
keys. They mark the clock taking hold and letting go, never a combat
outcome, and they must not be folded into DuelEvents or allowed to replace
the bind's own clang and break.

This was gotten wrong twice in one day (footsteps at step start, the clash
at the parry press) and both were audible immediately.

The pattern that holds up: the fighter state machine emits `FighterEvent`s
at its physical transitions, the engine translates them into `DuelEvent`s
(unlogged when presentation-only: `step`, `swing`, `met`), and the audio
layer keys exclusively off those events. The describe block "presentation
events follow the simulation, not the input" in `test/engine.test.ts` pins
the exact timings - extend it whenever a new cue is added.

## Interaction outcomes emerge from properties, never weapon identity

Weapon profiles declare physical and handling properties, plus the authored
facts that define an action. They do not store conclusions about what a weapon
can do in an interaction. Do not add capability flags such as `bindCapable` or
`canDisarm`, weapon-ID branches such as `weapon.id === "rapier"`, or pairwise
matchup tables.

Derive an interaction outcome in one shared function from the facts that
physically decide it. Depending on the interaction, those facts may include
both weapons' properties, attack progress, contact geometry, measure, fighter
state and timing. Pair outcomes are pairwise: never flatten a relationship
between two weapons into a boolean on either one. Numeric thresholds are fine
when they operate on a meaningful derived quantity and live in the shared
derivation, not in scattered callers.

The bind is the model case. Each weapon declares `bladeStiffness`, and
`canBind(a, b)` in `src/combat/contact.ts` derives whether that particular
contact can persist from both values. Two longswords currently lock, two
rapiers currently lock, and a rapier against a longsword is currently blown
off line. Those are consequences of the shipping numbers, not rules attached
to the weapon names. A future sword gets every pairing from the same formula
without adding a flag, exception or table row.

Tests must follow the same rule. Compute matchup matrices from the shared
derivation and pin the resulting values or pass/fail shape. A test may document
that the current rapier redirect is too fast to chase, but it must not require
failure merely because the attacker is named `rapier`. Retuning a property or
adding a weapon should change the matrix without requiring new control flow.

Authored identity is still allowed. `cut` and `thrust`, an attack's declared
line, control mappings, animations and flavour text are inputs to the model,
not conclusions about an interaction. Global game rules are also allowed when
they genuinely apply to every fighter. The prohibition is on encoding a
derived outcome as identity or capability.

Specs obey this rule too. They may explain the current weapon matchups, but
must state them as results of properties and formulas, never as permanent
weapon-name exceptions. When a new interaction needs a gate, first identify
the physical property and the shared derivation that produce it. If the design
still needs a weapon-pair table, the model is missing a deciding property.

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

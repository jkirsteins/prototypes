# duelist-defence: The duelist learns to defend

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

Mode 3 is a turret with footwork. Its whole vocabulary in `aiDecide` is
advance, retreat, stance moves and attacks: approach until narrow, strike,
retire while the cycle floor recovers. It never parries, never voids a
threat, never shifts a guard, because it never has one.

The consequence runs through the whole chain: every defensive mechanic the
first seven specs build - the rise, the covered line, the guard shift, the
held guard, the bind - is exercised by the player and never against the
player's own attacks, outside mode 1's drill. Attacking the duelist is a
pure timing race, and the player's line feints have no live target that
fights back.

This spec gives the duelist a defence, and keeps it deliberately imperfect,
because an opponent is something you fight, not something you solve for the
one gap it was shipped with - and not something that solves you.

**Delivers:** duelist defence - when mode 3 parries, voids, counters, or
deliberately does nothing.

**Depends on:** `pressure-and-winding`, and through it the entire chain.

---

## 1. Why last: the reflexes already exist, the policy does not

Every spec in the chain already made its own AI delta, deliberately scoped
to the mechanic it shipped:

| Reflex | Owned by |
|---|---|
| Mode 1 presses so the guard is formed, not just raised | `parry-rise` §6 |
| Mode 1 moves its stance to the threat; the press infers side | `attack-lines` §6 |
| Mode 3 draws its attack height seeded, stance-first | `attack-lines` §6 |
| Mode 3 redirects reactively as an attacker | `line-feints` §6 |
| Mode 1 shifts its guard as a feint target | `line-feints` §6 |
| The hold-release lifecycle and the shift rule for a held guard | `held-guard` §9 |
| The in-bind pressure/yield policy | `pressure-and-winding` §9 |
| Defence-lite: one threat per visible in-measure attack, one seeded roll (parry if formable / retreat / stand), closing suppressed while any live blade points in | shipped early in `src/combat/ai.ts` at playtest (cuts always killed the duelist, and it stepped INTO them); this spec's full menu, latency band and feasibility matrix SUPERSEDE it |

Those are reflexes: what to do once a defence exists. What none of them
defines is the **policy** - when the duelist chooses to defend at all, and
with which tool. `held-guard` §9 said so explicitly: the trigger "arrives in
`duelist-defence`, the last spec in the chain".

Last is the only correct place for it. A defence policy chooses over the
complete kit, and a policy written mid-chain would have been rewritten by
every spec that followed - and the bind proves the sequencing concretely: in
any pairing `canBind` sustains, a duelist that parries enters binds as the
**defender**, so the bind game must already exist and already have an AI
strategy, or every successful AI parry would dead-end. `pressure-and-winding` §9 supplied that policy;
this spec only routes new traffic into it.

This spec adds the policy and nothing else. Every reflex stays where it was
specified and is invoked, not copied. Mode 1's press mechanics (stance
first, react, press) are promoted to a shared helper that both modes call -
mode 1 with its perfect trigger, mode 3 through the imperfect policy below.
`duelistCooldown`'s own comment reserved this slot: "personality-driven
pacing, when it comes, layers on top as fighter-cognition delays in plain
milliseconds." This spec is that layer, for defence.

---

## 2. The constitution: how the AI is allowed to be good

The rules the chain already lives by, restated once as hard constraints on
everything in this spec:

- The AI reads only the **observable projection** - the same state row 3
  prints and the golden replay hashes. Never the opponent's input buffer,
  never a redirect that has not happened, never anything the projection
  excludes. (Since `pressure-and-winding`'s control-contest revision the
  bind itself holds no hidden state at all - only physical actions already
  begun - and in-bind reads are additionally delayed per its §9.)
- Every read is at least `AI_REACTION_MS` old.
- It pays every cost the player pays: the rise, the stance travel, the
  shift durations, `parryRecoveryMs`, and the held-guard input lifecycle -
  it issues `parry` and `parryRelease` intents like anyone else and never
  pokes state.
- Every draw comes from the existing seeded rng, so a replay is
  reproducible from (seed, inputs).

---

## 3. How it is allowed to be bad: imperfection with a cause

The duelist must be beatable, and beatable in ways that read as fencing.
Four honest weaknesses, all structural, none of them sabotage:

1. **It reacts like a fencer, not a tick-handler.** Each incoming threat
   gets a decision latency drawn seeded from
   `DUELIST_DEFENCE_LATENCY_MS = [AI_REACTION_MS, AI_REACTION_MS + 220]`,
   i.e. 180 to 400 ms, mean 290 - a touch worse than the player's 250 ms
   budget. A fast draw feels sharp; a slow draw *is* the opening. The floor
   is `AI_REACTION_MS` and nothing in this spec may react faster (test).
2. **It commits.** Once it presses, it owns the snapshot: its guard covers
   the line from its delayed read - the observable snapshot
   `AI_REACTION_MS` before the decision tick (§4.2.1) - and it corrects
   only through the same shift rules and durations the player has. A redirect thrown
   after its press defeats it exactly as it defeats a human. This is the
   headline: **the duelist becomes feintable as a defender**, and the
   player's `line-feints` skills finally have a live target.
3. **It plays a mixed strategy, not the best response.** One seeded draw
   per threat over four answers (§4). It sometimes eats an attack it could
   have parried, because it drew *stand* - or drew *counter* and lost the
   trade - which reads as being outguessed, the same feeling the bind's
   seeded temperament already produces, not as a scripted whiff.
4. **It does not predict.** No opponent modelling, no habit counting, no
   inspecting anything a player could not see. Its only "prediction" is the
   standing hold `held-guard` §9 already gave it while it waits - a guard
   on a readable line that the player can simply go around.

**Explicitly forbidden: error rates.** No knob makes a formed guard drop,
mistime or misread on purpose. `pressure-and-winding` §9 refuses an
error-rate flag for exactly this reason: uncertainty belongs in the draws,
the latency and commitment already spent, not in sabotaging mechanics that
otherwise work. A guard the duelist forms works exactly like yours.

---

## 4. The policy

### 4.1 The trigger

One decision per incoming attack, and the latch knows **which** attack it
answers. When the opponent's attack becomes visible (enters `windup`) the
duelist latches a threat carrying that attack's start tick and a drawn
latency; when the latency elapses it rolls the menu once and acts. The
threat clears when **that** attack - matched by start tick - resolves, so
back-to-back attacks latch distinct threats with distinct draws, and a
resolved attack can never satisfy or clear a later one. A redirect does
**not** re-roll the menu - the identity is the attack, not its line - and
only the `line-feints` §6 shift reflex may answer the lie.

```ts
interface AiState {
  // ...
  /** The one live threat: which attack (by start tick), when the answer
   *  fires, and whether it already has. */
  threat: { attackStartTick: number; latencyMs: number; answered: boolean } | null;
}
```

No draw happens at all when the attack cannot land: mode 1's out-of-measure
rule (an attack launched from beyond the attacker's own reach is ignored)
applies to the duelist unchanged. A fencer does not answer theatre.

No draw happens while the duelist is inside its own attack: it is
committed, exactly as the player would be, and the trade stands. A threat
that appears while a plan is pending but unthrown may pre-empt it - if the
menu says defend, `ai.plan` is cleared and the tempo is spent defending.

### 4.2 The menu

One seeded draw over four answers, weights zone-independent to start
(narrow is where threats that pass the reach gate live anyway):

| Answer | Weight | What it does |
|---|---|---|
| guard | 0.40 | cover the threat's line: press from cold, shift a wrong-line hold, keep holding a matching one (§4.2.1) |
| void | 0.20 | void immediately on the decision tick; a held guard drops on acceptance (`held-guard` §7); whether it escapes is measure, as for the player |
| counter-attack | 0.15 | launch an attack drawn like its normal plan (seeded kind and height, stance first), dropping a held guard on acceptance; `blade-contact` decides what the two blades do |
| stand | 0.25 | no defensive action, and no new attack plan while this threat is live (§4.2.2) |

The weights are a personality, and playtest knobs. What is not a knob:
`stand`'s weight stays above zero (an opponent that always answers cannot
be attacked into), and no answer's weight reaches one.

#### 4.2.1 The guard answer, over whatever the guard is already doing

**Every line comparison below reads the threat's line from the observable
snapshot at `decisionTick - AI_REACTION_MS`** - the §2 rule applied to the
freshest read the decision is allowed. A redirect inside that window is
invisible to this decision: the guard line it selects is computed from the
delayed snapshot, never from the current tick, and only the `line-feints`
§6 shift reflex - on its own delayed clock - may answer the lie later.

`held-guard` §9 lets the duelist wait with a guard already up, rising or
mid-shift, so the guard branch must never assume a cold start - and a
press over a held key does not exist (`held-guard` §3). Five cases, by
what the track is doing:

- **No guard up:** the shared press helper - stance to the threat's height
  if needed, press - then `held-guard` §9's hold lifecycle.
- **Held on the threat's line:** nothing to issue. The answer is to keep
  holding; §9's seeded release timer is suspended until the threat
  resolves, so the guard does not wander off mid-threat.
- **Held on the wrong line:** request the shift that corrects it - height,
  side, or both, through the same intents and durations the player pays
  (`held-guard` §6). One correction per decision; a later redirect is
  answered only by the `line-feints` §6 shift reflex, on its own rule.
- **Rising:** toward the threat's line and forming in time - continue,
  nothing to issue. Toward any other line - no retarget exists, because
  shifts are refused while rising (`held-guard` §6): downgrade to void.
- **Shifting:** toward the threat's line and completing in time -
  continue. Old covered line matching the threat - also continue: the old
  line stays protected for as long as the shift runs (`held-guard` §6's
  old-line-holds rule). Neither the old nor the target line matching - a
  second shift cannot start while one is active: downgrade to void.

**Every guard answer checks feasibility with the engine's own arithmetic
and downgrades honestly.** The formation deadline is `attack-lines` §4's
rule, called through the shared `guardEffectiveAt` helper and never
re-derived: the decision tick plus the **max** of the rise, the remaining
height travel and the side travel - the travels run concurrently, they are
never summed. A shift's deadline is its own duration (`held-guard` §6). If
the formed guard or completed shift would land past the visible attack's
`parryableUntil`, the duelist starts neither: it downgrades to void, which
drops any held guard normally. A press that cannot form is not
imperfection, it is noise, and it would teach the player that AI guards
are decorative.

#### 4.2.2 What stand means

Stand is a defined choice, not an absence: **no defensive action, and no
new attack plan until this threat resolves.** Without the suppression, the
approach-strike-retire pulse could draw a fresh attack mid-threat and turn
stand into an accidental counter - a fifth answer the menu never priced.
Existing movement continues; a plan decided before the threat proceeds
(committed is committed, and its stance move was already telling); and an
already-held guard stays up and may still stop the attack - that is
existing state doing its job, not a new answer. When the threat resolves,
the pulse resumes on its cooldown.

### 4.3 After the exchange

No scripted riposte. A successful deflection leaves the duelist with
whatever its cooldown and zone say next, exactly as before; where a riposte
exists by rights - a bind won through `pressure-and-winding` -
the bind advantage already is one, and this spec routes the AI into that
game as a defender for the first time. Its firmness there is emergent and
correct: the standing hold arrives settled and firm, entering the contest
with control leaning its way; a last-moment reactive press arrives soft
and starts the contest being pushed (`pressure-and-winding` §1, §3.1). The blade relation
`sustained-bind` §2.3 reserves needs no handling here at all: this spec
enters the existing bind policy and nothing more; bind geometry and its
eventual use belong to `sustained-bind` and `pressure-and-winding`.

---

## 5. The feasibility matrix, computed not asserted

Player attacks carry no telegraph - `telegraphMs` pads AI attacks only - so
the duelist faces a harder version of the reaction matrix the player got in
`attack-lines` §4.1. Which player attacks a defending duelist can possibly
answer is arithmetic over `WEAPONS`: visibility to `parryableUntil` on one
side, the drawn decision tick and the guard's concurrent travels on the
other.

The defender's side of the arithmetic is `attack-lines` §4's rule and no
other: the decision tick plus the three-way `max` of the rise, the
remaining height travel and the side travel - concurrent, never summed -
obtained by calling the engine's `guardEffectiveAt` helper, the same
function the live policy uses, so the test and the behaviour cannot drift
apart.

That table is a test, not a paragraph, in the same style as the two
matrices before it: computed for every (defender weapon, attacker weapon,
attack, stance right or wrong, latency at floor and at ceiling) and pinned,
so a retune moves it visibly. The expected shape, to be confirmed by the
computation when this lands: cuts answerable from the right stance, the
tell-less thrusts not, echoing `parry-rise` §5.1.

One invariant sits above the table:

> **For every weapon pairing, at least one player attack must remain
> unanswerable by reactive defence even at the latency floor from the
> correct stance.** The player always keeps a guaranteed
> non-reactively-parryable attack - not a guaranteed hit: the void, the
> counter, a guard that was already standing, and distance may all still
> answer it. What may never answer it is a guard formed in reaction. If a retune ever
> makes everything reactively answerable, the latency floor rises before
> anything else moves.

---

## 6. Modes 1 and 2 are not touched

Mode 1 keeps its perfect trigger and stays the drill: the place to learn a
mechanic against an opponent that always answers when it can and tells you
when it cannot. Mode 2 stays the metronome and still never defends. The
policy, the latency draws and the menu exist only in mode 3; a test pins
modes 1 and 2's decision streams unchanged for the same seed.

The difficulty ladder falls out for free: mode 2 never defends, mode 1
always defends and predictably, mode 3 defends sometimes and on its own
clock.

---

## 7. Presentation

Nothing new, and that is the point: the duelist's defence is made of the
player's own mechanics, so it is already fully legible. Its guard prints on
row 2 and row 3, its covered line and shifts render on the line bar with
the same slides, its stance moves telegraph its parries the same way they
telegraph its attacks. The reads the player has been taught transfer whole.

Audio is unchanged - guards were already silent, and a duelist parry ends
in the same single `met` clash. The help panel documents rules, not
opponents; if the mode-select copy names the modes, mode 3's line gains the
word "defends", and nothing else changes.

---

## 8. Tests

- **Determinism:** same seed and input script, same threat latencies, same
  menu draws, same defensive intent ticks.
- **The floor:** no defensive intent ever fires earlier than
  `AI_REACTION_MS` after the threat became visible; every latency draw
  falls inside `DUELIST_DEFENCE_LATENCY_MS`, and over a long seeded run
  the draws span the band rather than clustering at one end.
- **No future information:** two duels identical through tick T and
  differing only in the attacker's inputs after T produce identical
  duelist decisions through T - `held-guard`'s test, extended to the
  policy layer.
- **One decision per threat:** a redirect mid-attack does not re-roll the
  menu; the shift reflex may still answer it, on its own rule.
- **Threat identity:** back-to-back attacks latch distinct threats with
  distinct latency and menu draws; resolving the first never clears or
  answers the second.
- **Guard-aware answers:** with a matching guard already held, the guard
  draw issues no new intent and the hold persists through resolution; with
  a wrong-line hold it issues shift intents and never a press; and no
  `parry` intent is ever emitted while `parry !== null`.
- **The read is delayed:** a redirect less than `AI_REACTION_MS` before
  the decision tick does not change the AI's selected guard line; the same
  redirect one tick earlier than that does.
- **In-motion guards:** a guard rising toward the threat's line in time
  issues nothing and meets the blade; rising toward another line
  downgrades to void; a shift completing on the threat's line in time
  continues; a threat on an active shift's old line is met while the shift
  runs; a threat matching neither line of an active shift downgrades to
  void.
- **Stand suppresses the pulse:** a stand draw creates no new attack plan
  while its threat is live, existing movement continues, and an
  already-held guard stays up - and may still produce a `parried`. The
  pulse resumes on its cooldown after resolution.
- **Feasibility matrix:** computed from `WEAPONS` through the shared
  `guardEffectiveAt` helper and pinned, with the §5 invariant asserted per
  pairing.
- **The downgrade:** a threat constructed so no guard can form in time
  yields a void, never a press; a wrong-line hold whose correcting shift
  cannot complete in time voids instead of shifting; and no duelist press
  or shift ever completes past the visible attack's `parryableUntil`. The
  check calls the engine's `guardEffectiveAt` helper - asserted to be the
  same function the matrix uses, not a re-derived copy of the `max`.
- **The mix is real:** over a long seeded run against a scripted attacker,
  all four answers occur, and the fraction of in-measure attacks answered
  at all sits inside a wide pinned band - a drift alarm, not a tuning
  lock.
- **Feintable:** scripted exchange - duelist presses against a visible
  line, the attacker redirects inside the duelist's shift latency, the hit
  lands on the vacated line. The mirror case, redirect thrown early enough
  to shift against, is `parried`.
- **Commitment against its own attack:** no defensive intent is emitted
  while the duelist's own attack state is live; a pending unthrown plan is
  cleared when the menu draws a defence.
- **Bind entry as defender:** a duelist parry that becomes a bind - in any
  pairing `canBind` sustains, the rapier mirror as much as the longsword
  mirror - runs `pressure-and-winding` §9's policy from the starting
  control its snapshot earned; no special-case path.
- **Modes 1 and 2 unchanged:** identical decision streams for the same
  seed before and after this spec.
- **Golden replay:** hash re-recorded.

---

## 9. Out of scope

- **Opponent modelling.** No habit counting, no frequency adaptation, no
  difficulty that learns. The mixed strategy is stationary; if the game
  ever wants a studying opponent, that is its own spec with its own
  fairness argument.
- **Difficulty levels.** The weight table and latency band are one
  personality. Sliders, personalities per weapon, or a coward-to-berserker
  axis all layer on these constants later without new mechanisms.
- **Scripted ripostes** after a deflection. §4.3.
- **Predictive stance play** beyond `held-guard` §9's standing hold - no
  deliberate line-baiting, no guard camping strategy.
- **Defensive footwork** beyond the existing retire pulse and the void
  draw - no measure feints, no false-distance play (`line-feints` §8
  already defers step feints for the player too).
- Any change to modes 1 and 2.

---

## 10. Playtest gate

This is the spec that makes mode 3 a fencer; play it last against
everything you have learned. Both weapons, long sessions.

What to look for:

- Attacking the duelist stops being a timing race: some of your attacks
  meet steel, and *which* ones feels like being read - you can name the
  tell you gave.
- Your feints finally work against a live guard: sell a line, watch it
  commit, go around - and it only works when you actually sold it.
- The imperfection reads as human: slow answers look like hesitation, not
  lag; eaten hits look like wrong guesses, not scripts.
- The non-reactively-parryable attack from §5's invariant is never met by
  a reactive guard; when the duelist answers it at all, the answer is
  visibly distance, a trade, or a guard that was already standing.
- Mirror matches (longsword and rapier alike) now produce binds in both
  directions, and losing one as the attacker feels different from losing
  one as the defender.
- Across a session: you lose to feints, to binds, to measure and now to
  its defence. If its defence never beats you, the weights or the band are
  too soft; if it beats you into passivity, `stand`'s weight is too low or
  the latency floor too sharp.

What would look wrong: the duelist reading as a wall (every probe parried -
the mix has collapsed toward defence) or as a random number generator
(defences with no visible relation to what you threw - the latency band too
wide, or decisions leaking outside the one-per-threat rule). The first
knobs are the menu weights and the latency band; the constitution in §2 and
the invariant in §5 are not knobs at all.

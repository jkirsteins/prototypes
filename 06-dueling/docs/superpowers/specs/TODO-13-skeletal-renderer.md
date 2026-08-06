# skeletal-renderer: PLACEHOLDER - the pose renderer imported from 07

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Status: placeholder

Renderer feasibility is being investigated separately in the `07-*`
prototype. This file marks the point in the sequence where the renderer
becomes **mandatory**: `guard-positions` cannot ship playable on the
sprite pack, because the pack has no frames for Ochs, Alber, guard
transitions, one-handed realizations or per-weapon blades. Engine and
tests for `guard-positions` may land before this spec is fulfilled;
playtesting cannot.

When the 07 investigation concludes, this placeholder is replaced by the
real spec (same slug). Until then, it records the contract the imported
renderer must satisfy, so the model specs on either side can be written
against it.

## The contract

1. **Poses are data.** A complete rendered posture composes weapon +
   handling mode + guard realization (+ body stance, later) - the
   composition defined in `guard-positions`. The renderer consumes
   authored pose rows keyed by guard position x handling mode; it never
   keys a pose on a weapon id. In the current version every realization
   shares ONE canonical lower body (`guard-positions` section 1), so
   guard changes move hands and blade only and the simulation never
   owes a step it did not price. Conceptually a complete pose depends
   on `handling x guard x stance` even after the stance extension
   separates the layers; upper-body/lower-body layering is an
   **optimization target for asset count, not a guaranteed
   decomposition** - stance reaches through hips, torso and shoulders
   into the guard, and combat actions (attacks, large guard
   transitions) may remain full-body authored animations per
   combination. The renderer must allow layered standing poses and
   full-body action animations to coexist.
2. **The weapon attaches.** The weapon mesh/shape attaches to the hand
   transform; blade length comes from the same profile facts
   (`physical-foundations`) the engine derives reach from, so drawn
   reach IS simulated reach.
3. **The blade in a strike draws from the simulation.** During an attack
   the drawn blade position derives from the engine's own extension
   model (`contact.extension`), never from an independent animation
   clock.
4. **Presentation follows the simulation.** Pose changes key off
   timeline marks and engine events, exactly as the sprite renderer's
   `pickFrame` does today - the discrete-pose readability rules (the
   strike pose flip at `parryableUntil`) carry over.
5. **Parity first.** Before `guard-positions` lands, the renderer must
   express every current state (ready, step, void, attack phases, parry
   rise/formed, bind, hitstun, disarming, disarmed, exposed, dead) at
   least as legibly as the sprites do now.
6. **Deterministic animation locking.** The 07 prototype's locking
   discipline carries over explicitly: every rendered pose is a pure
   function of simulation state and simulation time. No free-running
   combat clips, no animation-system clocks of its own, no retained
   animation state that could drift from the engine - pausing,
   stepping a tick, or bullet time must move the pose exactly as they
   move the simulation.
7. **Character modularity.** Poses belong to a shared rig family, not
   to a character: character meshes are skinned to that rig (or
   retargeted onto it), so a new character costs a mesh, never a new
   copy of every animation. The `N characters x M animations`
   multiplier must not exist.

## Out of scope here

Everything else - skeleton format, tooling, pose authoring workflow,
easing between poses - belongs to the real spec when it arrives from 07.

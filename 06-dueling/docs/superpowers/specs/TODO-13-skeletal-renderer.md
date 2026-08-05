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
   keys a pose on a weapon id. In the current version each realization
   bakes its canonical lower body into the pose; the future stance
   extension splits the composition into layers - upper body from
   guard x handling, lower body from stance, weapon aligned to the
   handling pose - so the asset count is a sum
   (`handling x guard upper-body poses + stance lower-body poses`), not
   a Cartesian product. Combat actions (attacks, large guard
   transitions) involve hips, torso and arms together and may remain
   full-body authored animations per combination; the renderer must
   allow both layered standing poses and full-body action animations to
   coexist.
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

## Out of scope here

Everything else - skeleton format, tooling, pose authoring workflow,
easing between poses - belongs to the real spec when it arrives from 07.

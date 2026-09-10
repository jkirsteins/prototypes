# Survidle Sleep Legibility Design

## Problem

The 10 September blind playtest exposed three connected failures.

1. `Light sleeper` reads as a promise that the survivor is easy to wake, but
   its storm rule currently makes the survivor remain asleep longer and its
   description states the effects indirectly.
2. Stamina collapse is represented as sleep. A collapse is held until Stamina
   reaches 100 even when the homeostatic sleep model says the survivor is not
   sleepy, so Stamina acts as a second authority over sleep.
3. Sleep is implemented as a finite task whose estimated duration can finish
   before the body's live sleep need. The scheduler then starts another sleep
   task, exposing one physiological sleep as repeated timers.

Commit `56942580` made Stamina and Sleepiness separate and visible. This design
keeps that work. It adds practical time forecasts to the existing Sleepiness
display and removes the remaining coupling between Stamina and sleep.

## Model boundaries

Sleep has one authority: the existing homeostatic sleep debt combined with the
circadian and ultradian alertness curves in `src/sim/sleep.ts`.

- An awake survivor falls asleep when Sleepiness reaches `SLEEP_ONSET`.
- A sleeping survivor wakes when Sleepiness reaches `WAKE_AT`.
- Sleep lowers sleep debt. Awake time, including Rest, raises it.
- Sleep also restores Stamina because sleep is physically restful, but Stamina
  does not decide when sleep begins or ends.
- Rest restores Stamina and does not lower sleep debt.

Stamina remains the reserve spent by physical work. At or below `SLEEP_AT`, the
survivor is too exhausted to work and must Rest. This is an exhaustion recovery,
not sleep. The existing sticky `spent` need holds Rest until `RESTED_AT`, which
also keeps the work gate closed until that same threshold and prevents immediate
stop-start work without adding another recovery latch. If
Sleepiness reaches `SLEEP_ONSET` during that Rest, the body changes once from
Rest to Sleep through the ordinary sleep rule.

The old `sleeping.collapsed` state is no longer produced. Save loading accepts
it for compatibility and converts it to the corresponding exhausted Rest state.
No second sleep-pressure value or collapse-specific sleep duration is added.

## Continuous automatic sleep

Sleep is automatic. Remove the player-facing `Sleep` and `Camp for the night`
actions from the Do panel and from new orders. Keep `Rest` as the explicit
recovery action. Internal `sleep` and `night` task IDs remain loadable so old
saves do not break. A loaded `night` intent may finish its current automatic
sleep, then ends instead of requesting another one.

A body-owned sleep is one continuous activity:

- Starting sleep creates one sleep task.
- Generic task duration must not complete that task.
- Each simulation minute, the body model decides whether Sleepiness is still
  above the wake line.
- While sleep continues, the task's displayed remaining time is refreshed from
  the same model. A storm beginning or ending may move the forecast, but may not
  finish and restart the activity.
- When the body crosses `WAKE_AT`, body care ends the sleep task once and resumes
  normal order selection.

The one-hour minimum remains only an estimate floor for a legacy sleep task or
diagnostic call. It may not divide an automatic sleep into one-hour buckets.

## Light sleeper and storms

Keep the current storm effect: a light sleeper clears sleep debt at half the
normal rate while the local storm is active. This represents interrupted,
lower-quality sleep without simulating individual awakenings. Because the live
model owns the activity, changing storm conditions alter the expected wake time
without creating another sleep task.

Replace the trait description with direct mechanical copy:

`Light sleeper. Safe from wolves while asleep. Storms reduce sleep quality.`

This change is limited to the light-sleeper description. Other trait copy is
already stated as a direct capability or cost and is not part of this change.

## Forecasts and UI

Retain the merged Stamina and Sleepiness bars and their threshold markers. Add
one short forecast line directly under the Sleepiness bar.

- Awake: `Sleep about 22:30`
- At or above `SLEEPY_AT`: `Sleep soon, about 22:30`
- Asleep: `Wake about 07:10`
- Asleep while a storm reduces sleep quality:
  `Wake about 09:00 - storm reduces sleep quality`

Times use the game clock and are rounded to the nearest ten minutes, matching
the model's existing forecast step. `about` communicates that a forecast can
move. The forecast updates with the live bars rather than waiting for the keyed
panel to rerender.

Add a pure `minutesToSleep(debt, hour)` alongside `minutesToWake`. It advances
the existing debt and alertness processes as awake until `SLEEP_ONSET`; it does
not inspect Stamina. The waking UI uses it. The sleeping UI uses the existing
wake projection with the current local storm quality modifier. Both projections
are derived from the same functions that update the survivor.

Stamina communicates exhaustion independently through its existing threshold
and status. It must never supply the Sleepiness forecast or change `Sleep about
...` into a collapse prediction.

## Tests

Tests must establish the behavior before production changes.

- Sleep projection: a known debt and hour produce the expected sleep-onset time;
  changing Stamina does not change it.
- UI: the existing Sleepiness bar remains, awake state shows `Sleep about`,
  sleeping state shows `Wake about`, and a light sleeper in a storm gets the
  direct quality explanation.
- Collapse: a survivor below `SLEEP_AT` but below sleep onset Rests, does not set
  `player.sleeping`, and later transitions to Sleep only when Sleepiness crosses
  `SLEEP_ONSET`.
- Continuity: a sleep whose forecast changes during a storm keeps the same task
  and intent and never exposes a second sleep start.
- Actions: `Rest` remains available while `Sleep` and `Camp for the night` are
  absent from player-facing task options and filtering.
- Copy: the survivor card contains the direct light-sleeper description and no
  longer contains the storm-night metaphor.
- Save compatibility: an old collapsed-sleep save loads into exhausted Rest,
  and legacy internal sleep/night state does not restore a player-facing action.

Run only the focused tests needed by each TDD cycle, including individual tests
from the slow partition when they directly cover changed behavior. Do not run
the full slow suite. Before completion, run `npm test`, `npm run build`, and the
root `npm run lint`.

## Playtest gate

Use a survivor with `Light sleeper`, work Stamina below the collapse threshold
before natural bedtime, and let a storm begin during the following night.

Correct behavior:

- exhaustion produces one visible Rest activity;
- the Sleepiness forecast advances independently of Stamina;
- Rest changes once to one continuous Sleep activity at sleep onset;
- the wake forecast moves later when the storm begins without resetting the
  activity timer;
- the survivor wakes once and queued work resumes;
- the Do panel offers Rest but no Sleep or Camp for the night action.

It is wrong if Stamina causes sleep, Sleepiness has no clock forecast, a storm
starts a new sleep timer, the activity restarts at one hour, or the direct trait
description leaves the player to infer its mechanics.

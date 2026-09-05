# Testing the round

The instrument the roadmap's gate table reads. Four of its six bars come
from a beacon (Datadog RUM, on by default behind a switch on the settings
panel); two come from a survey. Nothing here is a game feature: the
simulation, the save and the life record are unchanged.

## Before a tester is recruited

Four steps, all on the author's side:

- Create the RUM application in the EU org, then paste its application id
  and client token into `src/beacon/config.ts`. Blank ids keep the beacon
  inert: the settings panel shows "not configured" and nothing is sent.
- Switch client IP collection off in the application's settings. The SDK
  has no switch for this; it is org-side only.
- Confirm event retention covers more than thirty days, or the day 30 bar
  has nothing to read.
- Confirm a funnel can take a time window. If it cannot, fall back to the
  MCP's export and a short script for the re-run bar.

## The tester link

`?tester=<cohort>` on any open marks the device a tester and names its
cohort. The mark is written beside the beacon id in local storage, the
parameter disappears from the address bar on the same load, and `?seed=`
is left alone. The mark survives "leave this world" and a new seed,
because it lives beside the id and not inside the world. The cohort word
is whatever the invite says, so a second recruiting wave is told apart
from the first; an empty `?tester=` is recorded as "default".

## What is sent

Five actions, every one carrying the world seed, the survivor index, the
game day, the tester flag and the cohort:

- `opened` on every load once the save is in. Adds the month number (the
  last written entry of the life record's forecast series, or null).
- `heartbeat` once a real minute while the tab is visible and the game is
  running (not dead, not landing, not the away report).
- `died` the frame a death is first seen. Adds the cause, the days
  survived and the minutes of attention in that life.
- `beganAgain` when the next survivor lands. Adds the seconds since the
  death.
- `settings` when the switch is toggled, so an opt-out is the last thing
  seen from that id.

What is never sent: no name, no email, no IP, no session replay, no
clicks.

## The six bars

For each, the reading rule is the roadmap's gate table; the four beacon
bars also carry the RUM query or funnel that reads them.

- **Re-run rate.** Two thirds start a new survivor within a day of a
  first death; half after a death that ended a run past 100 game days.
  Query: users with a `beganAgain` within 24 hours of a `died`, over
  users with a `died`.
- **The first run.** A tester completes a first death and starts again
  inside two hours of attention. Query: users with a `died` and a
  `beganAgain` inside 120 attention minutes of their first `opened`.
- **Hours of attention.** A median of ten or more among testers past day
  1. Query: the median over testers of heartbeats after game day 1,
  divided by 60.
- **Day 30.** A tenth still opening the tab. Query: users with an
  `opened` 30 days after their first, over users.
- **Would they pay.** Two thirds say yes to ten dollars after a week.
  Survey question, not the beacon.
- **Stories.** Testers tell survivor stories unprompted. Survey question,
  not the beacon.

The survey is one form, sent after a week, keyed by the id the settings
panel shows beside the switch.

# Testing the round

The instrument the roadmap's gate table reads. Four of its six bars come
from a beacon (Datadog RUM, on by default behind a switch on the settings
panel); two come from a survey. Nothing here is a game feature: the
simulation, the save and the life record are unchanged.

## Before a tester is recruited

Three steps set the application up; a fourth turns the beacon on:

- **Step 1.** Create the RUM application in the EU org, then paste its
  application id and client token into `src/beacon/config.ts`. Blank ids
  keep the beacon inert: the settings panel shows "not configured" and
  nothing is sent.
- **Step 2.** Switch client IP collection off in the application's
  settings. The SDK has no switch for this; it is org-side only. Until
  this step is done, the SDK's own view and error events still carry the
  visitor's IP the way any RUM install would.
- **Step 3.** Confirm event retention covers more than thirty days, or
  the day 30 bar has nothing to read; confirm a funnel can take a time
  window, or fall back to the MCP's export and a short script for the
  re-run bar.
- **Step 4, last.** Turn the switch on. Only after steps 1 to 3 above,
  and only once the fixes in this pass are live: the switch now stops
  every event through `beforeSend`, not only the ones the beacon composes
  itself; attention is counted per world and per life, so it cannot bleed
  from one survivor's playtime into another's; and the heartbeat counts
  only minutes the tab was actually watched.

## The tester link

`?tester=<cohort>` on any open marks the device a tester and names its
cohort. The mark is written beside the beacon id in local storage, the
parameter disappears from the address bar on the same load, and `?seed=`
is left alone. The mark survives "leave this world" and a new seed,
because it lives beside the id and not inside the world. The cohort word
names a recruiting wave, not a person: it is reduced to letters, digits
and hyphens before it is stored, so a name or an email pasted into the
link by mistake cannot end up identifying anyone. An empty `?tester=` is
recorded as "default". Sending a tester a second link with a different
word re-marks the same device under the new cohort, for someone invited
twice under two waves.

## What is sent

Five actions, every one carrying the world seed, the survivor index, the
game day, the tester flag and the cohort:

- `opened` on every load once the save is in. Adds the month number (the
  last written entry of the life record's forecast series, or null).
- `heartbeat` once a real minute while the tab is visible and the game is
  running (not dead, not landing, not the away report).
- `died` the frame a death is first seen, including a death the reload
  catch-up deals while the tab was closed. Adds the cause, the days
  survived and the minutes of attention in that life.
- `beganAgain` when the next survivor lands. Adds the seconds since the
  death.
- `settings` when the switch is toggled, so an opt-out is the last thing
  seen from that id; turning it off also ends the RUM session outright
  rather than waiting for the next event to be dropped.

What the beacon itself never sends: no name, no email, no IP, no session
replay, no clicks.

## What the SDK sends on its own

Beside the five actions above, the Datadog SDK sends its own telemetry
without being asked. This is vendor behaviour, not something the beacon
composes, and it is worth knowing about before a tester is recruited:

- A view event per page load, carrying the page URL (the query string may
  hold `?seed=`, `?day=`, `?speed=`; the referrer is blanked by the
  beacon's `beforeSend` before the event leaves), the viewport, the
  browser, the OS and the page's load timings.
- An error event for an uncaught exception, an unhandled promise
  rejection, or `console.error` text.
- SDK telemetry (the SDK's own health metrics) at its default 20 percent
  sample.
- A session id, held in the `_dd_s` cookie on the Pages origin.
- No second anonymous device id: `trackAnonymousUser` is off, so the RUM
  user is only the beacon's own random id.
- The visitor's client IP, until step 2 above is done.

## The author's own traffic

A dev open should not count as a tester's session. Either open with the
switch off, or exclude the operator's own beacon id at the query side;
the settings panel shows the id so it can be pasted into an exclude
filter. `?speed=` and the console's `advance` both inflate `day` and
`daysSurvived` past what real play would produce in the same wall-clock
time, so a run driven by either should be filtered out of the gate bars
the same way.

## How a tester's id survives

The id lives in local storage beside the save, not in a cookie or an
account. Clearing site data, opening a private window, or switching
browsers all mint a new id for the same person. That breaks the day 30
bar (the return reads as a different visitor) and the survey key (the
form the tester fills in a week later is keyed by the id the panel showed
them at the time, and a new id cannot be matched back to it).

## The six bars

For each, the reading rule is the roadmap's gate table; the four beacon
bars also carry the RUM query or funnel that reads them.

- **Re-run rate.** Two thirds start a new survivor within a day of a
  first death; half after a death that ended a run past 100 game days.
  Query: users with a `beganAgain` within 24 hours of a `died`, over
  users with a `died`; for the second clause, filter the `died` side to
  `died.daysSurvived > 100`.
- **The first run.** A tester completes a first death and starts again
  inside two hours of attention. Runnable query: the first survivor's
  `died` with `attentionMin` at or under 120, followed by a `beganAgain`.
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

## The invite

The text a tester receives, with the link filled in:

> Survidle is a survival game that runs in the browser and saves on the
> device you open it on, so open it on the one you will keep coming back
> to. Start here: `https://jkirsteins.github.io/prototypes/08/?tester=<cohort>`.
> Closing the tab is playing: the world runs on without you, and the game
> tells you what happened when you come back. Your first survivor will
> die, most likely inside the first hour or two, and that is the game
> working; choose the next one off the boat and carry on. After a week
> we will send you a short form. It asks for the id shown beside "share
> anonymous play data" on the settings strip, so note it or leave the
> tab where you can find it. Nothing you type in the game is sent
> anywhere.

The cohort word names the wave, never the person.

## The survey

One form, sent after a week, keyed by the id. Seven questions, in this
order:

1. The id beside "share anonymous play data" on the settings strip.
2. On how many real days did you open the tab?
3. What killed your first survivor?
4. Did you start again after that death? If not, why not?
5. What did you do while the tab was closed: set orders and leave, check
   in between things, or play in one sitting?
6. Would you pay ten dollars for this game? Yes or no. (The pay bar.)
7. Tell the story of one of your survivors, in your own words. (The
   stories bar: an answer here that was not asked for elsewhere is the
   reading.)

## The pre-round pass

Run before the first invite goes out, in this order:

- The four beacon steps at the top of this page, the switch last.
- A build deployed from main, opened on a device that has never seen
  it: it lands on the landing screen with three candidates, a face on
  each, and "next boat" moves the date a week.
- The rules in `docs/ux.md` at 1440 by 900 and at 390 wide with touch
  emulation: the landing screen's cards stack at the phone width, the
  journal card and its copy button sit inside the journal panel, nothing
  scrolls sideways, and the copy button gives the card as plain text
  (where the clipboard is refused, the text opens under the card).
- The away report after a real closed tab: the lines are by the
  survivor's name, the face sits beside the since line, and the log panel
  keeps those lines by name after "Continue".
- `npm test` green and `npm run reference` reporting the April gate.

The pass that closed the survivor's build ran in a headless Chrome over
CDP at both widths: at 1440 by 900 every step above held; at 390 wide the
cards stacked and nothing scrolled sideways, and the thumb sizing under
`(hover: none)` was read from the CSS test rather than the page, since
raw CDP does not trip that media query.

# 06 - Dueling

A 2D HEMA fencing duel prototype: measure and tempo as the whole game.
Spec: `docs/superpowers/specs/2026-08-01-hema-duel-mvp-design.md`.

All horizontal distances are centimeters at human scale: the fighter reads as
a ~175 cm person, the longsword's effective reach is 200 cm, the rapier's
240 cm, steps are 50-60 cm, the void hop 100 cm, and the arena is a ~17 m
piste. The renderer converts at 0.5 canvas px per cm; durations stay in ms.

## Run

From the repo root: `npm run dev`, then open `http://127.0.0.1:4173/prototypes/06/`. Running this prototype's own `npm run dev` from this directory is fine for a quick look (`http://127.0.0.1:5173/prototypes/06/`), but verify through the root server before calling work done.

Boot straight into a matchup with URL params: `/prototypes/06/?p=rapier&e=longsword&mode=1`. Params: `p` and `e` (longsword | rapier), `mode` (0 passive, 1 parry-only,
2 attack-in-place, 3 duelist), `overlay=0` to start with the debug overlay
off, `seed=<n>` to pin the duelist's jitter, `paused=1` to boot frozen at
tick 0, `speed=0.25|0.5|1|2|4` to set the timescale. Each duel otherwise
draws a fresh seed, shown bottom-left with the overlay on, so a fight worth
repeating can be replayed exactly with `?seed=`.

## Controls

- A / D: step back / forward (discrete, buffered)
- S: void (back-hop off the line)
- J: cut (2 tempi), K: thrust (1 tempo)
- L: parry
- 0 / 1 / 2 / 3: AI mode (passive / parry-only / attack-in-place / duelist:
  approaches to narrow measure, strikes, backs off while recovering)
- R: rematch, Esc: sword select, backtick: debug overlay
- Space: pause, . : step one tick (pauses first), [ / ]: slower / faster
  (0.25x to 4x). Actions pressed while paused queue and fire on the next
  stepped tick.
- M: mute audio. Sound starts on the first keypress (browser gesture rule).

## HEMA feature matrix

What the source design doc covers vs what this prototype implements.

| Concept | Status |
|---|---|
| Measure zones (out/wide/narrow) | implemented (per weapon, asymmetric, drawn on the floor) |
| Grappling measure | not in MVP |
| Tempo: committed attacks with readable cascade | implemented (windup/strike/recovery, with rise and stillness marks inside the windup; telegraph tell on AI attacks only) |
| Primo tempo / mezzo tempo / Nachreisen | partial (recognized and named in the event log when they happen; not separate mechanics) |
| Contratempo (strike into strike) | partial (simultaneous strikes resolve, can draw; no geometry advantage) |
| Void | implemented (backward only) |
| Offline/directional void | not in MVP (2D lateral abstraction undecided) |
| Parry (dui tempi) | implemented (resolves to neutral + counter window; no bind state) |
| Bind mini-game, fuehlen, hart/weich | not in MVP |
| Winden / Absetzen / Ringen am Schwert | not in MVP |
| Feints | not in MVP (void/parry decision is therefore not yet live) |
| Recovery windows varying by attack and outcome | implemented (whiff recovery > parried recovery > clean recovery, tested) |
| Multiple attack lines (high/low) | not in MVP |
| Weapons as measure/tempo profiles, not stats | implemented (longsword, rapier) |
| Other weapons (smallsword, spear, dagger, poleaxe, messer) | not in MVP |
| Footwork coupled to weapon | partial (per-weapon step size/duration/cadence; no passing/compass steps) |
| Cut vs thrust distinction | implemented (different timings per weapon; no armor interactions) |
| Half-swording, Mordschlag | not in MVP |
| Matchup asymmetry | partial (reach/tempo asymmetry only; one contested pairing) |
| Enemy movement AI / personalities | partial (mode 3 approaches, strikes from narrow measure, backs off; no personalities) |
| Terrain as matchup tool | not in MVP |
| Audio tempo cues | implemented (windup rise cut off by the beat-stillness, footfalls, one outcome sound per attack: whiff whoosh, clash at blade arrival, or hit - all tied to simulation instants, never keypresses. CC0 assets, see public/audio/manifest.md. M mutes; Safari plays silent) |
| Wall behavior | implemented (fighters cannot overlap or be pushed past arena bounds) |
| Nachreisen vs a parry-ready attacker | partial (the counter beats whiff recovery only when no approach step is needed; step-inclusive tuning is a follow-up) |

## Verifying HEMA behavior solo

Turn the overlay on (default), set mode 2, and check: standing in the enemy's
wide band draws attacks; voiding during its strike produces "misses ->
Nachreisen" and your counter thrust kills into recovery; parrying produces
"parried -> dui tempi" with a tighter window. Mode 1 validates your own
cascade: its parry catches your thrust but leaves it committed on cooldown,
and it ignores attacks thrown from out of measure (a non-threat draws no
reaction). Mode 3 plays the whole loop: watch it close to narrow measure,
strike, and retire out of danger while its attack recovers. To study a
single exchange, pause (space) during the wind-up, queue a parry, and step
(.) through the strike tick by tick: the strike bar's cursor crosses from
the meetable half to the delivered half on the same tick the travelling
frame flips to the delivered pose.

The two weapons read differently by design. A cut shows its slash arc for
exactly the meetable half - meet the sweeping arc; when the arc vanishes
into the delivered pose the window is over. A thrust never shows the point
in flight: it holds the loaded pose through the meetable half and snaps to
full extension the instant the window closes - you meet a thrust during
its preparation, or not at all.

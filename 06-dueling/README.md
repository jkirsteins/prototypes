# 06 - Dueling

A 2D HEMA fencing duel prototype: measure and tempo as the whole game.
Spec: `docs/superpowers/specs/2026-08-01-hema-duel-mvp-design.md`.

## Run

From this directory: `npm run dev`, then open `http://127.0.0.1:5173/prototypes/06/`. Stop the server when done. Boot straight into a matchup: `/prototypes/06/?p=rapier&e=longsword&mode=1`.

## Controls

- A / D: step back / forward (discrete, buffered)
- S: void (back-hop off the line)
- J: cut (2 tempi), K: thrust (1 tempo)
- L: parry
- 0 / 1 / 2: AI mode (passive / parry-only / attack-in-place)
- R: rematch, Esc: sword select, backtick: debug overlay

## HEMA feature matrix

What the source design doc covers vs what this prototype implements.

| Concept | Status |
|---|---|
| Measure zones (out/wide/narrow) | implemented (per weapon, asymmetric, drawn on the floor) |
| Grappling measure | not in MVP |
| Tempo: committed attacks with readable cascade | implemented (windup/beat/strike/recovery; pretempo tell on AI attacks only) |
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
| Enemy movement AI / personalities | not in MVP (dummy modes 0/1/2 only) |
| Terrain as matchup tool | not in MVP |
| Audio tempo cues | not in MVP |
| Wall behavior | implemented (fighters cannot overlap or be pushed past arena bounds) |

## Verifying HEMA behavior solo

Turn the overlay on (default), set mode 2, and check: standing in the enemy's
wide band draws attacks; voiding during its strike produces "misses ->
Nachreisen" and your counter thrust kills into recovery; parrying produces
"parried -> dui tempi" with a tighter window. Mode 1 validates your own
cascade: its parry catches your thrust but leaves it committed on cooldown.

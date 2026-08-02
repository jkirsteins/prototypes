# Audio manifest

All files are Ogg containers, 48000 Hz, one-shots peaking at ~-4 dBFS. All
CC0 - no attribution required anywhere, credits below are a courtesy.
Copied files are OGG Vorbis; files processed here are Ogg Opus (this
machine's ffmpeg has no Vorbis encoder, and Opus decodes in every browser
that decodes Ogg at all - Safari decodes neither, and degrades to a silent
game by design).

There is deliberately no ambient bed and no music: tried, found distracting.

## footstep_01.ogg .. footstep_04.ogg

- Source: "RPG Audio" pack by Kenney Vleugels (Kenney.nl),
  https://kenney.nl/assets/rpg-audio - License: CC0 1.0.
  Copied unmodified from 04-3dtest/assets/audio/footstep_grass_01..04.ogg
  (originals footstep04/05/06/09.ogg, the pack's four softest samples,
  peaks normalized to -4 dBFS there).
- Durations: 0.32 / 0.28 / 0.24 / 0.22 s. Vorbis, stereo.
- Intended use: one per step or void hop, round-robin, with +/- a few
  percent playbackRate jitter for variation.

## whoosh_01.ogg .. whoosh_03.ogg

- Source: synthesized, CC0 (pure-python white noise through a resonant
  state-variable bandpass whose center sweeps up-then-down, 400-2000 /
  500-2600 / 350-1600 Hz, fast-attack long-decay envelope). No third-party
  material.
- Why synthesized: the StarNinjas pack's "attack" samples used here first
  were recorded by moving two knives against each other - spectrally
  identical tails to the clash samples - so a missed swing sounded like
  blade contact. Air must not clang.
- Durations: 0.30 / 0.26 / 0.28 s. Peak ~-4 dBFS. Opus 96 kbps, mono.
- Intended use: a swing that finds no target (whiff).

## clash_01.ogg .. clash_03.ogg

- Source: "20 Sword Sound Effects (Attacks and Clashes)" by StarNinjas,
  https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes
  - License: CC0. Originals sword_clash.5/2/10.ogg - the three most compact
  of the ten clashes.
- Processing: decoded to float (sources are mastered hot, ~+7 dBFS float
  peaks), leading silence trimmed at -45 dB, downmixed to mono, true peak
  normalized to -4 dBFS, 2 ms fade-in against trim clicks. Opus 96 kbps.
  Codec overshoot on the hard transients leaves decoded peaks at
  -2.9..-3.8 dBFS; close enough.
- Durations: 0.54 / 0.81 / 0.65 s.
- Intended use: the guard meets the blade (the engine's "met" tick, the
  instant of contact - not "parried", which resolves half a strike later).

## hit_01.ogg

- Source: "RPG Audio" pack by Kenney Vleugels (see above), CC0, original
  knifeSlice.ogg.
- Processing: as the clashes. Duration 0.52 s. Peak -4 dBFS.
- Intended use: a strike that lands.

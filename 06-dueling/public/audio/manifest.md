# Audio manifest

All files are Ogg containers, 48000 Hz. All CC0 - no attribution required
anywhere, credits below are a courtesy. Copied files are OGG Vorbis; files
processed here are Ogg Opus (this machine's ffmpeg has no Vorbis encoder,
and Opus decodes in every browser that decodes Ogg at all - Safari decodes
neither, and degrades to a silent game by design).

## footstep_01.ogg .. footstep_04.ogg

- Source: "RPG Audio" pack by Kenney Vleugels (Kenney.nl),
  https://kenney.nl/assets/rpg-audio - License: CC0 1.0.
  Copied unmodified from 04-3dtest/assets/audio/footstep_grass_01..04.ogg
  (originals footstep04/05/06/09.ogg, the pack's four softest samples,
  peaks normalized to -4 dBFS there).
- Durations: 0.32 / 0.28 / 0.24 / 0.22 s. Peak -4 dBFS each. Vorbis, stereo.
- Intended use: one per step or void hop, round-robin, with +/- a few
  percent playbackRate jitter for variation.

## whoosh_01.ogg .. whoosh_03.ogg

- Source: "20 Sword Sound Effects (Attacks and Clashes)" by StarNinjas,
  https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes
  - License: CC0. Originals sword.3/4/6.ogg - the three shortest, sharpest
  swings of the pack's ten.
- Processing: decoded to float (sources are mastered hot, ~+6 dBFS float
  peaks), leading silence trimmed at -45 dB, downmixed to mono, true peak
  normalized to -4 dBFS, 2 ms fade-in against trim clicks. Opus 96 kbps.
- Durations: 0.63 / 0.54 / 0.54 s. Peak ~-4 dBFS.
- Intended use: a swing that finds no target (whiff).

## clash_01.ogg .. clash_03.ogg

- Source: same StarNinjas pack, originals sword_clash.5/2/10.ogg - the
  three most compact of the ten clashes.
- Processing: as the whooshes. Codec overshoot on the hard transients
  leaves decoded peaks at -2.9..-3.8 dBFS; close enough.
- Durations: 0.54 / 0.81 / 0.65 s.
- Intended use: blade meets a raised parry.

## hit_01.ogg

- Source: "RPG Audio" pack by Kenney Vleugels (see above), CC0, original
  knifeSlice.ogg.
- Processing: as the whooshes. Duration 0.52 s. Peak -4 dBFS.
- Intended use: a strike that lands.

## ambient_meadow.ogg

- Source: "Park ambiences" by Thimras (OpenGameArt user thimras),
  https://opengameart.org/content/park-ambiences - License: CC0.
  Copied unmodified from 04-3dtest/assets/audio/ambient_meadow.ogg (wind
  high-passed at 60 Hz, distant birds, 12 s equal-power crossfade baked
  into the head for seamless looping).
- Duration: 108.0 s. Peak -12.1 dBFS (deliberately quiet bed). Vorbis.
- Loop: seamless; loop the entire file.
- Intended use: outdoor duel background, played well below the SFX (the
  file is ~8 dB down already; the ambient bus adds more).

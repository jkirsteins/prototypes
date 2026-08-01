# Audio manifest

All files are OGG Vorbis, 48000 Hz, stereo. Total ~2.3 MB. All CC0 - no
attribution required anywhere, credits below are a courtesy.

## footstep_grass_01.ogg .. footstep_grass_04.ogg

- Source: "RPG Audio" pack by Kenney Vleugels (Kenney.nl),
  https://kenney.nl/assets/rpg-audio - License: CC0 1.0.
  Originals: footstep04/05/06/09.ogg - the four softest, darkest samples of
  the pack's ten (picked by spectral centroid ~1.2-1.6 kHz, reads as grass
  scuff rather than hard sole). Peaks normalized to -4 dBFS; otherwise
  untouched.
- Durations: 0.32 / 0.28 / 0.24 / 0.22 s. Peak -4 dBFS each.
- Intended use: third-person walk footsteps on grass. Round-robin or random
  pick per step; add +/- a few percent pitch_scale in Godot for extra
  variation.

## ambient_meadow.ogg

- Source: "Park ambiences" by Thimras (OpenGameArt user thimras),
  https://opengameart.org/content/park-ambiences - License: CC0.
  Built from park_ambience_wind.wav + park_ambience_birds.wav: stable
  low-rumble sections chosen by RMS/low-frequency analysis, wind high-passed
  at 60 Hz, birds high-passed at 150 Hz and rolled off above 6 kHz (distant),
  mixed and level-matched.
- Duration: 108.0 s. Peak -12.1 dBFS (deliberately quiet bed).
- Loop: seamless. The last sample and the first sample are consecutive
  samples of the source material, with a 12 s equal-power crossfade baked
  into the head. Loop the entire file (import with Loop enabled in Godot);
  no loop points needed.
- Intended use: countryside background bed, calm wind through grass with
  distant birdsong.

## title_theme.ogg

- Source: synthesized, CC0 (numpy Karplus-Strong plucked strings, kokle/
  zither character, over a soft D drone pad; noise-impulse convolution
  reverb). No third-party material.
- Duration: 45.2 s, 64 bpm, D aeolian. Peak -3.5 dBFS.
- Loop: has a gentle 3.5 s tail fading to silence and resolves to a D chord,
  so it loops acceptably from silence or can play once over the title card.
- Intended use: title card music. Slow, sparse, melancholic-but-warm.

## Godot notes

- OGG imports as AudioStreamOggVorbis; enable Loop on ambient_meadow.ogg in
  the import dock (loop offset 0).
- Footsteps are one-shots; keep Loop off.
- The ambience is ~9 dB quieter than the footsteps by design; balance with
  bus volume rather than re-normalizing the file.

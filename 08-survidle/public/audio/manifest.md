# Audio manifest

Every file here is Ogg Opus, 64 kbps, mono, 48000 Hz. One-shots are
normalized to a decoded peak of -4 dBFS and loops to -12 dBFS, so a bed
never masks an event; per-slot gains in src/audio/manifest.ts do the rest.
Loops have their seam baked in - the last 2 s of the source is crossfaded
back over the head - so the whole file loops without a click, and they carry
no edge fades that would punch a hole at the wrap. One-shots do carry edge
fades, because their cuts start and end mid-waveform.

Files under "Replace before distribution" are NOT CC0. They are here because
this is an unpublished prototype and the sounds are worth hearing while it is
being built. Two different conditions hide under that one heading, and they
are not equally serious. The BBC RemArc licence covers personal, educational
and research use only, so every BBC file must go before this is shipped, sold
or advertised. The two Wikimedia files are CC BY-SA and may stay, provided
the credit below travels with them and the work that carries them is licensed
alike. The CC0 files carry no condition at all; their credits are a courtesy.

scripts/audio-sources.json and scripts/audio-fetch.mjs rebuild this directory
and the two generated sections of this file from scratch.

## CC0

### open.ogg

- Slot: `open` (loop).
- Source: "Park ambiences" by Thimras, https://opengameart.org/content/park-ambiences, mixed and level-matched in 04-3dtest and taken from there.
- Author: Thimras (OpenGameArt).
- Licence: CC0 1.0.
- URL: repo:04-3dtest/assets/audio/ambient_meadow.ogg
- Processing: cut 20-54 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.1 dBFS.
- Note: wind through grass with distant birdsong: the meadow, heath and fell bed

### step_grass_01.ogg

- Slot: `step_grass` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 04-3dtest/assets/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:04-3dtest/assets/audio/footstep_grass_01.ogg
- Processing: cut 0-0.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.32 s. Decoded peak: -4.1 dBFS.
- Note: soft sole scuff on grass; four of them so a walk does not tick

### step_grass_02.ogg

- Slot: `step_grass` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 04-3dtest/assets/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:04-3dtest/assets/audio/footstep_grass_02.ogg
- Processing: cut 0-0.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.28 s. Decoded peak: -4.0 dBFS.
- Note: soft sole scuff on grass; four of them so a walk does not tick

### step_grass_03.ogg

- Slot: `step_grass` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 04-3dtest/assets/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:04-3dtest/assets/audio/footstep_grass_03.ogg
- Processing: cut 0-0.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.24 s. Decoded peak: -4.2 dBFS.
- Note: soft sole scuff on grass; four of them so a walk does not tick

### step_grass_04.ogg

- Slot: `step_grass` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 04-3dtest/assets/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:04-3dtest/assets/audio/footstep_grass_04.ogg
- Processing: cut 0-0.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.21 s. Decoded peak: -3.9 dBFS.
- Note: soft sole scuff on grass; four of them so a walk does not tick

### step_leaves_01.ogg

- Slot: `step_leaves` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 06-dueling/public/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:06-dueling/public/audio/footstep_01.ogg
- Processing: cut 0-0.5 s, asetrate=48000*0.9,aresample=48000, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.36 s. Decoded peak: -4.1 dBFS.
- Note: the same scuffs pitched down a tenth, which lengthens and darkens them into leaf litter

### step_leaves_02.ogg

- Slot: `step_leaves` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 06-dueling/public/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:06-dueling/public/audio/footstep_02.ogg
- Processing: cut 0-0.5 s, asetrate=48000*0.9,aresample=48000, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.31 s. Decoded peak: -4.0 dBFS.
- Note: the same scuffs pitched down a tenth, which lengthens and darkens them into leaf litter

### step_leaves_03.ogg

- Slot: `step_leaves` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 06-dueling/public/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:06-dueling/public/audio/footstep_03.ogg
- Processing: cut 0-0.5 s, asetrate=48000*0.9,aresample=48000, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.27 s. Decoded peak: -3.9 dBFS.
- Note: the same scuffs pitched down a tenth, which lengthens and darkens them into leaf litter

### step_leaves_04.ogg

- Slot: `step_leaves` (oneshot).
- Source: "RPG Audio" pack by Kenney Vleugels, https://kenney.nl/assets/rpg-audio, already in this repository at 06-dueling/public/audio.
- Author: Kenney Vleugels (Kenney.nl).
- Licence: CC0 1.0.
- URL: repo:06-dueling/public/audio/footstep_04.ogg
- Processing: cut 0-0.5 s, asetrate=48000*0.9,aresample=48000, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.24 s. Decoded peak: -3.8 dBFS.
- Note: the same scuffs pitched down a tenth, which lengthens and darkens them into leaf litter

### knap.ogg

- Slot: `knap` (oneshot).
- Source: "Flint Strike" by Za-Games, Freesound #539973, https://freesound.org/people/Za-Games/sounds/539973/.
- Author: Za-Games (Freesound).
- Licence: CC0 1.0.
- URL: https://cdn.freesound.org/previews/539/539973_12029332-hq.mp3
- Processing: cut 0-0.6 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.60 s. Decoded peak: -4.1 dBFS.
- Note: one struck flake off a core; short, because the crafting loop repeats it about once a second

## Replace before distribution

### forest.ogg

- Slot: `forest` (loop).
- Source: BBC Sound Effects NHU05065069, "Coal tits, goldcrests, treecreepers, robin and wind in the trees. Autumn, early morning. CONIFEROUS FOREST ATMOSPHERE, Quantock Hills, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05065069.mp3
- Processing: cut 40-74 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.1 dBFS.
- Note: spruce and pine, small birds and moving air; no water and no human noise, so it sits under everything else

### lake.ogg

- Slot: `lake` (loop).
- Source: BBC Sound Effects 07012119, "Water lapping on loch shore (Loch Broom, Ullapool)".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07012119.mp3
- Processing: cut 100-134 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.0 dBFS.
- Note: small waves on a freshwater shore, no surf and no gulls

### sea.ogg

- Slot: `sea` (loop).
- Source: BBC Sound Effects NHU05061097, "Waves. SHINGLE BEACH, Minsmere, Suffolk, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05061097.mp3
- Processing: cut 60-94 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.0 dBFS.
- Note: waves dragging back over stones, which is what the coast sounds like here rather than sand

### rain_light.ogg

- Slot: `rain_light` (loop).
- Source: BBC Sound Effects 07043374, "Rain on foliage".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07043374.mp3
- Processing: cut 140-174 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.4 dBFS.
- Note: steady rain landing on leaves, no thunder and no gutter

### rain_heavy.ogg

- Slot: `rain_heavy` (loop).
- Source: BBC Sound Effects 07005210, "Heavy rain, on turf and trees".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07005210.mp3
- Processing: cut 100-134 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.1 dBFS.
- Note: the same weather two grades up, from a different recording so the two rains are not one file at two gains

### fire.ogg

- Slot: `fire` (loop).
- Source: BBC Sound Effects 07025148, "Fire: Roaring wood fire".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07025148.mp3
- Processing: cut 200-234 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -11.9 dBFS.
- Note: a close, dense fire. The small camp fire recorded in Nanda Devi (BBC NHU05008080) reads better but its cracks stand 30 dB over its own crackle, and normalizing that to a -12 dBFS peak leaves the bed inaudible between bangs; this window has the archive's tightest crest

### leaves.ogg

- Slot: `leaves` (loop).
- Source: BBC Sound Effects 07027032, "Weather: Wind in trees".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07027032.mp3
- Processing: cut 120-154 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.1 dBFS.
- Note: the wind layer that rides over the forest bed when it blows

### chorus.ogg

- Slot: `chorus` (loop).
- Source: BBC Sound Effects NHU05104268, "Song thrush, blackbird, wren, carrion crow, hedge sparrow, wood pigeon, robin, rooks, recorded at height of chorus. DAWN CHORUS, Kent, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05104268.mp3
- Processing: cut 120-154 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -12.2 dBFS.
- Note: northern European songbirds at dawn; the distant rooster in the source sits outside the trim window

### insects.ogg

- Slot: `insects` (loop).
- Source: BBC Sound Effects NHU05085169, "Buzzing. STABLE FLIES (STOMOXYS CALCITRANS), Hampshire, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05085169.mp3
- Processing: cut 60-94 s, mono, 48 kHz, peak normalized to -12 dBFS, 2 s loop seam, Opus 64 kbps.
- Duration: 32.00 s. Decoded peak: -11.4 dBFS.
- Note: the summer bog: flies close enough to be a nuisance, which is the point

### step_snow_01.ogg

- Slot: `step_snow` (oneshot).
- Source: BBC Sound Effects NHU05014056, "Cu crunching sounds of individual person walking in snow. Slight wind noise. FOOTSTEPS, Nepal, Himalayas".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05014056.mp3
- Processing: cut 7.8-8.35 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.55 s. Decoded peak: -4.2 dBFS.
- Note: one crunch cut out of a close-miked walk; four consecutive steps, so they differ the way real steps do

### step_snow_02.ogg

- Slot: `step_snow` (oneshot).
- Source: BBC Sound Effects NHU05014056, "Cu crunching sounds of individual person walking in snow. Slight wind noise. FOOTSTEPS, Nepal, Himalayas".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05014056.mp3
- Processing: cut 8.32-8.86 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.54 s. Decoded peak: -3.8 dBFS.
- Note: one crunch cut out of a close-miked walk; four consecutive steps, so they differ the way real steps do

### step_snow_03.ogg

- Slot: `step_snow` (oneshot).
- Source: BBC Sound Effects NHU05014056, "Cu crunching sounds of individual person walking in snow. Slight wind noise. FOOTSTEPS, Nepal, Himalayas".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05014056.mp3
- Processing: cut 9.22-9.76 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.54 s. Decoded peak: -4.3 dBFS.
- Note: one crunch cut out of a close-miked walk; four consecutive steps, so they differ the way real steps do

### step_snow_04.ogg

- Slot: `step_snow` (oneshot).
- Source: BBC Sound Effects NHU05014056, "Cu crunching sounds of individual person walking in snow. Slight wind noise. FOOTSTEPS, Nepal, Himalayas".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05014056.mp3
- Processing: cut 10.06-10.62 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.56 s. Decoded peak: -3.1 dBFS.
- Note: one crunch cut out of a close-miked walk; four consecutive steps, so they differ the way real steps do

### step_bog_01.ogg

- Slot: `step_bog` (oneshot).
- Source: BBC Sound Effects 07041184, "Footsteps, one person walking in mud".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07041184.mp3
- Processing: cut 24.98-25.62 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.64 s. Decoded peak: -4.0 dBFS.
- Note: one suck of wet ground per file

### step_bog_02.ogg

- Slot: `step_bog` (oneshot).
- Source: BBC Sound Effects 07041184, "Footsteps, one person walking in mud".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07041184.mp3
- Processing: cut 25.68-26.32 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.64 s. Decoded peak: -4.1 dBFS.
- Note: one suck of wet ground per file

### step_bog_03.ogg

- Slot: `step_bog` (oneshot).
- Source: BBC Sound Effects 07041184, "Footsteps, one person walking in mud".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07041184.mp3
- Processing: cut 34.98-35.62 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.64 s. Decoded peak: -3.9 dBFS.
- Note: one suck of wet ground per file

### step_bog_04.ogg

- Slot: `step_bog` (oneshot).
- Source: BBC Sound Effects 07041184, "Footsteps, one person walking in mud".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07041184.mp3
- Processing: cut 41.44-42.08 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.64 s. Decoded peak: -3.6 dBFS.
- Note: one suck of wet ground per file

### step_rock_01.ogg

- Slot: `step_rock` (oneshot).
- Source: BBC Sound Effects 07004067, "Footsteps on shingle, 1 man departing".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07004067.mp3
- Processing: cut 0.28-0.86 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -4.6 dBFS.
- Note: loose stone underfoot; the walker recedes through the source, so the four cuts come from its first seven seconds

### step_rock_02.ogg

- Slot: `step_rock` (oneshot).
- Source: BBC Sound Effects 07004067, "Footsteps on shingle, 1 man departing".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07004067.mp3
- Processing: cut 2.96-3.54 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -3.8 dBFS.
- Note: loose stone underfoot; the walker recedes through the source, so the four cuts come from its first seven seconds

### step_rock_03.ogg

- Slot: `step_rock` (oneshot).
- Source: BBC Sound Effects 07004067, "Footsteps on shingle, 1 man departing".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07004067.mp3
- Processing: cut 5.12-5.7 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -7.2 dBFS.
- Note: loose stone underfoot; the walker recedes through the source, so the four cuts come from its first seven seconds

### step_rock_04.ogg

- Slot: `step_rock` (oneshot).
- Source: BBC Sound Effects 07004067, "Footsteps on shingle, 1 man departing".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07004067.mp3
- Processing: cut 6.94-7.52 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -3.4 dBFS.
- Note: loose stone underfoot; the walker recedes through the source, so the four cuts come from its first seven seconds

### step_ice_01.ogg

- Slot: `step_ice` (oneshot).
- Source: BBC Sound Effects 07023335, "Ice: Footsteps on ice, Normal, 1 pair".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07023335.mp3
- Processing: cut 7.34-7.92 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -4.0 dBFS.
- Note: a hard, hollow step; the ring under it is what tells you the lake is not ground

### step_ice_02.ogg

- Slot: `step_ice` (oneshot).
- Source: BBC Sound Effects 07023335, "Ice: Footsteps on ice, Normal, 1 pair".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07023335.mp3
- Processing: cut 8.78-9.32 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.54 s. Decoded peak: -4.0 dBFS.
- Note: a hard, hollow step; the ring under it is what tells you the lake is not ground

### step_ice_03.ogg

- Slot: `step_ice` (oneshot).
- Source: BBC Sound Effects 07023335, "Ice: Footsteps on ice, Normal, 1 pair".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07023335.mp3
- Processing: cut 15.26-15.82 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.56 s. Decoded peak: -4.1 dBFS.
- Note: a hard, hollow step; the ring under it is what tells you the lake is not ground

### step_ice_04.ogg

- Slot: `step_ice` (oneshot).
- Source: BBC Sound Effects 07023335, "Ice: Footsteps on ice, Normal, 1 pair".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07023335.mp3
- Processing: cut 34.16-34.74 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 0.58 s. Decoded peak: -3.9 dBFS.
- Note: a hard, hollow step; the ring under it is what tells you the lake is not ground

### axe_01.ogg

- Slot: `axe` (oneshot).
- Source: BBC Sound Effects 07022331, "Axe, used to chop a tree down".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07022331.mp3
- Processing: cut 16-17 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 1.00 s. Decoded peak: -4.0 dBFS.
- Note: one bite into a standing trunk, with its ring; the felling crash at the end of the source belongs to treeFalls, not here

### axe_02.ogg

- Slot: `axe` (oneshot).
- Source: BBC Sound Effects 07022331, "Axe, used to chop a tree down".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07022331.mp3
- Processing: cut 31.38-32.4 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 1.02 s. Decoded peak: -4.0 dBFS.
- Note: one bite into a standing trunk, with its ring; the felling crash at the end of the source belongs to treeFalls, not here

### axe_03.ogg

- Slot: `axe` (oneshot).
- Source: BBC Sound Effects 07022331, "Axe, used to chop a tree down".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07022331.mp3
- Processing: cut 35.32-36.32 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 1.00 s. Decoded peak: -4.4 dBFS.
- Note: one bite into a standing trunk, with its ring; the felling crash at the end of the source belongs to treeFalls, not here

### treeFalls.ogg

- Slot: `treeFalls` (oneshot).
- Source: BBC Sound Effects 07058031, "Tree falling".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07058031.mp3
- Processing: cut 1.4-7.2 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 5.80 s. Decoded peak: -3.9 dBFS.
- Note: the lean, the tearing, and the ground hit

### arrow.ogg

- Slot: `arrow` (oneshot).
- Source: BBC Sound Effects 07037397, "Archery, bow twang".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07037397.mp3
- Processing: cut 0.9-2.6 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 1.70 s. Decoded peak: -3.7 dBFS.
- Note: the release, not the landing: the cue fires when the shot is taken, hit or miss

### spear.ogg

- Slot: `spear` (oneshot).
- Source: BBC Sound Effects 07044110, "Small splash".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07044110.mp3
- Processing: cut 0.2-2.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 2.30 s. Decoded peak: -3.7 dBFS.
- Note: the fishing spear going into water; the cue is a cast at a fish from the shore, so a splash is the sound and not an impact

### fireCatches.ogg

- Slot: `fireCatches` (oneshot).
- Source: BBC Sound Effects 07059049, "Match struck - open fire lit, crackle of flame".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07059049.mp3
- Processing: cut 0-4.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 4.50 s. Decoded peak: -4.0 dBFS.
- Note: the strike and the tinder taking, which is what the log line says happens

### torchLit.ogg

- Slot: `torchLit` (oneshot).
- Source: BBC Sound Effects 07054185, "Building coal fire using paper, kindling & bellows".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07054185.mp3
- Processing: cut 7.5-11 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 3.50 s. Decoded peak: -4.0 dBFS.
- Note: kindling flaring; a smaller, faster catch than the camp fire's, from a different recording so the two moments do not share a file

### iceCracks.ogg

- Slot: `iceCracks` (oneshot).
- Source: BBC Sound Effects 07071025, "Ice creaking and cracking - 1972 (7K, reprocessed)".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07071025.mp3
- Processing: cut 4.8-9.4 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 4.60 s. Decoded peak: -3.9 dBFS.
- Note: the warning underfoot; a library effect rather than a field recording, and it reads as ice

### fallThrough.ogg

- Slot: `fallThrough` (oneshot).
- Source: BBC Sound Effects 07044109, "Large splash".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07044109.mp3
- Processing: cut 0.3-3 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 2.70 s. Decoded peak: -3.8 dBFS.
- Note: going through the ice: one heavy entry and the water closing

### toolBreaks.ogg

- Slot: `toolBreaks` (oneshot).
- Source: BBC Sound Effects 07039201, "Wood splintering".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/07039201.mp3
- Processing: cut 3.35-5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 1.65 s. Decoded peak: -4.0 dBFS.
- Note: a haft or a bow giving way

### wolves.ogg

- Slot: `wolves` (oneshot).
- Source: BBC Sound Effects NHU05102193, "Wolves howling. EUROPEAN WOLF (CANIS LUPUS), London Zoo, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05102193.mp3
- Processing: cut 27.5-36.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 9.00 s. Decoded peak: -3.8 dBFS.
- Note: the pack, not the single animal: this is the danger cue, so several voices at once

### wolf.ogg

- Slot: `wolf` (oneshot).
- Source: BBC Sound Effects NHU05078128, "Howls. WOLF (CANIS LUPUS)".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05078128.mp3
- Processing: cut 24.6-31 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 6.40 s. Decoded peak: -4.0 dBFS.
- Note: one long howl from a single animal, which is the night call rather than the pack alarm

### loon.ogg

- Slot: `loon` (oneshot).
- Source: BBC Sound Effects NHU05054192, "MCU calls and snatch of song at end, from a bird in water with chicks. BLACK-THROATED DIVER (GAVIA ARCTICA), Yukon Delta, Alaska".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05054192.mp3
- Processing: cut 6.5-11 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 4.50 s. Decoded peak: -3.7 dBFS.
- Note: the exact species the catalogue names

### cuckoo.ogg

- Slot: `cuckoo` (oneshot).
- Source: BBC Sound Effects NHU2065479, "Territorial call very close. COMMON CUCKOO (CUCULUS CANORUS), Notts, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU2065479.mp3
- Processing: cut 4.6-9.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 4.90 s. Decoded peak: -4.0 dBFS.
- Note: three calls; the bird repeats for minutes, so any window is representative

### raven.ogg

- Slot: `raven` (oneshot).
- Source: BBC Sound Effects NHU10392060, "Calls of single bird. RAVEN (CORVUS CORAX), Queen Charlotte Islands, Canada".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU10392060.mp3
- Processing: cut 0.2-6 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 5.80 s. Decoded peak: -4.4 dBFS.
- Note: one bird, no flock, no other species behind it

### owl.ogg

- Slot: `owl` (oneshot).
- Source: BBC Sound Effects NHU05085052, "Hoots. TAWNY OWL (STRIX ALUCO SYLVATICA), Inverness".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05085052.mp3
- Processing: cut 44.6-47.6 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 3.00 s. Decoded peak: -3.9 dBFS.
- Note: the catalogue's bird is the Ural owl; no Ural owl recording was found and the tawny is the nearest Strix on offer, with the same hooting shape

### crane.ogg

- Slot: `crane` (oneshot).
- Source: Wikimedia Commons, "Grus grus - Common Crane XC596509" (xeno-canto XC596509), https://commons.wikimedia.org/wiki/File:Grus_grus_-_Common_Crane_XC596509.mp3.
- Author: Benoit Van Hecke.
- Licence: CC BY-SA 4.0.
- URL: https://upload.wikimedia.org/wikipedia/commons/7/78/Grus_grus_-_Common_Crane_XC596509.mp3
- Processing: cut 2-9 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 7.00 s. Decoded peak: -3.9 dBFS.
- Note: the exact species; the BBC archive had only sandhill, whooping and Manchurian cranes

### goose.ogg

- Slot: `goose` (oneshot).
- Source: BBC Sound Effects NHU05079247, "Calls, with pink footed goose. GREYLAG GOOSE (ANSER ANSER), Kinross, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05079247.mp3
- Processing: cut 4.5-12 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 7.50 s. Decoded peak: -4.4 dBFS.
- Note: the catalogue's bird is the bean goose; greylag and pink-footed are the same genus and the same overflight racket, and no bean goose recording turned up

### capercaillie.ogg

- Slot: `capercaillie` (oneshot).
- Source: BBC Sound Effects NHU05016207, "Vcu display from male with guttural grunting calls. Also some wing beats. WESTERN CAPERCAILLIE (TETRAO UROGALLUS), Abernethy Forest, Scotland".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05016207.mp3
- Processing: cut 27.5-35 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 7.50 s. Decoded peak: -4.4 dBFS.
- Note: the lek display, which is what the sim plays in February to April

### blackGrouse.ogg

- Slot: `blackGrouse` (oneshot).
- Source: BBC Sound Effects NHU05078202, "Coos at lek. BLACK GROUSE (TETRAO TETRIX BRITANNICUS), Perthshire, Scotland".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05078202.mp3
- Processing: cut 58.5-66.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 8.00 s. Decoded peak: -4.1 dBFS.
- Note: the bubbling rookooing of a lek

### willowGrouse.ogg

- Slot: `willowGrouse` (oneshot).
- Source: BBC Sound Effects NHU05069086, "CU calls, howling wind in b/g. WILLOW GROUSE (LAGOPUS LAGOPUS), Hudson Bay, Manitoba, Canada".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05069086.mp3
- Processing: cut 10.5-14.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 4.00 s. Decoded peak: -4.0 dBFS.
- Note: the exact species; the wind behind it suits the bog and birch scrub it is heard from

### ptarmigan.ogg

- Slot: `ptarmigan` (oneshot).
- Source: BBC Sound Effects NHU05019225, "Mcu call from a male on the ground. PTARMIGAN (LAGOPUS MUTUS), Cairn Gorm, Scotland".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05019225.mp3
- Processing: cut 7.5-10.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 3.00 s. Decoded peak: -4.1 dBFS.
- Note: the exact species, on the fell where the sim puts it

### mallard.ogg

- Slot: `mallard` (oneshot).
- Source: BBC Sound Effects NHU05012018, "Cu male calling as it takes off, with wind in bushes. MALLARD (ANAS PLATYRHYNCHOS), Norfolk Broads, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05012018.mp3
- Processing: cut 2.5-9 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 6.50 s. Decoded peak: -4.3 dBFS.
- Note: the exact species

### eider.ogg

- Slot: `eider` (oneshot).
- Source: BBC Sound Effects NHU05028028, "Males & females calling mcu. Waves breaking on shore md. COMMON EIDER (SOMATERIA MOLLISSIMA), Shetland".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05028028.mp3
- Processing: cut 9.3-16 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 6.70 s. Decoded peak: -4.0 dBFS.
- Note: the exact species, and the surf behind it belongs where eiders are heard

### elk.ogg

- Slot: `elk` (oneshot).
- Source: BBC Sound Effects NHU05095061, "Grunting, groaning and trotting. EUROPEAN ELK or MOOSE (ALCES ALCES), Bialowieza Forest, Poland".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05095061.mp3
- Processing: cut 11.3-15 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 3.70 s. Decoded peak: -4.0 dBFS.
- Note: Alces alces in a European forest, not a red deer roaring

### fox.ogg

- Slot: `fox` (oneshot).
- Source: BBC Sound Effects NHU05079185, "Vixen barking and trotting. RED FOX (VULPES VULPES), Surrey, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05079185.mp3
- Processing: cut 27.4-30.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 3.10 s. Decoded peak: -3.6 dBFS.
- Note: the winter barking the sim plays in November to January

### woodpecker.ogg

- Slot: `woodpecker` (oneshot).
- Source: Wikimedia Commons, "Great Spotted Woodpecker drum.ogg", https://commons.wikimedia.org/wiki/File:Great_Spotted_Woodpecker_drum.ogg.
- Author: T. Voekler (Wikimedia user Teacoolish).
- Licence: CC BY-SA 3.0.
- URL: https://upload.wikimedia.org/wikipedia/commons/4/40/Great_Spotted_Woodpecker_drum.ogg
- Processing: cut 0-5.5 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 5.50 s. Decoded peak: -3.8 dBFS.
- Note: drumming rather than calling, which is the February to April sound the sim schedules

### squirrel.ogg

- Slot: `squirrel` (oneshot).
- Source: BBC Sound Effects NHU05104155, "Scolding. RED SQUIRREL (SCIURUS VULGARIS), Suffolk, UK".
- Author: BBC Archive.
- Licence: BBC RemArc (personal, educational and research use only).
- URL: https://sound-effects-media.bbcrewind.co.uk/mp3/NHU05104155.mp3
- Processing: cut 16.5-23 s, mono, 48 kHz, peak normalized to -4 dBFS, Opus 64 kbps.
- Duration: 6.50 s. Decoded peak: -3.8 dBFS.
- Note: the exact species, scolding from a branch

## Silent slots

None. Every slot in src/audio/manifest.ts has at least one file, so nothing
was deleted from SLOTS or from the KnownSlot union.

Four slots came close to staying silent, and what they got is worth knowing:

- `spear` is a fishing spear cast at a fish from the shore, not a thrown
  weapon. Searches for a spear or javelin found nothing in the BBC archive but
  aircraft reverse thrust; reading the cue site in src/sim/tasks.ts settled it
  as a splash, and a splash is what it plays.
- `torchLit` has no recording of a resin brand catching anywhere that was
  searched. The fireplace recording that gives `fireCatches` its match strike
  would have served, but then the camp fire and the torch would be the same
  file; a separate recording of kindling flaring was used instead.
- `knap` found nothing in the BBC archive (its stone results are quarries and
  masons' chisels) and nothing on Wikimedia Commons, whose "knapping" hits are
  all pronunciation clips of the word. The Freesound flint strike is CC0 and
  is one struck stone, which is the sound.
- `owl` is a Ural owl in the catalogue and a tawny owl here, and `goose` is a
  bean goose in the catalogue and a greylag here. Both are the nearest
  relative on offer with the same call shape. `crane` did NOT settle for the
  nearest relative: the BBC archive has only sandhill, whooping and Manchurian
  cranes, so the common crane came from Wikimedia instead.

One deliberate downgrade: `step_leaves` is the CC0 Kenney grass scuffs pitched
down a tenth rather than a recording of someone walking through leaf litter.
BBC 07041195 ("Footsteps, walking through leaves & undergrowth") is that
recording and is the upgrade to make if the pitched copies do not convince;
they were kept because they are CC0 and unambiguously read as footsteps.

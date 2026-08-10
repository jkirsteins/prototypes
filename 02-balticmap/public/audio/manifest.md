# Audio provenance

Every file here is CC0 (Creative Commons Zero - public domain, no attribution
required), sourced from Kenney's asset packs at https://kenney.nl. Processing
applied to each, via ffmpeg 8: trim leading/trailing silence at -45 dB, mono
downmix, 2 ms fade-in, loudness normalize to -18 LUFS with a -3 dBFS true-peak
ceiling, encode to mp3 (libmp3lame -q:a 5). Mp3 rather than ogg because Safari
decodes no Vorbis; a silent game on one browser is a bug, not a tradeoff.

| file | source pack | source file | used for |
| --- | --- | --- | --- |
| card-draw.mp3 | RPG Audio | bookFlip2.ogg | a card drawn |
| card-play.mp3 | RPG Audio | bookPlace1.ogg | a card played |
| shuffle.mp3 | RPG Audio | bookOpen.ogg | the discard reshuffled |
| discard.mp3 | RPG Audio | cloth1.ogg | a card discarded |
| harvest.mp3 | RPG Audio | chop.ogg | a Turnip harvest earned |
| confirm.mp3 | Interface Sounds | confirmation_001.ogg | a harvest boon picked |
| burn.mp3 | Interface Sounds | scratch_002.ogg | a card destroyed by the harvest |
| clash.mp3 | Impact Sounds | impactMetal_medium_000.ogg | a march landing (metal on metal) |
| hammer.mp3 | Impact Sounds | impactMining_000.ogg | defenses restored (pick on stone) |
| rustle.mp3 | Impact Sounds | footstep_grass_002.ogg | wild lands growing back |
| bell.mp3 | Impact Sounds | impactBell_heavy_000.ogg | a land subjugated |
| bell-heavy.mp3 | Impact Sounds | impactBell_heavy_002.ogg | a land annexed outright |
| door.mp3 | RPG Audio | doorOpen_1.ogg | a vassal freed / independence |
| coins.mp3 | RPG Audio | handleCoins.ogg | tribute paid |
| build.mp3 | Impact Sounds | impactWood_medium_000.ogg | a settlement founded |
| march.mp3 | RPG Audio | footstep05.ogg | defenders marching over |
| disease.mp3 | RPG Audio | creak1.ogg | disease seeded (an ominous creak) |
| plague.mp3 | Impact Sounds | impactSoft_heavy_000.ogg | a plague cashing its stacks |
| winds.mp3 | RPG Audio | cloth4.ogg | the winds shifting stacks |
| victory.mp3 | Music Jingles | Steel jingles/jingles_STEEL14.ogg | a won run (rising) |
| defeat.mp3 | Music Jingles | Steel jingles/jingles_STEEL07.ogg | a lost run (falling) |
| fanfare-grand.mp3 | Music Jingles | Steel jingles/jingles_STEEL06.ogg | the map unified (rising, longer) |

Pack pages (all CC0): https://kenney.nl/assets/rpg-audio,
https://kenney.nl/assets/impact-sounds, https://kenney.nl/assets/interface-sounds,
https://kenney.nl/assets/music-jingles.

The jingle picks were made by pitch-trend analysis (FFT over first vs last
third), not by ear: STEEL14/STEEL06 rise, STEEL07 falls. If one sounds wrong in
play, audition neighbours from the same pack - rising: STEEL01/06/14/15,
falling: STEEL03/07/13.

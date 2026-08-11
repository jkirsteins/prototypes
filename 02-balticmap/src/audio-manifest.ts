/** Pure data: which sounds exist and which event plays which. No DOM and no
 *  AudioContext, so tests can assert over it in the default node environment.
 *
 *  `EVENT_SOUNDS` is exhaustive over `GameEventType` - the `NOTICE_RULES`
 *  shape - so a new event type does not compile until somebody decides what
 *  it sounds like, or writes down (in `REPLAY_RULES`, which classifies the
 *  same types) why it is silent. A null here is a decision, not a default.
 *
 *  Files live in `public/audio/`, CC0, provenance in that directory's
 *  manifest.md. Mp3 rather than ogg: Safari decodes no Vorbis, and a silent
 *  game on one browser reads as broken sound, not a codec tradeoff. */

import type { GameEventType } from "./game";

export type SoundName =
  | "card-draw" | "card-play" | "shuffle" | "discard"
  | "harvest" | "confirm" | "burn"
  | "clash" | "hammer" | "rustle"
  | "bell" | "bell-heavy" | "door" | "coins" | "build" | "march"
  | "disease" | "plague" | "winds"
  | "victory" | "defeat" | "fanfare-grand";

export const SOUNDS: Record<SoundName, string> = {
  "card-draw": "card-draw.mp3",
  "card-play": "card-play.mp3",
  shuffle: "shuffle.mp3",
  discard: "discard.mp3",
  harvest: "harvest.mp3",
  confirm: "confirm.mp3",
  burn: "burn.mp3",
  clash: "clash.mp3",
  hammer: "hammer.mp3",
  rustle: "rustle.mp3",
  bell: "bell.mp3",
  "bell-heavy": "bell-heavy.mp3",
  door: "door.mp3",
  coins: "coins.mp3",
  build: "build.mp3",
  march: "march.mp3",
  disease: "disease.mp3",
  plague: "plague.mp3",
  winds: "winds.mp3",
  victory: "victory.mp3",
  defeat: "defeat.mp3",
  "fanfare-grand": "fanfare-grand.mp3",
};

/** What each event sounds like, wherever it is played from - a replay step,
 *  the HUD's own draw/play animations, or the ending screens. One table, so a
 *  raid cannot clang in the replay and thud in a future surface.
 *
 *  A null names an event whose moment on screen is owned by ANOTHER line of
 *  this table or by no moment at all; `REPLAY_RULES` carries the sentence
 *  saying which. */
export const EVENT_SOUNDS: Record<GameEventType, SoundName | null> = {
  draw: "card-draw",
  play: "card-play",
  reshuffle: "shuffle",
  discard: "discard",
  subjugated: "bell",
  released: "door",
  incorporated: "bell-heavy",
  independence: "door",
  tribute: "coins",
  settled: "build",
  healed: "hammer",
  transferred: "march",
  "disease-spread": "disease",
  plagued: "plague",
  "winds-shifted": "winds",
  // The consequence line under it carries the sound; two sounds for one
  // moment would stack.
  "passive-fired": null,
  // The play that drew the arrow flies its own card and cues "card-play";
  // a second sound for the same moment would stack.
  "march-declared": null,
  "march-resolved": "clash",
  // Nothing landed and no score moved - an arrow evaporating is the log's
  // news, not the ear's.
  "march-lapsed": null,
  "harvest-earned": "harvest",
  "harvest-picked": "confirm",
  "harvest-burned": "burn",
  victory: "victory",
  // Taking a won run back off the shelf. The player chose it and is looking
  // at the button they clicked; a fanfare for un-winning says the wrong
  // thing, and `cueEndingIfAny` re-arms so the NEXT ending still sounds.
  "played-on": null,
  defeat: "defeat",
  unified: "fanfare-grand",
  surrendered: "defeat",
};

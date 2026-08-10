import { describe, it, expect } from "vitest";
import { EVENT_SOUNDS, SOUNDS } from "../src/audio-manifest";
import { REPLAY_RULES } from "../src/replay";

// Vite's glob import rather than node:fs - this project ships no node types,
// and the transform runs identically under vitest. `?raw` decodes the file as
// text, which mangles the audio body but leaves the ID3 magic readable, and
// readable is all a presence-and-format check needs.
const shipped = import.meta.glob("../public/audio/*.mp3", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("audio manifest", () => {
  it("every named sound is a shipped mp3", () => {
    // A renamed or missing asset fails here, at test time, instead of as one
    // console warning in production and a silently soundless event.
    for (const file of Object.values(SOUNDS)) {
      const key = Object.keys(shipped).find((k) => k.endsWith(`/audio/${file}`));
      expect(key, `${file} is named in SOUNDS but not shipped`).toBeDefined();
      expect(shipped[key!].startsWith("ID3"), `${file} is not an mp3`).toBe(true);
    }
  });

  it("a silent event is one the replay passes over", () => {
    // The exhaustive Records already refuse to compile on a new event type;
    // this pins the runtime relationship between the two tables: an event
    // with no sound must be one whose passed-over reason says where its
    // moment went - a shown step with nothing to play is a decision nobody
    // made.
    for (const [type, sound] of Object.entries(EVENT_SOUNDS)) {
      if (sound !== null) continue;
      const rule = REPLAY_RULES[type as keyof typeof REPLAY_RULES];
      expect(rule.kind, `${type} is silent but not passed over`).toBe(
        "passed-over",
      );
    }
  });
});

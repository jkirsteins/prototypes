import { describe, it, expect } from "vitest";
import { SOUNDS } from "../src/audio-manifest";

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

  // What a null in `EVENT_SOUNDS` has to answer for - either no moment on
  // screen at all, or a beat that names its own sound - is pinned in
  // tests/presentation.test.ts, where the classifier's context is already
  // built. The two tables are exhaustive over the same type, so the
  // relationship between them belongs to whichever test can build a beat.
});

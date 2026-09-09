/**
 * innerHTML has one home.
 *
 * The morphing renderer is what keeps a scroll position, a caret and the
 * button under the pointer alive across a redraw: setPanel walks the old
 * nodes against the new and moves, changes and drops rather than
 * replacing. One hand-rolled assignment to innerHTML throws all of that
 * away for the panel it is in, silently, and reads like ordinary code.
 *
 * So there is exactly one place allowed to write it, and this is the test
 * that says so rather than a comment nobody reads at the moment they are
 * about to break it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The renderer itself: the morph has to parse the markup it is given somewhere. */
const ALLOWED = new Set(["render.ts"]);

const ASSIGN = /\.innerHTML\s*=/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : [],
  );
}

describe("innerHTML has one home", () => {
  it("nothing under src/ui assigns innerHTML except the renderer", () => {
    const offenders = filesUnder("src/ui")
      .filter((f) => !ALLOWED.has(f.split("/").pop() as string))
      .filter((f) => ASSIGN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("main.ts assigns it once, for the legend written at startup", () => {
    // Static markup, written once before the first frame, and the one
    // exemption. A second assignment here is a panel that stopped morphing.
    const hits = readFileSync("src/main.ts", "utf8").match(/\.innerHTML\s*=/g) ?? [];
    expect(hits.length).toBe(1);
  });
});

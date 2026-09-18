import { describe, expect, it } from "vitest";
import { resolveWorld } from "../src/sync/address";

const draw = () => "hare-pine-frost";

describe("the world in the address", () => {
  it("keeps the world the address names, and stores nothing new when it is this browser's", () => {
    const a = resolveWorld("?w=heron-pine-ember", "heron-pine-ember", draw);
    expect(a).toEqual({ code: "heron-pine-ember", search: "?w=heron-pine-ember", rewrite: false, switched: false });
  });

  it("switches to the world the address names when this browser had another", () => {
    const a = resolveWorld("?w=heron-pine-ember", "mud-crag-rhyme", draw);
    expect(a.code).toBe("heron-pine-ember");
    expect(a.switched).toBe(true);
    expect(a.rewrite).toBe(false);
  });

  it("goes to this browser's world when the address names none, and writes it in", () => {
    expect(resolveWorld("", "mud-crag-rhyme", draw)).toEqual({ code: "mud-crag-rhyme", search: "?w=mud-crag-rhyme", rewrite: true, switched: false });
  });

  it("draws a new world for a browser with none and an address with none", () => {
    expect(resolveWorld("", null, draw)).toEqual({ code: "hare-pine-frost", search: "?w=hare-pine-frost", rewrite: true, switched: false });
  });

  it("reads a typo as no world, keeps every other parameter, and rewrites the first build's ?sync=", () => {
    const typo = resolveWorld("?w=heron-pine-notaword&debug", "mud-crag-rhyme", draw);
    expect(typo.code).toBe("mud-crag-rhyme");
    expect(typo.search).toBe("?w=mud-crag-rhyme&debug=");
    expect(typo.rewrite).toBe(true);
    const legacy = resolveWorld("?sync=Heron-Pine-EMBER", null, draw);
    expect(legacy).toEqual({ code: "heron-pine-ember", search: "?w=heron-pine-ember", rewrite: true, switched: false });
  });
});

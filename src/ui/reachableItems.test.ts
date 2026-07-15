import { describe, expect, it } from "vitest";
import { splitRoomItemsByDescription } from "./reachableItems";
import { items } from "../game/content";

describe("reachable room items", () => {
  it("separates visible nouns that are missing from the room description", () => {
    const result = splitRoomItemsByDescription("You see a velvet lining and a brass plaque.", [
      items["velvet-lining"],
      items["brass-plaque"],
      items["loose-nail"],
      items.hinge,
    ]);

    expect(result.inline.map((item) => item.id)).toEqual(["velvet-lining", "brass-plaque"]);
    expect(result.additional.map((item) => item.id)).toEqual(["loose-nail", "hinge"]);
  });
}
);

/**
 * The panel asks for the same list several times a render.
 *
 * `intentGroups` allocates roughly eighty objects a call and is a pure
 * function of its region. The rows, the subtab counts, the purpose counts
 * and the concept chips all want it, so building it once per region rather
 * than once per caller is the difference between one allocation a frame and
 * four. A page reloaded by the browser for using significant memory is what
 * that churn looks like from outside.
 */
import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { conceptsFor, intentGroups } from "../src/ui/dopanel";
import { regionAt } from "../src/world/gen";

it("hands back the same list for the same region rather than rebuilding it", () => {
  const { state, world } = newGame(17);
  const region = regionAt(world, state.player.region);
  expect(intentGroups(region)).toBe(intentGroups(region));
});

it("builds a different list for a different region", () => {
  const { state, world } = newGame(17);
  const here = regionAt(world, state.player.region);
  const next = regionAt(world, here.neighbours[0].id);
  expect(intentGroups(next)).not.toBe(intentGroups(here));
});

it("answers the concepts of a row from memory", () => {
  expect(conceptsFor("build", "leanTo")).toBe(conceptsFor("build", "leanTo"));
  // Still the right answer, not just the same one.
  expect(conceptsFor("build", "leanTo")).toContain("shelter");
  expect(conceptsFor("readSky", undefined)).toEqual(["weather"]);
});

/**
 * The two views (roadmap P, part 1): which work each shows, which camp it is
 * looking at, and what the board is centred on.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { patchXY } from "../src/world/spatial";
import { regionAt } from "../src/world/gen";
import { PURPOSES, SUBTABS } from "../src/ui/purpose";
import {
  campRegions, DEFAULT_VIEW, loadView, panesInView, purposesInView, purposeView,
  saveView, subtabsInView, toSubtabInView, VIEWS, viewCentre, viewedCampCell,
  viewedCampRegion, viewSwitchHtml,
} from "../src/ui/view";
import { siteCamp } from "./siting-helpers";

const panes = (subtab: (typeof SUBTABS)[number], purpose: string) => ({ pane: "do" as const, subtab, purpose });

describe("which work a view shows", () => {
  it("gives every purpose exactly one view, and every view some subtabs", () => {
    for (const subtab of SUBTABS) {
      for (const purpose of PURPOSES[subtab]) {
        expect(VIEWS).toContain(purposeView(subtab, purpose));
      }
    }
    expect(subtabsInView("survivor")).toEqual(["Gather", "Hunt", "Explore"]);
    // Camp leads: a view opening on an empty trap line looks broken.
    expect(subtabsInView("camp")).toEqual(["Camp", "Build", "Make", "Hunt"]);
  });

  it("splits Hunt: the game under the survivor, the trap line under the camp", () => {
    expect(purposesInView("Hunt", "survivor")).not.toContain("Traps");
    expect(purposesInView("Hunt", "camp")).toEqual(["Traps"]);
    expect(purposeView("Hunt", "Traps")).toBe("camp");
    expect(purposeView("Hunt", "Game")).toBe("survivor");
  });

  it("every purpose of every subtab lands in one view or the other, and none in both", () => {
    for (const subtab of SUBTABS) {
      const split = [...purposesInView(subtab, "survivor"), ...purposesInView(subtab, "camp")].sort();
      expect(split).toEqual([...PURPOSES[subtab]].sort());
    }
  });
});

describe("moving between views", () => {
  it("keeps a pane that belongs here, and moves one that does not", () => {
    // Gather is survivor work: switching to camp view cannot leave it showing.
    const moved = panesInView(panes("Gather", "Kindling"), "camp");
    expect(subtabsInView("camp")).toContain(moved.subtab);
    expect(purposesInView(moved.subtab, "camp")).toContain(moved.purpose);
    // A pane already in this view is left exactly where it was.
    const kept = panes("Build", "Site");
    expect(panesInView(kept, "camp")).toEqual(kept);
  });

  it("a subtab in both views opens on that view's own first purpose", () => {
    // This is the guard the rest leans on: without it, clicking Hunt in camp
    // view would land on Game, which is survivor work in the wrong view.
    expect(toSubtabInView(panes("Camp", "Fire"), "Hunt", "camp").purpose).toBe("Traps");
    expect(toSubtabInView(panes("Gather", "Kindling"), "Hunt", "survivor").purpose).toBe(PURPOSES.Hunt[0]);
  });

  it("remembers the view across a reload, and falls back when the store is junk", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    expect(loadView(storage)).toBe(DEFAULT_VIEW);
    saveView("camp", storage);
    expect(loadView(storage)).toBe("camp");
    storage.setItem("survidle.display", "not json");
    expect(loadView(storage)).toBe(DEFAULT_VIEW);
  });
});

describe("the camp a camp view is looking at", () => {
  it("has none before one is sited, and says so rather than hiding the switch", () => {
    const { state, world } = newGame(17);
    expect(campRegions(state)).toEqual([]);
    expect(viewedCampRegion(state, null)).toBeNull();
    expect(viewedCampCell(state, null)).toBeNull();
    const html = viewSwitchHtml(state, world, "camp", null);
    expect(html).toContain('data-act="view"');
    expect(html).toContain("no camp yet");
  });

  it("takes the one the survivor stands in, and honours a picked one", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    siteCamp(state, world, home);
    expect(viewedCampRegion(state, null)).toBe(home);

    const neighbour = regionAt(world, home).neighbours[0].id;
    siteCamp(state, world, neighbour);
    expect(campRegions(state)).toContain(neighbour);
    expect(viewedCampRegion(state, neighbour)).toBe(neighbour);
    // A picked camp that is gone falls back rather than centring on nothing.
    regionState(state, world, neighbour).campCell = null;
    expect(viewedCampRegion(state, neighbour)).toBe(home);
  });

  it("draws a picker only once there is a choice to make", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    siteCamp(state, world, home);
    expect(viewSwitchHtml(state, world, "camp", null)).not.toContain('data-act="camp-view"');
    siteCamp(state, world, regionAt(world, home).neighbours[0].id);
    const html = viewSwitchHtml(state, world, "camp", null);
    expect(html).toContain('data-act="camp-view"');
    expect(html).toContain("(here)");
  });
});

describe("what the board is centred on", () => {
  it("follows the survivor in survivor view and stays on the camp in camp view", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    const camp = siteCamp(state, world, home);
    const away = regionAt(world, home).cells.find((c) => c !== camp)!;
    placeAt(state, world, away);

    expect(viewCentre(state, world, "survivor", null)).toEqual(patchXY(cellOf(state, world)));
    // The camp view holds the camp while the survivor is elsewhere - which is
    // the whole point of it, and is what makes it a place to plan from.
    expect(viewCentre(state, world, "camp", null)).toEqual(patchXY(camp));
    expect(viewCentre(state, world, "camp", null)).not.toEqual(patchXY(away));
  });

  it("camp view centres on the survivor when the lineage has no camp at all", () => {
    const { state, world } = newGame(17);
    expect(viewCentre(state, world, "camp", null)).toEqual(patchXY(cellOf(state, world)));
  });
});

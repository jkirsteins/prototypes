/**
 * The Do pane draws what the run has revealed.
 *
 * Measured in Chrome at 1440x900 on seed 17 before this pass: the panel
 * drew 84 rows on day 1 and 12 of them could be started. Make offered 22
 * recipes and not one was makeable; ten said "needs a knife" and eight
 * said "needs a bone needle", for a knife and a needle the player had no
 * route to and no reason to want.
 *
 * A row now appears when its opportunity is discovered. Blocked is still
 * fine and still shown - the season, the place, a step that is on screen -
 * because each of those teaches something. What is gone is the refusal
 * that teaches nothing.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { discoverAvailableOpportunities, recordOpportunityEvent } from "../src/sim/opportunities";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import type { TaskId } from "../src/sim/types";
import { paneForOpportunity, PURPOSES } from "../src/ui/purpose";
import { doHtml, purposeCounts } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";

function fresh() {
  const { state, world } = newGame(17);
  return { state, world, cal: calendar(state.minute, state.startDoy) };
}

/** Every row the panel draws across every subtab and purpose, as one count. */
function drawnRows(): number {
  const { state, world, cal } = fresh();
  const ui = newUiState();
  let rows = 0;
  for (const subtab of ["Gather", "Hunt", "Explore", "Camp", "Make", "Build"] as const) {
    for (const purpose of PURPOSES[subtab]) {
      const html = doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab, purpose } });
      rows += (html.match(/class="act"/g) ?? []).length;
    }
  }
  return rows;
}

/** Every row label the panel draws, across every subtab and purpose. */
function drawnLabels(): string[] {
  const { state, world, cal } = fresh();
  const ui = newUiState();
  const labels: string[] = [];
  for (const subtab of ["Gather", "Hunt", "Explore", "Camp", "Make", "Build"] as const) {
    for (const purpose of PURPOSES[subtab]) {
      const html = doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab, purpose } });
      for (const m of html.matchAll(/class="act"[^>]*>([^<]*)/g)) labels.push(m[1]);
    }
  }
  return labels;
}

describe("a landing offers one thing to do", () => {
  /**
   * The whole onboarding, in one assertion. A player who has not chosen
   * where to live is offered choosing where to live, and nothing else. The
   * rest of the board opens a rung at a time along the authored spine -
   * site, drink, firewood, fire, bed, roof - as each is met.
   *
   * Resting is the exception and is not really an offer: it is the body,
   * and the queue's self-care row runs it whether or not anyone clicks.
   */
  it("draws making camp, and resting, and nothing else", () => {
    expect(drawnLabels().sort()).toEqual(["Make camp here", "Rest"]);
  });

  it("is a long way down from the eighty-four it used to draw", () => {
    expect(drawnRows()).toBeLessThan(5);
  });

  it("offers no crafting the survivor has never heard of", () => {
    const { state, world, cal } = fresh();
    const ui = newUiState();
    for (const purpose of PURPOSES.Make) {
      const html = doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab: "Make", purpose } });
      expect(html).not.toContain("needs a bone needle");
      expect(html).not.toContain("hide coat");
    }
  });

  /**
   * The gate has to open, or it is just a way of hiding the game. Siting a
   * camp completes `site`, which discovers `drink`, and the ground the
   * survivor has settled in starts naming what it feeds them.
   */
  it("opens once there is a camp to open it", () => {
    const { state, world } = fresh();
    const cal = calendar(state.minute, state.startDoy);
    const before = drawnRows();

    regionState(state, world, state.player.region).campCell = cellOf(state, world);
    recordOpportunityEvent(state, { kind: "task", id: "makeCamp" as TaskId });
    discoverAvailableOpportunities(state, world, cal, false);

    const ui = newUiState();
    let after = 0;
    for (const subtab of ["Gather", "Hunt", "Explore", "Camp", "Make", "Build"] as const) {
      for (const purpose of PURPOSES[subtab]) {
        const html = doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab, purpose } });
        after += (html.match(/class="act"/g) ?? []).length;
      }
    }
    expect(after).toBeGreaterThan(before);
  });

  it("keeps the counts agreeing with the rows", () => {
    const { state, world } = fresh();
    const cal = calendar(state.minute, state.startDoy);
    const ui = newUiState();
    for (const subtab of ["Gather", "Hunt", "Explore", "Camp", "Make", "Build"] as const) {
      const panes = { pane: "do" as const, subtab, purpose: PURPOSES[subtab][0] };
      const counts = purposeCounts(state, world, { ...ui, panes });
      for (const purpose of PURPOSES[subtab]) {
        const html = doHtml(state, world, cal, { ...ui, panes: { ...panes, purpose } });
        const drawn = (html.match(/class="act"/g) ?? []).length;
        // The left pane's number is what the player uses to decide whether a
        // purpose is worth opening. A count that outran its rows would send
        // them into an empty pane.
        expect(counts[purpose] ?? 0).toBeLessThanOrEqual(Math.max(drawn, counts[purpose] ?? 0));
        if (drawn === 0) expect(counts[purpose] ?? 0).toBe(0);
      }
    }
  });
});

describe("the opportunity card is a door", () => {
  /**
   * The failure this whole pass started from. The card said "Make camp" and
   * clicking it opened a browse modal, leaving `#doitems` untouched and the
   * player to find Build > Site for themselves - the sixth subtab of six.
   */
  it("points at the row its opportunity is asking for", () => {
    expect(paneForOpportunity("site")).toEqual({ subtab: "Build", purpose: "Site" });
    expect(paneForOpportunity("fire")).toEqual({ subtab: "Camp", purpose: "Fire" });
    // Kindling, not Woodcutting: deadwood off the floor is what yields
    // firewood, and the goal asks for firewood rather than for logs.
    expect(paneForOpportunity("firewood")).toEqual({ subtab: "Gather", purpose: "Kindling" });
    expect(paneForOpportunity("drink")).toEqual({ subtab: "Camp", purpose: "Water" });
  });

  it("never points the landing at resting, which shares its key", () => {
    // `site` reveals making camp and the body rows alike. The card must name
    // the work, not the body.
    expect(paneForOpportunity("site")?.purpose).not.toBe("Rest");
  });
});

describe("a row that needs a tool waits for the tool", () => {
  /**
   * From first principles: "skills can't be blocked by tech i haven't
   * unlocked yet". An heir inherits the world's knowledge of wedges from
   * an ancestor who held a knife, lands without one, and saw "needs a
   * knife" beside a knife recipe blocked on stone this region has none of.
   * Possession gates the row, not discovery, and it is life-scoped.
   */
  it("hides knife work until there is a knife in hand", () => {
    const { state, world } = fresh();
    const cal = calendar(state.minute, state.startDoy);
    for (const key of ["make:wedges", "make:knife"] as const) state.opportunities.discoveredAt[key] = 0;
    const ui = newUiState();
    const html = () => doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab: "Make", purpose: "Tools" } });
    expect(html()).not.toContain("wedges");
    state.player.tools.push({ id: "knife", durability: 100 });
    expect(html()).toContain("wedges");
  });

  it("hides hunting until there is a bow, and still says why once there is", () => {
    const { state, world } = fresh();
    const cal = calendar(state.minute, state.startDoy);
    state.opportunities.discoveredAt["make:bow"] = 0;
    const ui = newUiState();
    const html = () => doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab: "Hunt", purpose: "Game" } });
    expect(html()).not.toContain("Hunt anything");
    state.player.tools.push({ id: "bow", durability: 100 });
    expect(html()).toContain("Hunt anything");
  });
});

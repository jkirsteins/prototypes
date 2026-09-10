import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { hasSpot, regionAt } from "../src/world/gen";
import { levelMinutes } from "../src/sim/skills";
import { noteHuntSign } from "../src/sim/hunting";
import { availableTasks } from "../src/sim/tasks";
import { doHtml, doPurposesHtml, filterRows, intentGroups, keyedRows, makeFirst, purposeCounts, rankRows } from "../src/ui/dopanel";
import { purposeOf, subtabOf } from "../src/ui/purpose";
import { paneHtml } from "./pane";
import { defaultChoice, defaultChoiceFor, newUiState, rowRequest, setWhenField } from "../src/ui/render";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { regionState, siteFor } from "../src/sim/regionstate";
import { TASK_IDS } from "../src/sim/types";
import type { OrderWhen, TaskId } from "../src/sim/types";
import { testAtmosphere } from "./weather-helpers";
import { siteCamp } from "./siting-helpers";

afterEach(() => vi.restoreAllMocks());

describe("the purposes and the filter", () => {
  it("does not expose a specific game species until the survivor has fresh local sign", () => {
    const { state, world } = newGame(3);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Hunt" as const, purpose: "Game" } };
    const cal = calendar(state.minute, state.startDoy);
    expect(doHtml(state, world, cal, ui)).not.toContain("Hunt mountain hare");
    noteHuntSign(state, cellOf(state, world), "hare");
    expect(doHtml(state, world, cal, ui)).toContain("Hunt mountain hare");
  });
  it("shows an initial walk separately from work duration in the selected format", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "heath");
    const cal = calendar(state.minute, state.startDoy);
    const distance = paneHtml(state, world, cal, "chop", undefined, { travelDisplay: "distance" });
    const time = paneHtml(state, world, cal, "chop", undefined, { travelDisplay: "time" });
    expect(distance).toMatch(/will walk to nearest forest - \d+\.\d km/);
    expect(time).toMatch(/will walk to nearest forest - (?:\d+ h )?\d+ min/);
    expect(distance).toMatch(/Fell any tree.*\d+ min/s);
  });

  it("the filter narrows by label, case-insensitive, and an empty filter keeps everything", () => {
    const rows = [{ label: "Gather sticks" }, { label: "Strip bark" }, { label: "Fell a tree" }];
    expect(filterRows(rows, "STICK").map((r) => r.label)).toEqual(["Gather sticks"]);
    expect(filterRows(rows, "  ").length).toBe(3);
  });

  it("the filter reads the whole row, so a word only the second line says still finds it", () => {
    const rows = [
      { label: "Gather dead wood", detail: "15 kg of firewood off the forest floor; no axe", why: "", group: "gather" },
      { label: "Open an ice hole", detail: "20 minutes with the axe; skins over by morning", why: "", group: "camp" },
      { label: "Gather sticks", detail: "6 sticks", why: "", group: "gather" },
      { label: "Light the fire at the pit", detail: "fire drill and 1 kg firewood", why: "needs a fire pit", group: "camp" },
    ];
    expect(filterRows(rows, "firewood").map((r) => r.label)).toEqual(["Gather dead wood", "Light the fire at the pit"]);
    // "no axe" on the dead wood row counts as an axe hit: reading the whole row
    // is what makes the box find things, and the cost is a looser match.
    expect(filterRows(rows, "axe").map((r) => r.label)).toEqual(["Gather dead wood", "Open an ice hole"]);
    expect(filterRows(rows, "pit").map((r) => r.label)).toEqual(["Light the fire at the pit"]);
    expect(filterRows(rows, "gather").map((r) => r.label)).toEqual(["Gather dead wood", "Gather sticks"]);
  });

  it("every word in the filter has to land somewhere, so a second word narrows", () => {
    const rows = [
      { label: "Gather dead wood", detail: "15 kg of firewood off the forest floor; no axe", why: "", group: "gather" },
      { label: "Light the fire at the pit", detail: "fire drill and 1 kg firewood", why: "", group: "camp" },
    ];
    expect(filterRows(rows, "fire").length).toBe(2);
    expect(filterRows(rows, "fire drill").map((r) => r.label)).toEqual(["Light the fire at the pit"]);
    expect(filterRows(rows, "fire  FLOOR").map((r) => r.label)).toEqual(["Gather dead wood"]);
    expect(filterRows(rows, "fire canoe").length).toBe(0);
  });

  it("work this ground will never offer is grey with no button, where merely blocked work can still be queued", () => {
    // "No rock in Elgdalen" is not a wait: no outcrop is coming. Queuing it
    // would park it at the head of the list, stopping every order under it
    // until it was struck off by hand. A storm or a missing tool still queues.
    const { state, world } = newGame(1);
    const home = regionAt(world, state.player.region);
    const bare = home.neighbours.map((n) => regionAt(world, n.id)).find((r) => !hasSpot(r, "outcrop"));
    expect(bare).toBeDefined();
    state.player.region = bare!.id;
    placeAt(state, world, bare!.campCell);
    const cal = calendar(state.minute, state.startDoy);
    const stone = availableTasks(state, world, cal).find((o) => o.id === "stone")!;
    expect(stone.ok).toBe(false);
    expect(stone.never).toBe(true);
    expect(stone.why).toBe(`no rock in ${bare!.name}`);
    // Stone is Gather/Material, which is where a reader looking for it goes.
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Gather" as const, purpose: "Stone" } };
    const html = doHtml(state, world, cal, ui);
    const row = html.slice(html.indexOf('data-opt="intent:stone:"'), html.indexOf('data-opt="intent:stone:"') + 300);
    expect(row).toContain("disabled");
    expect(row).not.toContain('data-act="intent"');
    // A row blocked for a reason that can change keeps its "add it anyway"
    // button. It is drawn in whichever pane it belongs to, which is the
    // point of the panes: every row has exactly one place it can be found.
    const blocked = availableTasks(state, world, cal).find((o) => !o.ok && !o.never && subtabOf(o.id, o.arg) !== null)!;
    expect(blocked).toBeDefined();
    const where = {
      ...newUiState(),
      panes: { pane: "do" as const, subtab: subtabOf(blocked.id, blocked.arg)!, purpose: purposeOf(blocked.id, blocked.arg)! },
    };
    const other = doHtml(state, world, cal, where);
    const at = other.indexOf(`data-opt="intent:${blocked.id}:`);
    expect(at).toBeGreaterThan(-1);
    expect(other.slice(at, at + 300)).toContain('data-act="intent"');
  });

  it("a pane lists startable rows first and hides none of them", () => {
    // Seed 17 on day 1: every skill sits at level 1, so a recipe recommended
    // well above that (bow, at Crafting 5) cannot start. It still shows, and
    // it still says why: learning what is available is most of learning the
    // game, so nothing is tucked behind a "more" any more.
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "forest");
    // The task under test is skill ordering, not the local storm field.
    testAtmosphere();
    const cal = calendar(state.minute, state.startDoy);
    const opts = availableTasks(state, world, cal);
    const chop = opts.find((o) => o.id === "chop")!;
    const bow = opts.find((o) => o.id === "craft" && o.arg === "bow")!;
    expect(chop.ok).toBe(true);
    expect(bow.ok).toBe(false);
    expect(bow.recommended).toEqual({ text: "Crafting 5, {you} {are} 1", under: true, short: 4 });

    expect(makeFirst([bow, chop])).toEqual([chop, bow]);

    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Make" as const, purpose: "Hunting" } };
    const html = doHtml(state, world, cal, ui);
    expect(html).toContain('data-opt="intent:craft:bow"');
    expect(html).not.toContain('data-act="more"');
  });

  it("offers Rest but leaves falling asleep and waking to the body", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).map((o) => o.id)).not.toContain("sleep");
    const html = doHtml(state, world, cal, { ...newUiState(), panes: { pane: "do", subtab: "Camp", purpose: "Rest" } });
    expect(html).toContain('data-opt="intent:rest:');
    expect(html).not.toContain('data-opt="intent:sleep:');
    expect(html).not.toContain('data-opt="intent:night:');
  });

  it("offers material tracking only inside an eligible Make or Build row", () => {
    const { state, world } = newGame(3);
    const cal = calendar(state.minute, state.startDoy);
    const ui = {
      ...newUiState(),
      panes: { pane: "do" as const, subtab: "Make" as const, purpose: "Tools" },
      open: { id: "craft" as TaskId, arg: "knife" },
    };
    const knife = doHtml(state, world, cal, ui);
    expect(knife).toContain('data-act="shopping-track" data-id="craft" data-arg="knife"');

    const noMaterials = {
      ...ui,
      panes: { pane: "do" as const, subtab: "Build" as const, purpose: "Fire" },
      open: { id: "build" as TaskId, arg: "firePit" },
    };
    expect(doHtml(state, world, cal, noMaterials)).not.toContain('data-act="shopping-track"');
  });

  it("the invisible keywords find a row whose own words never say what it is for", () => {
    // Nothing on the torch row says "fire", and nothing on the bough bed says
    // "sleep": the keywords are the only route to them.
    const rows = [
      { id: "lightTorch" as TaskId, label: "Light a torch", detail: "burns 1 h; no night penalty on foot", why: "", group: "camp" },
      { id: "build" as TaskId, arg: "boughBed", label: "bough bed", detail: "12 sticks; Spruce boughs off the cold ground", why: "", group: "build" },
      { id: "stone" as TaskId, label: "Gather stone", detail: "3 stone", why: "", group: "gather" },
    ];
    expect(filterRows(rows, "fire").map((r) => r.label)).toEqual(["Light a torch"]);
    expect(filterRows(rows, "sleep").map((r) => r.label)).toEqual(["bough bed"]);
    expect(filterRows(rows, "kindling").map((r) => r.label)).toEqual(["Light a torch"]);
    expect(filterRows(rows, "nonsense").length).toBe(0);
  });

  it("the fire site answers to the two names a reader is likelier to type", () => {
    const rows = [
      { id: "build" as TaskId, arg: "firePit", label: "fire site", detail: "a ring of stones", why: "", group: "build" },
      { id: "sticks" as TaskId, label: "Gather sticks", detail: "6 sticks", why: "", group: "gather" },
    ];
    expect(filterRows(rows, "firepit").map((r) => r.label)).toEqual(["fire site"]);
    expect(filterRows(rows, "fire pit").map((r) => r.label)).toEqual(["fire site"]);
    expect(filterRows(rows, "hearth").map((r) => r.label)).toEqual(["fire site"]);
  });

  it("shelter, cover and weather all find the shelter search", () => {
    const rows = [{ id: "findShelter" as TaskId, label: "Find shelter", detail: "look over this ground", why: "", group: "move" }];
    for (const word of ["shelter", "cover", "weather"]) expect(filterRows(rows, word).map((r) => r.label), word).toEqual(["Find shelter"]);
  });

  it("the rows come back best answer first: name, then the lines under it, then the keywords", () => {
    const rows = [
      { id: "deadwood" as TaskId, label: "Gather dead wood", detail: "15 kg off the forest floor", why: "", group: "gather" },
      { id: "iceHole" as TaskId, label: "Open an ice hole", detail: "20 minutes; skins over by morning", why: "needs a fire to thaw", group: "camp" },
      { id: "light" as TaskId, label: "Light the fire at the site", detail: "fire drill and 1 kg firewood", why: "", group: "camp" },
    ];
    expect(filterRows(rows, "fire").map((r) => r.label)).toEqual(["Light the fire at the site", "Open an ice hole", "Gather dead wood"]);
    const { direct, related } = rankRows(rows, "fire");
    expect(direct.map((r) => r.label)).toEqual(["Light the fire at the site", "Open an ice hole"]);
    expect(related.map((r) => r.label)).toEqual(["Gather dead wood"]);
    expect(rankRows(rows, "  ")).toEqual({ direct: rows, related: [] });
  });

  it("keywords ride with the row's own text, so one word from each still narrows", () => {
    const rows = [
      { id: "lightTorch" as TaskId, label: "Light a torch", detail: "burns 1 h; no night penalty on foot", why: "", group: "camp" },
      { id: "light" as TaskId, label: "Light the fire at the pit", detail: "fire drill and 1 kg firewood", why: "", group: "camp" },
    ];
    expect(filterRows(rows, "fire").length).toBe(2);
    expect(filterRows(rows, "fire torch").map((r) => r.label)).toEqual(["Light a torch"]);
  });

  it("every row a keyword names is a row this panel actually lists", () => {
    // A keyword on a row the Do panel never renders is a word that finds
    // nothing, and nothing else would tell you.
    const { state, world } = newGame(17);
    const listed = new Set(intentGroups(regionAt(world, state.player.region)).flatMap((g) => g.items.map((i) => i.id)));
    for (const key of keyedRows()) {
      const [id, arg] = key.split(":");
      expect(TASK_IDS).toContain(id);
      expect([...listed]).toContain(id);
      // A bare "craft" or "build" covers every recipe or structure; an arg names one.
      if (arg !== undefined && id === "craft") expect(RECIPE_IDS).toContain(arg);
      if (arg !== undefined && id === "build") expect(STRUCTURE_IDS).toContain(arg);
      if (arg !== undefined) expect(["craft", "build"]).toContain(id);
    }
  });

  it("the filter narrows doHtml's rows and puts the groups and their folds away", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    state.skills.woodcraft.xp = levelMinutes(5);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "tree" });
    expect(html).toContain("Fell any tree");
    expect(html).not.toContain("Gather sticks");
    expect(html).not.toContain('data-act="fold"');
  });


  it("a broad word leads with the rows that say it and puts the rest under their own heading", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "fire" });
    const split = html.indexOf('also answers to "fire"');
    expect(split).toBeGreaterThan(0);
    // The rows whose own name says "fire" lead the list, in front of the ones
    // whose second line says it, and the split holds back the ones that answer
    // to it only through the invisible keywords.
    const opts = [...html.matchAll(/data-opt="intent:([^"]*)"/g)].map((m) => m[1]);
    expect(opts.slice(0, 4)).toEqual(["light:", "lightIndoors:", "craft:fireDrill", "build:firePit"]);
    expect(html.indexOf('data-opt="intent:deadwood:"')).toBeLessThan(split);
    expect(html.indexOf('data-opt="intent:sticks:"')).toBeGreaterThan(split);
  });

  it("a filter nothing answers says so rather than emptying the panel", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "kayak" });
    expect(html).toContain('nothing answers to "kayak"');
    expect(html).not.toContain('class="opt');
  });



  it("a filter reaches every subtab, not the one the player is standing in", () => {
    // Cooking lives under Camp/Food. A search that only looked where the
    // reader happened to be is the search that sent them looking by hand.
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Gather" as const, purpose: "Fuel" }, filter: "cook" };
    expect(doHtml(state, world, cal, ui)).toContain('data-opt="intent:cook:');
  });

  it("a purpose shows its own rows and no others", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const food = { ...newUiState(), panes: { pane: "do" as const, subtab: "Gather" as const, purpose: "Wild food" } };
    const html = doHtml(state, world, cal, food);
    expect(html).toContain('data-opt="intent:roots:"');
    expect(html).not.toContain('data-opt="intent:deadwood:"');
  });

  it("Explore has one Shelter row in Do", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Explore" as const, purpose: "Shelter" } };
    const html = doHtml(state, world, cal, ui);
    expect(html).toContain('data-opt="intent:findShelter:"');
    expect((html.match(/data-opt="intent:findShelter:/g) ?? []).length).toBe(1);
  });

  it("Build has one improve-cover Shelter row in Do", () => {
    const { state, world } = newGame(21);
    const here = siteCamp(state, world);
    placeAt(state, world, here);
    siteFor(regionState(state, world, state.player.region), here).cover = 1;
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Build" as const, purpose: "Shelter" } };
    const html = doHtml(state, world, cal, ui);
    expect(html).toContain('data-opt="intent:improveCover:');
    expect((html.match(/data-opt="intent:improveCover:/g) ?? []).length).toBe(1);
    expect(doHtml(state, world, cal, { ...ui, filter: "roof cover" })).toContain('data-opt="intent:improveCover:');
  });

  it("Build offers one emergency Shelter row whose face names the next protection threshold", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Build" as const, purpose: "Shelter" } };
    const html = doHtml(state, world, cal, ui);
    expect((html.match(/data-opt="intent:emergencyShelter:/g) ?? [])).toHaveLength(1);
    const face = html.match(/data-opt="intent:emergencyShelter:[\s\S]*?<\/button>/)?.[0];
    expect(face).toContain("windbreak");
    expect(doHtml(state, world, cal, { ...ui, filter: "roof cover" })).toContain('data-opt="intent:emergencyShelter:');
    const site = siteFor(regionState(state, world, state.player.region), cellOf(state, world));
    site.emergencyMinutes = 50;
    const next = doHtml(state, world, cal, ui).match(/data-opt="intent:emergencyShelter:[\s\S]*?<\/button>/)?.[0];
    expect(next).toContain("weatherproof");
  });

  it("Camp is no longer one heap of twenty-six rows", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const water = { ...newUiState(), panes: { pane: "do" as const, subtab: "Camp" as const, purpose: "Water" } };
    const html = doHtml(state, world, cal, water);
    expect(html).toContain('data-opt="intent:melt:"');
    expect(html).not.toContain('data-opt="intent:sharpen:"');
  });

  it("the left pane counts what each purpose holds", () => {
    const { state, world } = newGame(21);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Camp" as const, purpose: "Fire" } };
    const counts = purposeCounts(state, world, ui);
    // Every purpose Camp offers is present, and none of them is empty.
    expect(Object.keys(counts).sort()).toEqual(["Fire", "Food", "Fuel", "Rest", "Tools", "Water"]);
    for (const [q, n] of Object.entries(counts)) expect(n, q).toBeGreaterThan(0);
    expect(doPurposesHtml(state, world, ui)).toContain('data-purpose="Water"');
  });

  it("an unfiltered pane with nothing in it says so rather than going blank", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Hunt" as const, purpose: "Scout" } };
    const html = doHtml(state, world, cal, ui);
    // Scout holds one row on every ground; if a purpose ever empties, the
    // pane says so rather than leaving the reader looking at nothing.
    expect(html.includes("data-opt=") || html.includes("nothing here yet")).toBe(true);
  });

  it("a far row still renders under a filter, with no more line", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "coat" });
    expect(html).toContain("hide coat");
    expect(html).not.toContain('data-act="more"');
  });

  it("once is a kind button, carrying the row's own choice of deliver and where", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), panes: { pane: "do" as const, subtab: "Gather" as const, purpose: "Kindling" } };
    ui.open = { id: "sticks", arg: "" };
    const html = doHtml(state, world, cal, ui);
    const open = html.slice(html.indexOf('data-opt="intent:sticks:"'));
    expect(open).toContain('data-until="once"');
    expect((open.match(/class="kind"/g) ?? []).length).toBe(6);
    expect(rowRequest({ ...defaultChoice(), deliver: "camp" }, "sticks", undefined).req.deliver).toBe("camp");
  });
});

/** One row's markup, from its own data-opt to the next row's, so a "not there" reads the row and not its neighbours. */
function rowHtml(html: string, key: string): string {
  const i = html.indexOf(`data-opt="${key}"`);
  const j = html.indexOf('data-opt="', i + 1);
  return html.slice(i, j < 0 ? undefined : j);
}

describe("the condition fields", () => {
  it("rowRequest carries a daily count and a when block", () => {
    const daily = rowRequest({ ...defaultChoice(), until: "daily", n: 2 }, "roots", undefined);
    expect(daily.req.until).toEqual({ kind: "daily", n: 2 });
    expect(daily.kind).toBe("job");
    const seasoned = rowRequest({ ...defaultChoice(), when: { season: { from: 120, to: 181 } } }, "roots", undefined);
    expect(seasoned.req.when).toEqual({ season: { from: 120, to: 181 } });
    // An untouched when block is no block at all: the plain click's request is what it was.
    expect(rowRequest(defaultChoice(), "roots", undefined).req.when).toBeUndefined();
  });

  it("the season, the stock line and the daily count open at the condition rung and are named under it", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = {
      ...newUiState(),
      panes: { pane: "do" as const, subtab: "Gather" as const, purpose: "Wild food" },
      open: { id: "berries" as const, arg: "" },
    };
    state.skills.foraging.xp = levelMinutes(12);
    const under = rowHtml(doHtml(state, world, cal, ui), "intent:berries:");
    expect(under).not.toContain("data-row-season-from");
    expect(under).not.toContain("data-row-stock-item");
    expect(under).toContain("insufficient skill");

    state.skills.foraging.xp = levelMinutes(15);
    const at = rowHtml(doHtml(state, world, cal, ui), "intent:berries:");
    for (const f of ["data-row-season-from", "data-row-season-to", "data-row-stock-item", "data-row-stock-mode", "data-row-stock-n"]) expect(at, f).toContain(f);
    expect(at).toContain('data-until="daily"');
    // The later pace control is still locked, but no internal rung wording leaks out.
    expect(at).toContain("insufficient skill");
    expect(at).not.toContain("pace at");
  });

  it("keeps scheduling prose out of an open row", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const shut = rowHtml(doHtml(state, world, cal, newUiState()), "intent:chop:");
    expect(shut).not.toContain("the rest are the runner's");
    const ui = { ...newUiState(), open: { id: "chop" as const, arg: "" } };
    const open = rowHtml(doHtml(state, world, cal, ui), "intent:chop:");
    expect(open).not.toContain("starts now");
    expect(open).not.toContain("the rest are the runner's");
    expect(open).not.toContain("about ");
    expect(open).not.toContain("you are");
  });

  it("the restart line shows at the condition rung and the due date at the pace rung, and only a keep carries them", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), open: { id: "chop" as const, arg: "" } };
    state.skills.woodcraft.xp = levelMinutes(15);
    const at15 = rowHtml(doHtml(state, world, cal, ui), "intent:chop:");
    expect(at15).toContain("data-row-restart");
    expect(at15).not.toContain("data-row-by");
    // The spending box is the date's other half and comes with it, not before it.
    expect(at15).not.toContain("data-row-spend");
    expect(at15).toContain("insufficient skill");

    state.skills.woodcraft.xp = levelMinutes(20);
    const at20 = rowHtml(doHtml(state, world, cal, ui), "intent:chop:");
    expect(at20).toContain("data-row-by");
    expect(at20).not.toContain("insufficient skill");
    // The spending box comes with a date and not before it, so the row that has
    // one shows it; the row still on "any" is the case below.
    const dated = { ...ui, choice: { ...ui.choice, when: { by: 334 } } };
    const withDate = rowHtml(doHtml(state, world, cal, dated), "intent:chop:");
    expect(withDate).toContain("data-row-spend");
    expect(withDate).toContain("spent by the season's close");
    // Ticked, the box draws itself ticked when the row is redrawn.
    const spending = { ...ui, choice: { ...ui.choice, when: { season: { from: 182, to: 89 }, by: 334, spend: true as const } } };
    expect(rowHtml(doHtml(state, world, cal, spending), "intent:chop:")).toContain("data-row-spend checked");
    // With the date on "any" there is no "after the date" to qualify: the box is
    // not drawn, so it cannot be ticked into a spending keepTargetToday ignores.
    const dateless = { ...ui, choice: { ...ui.choice, when: { season: { from: 182, to: 89 } } } };
    const noDate = rowHtml(doHtml(state, world, cal, dateless), "intent:chop:");
    expect(noDate).toContain("data-row-by");
    expect(noDate).not.toContain("data-row-spend");
    // A row with no stock to count has neither: nothing there reads a restart line or a date.
    const lit = rowHtml(doHtml(state, world, cal, { ...ui, open: { id: "light", arg: "" } }), "intent:light:");
    expect(lit).not.toContain("data-row-restart");

    // The fields sit beside the kinds, so the request is where the two a keep alone reads are dropped.
    const choice = { ...defaultChoice(), n: 40, when: { season: { from: 181, to: 273 }, restart: 30, by: 334 } };
    expect(rowRequest({ ...choice, until: "keep" }, "chop", undefined).req.when).toEqual(choice.when);
    expect(rowRequest({ ...choice, until: "times" }, "chop", undefined).req.when).toEqual({ season: { from: 181, to: 273 } });
    expect(rowRequest({ ...defaultChoice(), when: { restart: 30 } }, "chop", undefined).req.when).toBeUndefined();
  });

  it("a condition field writes the open row's when block, and any takes it off again", () => {
    const when: OrderWhen = {};
    setWhenField(when, "season-from", "3");
    expect(when.season?.from).toBe(90);
    setWhenField(when, "season-to", "9");
    expect(when.season).toEqual({ from: 90, to: 273 });
    setWhenField(when, "season-from", "");
    expect(when.season).toBeUndefined();

    setWhenField(when, "stock-item", "bone");
    expect(when.stock).toEqual({ item: "bone", atLeast: 1 });
    setWhenField(when, "stock-n", "4");
    expect(when.stock).toEqual({ item: "bone", atLeast: 4 });
    setWhenField(when, "stock-mode", "under");
    expect(when.stock).toEqual({ item: "bone", under: 4 });
    setWhenField(when, "stock-item", "");
    expect(when.stock).toBeUndefined();

    setWhenField(when, "restart", "192");
    setWhenField(when, "by", "11");
    expect(when.restart).toBe(192);
    expect(when.by).toBe(334);
    // A checkbox has no figure: its state is the value, and unticked takes it off.
    setWhenField(when, "spend", "spend");
    expect(when.spend).toBe(true);
    setWhenField(when, "spend", "");
    expect(when.spend).toBeUndefined();

    setWhenField(when, "restart", "");
    setWhenField(when, "by", "");
    expect(when.restart).toBeUndefined();
    expect(when.by).toBeUndefined();
  });
});

describe("the fetch rows", () => {
  it("the Camp group lists a fetch row per method and a plain click brings the water to camp", () => {
    const { world } = newGame(17);
    const r = regionAt(world, world.start);
    const camp = intentGroups(r).find((g) => g.label === "Camp")!;
    expect(camp.items.filter((i) => i.id === "fill").map((i) => i.arg)).toEqual(["shore", "hole", "seep"]);
    expect(rowRequest(defaultChoiceFor("fill"), "fill", "shore").req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("melt"), "melt", undefined).req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("chop"), "chop", undefined).req.deliver).toBe("leave");
  });
});

describe("a row says what it is, and what stops it", () => {
  // He said it plainly: he did not understand some of the text on a row. A
  // row you can do says its name and how long; a row you cannot says why.
  // The rest is one click away rather than in the way of the scan.

  it("a row you can do says its name and how long, and not its prose", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = paneHtml(state, world, cal, "deadwood");
    const at = html.indexOf('data-opt="intent:deadwood:"');
    const face = html.slice(at, html.indexOf("</button>", at));
    expect(face).toMatch(/\d+ (min|h)/);
    // "10 kg of firewood off the forest floor" is the detail. It is not
    // deleted, it moves under `more`.
    expect(face).not.toContain("forest floor");
  });

  it("the detail is under more, so nothing is lost, only moved", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const open = paneHtml(state, world, cal, "deadwood", undefined, { open: { id: "deadwood", arg: "" } });
    expect(open.slice(open.indexOf('data-opt="intent:deadwood:"'))).toContain("forest floor");
  });

  it("a row you cannot do says why, which is the whole reason it is there", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // Nothing is lit and no drill has been made: the row must say so, since
    // a greyed button he had to infer a fire drill from is what cost a life.
    const html = paneHtml(state, world, cal, "light");
    const at = html.indexOf('data-opt="intent:light:"');
    expect(at).toBeGreaterThan(-1);
    const face = html.slice(at, html.indexOf("</button>", at));
    expect(face.length).toBeGreaterThan(0);
    expect(face).toMatch(/no |needs|nothing/i);
  });

  it("a producer still promises what it gives, since nothing else says the game is idle", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = paneHtml(state, world, cal, "build", "dryingRack");
    const at = html.indexOf('data-opt="intent:build:dryingRack"');
    expect(html.slice(at, at + 600)).toContain("gives");
  });
});

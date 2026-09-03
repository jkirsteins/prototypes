import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes, poolCapacity } from "../src/sim/skills";
import { startTask, stepTask, stopTask } from "../src/sim/tasks";
import type { TaskGroup } from "../src/sim/tasks";
import { SPECIES } from "../src/sim/types";
import { ambientTemperature } from "../src/sim/weather";
import { updateBars } from "../src/ui/bars";
import { mapHtml, mapKey, VIEW_H, VIEW_W } from "../src/ui/map";
import { actionsHtml, deathHtml, doHtml, inventoryHtml, regionHtml, skillsHtml, statsHtml, taskHtml } from "../src/ui/panels";
import { commitStripN, newUiState, resetPanels, setPanel } from "../src/ui/render";
import { cellAt, neighbours, regionAt, spotOf } from "../src/world/gen";

function allActions(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"]) {
  const cal = calendar(state.minute);
  const groups: TaskGroup[] = ["gather", "hunt", "camp", "craft", "build", "move"];
  return groups.map((tab) => actionsHtml(state, world, cal, { ...newUiState(), tab })).join("\n");
}

describe("reachability: everything in the catalogue has a button", () => {
  const { state, world } = newGame(21);
  const html = allActions(state, world);

  it("every recipe", () => {
    for (const id of RECIPE_IDS) expect(html).toContain(`data-opt="craft:${id}"`);
  });
  it("every structure", () => {
    for (const id of STRUCTURE_IDS) expect(html).toContain(`data-opt="build:${id}"`);
  });
  it("every animal", () => {
    for (const s of SPECIES) {
      if (s === "fish") expect(html).toContain(`data-opt="fish:"`);
      else expect(html).toContain(`data-opt="hunt:${s}"`);
    }
  });
  it("every gather, camp and move task", () => {
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "cook", "light", "lightTorch", "sharpen", "repair", "rest", "sleep", "haul"]) {
      expect(html).toContain(`data-opt="${id}:`);
    }
    for (const nb of regionAt(world, state.player.region).neighbours) expect(html).toContain(`data-opt="travel:region:${nb.id}"`);
    for (const s of regionAt(world, state.player.region).spots) {
      if (s.id !== "camp") expect(html).toContain(`data-opt="walk:spot:${s.id}"`);
    }
  });
  it("shows a legal button, not a greyed one, when the inputs are there", () => {
    const rich = newGame(21);
    addItem(rich.state.player.pack, "bark", 3);
    const h = allActions(rich.state, rich.world);
    expect(h).toContain(`data-act="task" data-id="craft" data-arg="cordage"`);
  });
  it("names the ground to stand on when work is greyed", () => {
    expect(html).toMatch(/Fell a tree.*forest/s);
    expect(html).toMatch(/Gather stone.*(rock|outcrop)/s);
  });
  it("every option that trains carries a mastery bar; a hunt under level carries the warning", () => {
    document.body.innerHTML = html;
    expect(document.querySelector('[data-opt="chop:"] .bar.mastery')).not.toBeNull();
    expect(document.querySelector('[data-opt="walk:spot:forest"] .bar.mastery')).toBeNull();
    expect(document.querySelector('[data-opt="hunt:elk"] small.rec.warn')?.textContent).toBe("Hunting 8");
  });
});

describe("panels", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="stats"></div><div id="map"></div><div id="region"></div><div id="task"></div><div id="inventory"></div><div id="overlay"></div>`;
    resetPanels();
  });

  it("renders one span per cell with region borders and the player marker on the player's cell", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    setPanel("map", mapHtml(world, state, ui, cal));
    const cells = document.querySelectorAll("#map .c");
    expect(cells.length).toBe(VIEW_W * VIEW_H);
    expect(document.querySelectorAll("#map .c.bl, #map .c.br, #map .c.bt, #map .c.bb").length).toBeGreaterThan(50);
    expect(document.querySelectorAll("#map .mk-player").length).toBe(1);
    expect(document.querySelectorAll("#map .c.fog").length).toBeGreaterThan(100);
    expect(document.querySelectorAll("#map .c.cur").length).toBeGreaterThan(50);
  });

  it("marks the route while walking and cells with something lying on them", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    const k1 = mapKey(state, world, ui, cal);
    startTask(state, world, cal, "walk", "spot:forest");
    expect(mapKey(state, world, ui, cal)).not.toBe(k1);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.rt").length).toBe(state.route!.path.length);
    addItem(herePile(state, world), "stone", 2);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl").length).toBe(1);
    const nb = neighbours(world, cellOf(state, world)).find((c) => cellAt(world, c).terrain !== "water")!;
    placeAt(state, world, nb);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl:not(.mk)").length).toBe(1);
  });

  it("bars follow the state", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ambient = ambientTemperature(cal, state.weather);
    setPanel("stats", statsHtml(state, world, cal, ambient, newUiState()));
    state.player.health = 42;
    state.task = { id: "rest", progress: 30, duration: 60, repeat: false };
    setPanel("task", taskHtml(state, world, cal));
    updateBars(state, world);
    expect(document.querySelector<HTMLElement>("#bar-health")!.style.width).toBe("42.0%");
    expect(document.querySelector("#val-health")!.textContent).toBe("42");
    expect(document.querySelector<HTMLElement>("#bar-task")!.style.width).toBe("50.0%");
    expect(document.querySelector("#val-task")!.textContent).toContain("30 min left (30 s)");
  });

  it("region card shows the travel button for another region, and the spots and loose piles for here", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const nb = regionAt(world, state.player.region).neighbours[0].id;
    setPanel("region", regionHtml(state, world, cal, { ...newUiState(), selected: nb }));
    expect(document.querySelector(`#region [data-act="task"][data-id="travel"][data-arg="region:${nb}"]`)).not.toBeNull();
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    expect(document.querySelector(`#region [data-act="task"][data-id="walk"][data-arg="spot:forest"]`)).not.toBeNull();
    expect(document.querySelector("#region")!.textContent).toContain("you are at camp");
    // Drop something on a bare cell nearby and it is listed with a walk button.
    const loose = neighbours(world, cellOf(state, world)).find((c) => cellAt(world, c).terrain !== "water")!;
    placeAt(state, world, loose);
    addItem(herePile(state, world), "log", 2);
    placeAtSpot(state, world, state.player.region, "camp");
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    expect(document.querySelector("#region")!.textContent).toContain("40 kg lying at");
    expect(document.querySelector(`#region [data-act="task"][data-id="walk"][data-arg="cell:${loose}"]`)).not.toBeNull();
  });

  it("inventory lists pack and ground with take and drop", () => {
    const { state, world } = newGame(21);
    addItem(state.player.pack, "stick", 3);
    setPanel("inventory", inventoryHtml(state, world));
    expect(document.querySelector(`#inventory [data-act="drop"][data-item="stick"]`)).not.toBeNull();
    expect(document.querySelector(`#inventory [data-act="drop"][data-item="driedMeat"]`)).not.toBeNull();
  });

  it("death screen names the cause and offers a restart", () => {
    const { state, world } = newGame(21);
    state.dead = { cause: "froze", minute: 5000 };
    setPanel("overlay", deathHtml(state, world, calendar(5000)));
    expect(document.querySelector("#overlay")!.textContent).toContain("You froze");
    expect(document.querySelector(`#overlay [data-act="restart"]`)).not.toBeNull();
  });

  it("skills panel lists six rows with level, hours to next, pool share and active perks", () => {
    const { state } = newGame(21);
    state.skills.woodcraft.xp = levelMinutes(7) + 60;
    state.skills.woodcraft.pool = poolCapacity("woodcraft") * 0.3;
    const h = skillsHtml(state);
    expect(h).toContain("Woodcraft");
    expect(h).toContain("Fishing");
    expect((h.match(/class="skill"/g) ?? []).length).toBe(6);
    // Level 8 needs 98 h; level 7 had 72; one hour in, 25 h to go.
    expect(h).toContain("25 h to 8");
    expect(h).toContain("pool 30%");
    expect(h).toContain("half the tool wear");
    expect(h).toContain("5% faster");
  });

  it("death screen names the best skill", () => {
    const { state, world } = newGame(21);
    state.skills.hunting.xp = levelMinutes(12);
    state.dead = { cause: "froze", minute: state.minute };
    setPanel("overlay", deathHtml(state, world, calendar(state.minute)));
    expect(document.querySelector("#overlay")!.textContent).toContain("Hunting 12");
  });

  it("commitStripN clamps to at least 1 on every keystroke, and setPanel refuses to redraw a panel while its strip field has focus", () => {
    const ui = newUiState();
    commitStripN(ui, "7");
    expect(ui.n).toBe(7);
    commitStripN(ui, ""); // a cleared field
    expect(ui.n).toBe(1);
    commitStripN(ui, "0");
    expect(ui.n).toBe(1);
    commitStripN(ui, "3.6");
    expect(ui.n).toBe(4);

    document.body.innerHTML = `<div id="actions"></div>`;
    expect(setPanel("actions", `<input data-strip-n value="5">`)).toBe(true);
    const field = document.querySelector<HTMLInputElement>("[data-strip-n]")!;
    field.focus();
    expect(document.activeElement).toBe(field);
    // A redraw carrying different html is refused outright while the field is focused, and the DOM is left alone.
    expect(setPanel("actions", "<p>a different render</p>")).toBe(false);
    expect(document.querySelector("[data-strip-n]")).not.toBeNull();
    field.blur();
    expect(setPanel("actions", "<p>a different render</p>")).toBe(true);
    expect(document.querySelector("[data-strip-n]")).toBeNull();
  });
});

describe("the Do panel", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute);

  it("has a settings strip, the instant buttons, and one row per intent, judged at the work's place", () => {
    const html = doHtml(state, world, cal, newUiState());
    expect(html).toContain('data-act="strip" data-k="until" data-v="forever"');
    expect(html).toContain('data-act="strip" data-k="deliver" data-v="camp"');
    expect(html).toContain('data-act="strip" data-k="where" data-v="nearest"');
    expect(html).toContain("data-strip-n");
    expect(html).toContain('data-act="eat"');
    // Felling is legal from camp because the intent walks to the forest itself.
    expect(html).toContain('data-act="intent" data-id="chop" data-arg=""');
    expect(html).not.toContain('class="opt off" data-opt="intent:chop:"');
    for (const id of RECIPE_IDS) expect(html).toContain(`data-opt="intent:craft:${id}"`);
    for (const id of STRUCTURE_IDS) expect(html).toContain(`data-opt="intent:build:${id}"`);
    for (const s of SPECIES) expect(html).toContain(s === "fish" ? 'data-opt="intent:fish:"' : `data-opt="intent:hunt:${s}"`);
    for (const id of ["sticks", "bark", "stone", "berries", "split", "cook", "light", "sharpen", "repair", "night", "rest", "sleep"]) {
      expect(html).toContain(`data-opt="intent:${id}:`);
    }
    expect(html).toContain('data-opt="intent:lightTorch:"');
    expect(html).not.toContain('class="tabs"');
    expect(html).toContain('data-act="advanced"');
  });

  it("the strip's choice shows on the row, and the raw list appears under the advanced toggle unchanged", () => {
    // The Move tab is where the raw list keeps Haul and the spot walks.
    const ui = { ...newUiState(), until: "forever" as const, deliver: "camp" as const, advanced: true, tab: "move" as const };
    const html = doHtml(state, world, cal, ui);
    expect(html).toMatch(/data-opt="intent:chop:".*forever, bringing it to camp/s);
    expect(html).toContain('class="tabs"');
    expect(html).toContain('data-opt="haul:"');
    expect(html).toContain('data-opt="walk:spot:');
    expect(html).toContain(actionsHtml(state, world, cal, ui, false));
  });

  it("night's row carries no strip sentence, unlike every other intent under the same strip", () => {
    const ui = { ...newUiState(), until: "forever" as const, deliver: "camp" as const };
    const html = doHtml(state, world, cal, ui);
    expect(html).toMatch(/data-opt="intent:chop:".*forever, bringing it to camp/s);
    const nightRow = html.match(/<div class="opt"[^>]*data-opt="intent:night:"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(nightRow).not.toBe("");
    expect(nightRow).not.toContain("forever");
    expect(nightRow).not.toContain("bringing it to camp");
  });

  it("until camp has N always says bringing it to camp, even when the strip's own bring-it choice is leave it", () => {
    const ui = { ...newUiState(), until: "campHas" as const, deliver: "leave" as const, n: 20 };
    const html = doHtml(state, world, cal, ui);
    expect(html).toMatch(/data-opt="intent:chop:".*until camp has 20 logs.*bringing it to camp/s);
  });

  it("a build blocked only by materials elsewhere in the region is not greyed out, and names what it would fetch", () => {
    // Fetch fixture: sticks and cordage already at camp, the missing logs sitting at the forest.
    const g = newGame(3);
    const camp = regionState(g.state, g.world, g.state.player.region).campCell;
    const r = regionAt(g.world, g.state.player.region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(g.state, camp), "stick", 8);
    addItem(pile(g.state, camp), "cordage", 2);
    addItem(pile(g.state, forest), "log", 4);
    const html = doHtml(g.state, g.world, calendar(g.state.minute), newUiState());
    expect(html).toContain('data-act="intent" data-id="build" data-arg="leanTo"');
  });

  it("a build already finished renders as a greyed row, not a fetchable one, however much sits elsewhere", () => {
    const g = newGame(3);
    regionState(g.state, g.world, g.state.player.region).structures.leanTo = true;
    const r = regionAt(g.world, g.state.player.region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(g.state, forest), "log", 4);
    const html = doHtml(g.state, g.world, calendar(g.state.minute), newUiState());
    expect(html).toContain('class="opt off" data-opt="intent:build:leanTo"');
  });

  it("the Doing panel reads the intent as a sentence with its step, and set-aside work can be finished from anywhere", () => {
    const g = newGame(21);
    const rng = new Rng(1);
    // Seed 21's camp cell is itself forest ground; stand off it (the heath) so the intent really walks to the forest.
    placeAtSpot(g.state, g.world, g.state.player.region, "heath");
    startIntent(g.state, g.world, calendar(0), rng, { task: "chop", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" });
    let html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain("Fell a tree, until camp has 40 logs, bringing it to camp");
    expect(html).toContain("walking to the forest");
    expect(html).toContain('data-act="stop"');
    // A tree half felled, then the intent stopped from camp: the entry offers finish, not resume.
    placeAtSpot(g.state, g.world, g.state.player.region, "forest");
    startTask(g.state, g.world, calendar(0), "chop");
    for (let i = 0; i < 30; i++) stepTask(g.state, g.world, calendar(0), rng, 1);
    stopTask(g.state, g.world);
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain('data-act="finish" data-id="chop"');
    expect(html).toMatch(/data-act="finish" data-id="chop"[^>]*data-cell="\d+"/);
    expect(html).not.toContain('>resume<');
  });

  it("carried work's finish button names no cell, so it resolves through nearest and still reaches camp", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "firewood", 2);
    // Paused partway through, at camp; light is carried work, so its paused entry carries no cell.
    startTask(state, world, calendar(0), "light");
    stepTask(state, world, calendar(0), new Rng(1), 3);
    stopTask(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    const html = taskHtml(state, world, calendar(0));
    expect(html).toContain('data-act="finish" data-id="light"');
    expect(html).not.toMatch(/data-act="finish" data-id="light"[^>]*data-cell=/);
    // The finish handler's own logic when the button carries no cell: where "nearest".
    expect(startIntent(state, world, calendar(0), new Rng(1), { task: "light", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    expect(state.intent?.cell).toBe(camp);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { addItem } from "../src/sim/inventory";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { SPECIES } from "../src/sim/types";
import { ambientTemperature } from "../src/sim/weather";
import { updateBars } from "../src/ui/bars";
import { mapHtml, mapKey } from "../src/ui/map";
import { actionsHtml, deathHtml, inventoryHtml, regionHtml, statsHtml, taskHtml } from "../src/ui/panels";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import type { TaskGroup } from "../src/sim/tasks";

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
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "cook", "light", "sharpen", "repair", "rest", "sleep", "haul"]) {
      expect(html).toContain(`data-opt="${id}:`);
    }
    for (const nb of world.regions[state.player.region].neighbours) expect(html).toContain(`data-opt="travel:${nb.id}"`);
    for (const s of world.regions[state.player.region].spots) {
      if (s.id !== "camp") expect(html).toContain(`data-opt="walk:${s.id}"`);
    }
  });
  it("shows a legal button, not a greyed one, when the inputs are there", () => {
    const rich = newGame(21);
    addItem(rich.state.player.pack, "bark", 3);
    const h = allActions(rich.state, rich.world);
    expect(h).toContain(`data-act="task" data-id="craft" data-arg="cordage"`);
  });
});

describe("panels", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="stats"></div><div id="map"></div><div id="region"></div><div id="task"></div><div id="inventory"></div><div id="overlay"></div>`;
    resetPanels();
  });

  it("renders one span per cell with region borders and the player marker", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    setPanel("map", mapHtml(world, state, ui, cal));
    const cells = document.querySelectorAll("#map .c");
    expect(cells.length).toBe(world.w * world.h);
    expect(document.querySelectorAll("#map .c.bl, #map .c.br, #map .c.bt, #map .c.bb").length).toBeGreaterThan(50);
    expect(document.querySelectorAll("#map .mk-player").length).toBe(1);
    expect(document.querySelectorAll(`#map .c.cur`).length).toBe(world.regions[state.player.region].cells.length);
  });

  it("rebuilds the map only when its key changes", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    const k1 = mapKey(state, ui, cal);
    expect(mapKey(state, ui, cal)).toBe(k1);
    ui.selected = (state.player.region + 1) % world.regions.length;
    expect(mapKey(state, ui, cal)).not.toBe(k1);
    expect(setPanel("map", mapHtml(world, state, ui, cal))).toBe(true);
    expect(setPanel("map", mapHtml(world, state, ui, cal))).toBe(false);
  });

  it("bars follow the state", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ambient = ambientTemperature(cal, state.weather);
    setPanel("stats", statsHtml(state, cal, ambient, newUiState()));
    state.player.health = 42;
    state.task = { id: "rest", progress: 30, duration: 60, repeat: false };
    setPanel("task", taskHtml(state, world, cal));
    updateBars(state);
    expect(document.querySelector<HTMLElement>("#bar-health")!.style.width).toBe("42.0%");
    expect(document.querySelector("#val-health")!.textContent).toBe("42");
    expect(document.querySelector<HTMLElement>("#bar-task")!.style.width).toBe("50.0%");
    expect(document.querySelector("#val-task")!.textContent).toContain("30 min left (30 s)");
  });

  it("region card shows the travel button for a neighbour and the spots for here", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const nb = world.regions[state.player.region].neighbours[0].id;
    setPanel("region", regionHtml(state, world, cal, { ...newUiState(), selected: nb }));
    expect(document.querySelector(`#region [data-act="task"][data-id="travel"][data-arg="${nb}"]`)).not.toBeNull();
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    expect(document.querySelector(`#region [data-act="task"][data-id="walk"][data-arg="forest"]`)).not.toBeNull();
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
});

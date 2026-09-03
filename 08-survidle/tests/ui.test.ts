import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { addOrder, moveOrder } from "../src/sim/orders";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes, poolCapacity } from "../src/sim/skills";
import { startTask, stepTask, stopTask } from "../src/sim/tasks";
import type { TaskGroup } from "../src/sim/tasks";
import { ambientTemperature } from "../src/sim/weather";
import { updateBars } from "../src/ui/bars";
import { mapHtml, mapKey, VIEW_H, VIEW_W } from "../src/ui/map";
import { actionsHtml, deathHtml, doHtml, inventoryHtml, regionHtml, rosterHtml, skillsHtml, statsHtml, taskHtml } from "../src/ui/panels";
import { commitStripN, newUiState, resetPanels, setPanel } from "../src/ui/render";
import { fishSpecies, huntedLand, SPECIES_DEFS, type Species } from "../src/sim/species";
import { cellAt, neighbours, regionAt, spotOf, speciesHere } from "../src/world/gen";

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
  it("every animal the region holds, and nothing it does not", () => {
    const r = regionAt(world, state.player.region);
    const here = huntedLand().filter((s) => r.capacity[s]);
    expect(here.length).toBeGreaterThan(0);
    for (const s of here) expect(html).toContain(`data-opt="hunt:${s}"`);
    for (const s of huntedLand()) if (!r.capacity[s]) expect(html).not.toContain(`data-opt="hunt:${s}"`);
    for (const s of fishSpecies()) expect(html.includes(`data-opt="fish:${s}"`)).toBe(Boolean(r.capacity[s]));
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

  it("lists the roster in Game, Birds, Fish and Heard lines, only species that live here", () => {
    const { state, world } = newGame(5);
    const id = state.player.region;
    const html = rosterHtml(state, world, id, calendar(1440 * 275)); // January
    const r = regionAt(world, id);
    for (const s of speciesHere(r)) expect(html).toContain(SPECIES_DEFS[s].name);
    for (const s of Object.keys(SPECIES_DEFS) as Species[]) if (!r.capacity[s]) expect(html).not.toContain(`${SPECIES_DEFS[s].name}`);
    if (r.capacity.mallard) expect(html).toContain("mallard gone until April");
    if (r.capacity.bear) expect(html).toContain("brown bear denned until April");
    if (r.capacity.loon) expect(html).toContain("loon (from May)");
    if (r.capacity.hare) {
      regionState(state, world, id).pop.hare = 0;
      expect(rosterHtml(state, world, id, calendar(0))).toContain("hare <b>none</b>");
    }
    expect(html.startsWith("<div>Game:") || html.startsWith("<div>Birds:") || html.startsWith("<div>Fish:") || html.startsWith("<div>Heard:")).toBe(true);
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
    expect(document.querySelector("#overlay")!.textContent).toContain("The cold took you");
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

  it("the death screen tells the last three lines before the end", () => {
    const { state, world } = newGame(3);
    state.log.push({ minute: 100, text: "You are thirsty.", kind: "bad" });
    state.log.push({ minute: 200, text: "You are starving.", kind: "bad" });
    state.log.push({ minute: 300, text: "You can barely lift your arms. Sleep.", kind: "bad" });
    state.dead = { cause: "thirst", minute: 301 };
    const html = deathHtml(state, world, calendar(301));
    expect(html).toContain("Thirst took you.");
    expect(html).toMatch(/You are thirsty\..*You are starving\..*You can barely lift your arms\. Sleep\./s);
  });

  it("a froze death excludes its own death line from the story, not just the cause paragraph", () => {
    const { state, world } = newGame(3);
    state.log.push({ minute: 250, text: "You are shivering hard. Find warmth.", kind: "bad" });
    state.log.push({ minute: 300, text: "The cold took you.", kind: "bad" });
    state.dead = { cause: "froze", minute: 300 };
    const html = deathHtml(state, world, calendar(300));
    expect(html).toContain("The cold took you.");
    expect((html.match(/The cold took you\./g) ?? []).length).toBe(1);
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
    const roster = regionAt(world, state.player.region);
    for (const s of huntedLand()) if (roster.capacity[s]) expect(html).toContain(`data-opt="intent:hunt:${s}"`);
    for (const s of fishSpecies()) expect(html.includes(`data-opt="intent:fish:${s}"`)).toBe(Boolean(roster.capacity[s]));
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

describe("the Orders panel", () => {
  it("the strip offers keep, and a blocked row is still a button", () => {
    const { state, world } = newGame(3);
    const ui = { ...newUiState(), until: "keep" as const, n: 40 };
    const html = doHtml(state, world, calendar(0), ui);
    expect(html).toContain('data-k="until" data-v="keep"');
    expect(html).toContain("keep camp at 40 kg firewood");
    // Split needs logs this camp has none of: dim, with the reason, and still clickable.
    expect(html).toMatch(/class="opt off" data-opt="intent:split:"><button class="act" data-act="intent" data-id="split"/);
    expect(html).toContain("no logs here");
  });

  it("lists the orders in rank order with their state, counters and buttons", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "log", 6);
    addItem(pile(state, st.campCell), "firewood", 60);
    const keep = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    const cabin = addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 3);
    const cal = calendar(state.minute);
    let html = taskHtml(state, world, cal);
    expect(html).toContain("<h2>Orders</h2>");
    expect(html.indexOf(`data-id="${keep.id}"`)).toBeLessThan(html.indexOf(`data-id="${cabin.id}"`));
    expect(html).toContain("met");
    expect(html).toContain("missing materials at camp");
    expect(html).toContain("gathering sticks");
    expect(html).toContain('id="bar-task"');
    expect(html.split('id="bar-task"').length).toBe(2);
    expect(html).toContain(`data-act="order-up" data-id="${keep.id}" disabled`);
    expect(html).toContain(`data-act="order-down" data-id="${grind.id}" disabled`);
    expect(html).toContain(`data-act="order-remove" data-id="${cabin.id}"`);
    expect(html).not.toContain('data-act="stop"');
    // Counters appear once the work has completed.
    for (let i = 0; i < 400 && grind.done === 0; i++) advance(state, world, 1);
    html = taskHtml(state, world, calendar(state.minute));
    expect(html).toMatch(new RegExp(`${grind.done} bundle`));
    // Moving the cabin up shows in the next render.
    moveOrder(state, world, cabin.id, -1);
    html = taskHtml(state, world, calendar(state.minute));
    expect(html.indexOf(`data-id="${cabin.id}"`)).toBeLessThan(html.indexOf(`data-id="${keep.id}"`));
  });

  it("a blocked order below the live one shows its own reason, not \"waiting\"", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "log", 6);
    const grind = addOrder(state, world, { task: "split", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const cabin = addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(grind.id);
    const html = taskHtml(state, world, calendar(state.minute));
    expect(html).toContain('<div class="step">missing materials at camp</div>');
    expect(html).not.toContain('<div class="step">waiting</div>');
    expect(html).toContain(`data-act="order-remove" data-id="${cabin.id}"`);
  });

  it("shows the wait with the rest bar when nothing can run", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "firewood", 60);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 2);
    const html = taskHtml(state, world, calendar(state.minute));
    expect(html).toContain("Waiting at camp");
    expect(html).toContain('id="bar-task"');
  });
});

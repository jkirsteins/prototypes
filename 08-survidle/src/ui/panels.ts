import { itemLabel } from "../sim/actions";
import { densityLabel, regionDensity } from "../sim/animals";
import { type Calendar, fmtClock, fmtDate } from "../sim/calendar";
import { herePile, listItems, qty, weight } from "../sim/inventory";
import { ANIMALS, CLOTHING, FOODS, type FoodId, ITEM_KG, RACK_MAX_KG, TOOLS } from "../sim/items";
import { feltTemperature, insulation } from "../sim/player";
import { availableTasks, check, SPOT_NAMES, type TaskGroup, type TaskOption, walkKm } from "../sim/tasks";
import { type GameState, type ItemId, type LogEntry, SPECIES } from "../sim/types";
import { weatherLabel } from "../sim/weather";
import { fmtDuration, fmtKg, fmtKm, fmtReal, GAME_MINUTES_PER_REAL_SECOND, PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../units";
import { spotKm, type World } from "../world/gen";
import { esc, type UiState } from "./render";
import { skyHtml } from "./sky";

function bar(id: string, cls: string, label: string): string {
  return `<div class="bar ${cls}"><div class="fill" id="bar-${id}"></div><span class="lbl"><span>${label}</span><b id="val-${id}"></b></span></div>`;
}

function durBar(v: number): string {
  return `<div class="bar dur${v < 25 ? " low" : ""}"><div class="fill" style="width:${Math.max(0, Math.min(100, v))}%"></div></div>`;
}

export function statsHtml(state: GameState, cal: Calendar, ambient: number, ui: UiState): string {
  const p = state.player;
  const felt = feltTemperature(state, ambient);
  const tags: string[] = [];
  tags.push(`<span class="tag">feels like ${Math.round(felt)} C</span>`);
  if (p.sick > 0) tags.push(`<span class="tag bad">sick, ${fmtDuration(p.sick)} to go</span>`);
  if (p.injured > 0) tags.push(`<span class="tag bad">injured, ${fmtDuration(p.injured)}</span>`);
  if (p.kcal <= 1200) tags.push(`<span class="tag bad">starving</span>`);
  if (p.warmth < 20) tags.push(`<span class="tag bad">hypothermia</span>`);
  else if (p.warmth < 40) tags.push(`<span class="tag bad">cold</span>`);
  if (p.energy < 20) tags.push(`<span class="tag bad">exhausted</span>`);
  return `<h2>You <span class="r">day ${cal.day}</span></h2>
${bar("health", "health", "Health")}
${bar("kcal", "kcal", "Food")}
${bar("warmth", "warmth", "Warmth")}
${bar("energy", "energy", "Energy")}
${bar("wet", "wet", "Wet")}
<div class="statuses">${tags.join("")}</div>
<div>
  <button class="mini${p.autoEat ? " on" : ""}" data-act="toggle-eat" title="Eat when the reserve drops under 1800 kcal">auto-eat: ${p.autoEat ? "on" : "off"}</button>
  <button class="mini${p.autoFeed ? " on" : ""}" data-act="toggle-feed" title="Feed the fire from firewood at camp while you are there">auto-feed fire: ${p.autoFeed ? "on" : "off"}</button>
</div>
<div style="margin-top:8px">
  ${ui.confirmAbandon
    ? `<button class="mini danger" data-act="abandon-yes">Really abandon this run? Yes, it is over</button> <button class="mini" data-act="abandon-no">no</button>`
    : `<button class="mini" data-act="abandon">abandon run</button>`}
</div>`;
}

export function gearHtml(state: GameState): string {
  const p = state.player;
  const clothes = p.clothing
    .map((g) => `<div>${CLOTHING[g.id].name} <small>+${CLOTHING[g.id].insulation} C, ${Math.round(g.durability)}%</small>${durBar(g.durability)}</div>`)
    .join("");
  const tools = p.tools.length
    ? p.tools.map((t) => `<div>${TOOLS[t.id].name} <small>${Math.round(t.durability)}%</small>${durBar(t.durability)}</div>`).join("")
    : "<div class=\"dim\">no tools</div>";
  return `<h2>Worn <span class="r">+${insulation(state).toFixed(1)} C</span></h2>${clothes}<h2 style="margin-top:10px">Tools</h2>${tools}`;
}

export function clockHtml(state: GameState, cal: Calendar, ambient: number): string {
  const sun = cal.isNight ? "night" : "day";
  const snow = state.weather.snowCm >= 1 ? `<span>snow ${Math.round(state.weather.snowCm)} cm</span>` : "";
  return `<div class="clockrow"><div class="line">
<span class="big">Day ${cal.day}</span>
<span>${fmtDate(cal)}, ${cal.season}</span>
<span class="big">${fmtClock(cal.hour)}</span>
<span>${sun}, light ${fmtClock(cal.sunrise)} to ${fmtClock(cal.sunset)}</span>
<span class="${ambient < -10 ? "bad" : ""}">${Math.round(ambient)} C, ${weatherLabel(state.weather, ambient)}</span>
${snow}
<span class="dim">1 s = ${GAME_MINUTES_PER_REAL_SECOND} game min</span>
</div>${skyHtml()}</div>`;
}

export function regionHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const p = state.player;
  const id = ui.selected ?? p.region;
  const r = world.regions[id];
  const st = state.regions[id];
  const here = id === p.region;
  const nb = world.regions[p.region].neighbours.find((n) => n.id === id);
  const f = r.frac;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const terrain = [
    `forest ${pct(r.forest)} <small>(spruce ${pct(f.spruce)}, pine ${pct(f.pine)}, birch ${pct(f.birch)})</small>`,
    `bog ${pct(f.bog)}`, `meadow ${pct(f.meadow)}`, `rock ${pct(r.rock)}`, `water ${pct(f.water)}`,
  ].join(", ");
  const animals = SPECIES.map((s) => `${ANIMALS[s].name}: <b>${densityLabel(regionDensity(state, world, id, s, cal))}</b>`).join(", ");
  const spots = r.spots
    .map((s) => {
      const pileKg = st.piles[s.id] ? weight(st.piles[s.id]!) : 0;
      const isHere = here && p.spot === s.id;
      const lying = pileKg > 0 ? `${fmtKg(pileKg)} lying there` : "";
      if (!here) {
        return `<div>${SPOT_NAMES[s.id]} <small>${[s.id === "camp" ? "" : `${fmtKm(s.km)} from camp`, lying].filter(Boolean).join(", ")}</small></div>`;
      }
      if (isHere) return `<div><b>@</b> ${SPOT_NAMES[s.id]} <small>${["you are here", lying].filter(Boolean).join(", ")}</small></div>`;
      // Distance and time from where the player stands, not from camp.
      const walk = check(state, world, cal, "walk", s.id);
      const km = walkKm(r, p.spot, s.id);
      const btn = walk.ok
        ? ` <button class="mini" data-act="task" data-id="walk" data-arg="${s.id}">walk (${fmtDuration(walk.duration)}, ${fmtReal(walk.duration)})</button>`
        : ` <small>${esc(walk.why)}</small>`;
      return `<div>${SPOT_NAMES[s.id]} <small>${[`${fmtKm(km)} from here`, lying].filter(Boolean).join(", ")}</small>${btn}</div>`;
    })
    .join("");
  const built: string[] = [];
  if (st.structures.firePit) built.push("fire pit");
  if (st.structures.leanTo) built.push("lean-to");
  if (st.structures.cabin) built.push("log cabin");
  if (st.structures.dryingRack) built.push("drying rack");
  if (st.structures.snares) built.push(`${st.structures.snares} snare${st.structures.snares > 1 ? "s" : ""}${st.snareCatch.count ? ` (${st.snareCatch.count} caught)` : ""}`);
  const unfinished = Object.entries(st.build).filter(([, v]) => (v ?? 0) > 0).map(([k]) => `${k} in progress`);
  const fire = st.structures.firePit
    ? `<div>fire: ${st.fire.lit ? "<span class=\"good\">burning</span>" : "<span class=\"dim\">cold</span>"}</div>${here ? bar("fire", "fire", "Fuel") : ""}`
    : "";
  const rack = st.structures.dryingRack
    ? `<div>rack: ${st.rack.kg > 0 ? `${st.rack.kg.toFixed(1)} kg drying, ${Math.round((st.rack.dried / (48 * 60)) * 100)}%` : "empty"} <small>(${RACK_MAX_KG} kg max)</small></div>`
    : "";
  let travel = "";
  if (!here && nb) {
    travel = `<div style="margin-top:6px"><button class="act" data-act="task" data-id="travel" data-arg="${id}">Go to ${esc(r.name)} <small>${fmtKm(nb.km + spotKm(world.regions[p.region], p.spot))} from where you stand</small></button></div>`;
  } else if (!here) {
    travel = `<div class="dim" style="margin-top:6px">Not next to ${esc(world.regions[p.region].name)}. Travel region by region.</div>`;
  }
  return `<h2>${here ? "Here" : "Region"} <span class="r">${r.area.toFixed(1)} km2</span></h2>
<div><b class="accent">${esc(r.name)}</b>${here ? ` <small>you are at ${SPOT_NAMES[p.spot]}</small>` : ""}${ui.selected !== null ? ` <button class="mini" data-act="select" data-r="${p.region}">back to here</button>` : ""}</div>
<dl class="kv">
<dt>land</dt><dd>${terrain}</dd>
<dt>trees</dt><dd>${Math.floor(st.wood)} worth felling</dd>
<dt>animals</dt><dd>${animals}</dd>
<dt>places</dt><dd class="spots">${spots}</dd>
<dt>built</dt><dd>${built.length || unfinished.length ? [...built, ...unfinished].join(", ") : "<span class=\"dim\">nothing</span>"}${fire}${rack}</dd>
</dl>${travel}`;
}

export function taskHtml(state: GameState, world: World, cal: Calendar): string {
  const t = state.task;
  if (!t) return `<h2>Doing</h2><div class="dim">Nothing. Pick something below.</div>`;
  const opts = availableTasks(state, world, cal);
  const label = opts.find((o) => o.id === t.id && (o.arg ?? "") === (t.arg ?? ""))?.label ?? t.id;
  return `<h2>Doing${t.repeat ? " <span class=\"r\">on repeat</span>" : ""}</h2>
<div class="head"><b>${esc(label)}</b><button class="mini" data-act="stop">stop</button></div>
<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;
}

const GROUPS: { id: TaskGroup; label: string }[] = [
  { id: "gather", label: "Gather" }, { id: "hunt", label: "Hunt" }, { id: "camp", label: "Camp" },
  { id: "craft", label: "Craft" }, { id: "build", label: "Build" }, { id: "move", label: "Move" },
];

function optHtml(o: TaskOption): string {
  const arg = o.arg ?? "";
  if (!o.ok) {
    return `<div class="opt off" data-opt="${o.id}:${esc(arg)}"><span class="act">${esc(o.label)}<small>${esc(o.why)}${o.detail ? ` - ${esc(o.detail)}` : ""}</small></span></div>`;
  }
  const time = `${fmtDuration(o.duration)} (${fmtReal(o.duration)})`;
  const rep = o.repeatable
    ? `<button class="rep" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}" data-repeat="1" title="Keep doing it until it cannot continue">loop</button>`
    : "";
  return `<div class="opt" data-opt="${o.id}:${esc(arg)}"><button class="act" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}<small>${time}${o.detail ? `; ${esc(o.detail)}` : ""}</small></button>${rep}</div>`;
}

export function actionsHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const tabs = GROUPS.map((g) => `<button class="${g.id === ui.tab ? "on" : ""}" data-act="tab" data-tab="${g.id}">${g.label}</button>`).join("");
  const opts = availableTasks(state, world, cal).filter((o) => o.group === ui.tab);
  let instant = "";
  if (ui.tab === "camp") {
    const p = state.player;
    const invs = [p.pack, herePile(state)];
    const foods = (Object.keys(FOODS) as FoodId[])
      .map((f) => {
        const have = invs.reduce((a, inv) => a + qty(inv, f), 0);
        if (have <= 1e-9) return "";
        const def = FOODS[f];
        return `<button class="mini" data-act="eat" data-food="${f}">eat ${itemLabel(f, Math.min(def.portionKg, have))} <small>+${Math.round(def.kcalPerKg * Math.min(def.portionKg, have))} kcal${def.sickChance ? ", risky" : ""}</small></button>`;
      })
      .join(" ");
    const st = state.regions[p.region];
    const wood = invs.reduce((a, inv) => a + qty(inv, "firewood"), 0);
    const fire = st.fire.lit && p.spot === "camp"
      ? `<button class="mini" data-act="feed" ${wood <= 0 ? "disabled" : ""}>add firewood <small>${fmtKg(wood)} within reach</small></button>`
      : "";
    const raw = invs.reduce((a, inv) => a + qty(inv, "rawMeat"), 0);
    const rack = st.structures.dryingRack && p.spot === "camp"
      ? `<button class="mini" data-act="rack" ${raw <= 0 || st.rack.kg >= RACK_MAX_KG ? "disabled" : ""}>hang raw meat to dry <small>${fmtKg(Math.min(raw, RACK_MAX_KG - st.rack.kg))}</small></button>`
      : "";
    instant = `<div style="margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:4px">${foods}${fire}${rack}</div>`;
  }
  return `<h2>Do</h2><div class="tabs">${tabs}</div>${instant}${opts.map(optHtml).join("")}`;
}

function invRows(items: { item: ItemId; qty: number }[], act: "take" | "drop"): string {
  if (!items.length) return `<div class="dim">nothing</div>`;
  return `<div class="inv">${items
    .map(({ item, qty: q }) => {
      const one = ITEM_KG[item] === 1 ? Math.min(q, 1) : 1;
      const oneLabel = ITEM_KG[item] === 1 ? "1 kg" : "1";
      return `<span class="n">${itemLabel(item, q)}</span><span class="ctl"><button class="mini" data-act="${act}" data-item="${item}" data-n="${one}">${act} ${oneLabel}</button> <button class="mini" data-act="${act}" data-item="${item}" data-n="all">all</button></span>`;
    })
    .join("")}</div>`;
}

export function inventoryHtml(state: GameState, world: World): string {
  const p = state.player;
  const kg = weight(p.pack);
  const over = kg > PACK_HARD_KG ? "bad" : kg > PACK_COMFORTABLE_KG ? "accent" : "";
  const here = herePile(state);
  return `<h2>Pack <span class="r ${over}">${fmtKg(kg)} of ${PACK_COMFORTABLE_KG} kg comfortable, ${PACK_HARD_KG} kg max</span></h2>
${invRows(listItems(p.pack), "drop")}
${listItems(p.pack).length ? `<div style="margin-top:4px"><button class="mini" data-act="drop-all">drop everything here</button></div>` : ""}
<h2 style="margin-top:10px">On the ground at ${SPOT_NAMES[p.spot]}, ${esc(world.regions[p.region].name)} <span class="r">${fmtKg(weight(here))}</span></h2>
${invRows(listItems(here), "take")}`;
}

export function fmtLogTime(e: LogEntry): string {
  const abs = e.minute + 480;
  const day = Math.floor(e.minute / 1440) + 1;
  const hour = ((abs % 1440) / 60);
  return `d${day} ${fmtClock(hour)}`;
}

export function logHtml(state: GameState): string {
  const entries = state.log.slice(-60).reverse();
  return `<h2>Log</h2><div class="entries">${entries
    .map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(e.text)}</div>`)
    .join("")}</div>`;
}

export function deathHtml(state: GameState, world: World, cal: Calendar): string {
  const d = state.dead!;
  const cause = { starved: "You starved.", froze: "You froze.", wolves: "The wolves had you.", sickness: "The fever took you." }[d.cause];
  const s = state.stats;
  return `<div class="box">
<h1>Dead</h1>
<p>${cause} ${fmtDate(cal)}, day ${cal.day} of the run, at ${esc(world.regions[state.player.region].name)}.</p>
<p>${s.trees} trees felled. ${s.animals} animals taken. ${s.structures} things built. ${s.km.toFixed(1)} km walked.</p>
<p class="dim">The save is gone. There is no coming back from this one.</p>
<button class="act" data-act="restart">Begin again, somewhere new</button>
</div>`;
}

export function awayHtml(entries: LogEntry[], realSeconds: number, capped: boolean): string {
  const h = Math.floor(realSeconds / 3600);
  const m = Math.floor((realSeconds % 3600) / 60);
  const gameMin = realSeconds * GAME_MINUTES_PER_REAL_SECOND;
  return `<div class="box">
<h1>While you were away</h1>
<p>${h ? `${h} h ` : ""}${m} min of the clock; ${fmtDuration(gameMin)} in the north${capped ? " (a day is as much as the world runs on without you)" : ""}.</p>
${entries.length ? `<div class="entries">${entries.slice(-40).map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(e.text)}</div>`).join("")}</div>` : "<p class=\"dim\">Nothing worth telling.</p>"}
<button class="act" data-act="dismiss">Continue</button>
</div>`;
}

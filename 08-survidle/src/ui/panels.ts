import { itemLabel } from "../sim/actions";
import { absence, densityLabel, regionDensity } from "../sim/animals";
import { type Calendar, fmtClock, fmtDate, monthName } from "../sim/calendar";
import { coldFeet, coldHands, garmentWet } from "../sim/clothing";
import { groundDry, smoky } from "../sim/fire";
import { herePile, listItems, pile, pilesIn, qty, weight } from "../sim/inventory";
import { intentOption, intentSentence, yieldItem } from "../sim/intent";
import { CLOTHING, FOODS, type FoodId, KG_ITEMS, RACK_MAX_KG, RECIPE_IDS, STRUCTURE_IDS, TOOLS } from "../sim/items";
import { fishSpecies, huntedLand, isFish, isVoiceOnly, SPECIES_DEFS, type Species } from "../sim/species";
import { NOT_ORDERS, orderGate, type Gate } from "../sim/ladder";
import { countWord, orderMet, orderSentence, ordersHere } from "../sim/orders";
import { DEATH_LINES, FAT_KCAL_PER_KG, feltTemperature, insulation, starvation } from "../sim/player";
import { cellOf, describeWhere, kmBetween, spotHere, watersideCell } from "../sim/position";
import { regionState } from "../sim/regionstate";
import type { AwayOrder, AwaySummary } from "../sim/save";
import { level, levelMinutes, poolShare, SKILL_CAP, SKILL_IDS, SKILL_NAMES, skillLevel, RUNG_LEVEL, RUNG_ORDER, RUNG_WORD } from "../sim/skills";
import {
  availableTasks, check, fallChance, pausedList, SPOT_NAMES, type TaskGroup, type TaskOption, whereIs, withProgression,
} from "../sim/tasks";
import type { GameState, Garment, ItemId, LogEntry, SkillId, TaskId } from "../sim/types";
import { campWaterCapacity, ICE_SHORE_CM, THIRSTY_L, vesselLitres, WATER_FULL, waterSource } from "../sim/water";
import { iceMode, stormNow, walkableIce, weatherLabel } from "../sim/weather";
import { fmtDuration, fmtKg, fmtKm, fmtReal, GAME_MINUTES_PER_REAL_SECOND, PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../units";
import { regionAt, type RegionDef, speciesHere, type World } from "../world/gen";
import { esc, stripRequest, type UiState } from "./render";
import { skyHtml } from "./sky";

function bar(id: string, cls: string, label: string): string {
  return `<div class="bar ${cls}"><div class="fill" id="bar-${id}"></div><span class="lbl"><span>${label}</span><b id="val-${id}"></b></span></div>`;
}

function durBar(v: number): string {
  return `<div class="bar dur${v < 25 ? " low" : ""}"><div class="fill" style="width:${Math.max(0, Math.min(100, v))}%"></div></div>`;
}

function wetBar(g: Garment): string {
  const w = garmentWet(g);
  const label = w > 80 ? "soaked" : w > 50 ? "wet" : "";
  return `<div class="bar dur wet"><div class="fill" style="width:${Math.max(0, Math.min(100, w))}%"></div>${label ? `<span class="lbl"><span>${label}</span></span>` : ""}</div>`;
}

function masteryBar(m: { level: number; share: number }): string {
  return `<div class="bar mastery" title="mastery ${m.level}"><div class="fill" style="width:${Math.round(m.share * 100)}%"></div><span class="lbl"><span>mastery ${m.level}</span></span></div>`;
}

/** What the pool is giving right now, in words. */
function poolPerks(share: number, skill: SkillId): string[] {
  const out: string[] = [];
  if (share >= 0.5) out.push("10% faster");
  else if (share >= 0.1) out.push("5% faster");
  const yieldSkill = skill === "foraging" || skill === "fishing";
  if (share >= 0.95) out.push(yieldSkill ? "half again the yield" : "no tool wear");
  else if (share >= 0.25) out.push(yieldSkill ? "a fifth more yield" : "half the tool wear");
  return out;
}

export function statsHtml(state: GameState, world: World, cal: Calendar, ambient: number, ui: UiState): string {
  const p = state.player;
  const felt = feltTemperature(state, world, ambient);
  const tags: string[] = [];
  tags.push(`<span class="tag">feels like ${Math.round(felt)} C</span>`);
  if (p.sick > 0) tags.push(`<span class="tag bad">sick, ${fmtDuration(p.sick)} to go</span>`);
  if (p.injured > 0) tags.push(`<span class="tag bad">injured, ${fmtDuration(p.injured)}</span>`);
  if (p.frostbite.feet > 0) tags.push(`<span class="tag bad">frostbitten feet, ${fmtDuration(p.frostbite.feet)}</span>`);
  if (p.frostbite.hands > 0) tags.push(`<span class="tag bad">frostbitten hands, ${fmtDuration(p.frostbite.hands)}</span>`);
  if (p.torch.lit) tags.push(`<span class="tag">torch lit, ${fmtDuration(p.torch.minutes)}</span>`);
  if (p.kcal <= 1200) tags.push(`<span class="tag bad">starving</span>`);
  if (starvation(p) >= 0.75) tags.push(`<span class="tag bad">wasting</span>`);
  if (p.warmth < 20) tags.push(`<span class="tag bad">hypothermia</span>`);
  else if (p.warmth < 40) tags.push(`<span class="tag bad">cold</span>`);
  if (p.energy < 20) tags.push(`<span class="tag bad">exhausted</span>`);
  if (p.water < THIRSTY_L) tags.push(`<span class="tag bad">thirsty</span>`);
  return `<h2>You <span class="r">day ${cal.day}</span></h2>
${bar("health", "health", "Health")}
${bar("kcal", "kcal", "Food")}
<div class="dim">fat: ${(p.fat / FAT_KCAL_PER_KG).toFixed(1)} kg</div>
${bar("water", "water", "Water")}
${bar("warmth", "warmth", "Warmth")}
${bar("energy", "energy", "Energy")}
${bar("wet", "wet", "Wet")}
<div class="statuses">${tags.join("")}</div>
<div>
  <button class="mini${p.autoEat ? " on" : ""}" data-act="toggle-eat" title="Eat when the reserve drops under 1800 kcal">auto-eat: ${p.autoEat ? "on" : "off"}</button>
  <button class="mini${p.autoFeed ? " on" : ""}" data-act="toggle-feed" title="Feed the fire from firewood at camp while you are there">auto-feed fire: ${p.autoFeed ? "on" : "off"}</button>
  <button class="mini${p.autoDrink ? " on" : ""}" data-act="toggle-drink" title="Drink when the reserve drops under 1 litre, if a vessel or the water under foot allows">auto-drink: ${p.autoDrink ? "on" : "off"}</button>
</div>
<div style="margin-top:8px">
  ${ui.confirmAbandon
    ? `<button class="mini danger" data-act="abandon-yes">Really abandon this run? Yes, it is over</button> <button class="mini" data-act="abandon-no">no</button>`
    : `<button class="mini" data-act="abandon">abandon run</button>`}
</div>`;
}

export function gearHtml(state: GameState, felt: number): string {
  const p = state.player;
  const cf = coldFeet(state, felt);
  const ch = coldHands(state, felt);
  const clothes = p.clothing
    .map((g) => {
      const def = CLOTHING[g.id];
      const warmth = def.sleep ? `+${def.sleep} C asleep` : `+${def.insulation} C`;
      const cold = (def.slot === "boots" && cf) || (def.slot === "mittens" && ch) ? ` <small class="bad">${def.slot === "boots" ? "feet cold" : "hands cold"}</small>` : "";
      return `<div>${def.name} <small>${warmth}, ${Math.round(g.durability)}%</small>${cold}${durBar(g.durability)}${wetBar(g)}</div>`;
    })
    .join("");
  const tools = p.tools.length
    ? p.tools.map((t) => `<div>${TOOLS[t.id].name} <small>${Math.round(t.durability)}%</small>${durBar(t.durability)}</div>`).join("")
    : "<div class=\"dim\">no tools</div>";
  return `<h2>Worn <span class="r">+${insulation(state).toFixed(1)} C</span></h2>${clothes}<h2 style="margin-top:10px">Tools</h2>${tools}`;
}

export function skillsHtml(state: GameState): string {
  const rows = SKILL_IDS.map((id) => {
    const s = state.skills[id];
    const l = level(s.xp);
    const next = l >= SKILL_CAP ? null : levelMinutes(l + 1);
    const from = levelMinutes(l);
    const share = next ? (s.xp - from) / (next - from) : 1;
    const toNext = next ? `${fmtDuration(next - s.xp)} to ${l + 1}` : "at the cap";
    const pool = poolShare(state, id);
    const perks = poolPerks(pool, id);
    let nextShown = false;
    const rungs = RUNG_ORDER.map((k) => {
      const at = RUNG_LEVEL[k];
      if (l >= at) return `<span class="on">${RUNG_WORD[k]} ${at}</span>`;
      // Only the next shut rung says how far it is; the ones past it read as marks.
      const toGo = nextShown ? "" : `, ${fmtDuration(levelMinutes(at) - s.xp)} to go`;
      nextShown = true;
      return `<span class="">${RUNG_WORD[k]} ${at}${toGo}</span>`;
    }).join(" ");
    return `<div class="skill"><div class="line"><b>${SKILL_NAMES[id]}</b> <span class="lvl">${l}</span><span class="r">${toNext}</span></div>
<div class="bar dur"><div class="fill" style="width:${Math.round(share * 100)}%"></div></div>
<div class="bar pool"><div class="fill" style="width:${Math.round(pool * 100)}%"></div><i style="left:10%"></i><i style="left:25%"></i><i style="left:50%"></i><i style="left:95%"></i><span class="lbl"><span>pool ${Math.round(pool * 100)}%</span></span></div>
${perks.length ? `<div class="good"><small>${perks.join(", ")}</small></div>` : ""}<div class="rungs"><small>${rungs}</small></div></div>`;
  });
  return `<h2>Skills</h2>${rows.join("")}`;
}

export function clockHtml(state: GameState, cal: Calendar, ambient: number): string {
  const sun = cal.isNight ? "night" : "day";
  const snow = state.weather.snowCm >= 1 ? `<span>snow ${Math.round(state.weather.snowCm)} cm</span>` : "";
  const ice = state.weather.iceCm >= 1 ? `<span>ice ${Math.round(state.weather.iceCm)} cm</span>` : "";
  const storm = state.weather.storm && stormNow(state.weather, state.minute)
    ? `<span class="bad">storm, ${fmtDuration(state.weather.storm.until - state.minute)} left</span>` : "";
  const dry = groundDry(state.weather, cal) ? `<span class="bad">tinder dry</span>` : "";
  return `<div class="clockrow"><div class="line">
<span class="big">Day ${cal.day}</span>
<span>${fmtDate(cal)}, ${cal.season}</span>
<span class="big">${fmtClock(cal.hour)}</span>
<span>${sun}, light ${fmtClock(cal.sunrise)} to ${fmtClock(cal.sunset)}</span>
<span class="${ambient < -10 ? "bad" : ""}">${Math.round(ambient)} C, ${weatherLabel(state.weather, ambient)}</span>
${snow}
${ice}
${storm}
${dry}
<span class="dim">1 s = ${GAME_MINUTES_PER_REAL_SECOND} game min</span>
</div>${skyHtml()}</div>`;
}

/**
 * A second button offering the shortcut across thin ice, only while the ice
 * is thin (safe ice is already the plain route; no ice at all leaves nothing
 * to cross) and only when it beats the plain route: shorter, or the plain
 * route does not exist at all.
 */
function thinIceButton(state: GameState, world: World, cal: Calendar, id: "walk" | "travel", arg: string, plain: TaskOption): string {
  if (iceMode(state.weather) !== "thin") return "";
  const thin = check(state, world, cal, id, `${arg}:thin`);
  if (!thin.ok || (plain.ok && thin.duration >= plain.duration)) return "";
  const pct = Math.round(fallChance(state.weather.iceCm) * 100);
  return ` <button class="mini" data-act="task" data-id="${id}" data-arg="${arg}:thin" title="${pct}% chance of falling through, per cell crossed">across the ice (${Math.round(state.weather.iceCm)} cm, thin)</button>`;
}

/** "mallard gone until April" for a species that cannot be met at all now, otherwise the density in words. */
function rosterEntry(state: GameState, world: World, id: number, s: Species, cal: Calendar): string {
  const def = SPECIES_DEFS[s];
  // The same predicate the hunt and fish rows use, so the card and the row cannot disagree.
  const gone = absence(def, cal, state.weather.iceCm);
  if (gone) {
    if (!isVoiceOnly(s)) return `${def.name} ${gone}`;
    return def.season.kind === "migrant" ? `${def.name} (from ${monthName(def.season.arrive)})` : `${def.name} (${gone})`;
  }
  if (isVoiceOnly(s)) return def.name;
  return `${def.name} <b>${densityLabel(regionDensity(state, world, id, s, cal))}</b>`;
}

/** Four lines, each only the species that live here: Game, Birds, Fish, Heard. Empty lines are left out. */
export function rosterHtml(state: GameState, world: World, id: number, cal: Calendar): string {
  const here = speciesHere(regionAt(world, id));
  const groups: [string, (s: Species) => boolean][] = [
    ["Game", (s) => SPECIES_DEFS[s].kind === "mammal"],
    ["Birds", (s) => SPECIES_DEFS[s].kind === "bird" && !isVoiceOnly(s)],
    ["Fish", (s) => isFish(s)],
    ["Heard", (s) => isVoiceOnly(s)],
  ];
  return groups
    .map(([label, pick]) => {
      const list = here.filter(pick).map((s) => rosterEntry(state, world, id, s, cal));
      return list.length ? `<div>${label}: ${list.join(", ")}</div>` : "";
    })
    .join("");
}

export function regionHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const p = state.player;
  const id = ui.selected ?? p.region;
  const r = regionAt(world, id);
  const st = regionState(state, world, id);
  const here = id === p.region;
  const nb = regionAt(world, p.region).neighbours.find((n) => n.id === id);
  const f = r.frac;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const terrain = [
    `forest ${pct(r.forest)} <small>(spruce ${pct(f.spruce)}, pine ${pct(f.pine)}, birch ${pct(f.birch)})</small>`,
    `bog ${pct(f.bog)}`, `meadow ${pct(f.meadow)}`, `rock ${pct(r.rock)}`, `water ${pct(f.water)}`,
  ].join(", ");
  const myCell = cellOf(state, world);
  const spots = r.spots
    .map((s) => {
      const pileKg = state.piles[s.cell] ? weight(state.piles[s.cell]) : 0;
      const lying = pileKg > 0 ? `${fmtKg(pileKg)} lying there` : "";
      if (!here) {
        return `<div>${SPOT_NAMES[s.id]} <small>${[s.id === "camp" ? "" : `${fmtKm(s.km)} from camp`, lying].filter(Boolean).join(", ")}</small></div>`;
      }
      if (s.cell === myCell) return `<div><b>@</b> ${SPOT_NAMES[s.id]} <small>${["you are here", lying].filter(Boolean).join(", ")}</small></div>`;
      // Distance and time from where the player stands, along the route.
      const walk = check(state, world, cal, "walk", `spot:${s.id}`);
      const km = kmBetween(world, myCell, s.cell, walkableIce(state.weather));
      const btn = walk.ok
        ? ` <button class="mini" data-act="task" data-id="walk" data-arg="spot:${s.id}">walk (${fmtDuration(walk.duration)}, ${fmtReal(walk.duration)})</button>`
        : ` <small>${esc(walk.why)}</small>`;
      const thin = thinIceButton(state, world, cal, "walk", `spot:${s.id}`, walk);
      return `<div>${SPOT_NAMES[s.id]} <small>${[km === null ? "no way there" : `${fmtKm(km)} from here`, lying].filter(Boolean).join(", ")}</small>${btn}${thin}</div>`;
    })
    .join("");
  // Things lying about this region away from the named spots.
  const spotCells = new Set(r.spots.map((s) => s.cell));
  const loose = pilesIn(state, world, id)
    .filter((x) => !spotCells.has(x.cell) && x.cell !== myCell)
    .map((x) => {
      const walk = here ? check(state, world, cal, "walk", `cell:${x.cell}`) : null;
      const btn = walk?.ok ? ` <button class="mini" data-act="task" data-id="walk" data-arg="cell:${x.cell}">walk (${fmtDuration(walk.duration)}, ${fmtReal(walk.duration)})</button>` : "";
      return `<div>${fmtKg(weight(x.inv))} lying at ${esc(whereIs(state, world, x.cell))}${btn}</div>`;
    })
    .join("");
  const built: string[] = [];
  if (st.structures.firePit) built.push("fire pit");
  if (st.structures.leanTo) built.push("lean-to");
  if (st.structures.cabin) built.push("log cabin");
  if (st.structures.dryingRack) built.push("drying rack");
  if (st.structures.boughBed) built.push("bough bed");
  if (st.structures.snares) built.push(`${st.structures.snares} snare${st.structures.snares > 1 ? "s" : ""}${st.snareCatch.count ? ` (${st.snareCatch.count} caught)` : ""}`);
  const unfinished = (Object.keys(st.build) as (keyof typeof st.build)[]).filter((k) => (st.build[k] ?? 0) > 0).map((k) => `${k} in progress`);
  const fire = st.structures.firePit
    ? `<div>fire: ${st.fire.lit ? `<span class="good">burning${smoky(st.fire) ? ", smoking" : ""}</span>` : "<span class=\"dim\">cold</span>"}</div>${here ? bar("fire", "fire", "Fuel") : ""}`
    : "";
  const rack = st.structures.dryingRack
    ? `<div>rack: ${st.rack.kg > 0 ? `${st.rack.kg.toFixed(1)} kg drying, ${Math.round((st.rack.dried / (48 * 60)) * 100)}%` : "empty"} <small>(${RACK_MAX_KG} kg max)</small></div>`
    : "";
  const campPile = pile(state, st.campCell);
  const cap = campWaterCapacity(campPile);
  const water = cap > 0 || qty(campPile, "water") + qty(campPile, "ice") > 0
    ? `<div>water: ${qty(campPile, "water").toFixed(1)} of ${cap.toFixed(1)} l${qty(campPile, "ice") > 0 ? `, ${qty(campPile, "ice").toFixed(1)} l frozen` : ""}${st.iceHole ? ", ice hole open" : ""}</div>`
    : "";
  let travel = "";
  if (!here) {
    const go = check(state, world, cal, "travel", `region:${id}`);
    travel = go.ok
      ? `<div style="margin-top:6px"><button class="act" data-act="task" data-id="travel" data-arg="region:${id}">Go to ${esc(r.name)} <small>${esc(go.detail)}, ${fmtDuration(go.duration)} (${fmtReal(go.duration)})${nb ? "" : "; not a neighbour, a long way round"}</small></button>${thinIceButton(state, world, cal, "travel", `region:${id}`, go)}</div>`
      : `<div style="margin-top:6px"><span class="dim">${esc(go.why)}</span>${thinIceButton(state, world, cal, "travel", `region:${id}`, go)}</div>`;
  }
  return `<h2>${here ? "Here" : "Region"} <span class="r">${r.area.toFixed(1)} km2</span></h2>
<div><b class="accent">${esc(r.name)}</b>${here ? ` <small>you are ${esc(describeWhere(state, world))}</small>` : ""}${ui.selected !== null ? ` <button class="mini" data-act="select" data-r="${p.region}">back to here</button>` : ""}</div>
<dl class="kv">
<dt>land</dt><dd>${terrain}</dd>
<dt>trees</dt><dd>${Math.floor(st.wood)} worth felling</dd>
<dt>animals</dt><dd>${rosterHtml(state, world, id, cal)}</dd>
<dt>places</dt><dd class="spots">${spots}${loose}</dd>
<dt>built</dt><dd>${built.length || unfinished.length ? [...built, ...unfinished].join(", ") : "<span class=\"dim\">nothing</span>"}${fire}${rack}${water}</dd>
</dl>${travel}`;
}

const TASK_BAR = `<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;

/** The ranked list: each row its sentence, counters, state and buttons; the live row carries the task bar. */
function ordersHtml(state: GameState, world: World, cal: Calendar): string {
  const orders = ordersHere(state, world);
  const it = state.intent;
  const waiting = it?.task === "wait"
    ? `<div class="step">Waiting at camp: ${esc(it.step)}</div>${state.task ? TASK_BAR : ""}`
    : "";
  const rows = orders.map((o, i) => {
    const live = it?.orderId === o.id;
    const counts = o.done > 0 ? ` <small>${esc(`${o.done} ${countWord(o.req.task, o.done)}, ${fmtDuration(o.minutes)}`)}</small>` : "";
    const second = live
      ? `<div class="step">${esc(it!.step)}</div>${state.task ? TASK_BAR : ""}`
      : `<div class="step">${esc(o.skipped || (orderMet(state, world, o, false) ? "met" : "waiting"))}</div>`;
    const btns = `<span class="ctl"><button class="mini" data-act="order-up" data-id="${o.id}" ${i === 0 ? "disabled" : ""}>up</button> <button class="mini" data-act="order-down" data-id="${o.id}" ${i === orders.length - 1 ? "disabled" : ""}>down</button> <button class="mini" data-act="order-remove" data-id="${o.id}" title="Take it off the list">x</button></span>`;
    return `<div class="order${live ? " live" : ""}"><div class="head"><b>${i + 1}. ${esc(orderSentence(state, world, cal, o))}</b>${counts}${btns}</div>${second}</div>`;
  }).join("");
  return `${waiting}${rows}`;
}

export function taskHtml(state: GameState, world: World, cal: Calendar): string {
  const t = state.task;
  const it = state.intent;
  const orders = ordersHere(state, world);
  const aside = pausedList(state, world, cal);
  const asideHtml = aside.length
    ? `<div class="aside"><small>Set aside</small>${aside
        .map(({ task, option, here: isHere }) => {
          const pct = Math.round(task.fraction * 100);
          const note = !isHere || !option.ok ? ` <small>${esc(option.why)}</small>` : "";
          const resume = option.ok
            ? ` <button class="mini" data-act="task" data-id="${task.id}" data-arg="${esc(task.arg ?? "")}">resume</button>`
            : "";
          // Located work names its cell; carried work (light, repair, sharpen, craft) carries none,
          // so main.ts resolves it through "nearest" instead - camp for camp-bound work, here for craft.
          const cellAttr = task.cell >= 0 ? ` data-cell="${task.cell}"` : "";
          const finish = ` <button class="mini" data-act="finish" data-id="${task.id}" data-arg="${esc(task.arg ?? "")}"${cellAttr} title="Go there if need be and finish it">finish</button>`;
          return `<div class="paused">${esc(option.label)} <b>${pct}%</b>${note}${resume}${finish}</div>`;
        })
        .join("")}</div>`
    : "";
  // A scheduled intent is drawn as its row; a manual one, or a raw task, as a head of its own.
  const scheduled = it !== null && (it.task === "wait" || orders.some((o) => o.id === it.orderId));
  let head = "";
  if (it && !scheduled) {
    head = `<div class="head"><b>${esc(intentSentence(state, world, cal, it))}</b><button class="mini" data-act="stop" title="Stop; the share done is kept">stop</button></div>
<div class="step">${esc(it.step)}</div>${t ? TASK_BAR : ""}`;
  } else if (!it && t) {
    const opts = availableTasks(state, world, cal);
    let label = opts.find((o) => o.id === t.id && (o.arg ?? "") === (t.arg ?? ""))?.label ?? t.id;
    // Started as "anything": the species is what it turned out to be, so the head says both.
    if (t.any) label = `${label} (whatever was about)`;
    if ((t.id === "walk" || t.id === "travel") && state.route) label = `${t.id === "travel" ? "Go" : "Walk"} to ${state.route.label}`;
    head = `<div class="head"><b>${esc(label)}${t.repeat ? " <span class=\"r\">on repeat</span>" : ""}</b><button class="mini" data-act="stop" title="Set it aside; the share done is kept">stop</button></div>${TASK_BAR}`;
  } else if (!it && !orders.length) {
    head = `<div class="dim">Nothing. Pick something below.</div>`;
  }
  const list = orders.length ? ordersHtml(state, world, cal) : "";
  return `<h2>${orders.length ? "Orders" : "Doing"}</h2>${head}${list}${asideHtml}`;
}

const GROUPS: { id: TaskGroup; label: string }[] = [
  { id: "gather", label: "Gather" }, { id: "hunt", label: "Hunt" }, { id: "camp", label: "Camp" },
  { id: "craft", label: "Craft" }, { id: "build", label: "Build" }, { id: "move", label: "Move" },
];

function optHtml(o: TaskOption): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(o.recommended.text)}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  if (!o.ok) {
    return `<div class="opt off" data-opt="${o.id}:${esc(arg)}"><span class="act">${esc(o.label)}${rec}<small>${esc(o.why)}${o.detail ? ` - ${esc(o.detail)}` : ""}</small>${bar}</span></div>`;
  }
  const time = `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}`;
  const rep = o.repeatable
    ? `<button class="rep" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}" data-repeat="1" title="Keep doing it until it cannot continue">loop</button>`
    : "";
  return `<div class="opt" data-opt="${o.id}:${esc(arg)}"><button class="act" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${time}${o.detail ? `; ${esc(o.detail)}` : ""}</small>${bar}</button>${rep}</div>`;
}

/** The eat / add firewood buttons, shown whenever they apply, wherever the player stands. */
function instantHtml(state: GameState, world: World): string {
  const p = state.player;
  const invs = [p.pack, herePile(state, world)];
  const camp = spotHere(state, world) === "camp";
  const foods = (Object.keys(FOODS) as FoodId[])
    .map((f) => {
      const have = invs.reduce((a, inv) => a + qty(inv, f), 0);
      if (have <= 1e-9) return "";
      const def = FOODS[f];
      return `<button class="mini" data-act="eat" data-food="${f}">eat ${itemLabel(f, Math.min(def.portionKg, have))} <small>+${Math.round(def.kcalPerKg * Math.min(def.portionKg, have))} kcal${def.sickChance ? ", risky" : ""}</small></button>`;
    })
    .join(" ");
  const st = regionState(state, world, p.region);
  const wood = invs.reduce((a, inv) => a + qty(inv, "firewood") + qty(inv, "wetFirewood"), 0);
  const fire = st.fire.lit && camp
    ? `<button class="mini" data-act="feed" ${wood <= 0 ? "disabled" : ""}>add firewood <small>${fmtKg(wood)} within reach</small></button>`
    : "";
  const atSource = waterSource(state, world);
  const short = p.water < WATER_FULL - 1e-9;
  const shoreClosed = watersideCell(world, cellOf(state, world)) && state.weather.iceCm >= ICE_SHORE_CM;
  const drink = short && (atSource || vesselLitres(p) > 0)
    ? `<button class="mini" data-act="drink">drink <small>${p.water.toFixed(1)} of ${WATER_FULL.toFixed(1)} l</small></button>`
    : shoreClosed && vesselLitres(p) <= 0
      ? `<button class="mini" disabled>drink <small>iced over</small></button>`
      : "";
  const fill = atSource && p.tools.some((t) => (TOOLS[t.id].litres ?? 0) > (t.litres ?? 0))
    ? `<button class="mini" data-act="fill">fill vessels</button>`
    : "";
  return `<div style="margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:4px">${foods}${fire}${drink}${fill}</div>`;
}

export function actionsHtml(state: GameState, world: World, cal: Calendar, ui: UiState, instant = true): string {
  const tabs = GROUPS.map((g) => `<button class="${g.id === ui.tab ? "on" : ""}" data-act="tab" data-tab="${g.id}">${g.label}</button>`).join("");
  const opts = availableTasks(state, world, cal).filter((o) => o.group === ui.tab);
  const instantBtns = instant && ui.tab === "camp" ? instantHtml(state, world) : "";
  return `<h2>Do</h2><div class="tabs">${tabs}</div>${instantBtns}${opts.map(optHtml).join("")}`;
}

/** The Do panel's rows. The Hunt group is the region's own roster: what is not here is not offered. */
export function intentGroups(r: RegionDef): { label: string; items: { id: TaskId; arg?: string }[] }[] {
  return [
    { label: "Gather", items: [{ id: "chop" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }] },
    { label: "Hunt", items: [
      { id: "hunt" as TaskId, arg: "any" },
      ...huntedLand().filter((s) => r.capacity[s]).map((s) => ({ id: "hunt" as TaskId, arg: s })),
      { id: "fish" as TaskId, arg: "any" },
      ...fishSpecies().filter((s) => r.capacity[s]).map((s) => ({ id: "fish" as TaskId, arg: s })),
    ] },
    { label: "Camp", items: [{ id: "split" }, { id: "hang" }, { id: "cook", arg: "rawMeat" }, { id: "cook", arg: "fish" }, { id: "light" }, { id: "lightIndoors" }, { id: "melt" }, { id: "thaw" }, { id: "fill" }, { id: "iceHole" }, { id: "lightTorch" }, { id: "repair" }, { id: "sharpen" }, { id: "night" }, { id: "rest" }, { id: "sleep" }] },
    { label: "Make", items: RECIPE_IDS.map((id) => ({ id: "craft" as TaskId, arg: id })) },
    { label: "Build", items: STRUCTURE_IDS.map((id) => ({ id: "build" as TaskId, arg: id })) },
  ];
}

/**
 * What the strip would add to a plain click, in words; empty for once, leave
 * it, nearest. Mirrors startIntent's own coercions, so the row never
 * promises what the click would not actually do: a NOT_ORDERS task ignores
 * the strip entirely (forced to once, leave it, same as stripRequest), and
 * camp has always delivers to camp whatever the strip's own "bring it"
 * choice says.
 */
function stripSentence(ui: UiState, id: TaskId, arg: string | undefined): string {
  if (NOT_ORDERS.includes(id)) return "";
  const parts: string[] = [];
  const item = yieldItem(id, arg);
  if (ui.until === "times") parts.push(`${ui.n} times`);
  else if (ui.until === "campHas") parts.push(item ? `until camp has ${itemLabel(item, ui.n)}` : "once");
  // Light holds no stock, so "keep camp at N" has no N to show: the keep is the fire staying lit.
  else if (ui.until === "keep") parts.push(item ? `keep camp at ${itemLabel(item, ui.n)}` : id === "light" ? "keep it lit" : "once");
  else if (ui.until === "forever") parts.push("forever");
  if (item && (ui.deliver === "camp" || ui.until === "campHas" || ui.until === "keep")) parts.push("bringing it to camp");
  else if (!item && ui.deliver === "camp" && id !== "light") parts.push("bringing it to camp");
  if (ui.where !== "nearest") parts.push(`at ${SPOT_NAMES[ui.where]}`);
  return parts.join(", ");
}

function intentRowHtml(o: TaskOption, extra: string, gate: Gate): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(o.recommended.text)}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  const detail = [o.detail, extra].filter(Boolean).join("; ");
  // A shut rung is the promise of the rung, not a hidden row: the same data-opt, the reason, and nothing to click.
  if (!gate.ok) {
    return `<div data-opt="intent:${o.id}:${esc(arg)}" class="opt off"><span class="act">${esc(o.label)}${rec}<small>${esc(gate.why)}</small>${bar}</span></div>`;
  }
  if (!o.ok) {
    return `<div class="opt off" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}" title="Add it anyway; it waits until it can start">${esc(o.label)}${rec}<small>${esc(o.why)}${detail ? ` - ${esc(detail)}` : ""}</small>${bar}</button></div>`;
  }
  const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const line = [time, detail].filter(Boolean).join("; ");
  return `<div class="opt" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${esc(line)}</small>${bar}</button></div>`;
}

function stripHtml(state: GameState, world: World, ui: UiState): string {
  const b = (k: string, v: string, label: string, on: boolean) => `<button class="mini${on ? " on" : ""}" data-act="strip" data-k="${k}" data-v="${v}">${label}</button>`;
  const r = regionAt(world, state.player.region);
  const here = cellOf(state, world);
  const spots = r.spots.filter((s) => s.id !== "camp").map((s) => {
    const km = kmBetween(world, here, s.cell);
    return b("where", s.id, `${SPOT_NAMES[s.id]}${km === null ? "" : ` <small>${fmtKm(km)}</small>`}`, ui.where === s.id);
  }).join("");
  return `<div class="strip">
<div><small>do it</small>${b("until", "once", "once", ui.until === "once")}${b("until", "times", "N times", ui.until === "times")}${b("until", "campHas", "until camp has N", ui.until === "campHas")}${b("until", "keep", "keep camp at N", ui.until === "keep")}${b("until", "forever", "forever", ui.until === "forever")}<input class="n" type="number" min="1" data-strip-n value="${ui.n}"></div>
<div><small>bring it</small>${b("deliver", "leave", "leave it", ui.deliver === "leave")}${b("deliver", "camp", "to camp", ui.deliver === "camp")}</div>
<div><small>where</small>${b("where", "nearest", "nearest", ui.where === "nearest")}${spots}</div>
</div>`;
}

export function doHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const groups = intentGroups(regionAt(world, state.player.region)).map((g) => {
    const rows = g.items.map(({ id, arg }) => {
      const { req, kind } = stripRequest(ui, id, arg);
      return intentRowHtml(withProgression(state, world, intentOption(state, world, cal, id, arg, ui.where)), stripSentence(ui, id, arg), orderGate(state, req, kind));
    }).join("");
    return `<div class="grp"><small>${g.label}</small>${rows}</div>`;
  }).join("");
  const adv = `<div style="margin-top:8px"><button class="mini${ui.advanced ? " on" : ""}" data-act="advanced">advanced: ${ui.advanced ? "on" : "off"}</button></div>${ui.advanced ? actionsHtml(state, world, cal, ui, false) : ""}`;
  return `<h2>Do</h2>${stripHtml(state, world, ui)}${instantHtml(state, world)}${groups}${adv}`;
}

/** Water and ice live only in piles (spec 2.1); a take button would move litres into the pack, where they are inert. */
function invRows(items: { item: ItemId; qty: number }[], act: "take" | "drop"): string {
  const rows = act === "take" ? items.filter(({ item }) => item !== "water" && item !== "ice") : items;
  if (!rows.length) return `<div class="dim">nothing</div>`;
  return `<div class="inv">${rows
    .map(({ item, qty: q }) => {
      const one = KG_ITEMS.has(item) ? Math.min(q, 1) : 1;
      const oneLabel = KG_ITEMS.has(item) ? "1 kg" : "1";
      return `<span class="n">${itemLabel(item, q)}</span><span class="ctl"><button class="mini" data-act="${act}" data-item="${item}" data-n="${one}">${act} ${oneLabel}</button> <button class="mini" data-act="${act}" data-item="${item}" data-n="all">all</button></span>`;
    })
    .join("")}</div>`;
}

export function inventoryHtml(state: GameState, world: World): string {
  const p = state.player;
  const kg = weight(p.pack);
  const over = kg > PACK_HARD_KG ? "bad" : kg > PACK_COMFORTABLE_KG ? "accent" : "";
  const here = herePile(state, world);
  return `<h2>Pack <span class="r ${over}">${fmtKg(kg)} of ${PACK_COMFORTABLE_KG} kg comfortable, ${PACK_HARD_KG} kg max</span></h2>
${invRows(listItems(p.pack), "drop")}
${listItems(p.pack).length ? `<div style="margin-top:4px"><button class="mini" data-act="drop-all">drop everything here</button></div>` : ""}
<h2 style="margin-top:10px">On the ground here, ${esc(describeWhere(state, world))} <span class="r">${fmtKg(weight(here))}</span></h2>
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

function bestSkill(state: GameState): string {
  const best = SKILL_IDS.map((id) => ({ id, l: skillLevel(state, id) })).sort((a, b) => b.l - a.l)[0];
  return `Best skill: ${SKILL_NAMES[best.id]} ${best.l}.`;
}

export function deathHtml(state: GameState, world: World, cal: Calendar): string {
  const d = state.dead!;
  const cause = DEATH_LINES[d.cause];
  const s = state.stats;
  const story = state.log.filter((e) => e.minute <= d.minute && e.text !== DEATH_LINES[d.cause]).slice(-3);
  return `<div class="box">
<h1>Dead</h1>
<p>${cause} ${fmtDate(cal)}, day ${cal.day} of the run, at ${esc(regionAt(world, state.player.region).name)}.</p>
${story.length ? `<div class="entries">${story.map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(e.text)}</div>`).join("")}</div>` : ""}
<p>${s.trees} trees felled. ${s.animals} animals taken. ${s.structures} things built. ${s.km.toFixed(1)} km walked.</p>
<p>${bestSkill(state)}</p>
<p class="dim">The save is gone. There is no coming back from this one.</p>
<button class="act" data-act="restart">Begin again, somewhere new</button>
</div>`;
}

function awayOrderLine(o: AwayOrder): string {
  const did = o.done > 0 ? `${o.done} ${countWord(o.task, o.done)}, ${fmtDuration(o.minutes)}` : "";
  const now = o.gone ? "done" : o.skipped ? `blocked, ${o.skipped}` : did ? "" : "nothing to do";
  return `<div class="e ${o.skipped && !o.gone ? "bad" : ""}">${esc(o.label)}: ${esc([did, now].filter(Boolean).join("; "))}.</div>`;
}

export function awayHtml(away: AwaySummary, realSeconds: number, capped: boolean): string {
  const h = Math.floor(realSeconds / 3600);
  const m = Math.floor((realSeconds % 3600) / 60);
  const gameMin = realSeconds * GAME_MINUTES_PER_REAL_SECOND;
  const moved = away.movedTo ? `<p>You are now in ${esc(away.movedTo)}.</p>` : "";
  const orders = away.orders.length ? `<div class="entries orders">${away.orders.map(awayOrderLine).join("")}</div>` : "";
  const entries = away.entries;
  return `<div class="box">
<h1>While you were away</h1>
<p>${h ? `${h} h ` : ""}${m} min of the clock; ${fmtDuration(gameMin)} in the north${capped ? " (a day is as much as the world runs on without you)" : ""}.</p>
${moved}${orders}
${entries.length ? `<div class="entries">${entries.slice(-40).map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(e.text)}</div>`).join("")}</div>` : "<p class=\"dim\">Nothing worth telling.</p>"}
<button class="act" data-act="dismiss">Continue</button>
</div>`;
}

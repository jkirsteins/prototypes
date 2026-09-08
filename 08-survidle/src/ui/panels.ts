import { edible, HUNGRY_LINE, itemLabel, refusalReason } from "../sim/actions";
import { type Calendar, fmtClock, fmtDate } from "../sim/calendar";
import { needsMending, rackCapacity } from "../sim/camp";
import { CAPABILITIES, standingHere } from "../sim/capabilities";
import { coldFeet, coldHands, garmentWet } from "../sim/clothing";
import { groundDry, smoky } from "../sim/fire";
import { herePile, listItems, pile, qty, weight } from "../sim/inventory";
import { body } from "../sim/person";
import { intentSentence, WAITING_STEP } from "../sim/intent";
import { CLOTHING, FOODS, type FoodId, ITEM_KG, KCAL_FULL, KG_ITEMS, STRUCTURES, TOOLS } from "../sim/items";
import { knownShare } from "../sim/mapped";
import { entry, epitaph, epitaphTail, fmtWorldDate, monthOfDoy, stories } from "../sim/epitaph";
import { CAUSE_WORD, type ForecastRow } from "../sim/forecast";
import type { ForecastView } from "../sim/forecaster";
import { daysInWords, landingDate, nextBoatDate } from "../sim/landing";
import { MANUAL_LINKS, MANUAL_SECTIONS } from "../sim/manual";
import { cardHtml, deadExtras, livingExtras } from "./card";
import { faceSvg } from "./face";
import { moodOf } from "./mood";
import { fmtName } from "../sim/names";
import { sleepiness, SLEEPY_AT } from "../sim/sleep";
import { countWord, judgeOrders, orderSentence, ordersHere, waitingLine } from "../sim/orders";
import { feltTemperature, insulation, starvation } from "../sim/player";
import { illuminance, lightWord } from "../sim/light";
import { campCellOf, cellOf, describeWhere, kmBetween, spotHere, SPOT_WORDS, watersideCell } from "../sim/position";
import { current, worldDate } from "../sim/record";
import { regionState } from "../sim/regionstate";
import type { AwayOrder, AwaySummary } from "../sim/save";
import { CARRY_SHARE, keyName, level, levelMinutes, masteryMilestone, poolShare, SKILL_CAP, SKILL_IDS, SKILL_NAMES, RUNG_LEVEL, RUNG_ORDER, RUNG_WORD } from "../sim/skills";
import { NAMES, ASKS_FOR, nextThreshold } from "../sim/spine";
import {
  availableTasks, check, fallChance, pausedList, type TaskOption, whereIs,
} from "../sim/tasks";
import type { GameState, Garment, ItemId, LogEntry, Person, SkillId } from "../sim/types";
import { campWaterCapacity, ICE_SHORE_CM, THIRSTY_L, vesselLitres, WATER_FULL, waterSource } from "../sim/water";
import { iceMode, stormNow, walkableIce, weatherLabel } from "../sim/weather";
import { fmtDuration, fmtKg, fmtKm, GAME_MINUTES_PER_REAL_SECOND, shareWord } from "../units";
import { regionAt, type World } from "../world/gen";
import { hurryKind, PULSE_MIN } from "./hurry";
import { esc, type UiState } from "./render";
import { plain, voice } from "../sim/voice";
import { skyHtml } from "./sky";

function bar(id: string, cls: string, label: string, markAt?: number): string {
  // A mark is a fixed share of the bar, so it belongs in the markup: it is
  // the one part of a bar that does not move, and the thing a falling fill
  // is falling toward.
  const mark = markAt === undefined ? "" : `<div class="mark" style="left:${(markAt * 100).toFixed(1)}%" title="eats here"></div>`;
  return `<div class="bar ${cls}"><div class="fill" id="bar-${id}"></div>${mark}<span class="lbl"><span>${label}</span><b id="val-${id}"></b></span></div>`;
}

/**
 * No bar's fill carries a width. A width is a moving number, and a panel is
 * redrawn whenever its markup string differs from last frame's, so one raw
 * width puts the whole panel through a parse and a diff sixty times a second
 * to move one bar a fraction of a pixel. A fill names the thing it draws
 * instead, and updateFills in bars.ts writes the width straight onto the
 * element, touching nothing else. tests/churn.test.ts holds the line.
 */
function durBar(v: number, of: string): string {
  return `<div class="bar dur${v < 25 ? " low" : ""}"><div class="fill" data-fill="${esc(of)}"></div></div>`;
}

function wetBar(g: Garment): string {
  const w = garmentWet(g);
  const label = w > 80 ? "soaked" : w > 50 ? "wet" : "";
  return `<div class="bar dur wet"><div class="fill" data-fill="${esc(`garmentWet:${g.id}`)}"></div>${label ? `<span class="lbl"><span>${label}</span></span>` : ""}</div>`;
}

/**
 * What a row's practice is called and where it sits: the skill it trains,
 * then this one action within it, then the level of that action. A bare
 * "mastery 1" beside a Skills panel reading "Woodcraft 2" was two numbers
 * with no stated relation, and read as a contradiction; the breadcrumb says
 * the smaller number is a child of the larger. It also gives the filter box
 * a category to match, so typing a skill's name finds every row under it.
 *
 * Only the level is in the markup, and that moves about once a session; the
 * share climbs with every minute of work, so the fill names what it draws
 * and leaves the width to updateFills.
 */
export function masteryLine(state: GameState, m: { level: number; skill: SkillId; key: string }): string {
  const crumb = `<small class="crumb">${esc(SKILL_NAMES[m.skill])} &gt; ${esc(keyName(m.key))} ${m.level}</small>`;
  const next = masteryMilestone(state, m.skill, m.key);
  if (!next) return crumb;
  const label = `${plain(next.text)} at ${next.at}`;
  return `${crumb}<div class="bar mastery" title="${esc(label)}"><div class="fill" data-fill="${esc(`masteryTo:${m.skill}|${m.key}`)}"></div><span class="lbl"><span>${esc(label)}</span></span></div>`;
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
  // Under the meal line means the meal did not happen - auto-eat off, or
  // nothing left it would take. Either way the fat behind it is paying, and
  // that is the state worth a word. Starving is what the fat running out is.
  if (p.kcal < HUNGRY_LINE) tags.push(`<span class="tag bad">hungry</span>`);
  if (starvation(state) >= 0.5) tags.push(`<span class="tag bad">starving</span>`);
  if (starvation(state) >= 0.75) tags.push(`<span class="tag bad">wasting</span>`);
  if (p.warmth < 20) tags.push(`<span class="tag bad">hypothermia</span>`);
  else if (p.warmth < 40) tags.push(`<span class="tag bad">cold</span>`);
  if (p.energy < 20) tags.push(`<span class="tag bad">exhausted</span>`);
  if (sleepiness(p.sleepDebt, cal.hour) >= SLEEPY_AT) tags.push(`<span class="tag bad">sleepy</span>`);
  if (p.water < THIRSTY_L) tags.push(`<span class="tag bad">thirsty</span>`);
  return `<h2><span class="stat-face mood-${moodOf(state)}">${faceSvg(current(state).person, 24)}</span>${esc(current(state).name.first)} <span class="r">day ${cal.day}</span></h2>
${bar("health", "health", "Health")}
${bar("kcal", "kcal", "Food", HUNGRY_LINE / KCAL_FULL)}
${bar("fat", "fat", "Fat")}
${bar("water", "water", "Water")}
${bar("warmth", "warmth", "Warmth")}
${bar("energy", "energy", "Energy")}
${bar("wet", "wet", "Wet")}
<div class="statuses">${tags.join("")}</div>
<div class="autos">
  <span class="dim">auto</span>
  <button class="mini${p.autoEat ? " on" : ""}" data-act="toggle-eat" title="Eat when the reserve drops under ${HUNGRY_LINE} kcal">eat</button>
  <button class="mini${p.autoDrink ? " on" : ""}" data-act="toggle-drink" title="Drink when the reserve drops under 1 litre, if a vessel or the water under foot allows">drink</button>
  <button class="mini${p.autoFeed ? " on" : ""}" data-act="toggle-feed" title="Feed the fire from firewood at camp while you are there">feed fire</button>
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
      return `<div>${def.name} <small>${warmth}, ${Math.round(g.durability)}%</small>${cold}${durBar(g.durability, `garment:${g.id}`)}${wetBar(g)}</div>`;
    })
    .join("");
  const tools = p.tools.length
    ? p.tools.map((t) => `<div>${TOOLS[t.id].name} <small>${Math.round(t.durability)}%</small>${durBar(t.durability, `tool:${t.id}`)}</div>`).join("")
    : "<div class=\"dim\">no tools</div>";
  return `<h2>Worn <span class="r">+${insulation(state).toFixed(1)} C</span></h2>${clothes}<h2 style="margin-top:10px">Tools</h2>${tools}`;
}

export function skillsHtml(state: GameState): string {
  const rows = SKILL_IDS.map((id) => {
    const s = state.skills[id];
    const l = level(s.xp);
    const next = l >= SKILL_CAP ? null : levelMinutes(l + 1);
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
    const carriedNote =
      s.carried && s.carried > s.xp / 2 && state.survivors.length >= 2
        ? ` carried from ${esc(fmtName(state.survivors[state.survivors.length - 2].name))}`
        : "";
    return `<div class="skill"><div class="line"><b>${SKILL_NAMES[id]}</b> <span class="lvl">${l}</span><span class="r">${toNext}${carriedNote}</span></div>
<div class="bar dur"><div class="fill" data-fill="skill:${id}"></div></div>
<div class="bar pool"><div class="fill" data-fill="pool:${id}"></div><i style="left:10%"></i><i style="left:25%"></i><i style="left:50%"></i><i style="left:95%"></i><span class="lbl"><span>pool ${Math.round(pool * 100)}%</span></span></div>
${perks.length ? `<div class="good"><small>${perks.join(", ")}</small></div>` : ""}<div class="rungs"><small>${rungs}</small></div></div>`;
  });
  return `<h2>Skills</h2>${rows.join("")}`;
}

export function clockHtml(state: GameState, world: World, cal: Calendar, _ambient: number, rate = 1): string {
  // What a person would call the light where they stand, which after dark is
  // the difference between a night's work and a night's groping about. The
  // lux behind it is never shown. The weather has its own widget.
  const sun = lightWord(illuminance(state, world, cal, cellOf(state, world)));
  return `<div class="when">
<div class="big">Day ${cal.day} <span class="hour">${fmtClock(cal.hour)}</span></div>
<div class="dim">${fmtDate(cal)}, ${cal.season} &middot; ${sun}</div>
<div class="${rate > 1 ? "hurrying" : "dim"}"><small>1 s = ${Math.round(GAME_MINUTES_PER_REAL_SECOND * rate)} game min</small></div>
</div>`;
}

/**
 * The weather, as its own widget, built the way a phone's is.
 *
 * The sky's picture and the day's ends at the top, the temperature large
 * enough to read without looking for it, the sky in a word under it, then
 * the pairs a reader scans rather than reads. What the ground is doing -
 * snow, ice, a storm, tinder dry - is one of those pairs rather than a
 * headline, because whether there are two or three centimetres of snow is
 * true and is not what anybody opens a panel to learn.
 */
export function weatherHtml(state: GameState, world: World, cal: Calendar, ambient: number): string {
  const snow = state.weather.snowCm >= 1 ? `snow ${Math.round(state.weather.snowCm)} cm` : "";
  const ice = state.weather.iceCm >= 1 ? `ice ${Math.round(state.weather.iceCm)} cm` : "";
  const ground = [snow, ice].filter(Boolean).join(", ");
  const storm = state.weather.storm && stormNow(state.weather, state.minute)
    ? `<div class="wx-warn">storm, ${fmtDuration(state.weather.storm.until - state.minute)} left</div>` : "";
  const dry = groundDry(state.weather, cal) ? `<div class="wx-warn">tinder dry</div>` : "";
  const felt = Math.round(feltTemperature(state, world, ambient));
  return `<div class="wx">
<div class="wx-head">
  <div class="wx-sky">${skyHtml()}</div>
  <div class="wx-sun"><div>&uarr; ${fmtClock(cal.sunrise)}</div><div>&darr; ${fmtClock(cal.sunset)}</div></div>
</div>
<div class="wx-temp ${ambient < -10 ? "bad" : ""}">${Math.round(ambient)}<span class="deg">C</span></div>
<div class="wx-word">${weatherLabel(state.weather, ambient)}</div>
<div class="wx-rows">
  <div class="wx-k">Feels like</div><div class="wx-v ${felt < 0 ? "bad" : ""}">${felt} C</div>
  ${ground ? `<div class="wx-k">Ground</div><div class="wx-v">${ground}</div>` : ""}
</div>
${storm}${dry}
<div class="wx-where">${esc(regionAt(world, state.player.region).name)}</div>
</div>`;
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




/**
 * What the camp is doing while you are looking somewhere else.
 *
 * The fire and whether it has anything left to burn, what stands here,
 * what is lying here, and what each producer is limited by - the reason a
 * camp that makes its own food still runs out.
 *
 * This is the one thing the region panel held that a map tooltip could not
 * take. Lighting the fire produced an animation; losing it produced
 * silence, and he found out by noticing. An idle game must be loudest when
 * a thing the player built stops, so this sits in the info column and is
 * never behind a pointer or a tab.
 */
/**
 * Everywhere you can go, in a corner of the map: the named places in this
 * region, then the ways out of it.
 *
 * Both used to live at the foot of the region panel, and the ways out only
 * after picking a neighbour on the map first - so a player who never
 * worked out that regions were clickable never learned there was anywhere
 * else to go. They sit on the ground they lead off now.
 *
 * The places are here rather than left to the map's own marks because
 * those draw at the rungs below the default: a player who never zooms in
 * would otherwise have no way to learn the forest is three hundred metres
 * off. The tooltip answers "what is that cell"; this answers "where are
 * the places", which is a different question and the one he was asking.
 */
export function placesHtml(state: GameState, world: World, cal: Calendar): string {
  const r = regionAt(world, state.player.region);
  const camp = campCellOf(state, world);
  const here = cellOf(state, world);
  const rows = r.spots
    .map((s) => {
      const cell = s.id === "camp" ? camp : s.cell;
      // A generated spot sitting on the live camp's own cell would draw a
      // second row for the same ground. The camp row, listed first, stands
      // for it.
      if (s.id !== "camp" && cell === camp) return "";
      const name = esc(SPOT_WORDS[s.id]);
      if (cell === here) return `<div class="way" data-place="${s.id}"><b>${name}</b> <small class="dim">you are here</small></div>`;
      const walk = check(state, world, cal, "walk", `spot:${s.id}`);
      const km = kmBetween(state, world, here, cell, walkableIce(state.weather));
      if (!walk.ok) return `<div class="way" data-place="${s.id}"><span class="dim">${name}: ${esc(plain(walk.why))}</span></div>`;
      // The whole row is the button, and what it costs is in its own label:
      // a name in a button beside a sentence saying "from here" spent two
      // thirds of the row on words that never change.
      const cost = `${km === null ? "" : `${esc(fmtKm(km))}, `}${esc(fmtDuration(walk.duration))}`;
      return `<div class="way" data-place="${s.id}"><button class="mini go" data-act="task" data-id="walk" data-arg="spot:${s.id}">${name} <small>${cost}</small></button>${thinIceButton(state, world, cal, "walk", `spot:${s.id}`, walk)}</div>`;
    })
    .join("");
  return `<div class="waylabel">places</div>${rows}`;
}

/**
 * The way into one region: go there when its ground is known, and open it
 * when it is not.
 *
 * This is the whole of what leaving looks like, for one neighbour. The map
 * is where it is offered - point at a region and it says how to get in -
 * because a list of names in a corner is a second place to learn about
 * ground the map is already drawing.
 */
export function wayIntoHtml(state: GameState, world: World, cal: Calendar, region: number): string {
  const name = esc(regionAt(world, region).name);
  if (knownShare(state, world, region) >= 1) {
    const go = check(state, world, cal, "travel", `region:${region}`);
    const ice = thinIceButton(state, world, cal, "travel", `region:${region}`, go);
    return go.ok
      ? `<div class="way" data-way="${region}"><button class="mini go" data-act="task" data-id="travel" data-arg="region:${region}">Go to ${name} <small>${esc(fmtDuration(go.duration))}</small></button>${ice}</div>`
      : `<div class="way" data-way="${region}"><span class="dim">${name}: ${esc(plain(go.why))}</span>${ice}</div>`;
  }
  const ex = check(state, world, cal, "explore", `region:${region}`);
  return ex.ok
    ? `<div class="way" data-way="${region}"><button class="mini go" data-act="task" data-id="explore" data-arg="region:${region}">Explore ${name}</button></div>`
    : `<div class="way" data-way="${region}"><span class="dim">${name}: ${esc(plain(ex.why))}</span></div>`;
}

/**
 * Every way out of this region, for the tests that ask whether a thing can
 * be reached at all. The board offers these one at a time, on the map.
 */
export function travelHtml(state: GameState, world: World, cal: Calendar): string {
  return regionAt(world, state.player.region).neighbours
    .map((n) => wayIntoHtml(state, world, cal, n.id))
    .join("");
}

export function campHtml(state: GameState, world: World): string {
  const id = state.player.region;
  const r = regionAt(world, id);
  const st = regionState(state, world, id);

  const built: string[] = [];
  if (st.structures.firePit) built.push(STRUCTURES.firePit.name);
  if (st.structures.leanTo) built.push(needsMending(st, "leanTo") ? "lean-to (needs re-roofing)" : "lean-to");
  if (st.structures.cabin) built.push("log cabin");
  if (st.structures.turfHut) built.push(needsMending(st, "turfHut") ? "turf hut (needs re-roofing)" : "turf hut");
  if (st.structures.dryingRack) built.push(needsMending(st, "dryingRack") ? "drying rack (needs relashing)" : "drying rack");
  if (st.structures.boughBed) built.push("bough bed");
  if (st.structures.waterStore) built.push("water trough");
  if (st.structures.snowShelter) built.push("snow shelter");
  if (st.structures.snares) built.push(`${st.structures.snares} snare${st.structures.snares > 1 ? "s" : ""}${st.snareCatch.count ? ` (${st.snareCatch.count} caught)` : ""}`);
  if (st.trap) built.push(`trap at ${esc(whereIs(state, world, st.trap.cell))}: ${st.trap.kg > 0 ? `${st.trap.kg.toFixed(1)} kg` : "empty"}`);
  const unfinished = (Object.keys(st.build) as (keyof typeof st.build)[]).filter((k) => (st.build[k] ?? 0) > 0).map((k) => `${k} in progress`);

  // The fuel figure moves with every minute the fire burns, so the bar names
  // what it draws and bars.ts writes the width; the markup never says it.
  const fire = st.structures.firePit
    ? `<div>fire: ${st.fire.lit ? `<span class="good">burning${smoky(st.fire) ? ", smoking" : ""}</span>` : "<span class=\"dim\">cold</span>"}</div>${bar("fire", "fire", "Fuel")}`
    : "";
  const rack = st.structures.dryingRack
    ? `<div>rack: ${st.rack.kg > 0 ? `${st.rack.kg.toFixed(1)} kg drying, ${Math.round((st.rack.dried / (48 * 60)) * 100)}%` : "empty"} <small>(${rackCapacity(st)} kg max)</small></div>`
    : "";
  const campPile = pile(state, st.campCell);
  const cap = campWaterCapacity(campPile, st);
  const water = cap > 0 || qty(campPile, "water") + qty(campPile, "ice") > 0
    ? `<div>water: ${qty(campPile, "water").toFixed(1)} of ${cap.toFixed(1)} l${qty(campPile, "ice") > 0 ? `, ${qty(campPile, "ice").toFixed(1)} l frozen` : ""}${st.iceHole ? ", ice hole open" : ""}</div>`
    : "";
  const lying = weight(campPile);
  const heap = lying > 0 ? `<div class="dim">${fmtKg(lying)} lying here</div>` : "";
  const limits = CAPABILITIES.filter((c) => c.producer && standingHere(state, st, world, c))
    .map((c) => `<div><small>${esc(c.id)}: ${esc(c.limits)}</small></div>`)
    .join("");

  const stands = built.length || unfinished.length
    ? `<div>${[...built, ...unfinished].join(", ")}</div>`
    : `<div class="dim">nothing built</div>`;
  return `<h2>Camp <span class="r">${esc(r.name)}</span></h2>${fire}${stands}${rack}${water}${heap}${limits}`;
}


const TASK_BAR = `<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;
/** The pulse draining, on the live row of an order hurried by clicking; written by id each frame. */
const HURRY_BAR = `<div class="bar hurry"><div class="fill" id="bar-hurry"></div></div>`;


/** The ranked list: each row its sentence, counters, state and buttons; the live row carries the task bar. */
export function ordersHtml(state: GameState, world: World, cal: Calendar): string {
  const orders = ordersHere(state, world);
  const it = state.intent;
  // An idle wait is waiting on the list, not on its own hour of rest: it says so
  // plainly and shows no bar, since the hour running out changes nothing. A wait
  // that is doing something - the fire, the body's own rest - names it and keeps
  // the bar, which is that work's own.
  const idle = it?.task === "wait" && it.step === WAITING_STEP;
  // Where the wait actually is, rather than a fixed "at camp": the wait's body
  // tier walks - home, to the water, to the snares - so the fixed string spent
  // those minutes claiming to be at camp while its own step said it was walking
  // there. The cell is read, so the two halves of the sentence cannot disagree.
  const waitWhere = it?.task === "wait" && cellOf(state, world) !== regionState(state, world, state.player.region).campCell
    ? `Waiting, ${describeWhere(state, world)}`
    : "Waiting at camp";
  const waiting = it?.task === "wait"
    ? `<div class="step">${esc(waitWhere)}${idle ? "" : `: ${esc(plain(it.step))}`}</div>${state.task && !idle ? TASK_BAR : ""}`
    : "";
  // One judgement for the whole list: waitingLine reads it per row, and running
  // it per row would judge a ten-row list ten times a frame.
  const judged = judgeOrders(state, world, cal);
  const rows = orders.map((o, i) => {
    const live = it?.orderId === o.id;
    // A counted or standing order goes ahead a pulse at a time when its head is clicked; a once order is hurried unasked.
    const clicks = live && hurryKind(state) === "click";
    const counts = o.done > 0 ? ` <small>${esc(`${o.done} ${countWord(o.req.task, o.done)}, ${fmtDuration(o.minutes)}`)}</small>` : "";
    // waitingLine is the plain reading and writes nothing; the scheduler's own read
    // is what moves a restart band's mark, so drawing a row never advances the list.
    const second = live
      ? `<div class="step">${esc(plain(it!.step))}</div>${state.task ? TASK_BAR : ""}${clicks ? HURRY_BAR : ""}`
      : `<div class="step">${esc(plain(waitingLine(state, world, cal, o, judged)))}</div>`;
    const btns = `<span class="ctl"><button class="mini" data-act="order-up" data-id="${o.id}" ${i === 0 ? "disabled" : ""}>up</button> <button class="mini" data-act="order-down" data-id="${o.id}" ${i === orders.length - 1 ? "disabled" : ""}>down</button> <button class="mini" data-act="order-remove" data-id="${o.id}" title="Take it off the list">x</button></span>`;
    const head = clicks
      ? `<div class="head hurry" data-act="hurry" title="Click to hurry it: ${Math.round(PULSE_MIN)} minutes in a moment, then wait for the bar">`
      : `<div class="head">`;
    // Words and not only the title: a touch device has no hover to show one, and
    // a mouse never rests on a row long enough to find it.
    const hint = clicks ? `<small class="hint">click to hurry</small>` : "";
    return `<div class="order${live ? " live" : ""}">${head}<b>${i + 1}. ${esc(orderSentence(state, world, cal, o))}</b>${counts}${hint}${btns}</div>${second}</div>`;
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
          const note = !isHere || !option.ok ? ` <small>${esc(plain(option.why))}</small>` : "";
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
<div class="step">${esc(plain(it.step))}</div>${t ? TASK_BAR : ""}`;
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
  // Eating, drinking and feeding the fire sit with what is happening now
  // rather than inside the Do pane: left there they would vanish the moment
  // a player opened the Log, which is a regression on a control that
  // answers a body's need.
  return `<h2>Doing</h2>${instantHtml(state, world)}${head}${asideHtml}`;
}

/**
 * The queue, in its own column.
 *
 * It keeps that column whether or not there is anything in it. An idle
 * game is its queue - it is what runs while the player is away - and a
 * column that appeared only once an order existed would teach nobody that
 * orders are a thing, which is half of why a tester said he did not trust
 * it.
 */
export function queueHtml(state: GameState, world: World, cal: Calendar): string {
  const orders = ordersHere(state, world);
  if (!orders.length) {
    return `<h2>Orders</h2><div class="dim">Nothing standing.</div><div class="dim"><small>Orders run in turn, and keep running while you are away.</small></div>`;
  }
  return `<h2>Orders <span class="r">${orders.length}</span></h2>${ordersHtml(state, world, cal)}`;
}

/** "N of 10 die: cause, day D", or "none of 10 die" when nothing died. */
export function forecastRowText(row: ForecastRow): string {
  if (row.died === 0) return `none of ${row.runs} die`;
  return `${row.died} of ${row.runs} die: ${CAUSE_WORD[row.cause!]}, day ${row.day}`;
}

/** The game days a stretch of real hours away buys, since that is the number the answer is in. */
export function awayDays(hours: number): number {
  return Math.round((hours * 3600 * GAME_MINUTES_PER_REAL_SECOND) / 1440);
}

/**
 * What happens if you leave, over the stretch the slider names.
 *
 * He read "away up to 24 hours" as how long the survivor works, so the
 * panel says leaving rather than being away, and says what the hours buy:
 * eight of them are twenty game days, which is the number the death in
 * the answer is counted in.
 *
 * A dead survivor has nothing ahead; the stale row from before the death
 * would otherwise sit there being wrong.
 */
export function forecastHtml(view: ForecastView | null, state: GameState): string {
  const head = `<h2>If you leave</h2>`;
  if (state.dead) return `${head}<div class="row"><span class="dim">nothing ahead</span></div>`;
  // The dial under this says what the hours buy in days; saying it here too
  // put the same figure twice in one box.
  const label = `for ${state.awayHours} h`;
  const r = view?.rows.away;
  if (!r) return `${head}<div class="row"><span class="dim">${label}</span><span class="dim">...</span></div>`;
  const text = esc(forecastRowText(r));
  if (r.stale) return `${head}<div class="row"><span class="dim">${label}</span><span class="dim">${text} ...</span></div>`;
  return `${head}<div class="row"><span>${label}</span><span>${text}</span></div>`;
}

/** The eat / add firewood buttons, shown whenever they apply, wherever the player stands. */
export function instantHtml(state: GameState, world: World): string {
  const p = state.player;
  const invs = [p.pack, herePile(state, world)];
  const camp = spotHere(state, world) === "camp";
  const foods = (Object.keys(FOODS) as FoodId[])
    .map((f) => {
      const have = invs.reduce((a, inv) => a + qty(inv, f), 0);
      if (have <= 1e-9) return "";
      const def = FOODS[f];
      const refused = !edible(state, f);
      const reason = refusalReason(state, f);
      return `<button class="mini" data-act="eat" data-food="${f}" ${refused ? "disabled" : ""}>eat ${itemLabel(f, Math.min(def.portionKg, have))} <small>${refused ? reason : `+${Math.round(def.kcalPerKg * Math.min(def.portionKg, have))} kcal${def.sickChance ? ", risky" : ""}`}</small></button>`;
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
  // Named, so morphChildren finds this box again wherever it has moved to
  // rather than matching it by position. A row of buttons whose contents
  // come and go with what is in the pack is the last thing that should be
  // matched by where it happened to sit last frame.
  return `<div data-box="instant" style="margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:4px">${foods}${fire}${drink}${fill}</div>`;
}

/** Water and ice live only in piles (spec 2.1); a take button would move litres into the pack, where they are inert. */
function invRows(items: { item: ItemId; qty: number }[], act: "take" | "drop"): string {
  const rows = act === "take" ? items.filter(({ item }) => item !== "water" && item !== "ice") : items;
  if (!rows.length) return `<div class="dim">nothing</div>`;
  return `<div class="inv">${rows
    .map(({ item, qty: q }) => {
      const one = KG_ITEMS.has(item) ? Math.min(q, 1) : 1;
      const oneLabel = KG_ITEMS.has(item) ? "1 kg" : "1";
      const kg = KG_ITEMS.has(item) ? q : q * ITEM_KG[item];
      return `<span class="n">${itemLabel(item, q)} <small class="dim">${fmtKg(kg)}</small></span><span class="ctl"><button class="mini" data-act="${act}" data-item="${item}" data-n="${one}">${act} ${oneLabel}</button> <button class="mini" data-act="${act}" data-item="${item}" data-n="all">all</button></span>`;
    })
    .join("")}</div>`;
}

/**
 * Carrying a ground pile home, beside the pile it carries. Haul is the one
 * task with nothing to say in the Do list - it names no goods and trains no
 * skill, it is the pack and this ground and the walk between them - so it
 * belongs with the take buttons that act on the same heap, not in a list
 * organised by what work produces.
 */
function haulHtml(state: GameState, world: World, cal: Calendar): string {
  const o = check(state, world, cal, "haul");
  if (!o.ok) return o.why ? `<div style="margin-top:4px"><span class="dim">${esc(plain(o.why))}</span></div>` : "";
  return `<div style="margin-top:4px"><button class="mini" data-act="task" data-id="haul">haul it all to camp <small>${esc(plain(o.detail))}, ${fmtDuration(o.duration)}</small></button></div>`;
}

/**
 * Everything within reach, in two halves that must not be mistaken for
 * each other: what the survivor carries, and what is lying on the ground
 * under them.
 *
 * They were two headings in one flow, and a reader scanning for a thing
 * could not tell which half they had found it in - which matters, because
 * the carried half has a weight limit that kills and the ground half has
 * none. Each is its own bordered box, says whose it is, and carries only
 * the buttons that half can offer: drop from the pack, take from the
 * ground.
 */
export function inventoryHtml(state: GameState, world: World, cal: Calendar): string {
  const p = state.player;
  const kg = weight(p.pack);
  const d = body(state);
  const over = kg > d.packHardKg ? "bad" : kg > d.packComfortableKg ? "accent" : "";
  const carried = listItems(p.pack);
  const here = herePile(state, world);
  const dropAll = carried.length ? `<div class="invact"><button class="mini" data-act="drop-all">drop everything here</button></div>` : "";
  return `<div class="invsec carry" data-inv="carry">
<h2>Carried <span class="r ${over}">${fmtKg(kg)} of ${d.packComfortableKg} kg comfortable, ${d.packHardKg} kg max</span></h2>
${invRows(carried, "drop")}${dropAll}
</div>
<div class="invsec ground" data-inv="ground">
<h2>On the ground, ${esc(describeWhere(state, world))} <span class="r">${fmtKg(weight(here))}</span></h2>
${invRows(listItems(here), "take")}${haulHtml(state, world, cal)}
</div>`;
}

export function fmtLogTime(e: LogEntry): string {
  const abs = e.minute + 480;
  const day = Math.floor(e.minute / 1440) + 1;
  const hour = ((abs % 1440) / 60);
  return `d${day} ${fmtClock(hour)}`;
}

/** The log: "you" for what the player watched, the survivor's name for what happened while they were away. */
export function logHtml(state: GameState): string {
  // Oldest first, the way a story is told and the way he expected it: he
  // read the newest-first order as his own misreading rather than the log's.
  const entries = state.log.slice(-60);
  const name = current(state).name.first;
  return `<h2>Log</h2><div class="entries">${entries
    .map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(voice(e.text, e.away ? name : null))}</div>`)
    .join("")}</div>`;
}

/** The entry's later lines (the epitaph itself is shown separately), one row per line. */
function entryLinesHtml(lines: string[]): string {
  return `<div class="entries">${lines.map((l) => `<div class="e">${esc(l)}</div>`).join("")}</div>`;
}

/** "Veikko Urbonas lived 49 days." under the epitaph, for every survivor but the first. */
function ancestorLine(state: GameState): string {
  const prev = state.survivors[state.survivors.length - 2];
  if (!prev?.died) return "";
  return `<p class="ancestor">${esc(fmtName(prev.name))} lived ${prev.died.day} days.</p>`;
}

export function tombstoneHtml(state: GameState, _world: World, _ui: UiState): string {
  const rec = current(state);
  const next = landingDate(worldDate(state, state.dead!.minute)).date;
  const lines = entry(rec);
  return `<div class="box">
<h1>${esc(fmtName(rec.name))}</h1>
<p>${esc(epitaphTail(rec))}</p>
${ancestorLine(state)}
<div class="card">${cardHtml(rec.person, rec.name, deadExtras(rec))}</div>
${entryLinesHtml(lines.slice(1))}
<p class="dim">The next survivor carries ${esc(shareWord(CARRY_SHARE))} of what ${esc(rec.name.first)} knew, and none of the practice at any one thing.</p>
<p>The next boat lands in ${esc(monthOfDoy(next.doy))}, year ${next.year}.</p>
<button class="act" data-act="begin-again">Begin again</button>
<button class="mini" data-act="cemetery">cemetery</button>
</div>`;
}

export function landingHtml(state: GameState, world: World): string {
  const l = state.landing!;
  const first = l.oldCamp === null;
  const gap = first ? "" : `${esc(daysInWords(l.gapDays))} days after ${esc(fmtName(current(state).name))} died. `;
  const next = first ? { year: 1, doy: l.date.doy + 7 } : nextBoatDate(l.date).date;
  const cards = l.candidates.map((c, i) => `<button class="card${i === l.chosen ? " chosen" : ""}" data-act="pick-candidate" data-index="${i}">${cardHtml(c.person, c.name)}</button>`).join("");
  return `<div class="box landing">
<h1>${esc(fmtWorldDate(l.date))}</h1>
<p>${gap}A boat puts in at ${esc(regionAt(world, l.region).name)} with three aboard. Choose one; the other two sail on.</p>
<div class="cards">${cards}</div>
<p class="dim">Whoever you choose lands with an axe, the wool on their back and a kilo of dried meat.</p>
<p><label>Name <input data-name maxlength="40" value="${esc(fmtName(l.name))}" /></label></p>
<button class="act" data-act="land">Land</button>
<button class="mini" data-act="next-boat" title="A week later, and the world runs on without you">wait for the next boat and three new people (${esc(fmtWorldDate(next))})</button>
<button class="mini" data-act="manual-open">How to survive</button>
</div>`;
}

export function manualHtml(): string {
  const sections = MANUAL_SECTIONS.map((s) => `<h2>${esc(s.title)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}`).join("");
  const links = MANUAL_LINKS.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></li>`).join("");
  return `<div class="box manual">
<h1>How to survive</h1>
${sections}
<h2>More</h2>
<ul>${links}</ul>
<button class="act" data-act="manual-close">Close</button>
</div>`;
}


export function cemeteryHtml(state: GameState, ui: UiState): string {
  const dead = [...state.survivors].filter((s) => s.died !== null).reverse();
  const rows = dead.map((s) => {
    const open = ui.cemeteryOpen === s.index;
    // Closed, a grave tells the three things worth telling; open, the entry says all of them and the stories would be it twice.
    const lines = open
      ? `<div class="card">${cardHtml(s.person, s.name, deadExtras(s))}</div>${entryLinesHtml(entry(s).slice(1))}`
      : stories(s).map((t) => `<div class="s">${esc(t)}</div>`).join("");
    return `<div class="grave"><button class="mini" data-act="cemetery-open" data-index="${s.index}">${esc(epitaph(s))}</button>${lines}</div>`;
  });
  const leave = ui.confirmLeave
    ? `<button class="mini danger" data-act="leave-world-yes">Leave this world for good? Yes, everyone here is forgotten</button> <button class="mini" data-act="leave-world-no">no</button>`
    : `<button class="mini" data-act="leave-world">leave this world</button>`;
  return `<div class="box">
<h1>Cemetery</h1>
${rows.length ? rows.join("") : `<p class="dim">No one has died here yet.</p>`}
<p>${leave}</p>
<button class="act" data-act="cemetery-close">Close</button>
</div>`;
}

export function journalHtml(state: GameState, cal: Calendar, _ui: UiState): string {
  const n = nextThreshold(state, cal);
  const when = n.inDays > 0 ? `expected in ${n.inDays} days` : "any day now";
  const season = `<div class="season"><b>Next: ${esc(NAMES[n.id])}</b>, ${when}. ${esc(ASKS_FOR[n.id])}</div>`;
  const rec = current(state);
  const card = `<div class="card">${cardHtml(rec.person, rec.name, livingExtras(state), { px: 48 })}</div>`;
  const mine = entry(current(state));
  const ancestors = state.survivors.slice(0, -1).reverse().map((s) => `<div class="e"><button class="mini" data-act="cemetery-open" data-index="${s.index}">${esc(fmtName(s.name))}</button> ${esc(epitaphTail(s))}</div>`);
  return `<h2>Journal</h2>${season}${card}${entryLinesHtml(mine)}${ancestors.length ? `<h3>Before you</h3><div class="entries">${ancestors.join("")}</div>` : ""}<button class="mini" data-act="cemetery">cemetery</button>`;
}

function awayOrderLine(o: AwayOrder): string {
  const did = o.done > 0 ? `${o.done} ${countWord(o.task, o.done)}, ${fmtDuration(o.minutes)}` : "";
  const now = o.gone ? "done" : o.skipped ? `blocked, ${o.skipped}` : did ? "" : "nothing to do";
  return `<div class="e ${o.skipped && !o.gone ? "bad" : ""}">${esc(o.label)}: ${esc([did, now].filter(Boolean).join("; "))}.</div>`;
}

export function awayHtml(away: AwaySummary, realSeconds: number, capped: boolean, sinceLine: string, person?: Person, name: string | null = null): string {
  const h = Math.floor(realSeconds / 3600);
  const m = Math.floor((realSeconds % 3600) / 60);
  const gameMin = realSeconds * GAME_MINUTES_PER_REAL_SECOND;
  const moved = away.movedTo ? `<p>${esc(voice(`{You} {are} now in ${away.movedTo}.`, name))}</p>` : "";
  const orders = away.orders.length ? `<div class="entries orders">${away.orders.map(awayOrderLine).join("")}</div>` : "";
  const entries = away.entries;
  return `<div class="box">
<h1>While you were away</h1>
<p>${h ? `${h} h ` : ""}${m} min of the clock; ${fmtDuration(gameMin)} in the north${capped ? " (a day is as much as the world runs on without you)" : ""}.</p>
<p>${person ? faceSvg(person, 32) : ""} ${esc(sinceLine)}</p>
${moved}${orders}
${entries.length ? `<div class="entries">${entries.slice(-40).map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(voice(e.text, e.away ? name : null))}</div>`).join("")}</div>` : "<p class=\"dim\">Nothing worth telling.</p>"}
<button class="act" data-act="dismiss">Continue</button>
</div>`;
}

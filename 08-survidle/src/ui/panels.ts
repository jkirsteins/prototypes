import { edible, hungerLine, itemLabel, refusalReason } from "../sim/actions";
import { absence, densityLabel, regionDensity } from "../sim/animals";
import { COLD_UNDER, SLEEP_AT, SOAKED_WETNESS, stormOptions, workResumeAt } from "../sim/body";
import { isCareRow } from "../sim/bodyorder";
import { isFish, isVoiceOnly, SPECIES_DEFS, type Species } from "../sim/species";
import { type Calendar, fmtClock, fmtDate, monthName } from "../sim/calendar";
import { needsMending, rackCapacity } from "../sim/camp";
import { CAPABILITIES, standingHere } from "../sim/capabilities";
import { coldFeet, coldHands, garmentWet } from "../sim/clothing";
import { groundDry, hasEmbers, smoky } from "../sim/fire";
import { herePile, listItems, pileAt, qty, weight } from "../sim/inventory";
import { body, fatLandmarks } from "../sim/person";
import { groundOf } from "../sim/intent";
import { CLOTHING, FIRE_LOW_KG, FIRE_MAX_KG, FOODS, type FoodId, ITEM_KG, KG_ITEMS, STRUCTURES, TOOLS } from "../sim/items";
import { knownShare } from "../sim/mapped";
import { entry, epitaph, epitaphTail, fmtWorldDate, monthOfDoy, stories } from "../sim/epitaph";
import { CAUSE_WORD, type ForecastRow } from "../sim/forecast";
import type { ForecastView } from "../sim/forecaster";
import { daysInWords, landingDate, nextBoatDate } from "../sim/landing";
import { MANUAL_LINKS, MANUAL_SECTIONS } from "../sim/manual";
import { cardHtml, deadExtras, livingExtras } from "./card";
import { faceSvg } from "./face";
import { liveFaceHtml, livePortraitState } from "./portrait";
import { fmtName } from "../sim/names";
import { sleepiness, SLEEP_ONSET, SLEEPY_AT, SPENT_AT, WAKE_AT } from "../sim/sleep";
import { countWord, judgeOrders, orderSentence, ordersHere, waitingLine } from "../sim/orders";
import { FAT_RIBS, FAT_WASTING, feltTemperature, insulation, starvation, walkManner } from "../sim/player";
import { campCellOf, cellOf, describeWhere, kmBetween, spotHere, SPOT_WORDS, watersideCell } from "../sim/position";
import { survivorRoute } from "../sim/routing";
import { current, worldDate } from "../sim/record";
import { campSite, regionState } from "../sim/regionstate";
import type { AwayOrder, AwaySummary } from "../sim/save";
import { CARRY_SHARE, keyName, level, levelMinutes, masteryMilestone, poolShare, SKILL_CAP, SKILL_IDS, SKILL_NAMES, RUNG_LEVEL, RUNG_ORDER, RUNG_WORD } from "../sim/skills";
import { NAMES, ASKS_FOR, nextThreshold } from "../sim/spine";
import {
  availableTasks, check, fallChance, type TaskOption, walkTarget, whereIs,
} from "../sim/tasks";
import { isWorkIntent, type AtmosphereSample, type GameState, type Garment, type ItemId, type LogEntry, type Person, type SkillId } from "../sim/types";
import { campWaterCapacity, ICE_SHORE_CM, THIRSTY_L, vesselLitres, WATER_FULL, waterSource } from "../sim/water";
import { atmosphereAt, forecastText, groundAt, iceMode, type LocalConditions, localStorm, localWeather, stormComing, stormNow } from "../sim/weather";
import { fmtDuration, fmtKg, GAME_MINUTES_PER_REAL_SECOND, shareWord } from "../units";
import { cellAt, regionAt, speciesHere, type World } from "../world/gen";
import { remainingKm } from "../world/route";
import { hurryKind, type HurryState } from "./hurry";
import { esc, type UiState } from "./render";
import { shoppingPlaceCueHtml } from "./shopping";
import { plain, voice } from "../sim/voice";
import { skyHtml, WALL } from "./sky";
import { DEFAULT_TRAVEL_DISPLAY, formatTravel, type TravelDisplay } from "./travel";
import { activeEquipmentHtml } from "./equipment";

/**
 * A mark on a bar: either a fixed share, which belongs in the markup since
 * it never moves, or the name of a moving one, written each frame by
 * updateBars onto this element rather than into the panel's diffed markup
 * (tests/churn.test.ts).
 */
/**
 * One bar, and the lines on it the body acts at.
 *
 * A mark is a place something changes - eats here, sits down here, dies here
 * - drawn where a number alone would leave the player to infer it from
 * watching the survivor. It says what it demarcates and nothing else: the
 * bar itself is named beside its own figure and wants no explaining, and a
 * tooltip on the whole bar would swallow the marks' own.
 *
 * A fixed share is written into the markup; a moving one is named and
 * bars.ts writes its position each frame, since a share that changed in the
 * markup would redraw the panel sixty times a second (tests/churn.test.ts).
 */
interface BarMark { at: number | string; title: string }

function bar(id: string, cls: string, label: string, marks: BarMark[] = []): string {
  const m = marks
    .map((k) => (typeof k.at === "number"
      ? `<div class="mark" style="left:${(k.at * 100).toFixed(1)}%" title="${esc(k.title)}"></div>`
      : `<div class="mark" data-mark="${k.at}" title="${esc(k.title)}"></div>`))
    .join("");
  return `<div class="bar readout ${cls}"><div class="fill" id="bar-${id}" data-bar="${id}"></div>${m}<span class="lbl"><span>${label}</span><b id="val-${id}" data-val="${id}"></b></span></div>`;
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
  return `<div class="bar compact dur${v < 25 ? " low" : ""}"><div class="fill" data-fill="${esc(of)}"></div></div>`;
}

function wetBar(g: Garment): string {
  const w = garmentWet(g);
  const label = w > 80 ? "soaked" : w > 50 ? "wet" : w > 0 ? "damp" : "dry";
  return `<small class="meter-caption">wetness: ${label}</small><div class="bar compact dur wet"><div class="fill" data-fill="${esc(`garmentWet:${g.id}`)}"></div></div>`;
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
  return `${crumb}<small class="mastery-next">${esc(label)}</small><div class="bar mastery" title="${esc(label)}"><div class="fill" data-fill="${esc(`masteryTo:${m.skill}|${m.key}`)}"></div></div>`;
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
  const marks = fatLandmarks(current(state).person);
  const resumeAt = workResumeAt(state);
  const tags: string[] = [];
  tags.push(`<span class="tag">feels like ${Math.round(felt)} C</span>`);
  if (p.sick > 0) tags.push(`<span class="tag bad">sick, ${fmtDuration(p.sick)} to go</span>`);
  if (p.injured > 0) tags.push(`<span class="tag bad">injured, ${fmtDuration(p.injured)}</span>`);
  if (p.frostbite.feet > 0) tags.push(`<span class="tag bad">frostbitten feet, ${fmtDuration(p.frostbite.feet)}</span>`);
  if (p.frostbite.hands > 0) tags.push(`<span class="tag bad">frostbitten hands, ${fmtDuration(p.frostbite.hands)}</span>`);
  if (p.torch.lit) tags.push(`<span class="tag">torch lit, ${fmtDuration(p.torch.minutes)}</span>`);
  // Under the meal line means the meal did not happen: nothing left worth
  // taking, or the body's row waiting its turn behind the work. Either way
  // the fat behind it is paying, and that is the state worth a word.
  // Starving is what the fat running out is.
  if (p.kcal < hungerLine(state)) tags.push(`<span class="tag bad">hungry</span>`);
  if (starvation(state) >= FAT_RIBS) tags.push(`<span class="tag bad">starving</span>`);
  if (starvation(state) >= FAT_WASTING) tags.push(`<span class="tag bad">wasting</span>`);
  if (p.warmth < 20) tags.push(`<span class="tag bad">hypothermia</span>`);
  else if (p.warmth < 40) tags.push(`<span class="tag bad">cold</span>`);
  if (p.energy < 20) tags.push(`<span class="tag bad">exhausted</span>`);
  if (sleepiness(p.sleepDebt, cal.hour) >= SLEEPY_AT) tags.push(`<span class="tag bad">sleepy</span>`);
  if (resumeAt !== null) tags.push(`<span class="tag bad">recovering from collapse, work resumes at ${resumeAt} Stamina</span>`);
  if (p.water < THIRSTY_L) tags.push(`<span class="tag bad">thirsty</span>`);
  const portrait = livePortraitState(state, world, cal, ambient);
  return `<h2>${liveFaceHtml(current(state).person, 24, portrait)}${esc(current(state).name.first)} <span class="r">day ${cal.day}</span></h2>
${bar("health", "health", "Health")}
${bar("kcal", "kcal", "Food", [{ at: "hunger", title: "eats below here" }])}
${bar("fat", "fat", "Fat", [{ at: marks.floor / marks.upper, title: "dies here" }, { at: marks.lower / marks.upper, title: "thin below here" }, { at: marks.upper / marks.upper, title: "well fed above here" }])}
${bar("water", "water", "Water", [{ at: THIRSTY_L / WATER_FULL, title: "thirsty below here" }])}
${bar("warmth", "warmth", "Warmth", [{ at: COLD_UNDER / 100, title: "goes to the fire below here" }, { at: 0.2, title: "hypothermia below here" }])}
${bar("energy", "energy", "Stamina", [
  { at: SPENT_AT / 100, title: "stops work below here" },
  { at: SLEEP_AT / 100, title: "collapses below here" },
  ...(resumeAt === null ? [] : [{ at: resumeAt / 100, title: "work resumes here after collapse" }]),
])}
${bar("sleepiness", "sleepiness", "Sleepiness", [
  { at: WAKE_AT / 100, title: "wakes below here" },
  { at: SLEEPY_AT / 100, title: "sleepy above here" },
  { at: SLEEP_ONSET / 100, title: "falls asleep above here" },
])}
${bar("wet", "wet", "Wet", [{ at: SOAKED_WETNESS / 100, title: "soaked above here" }])}
<div class="statuses">${tags.join("")}</div>
<div style="margin-top:8px">
  ${ui.confirmAbandon
    ? `<button class="mini danger" data-act="abandon-yes">Really abandon this run? Yes, it is over</button> <button class="mini" data-act="abandon-no">no</button>`
    : `<button class="mini" data-act="abandon">abandon run</button>`}
</div>`;
}

export function gearHtml(state: GameState, felt: number): string;
export function gearHtml(state: GameState, world: World, cal: Calendar, felt: number): string;
export function gearHtml(state: GameState, worldOrFelt: World | number, cal?: Calendar, feltArg?: number): string {
  const world = typeof worldOrFelt === "number" ? null : worldOrFelt;
  const felt = typeof worldOrFelt === "number" ? worldOrFelt : (feltArg ?? 0);
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
  const active = world && cal ? activeEquipmentHtml(state, world, cal) : "";
  return `${active ? `<h2>Active equipment</h2>${active}` : ""}<h2${active ? ' style="margin-top:10px"' : ""}>Worn <span class="r">+${insulation(state).toFixed(1)} C</span></h2>${clothes}<h2 style="margin-top:10px">Tools</h2>${tools}`;
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
<div class="bar compact dur"><div class="fill" data-fill="skill:${id}"></div></div>
<small class="meter-caption">pool ${Math.round(pool * 100)}%</small><div class="bar compact pool"><div class="fill" data-fill="pool:${id}"></div><i style="left:10%"></i><i style="left:25%"></i><i style="left:50%"></i><i style="left:95%"></i></div>
${perks.length ? `<div class="good"><small>${perks.join(", ")}</small></div>` : ""}<div class="rungs"><small>${rungs}</small></div></div>`;
  });
  return `<h2>Skills</h2>${rows.join("")}`;
}

/**
 * The weather, and the day, as one widget built the way a phone's is.
 *
 * The sky is its whole background - the same drawing the map is lit from,
 * stretched behind the numbers - with the day and the hour over it, the
 * day's ends in the corner, the temperature large enough to read without
 * looking for it, and then the pairs a reader scans rather than reads.
 *
 * The clock used to be a panel of its own above the map. What it said fits
 * here in three lines, and the row it was taking is now map, which is what
 * a player is actually looking at.
 */
interface WeatherPanelAirMemo {
  world: World;
  seed: number;
  startDoy: number;
  minute: number;
  cell: number;
  snowCm: number;
  air: AtmosphereSample;
}

/** The weather panel renders atmospheric fields once per displayed minute. */
const weatherPanelAir = new WeakMap<GameState, WeatherPanelAirMemo>();

function weatherPanelConditions(state: GameState, world: World, cell: number): LocalConditions {
  const ground = groundAt(state, world, cellAt(world, cell).region);
  const minute = Math.floor(state.minute + state.weather.elapsedMinutes);
  const previous = weatherPanelAir.get(state);
  if (previous && previous.world === world && previous.seed === world.seed
    && previous.startDoy === state.weather.startDoy && previous.minute === minute
    && previous.cell === cell && Object.is(previous.snowCm, ground.snowCm)) {
    return { ...previous.air, ground };
  }
  const air = atmosphereAt(state, world, cell, ground.snowCm);
  weatherPanelAir.set(state, { world, seed: world.seed, startDoy: state.weather.startDoy,
    minute, cell, snowCm: ground.snowCm, air: { ...air } });
  return { ...air, ground };
}

export function weatherHtml(state: GameState, world: World, cal: Calendar, _ambient: number, rate = 1, uid = ""): string {
  const conditions = weatherPanelConditions(state, world, cellOf(state, world));
  const ambient = conditions.temperatureC;
  const snow = conditions.ground.snowCm >= 1 ? `snow ${Math.round(conditions.ground.snowCm)} cm` : "";
  const ice = conditions.ground.iceCm >= 1 ? `ice ${Math.round(conditions.ground.iceCm)} cm` : "";
  const ground = [snow, ice].filter(Boolean).join(", ");
  const storm = localStorm(conditions) ? `<div class="wx-warn">storm</div>` : "";
  const forecast = forecastText(state);
  const forecastLine = forecast ? `<div class="wx-warn" data-weather-forecast>${esc(forecast)}</div>` : "";
  const plan = forecast && state.weather.storm && (stormComing(state) || stormNow(state.weather, state.minute))
    ? stormOptions(state, world, state.weather.storm)
    : null;
  const planWords = plan?.recommended === "returnCamp" ? "return to camp"
    : plan?.recommended === "remoteRefuge" ? "go to the known refuge"
      : plan ? "shelter here" : "";
  const planLine = plan ? `<div class="wx-warn" data-weather-plan="${plan.recommended}">plan: ${planWords}</div>` : "";
  const dry = groundDry(conditions.ground, cal) ? `<div class="wx-warn">tinder dry</div>` : "";
  const felt = Math.round(feltTemperature(state, world, ambient));
  const bearing = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(conditions.windBearingDeg / 45) % 8];
  const precipitation = conditions.precipMmPerHour >= 0.05;
  const intensity = conditions.precipMmPerHour >= 7.5 ? "heavy " : conditions.precipMmPerHour < 1 ? "light " : "";
  const weather = precipitation
    ? `${intensity}${conditions.precip === "snow" ? "snow" : "rain"}`
    : conditions.cloud >= 0.75 ? "overcast" : conditions.cloud >= 0.35 ? "cloudy" : "clear";
  const visibility = conditions.fog >= 0.1 ? `fog, ${Math.max(0.2, 3 / conditions.extinctionPerKm).toFixed(1)} km` : `${Math.max(0.2, 3 / conditions.extinctionPerKm).toFixed(0)} km`;
  return `<div class="wx">
<div class="wx-bg">${skyHtml(WALL, uid, false, conditions)}</div>
<div class="wx-head">
  <div class="wx-day">
    <div class="wx-clock">Day ${cal.day} <span class="hour">${fmtClock(cal.hour)}</span></div>
    <div class="wx-date">${fmtDate(cal)}, ${cal.season}</div>
  </div>
  <div class="wx-sun"><div>&uarr; ${fmtClock(cal.sunrise)}</div><div>&darr; ${fmtClock(cal.sunset)}</div></div>
</div>
<div class="wx-temp ${ambient < -10 ? "bad" : ""}">${Math.round(ambient)}<span class="deg">C</span></div>
<div class="wx-word">${weather}</div>
<div class="wx-rows">
  <div class="wx-k">Feels like</div><div class="wx-v ${felt < 0 ? "bad" : ""}">${felt} C</div>
  <div class="wx-k">Wind</div><div class="wx-v wx-wind">${bearing} ${Math.round(conditions.windKmh)} km/h</div>
  <div class="wx-k">Visibility</div><div class="wx-v wx-visibility">${visibility}</div>
  ${ground ? `<div class="wx-k">Ground</div><div class="wx-v">${ground}</div>` : ""}
</div>
${storm}${forecastLine}${planLine}${dry}
<div class="wx-where"><svg class="speed-history" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="speed-fade-${uid || "live"}"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity="1"/></linearGradient></defs><path data-speed-path fill="url(#speed-fade-${uid || "live"})"></path></svg><span>${esc(regionAt(world, state.player.region).name)}</span><span class="wx-rate ${rate > 1 ? "hurrying" : ""}" data-speed-rate>1 s = ${Math.round(GAME_MINUTES_PER_REAL_SECOND * rate)} game min</span></div>
</div>`;
}

/**
 * The weather panel owns continuously animated sky markup. Rebuild that markup
 * only when the displayed game minute, location, or displayed speed changes;
 * CSS carries cloud, precipitation, and fog motion between those readings.
 */
export function weatherKey(state: GameState, world: World, _cal: Calendar, rate = 1): string {
  const cell = cellOf(state, world);
  const conditions = weatherPanelConditions(state, world, cell);
  const snow = conditions.ground.snowCm >= 1 ? Math.round(conditions.ground.snowCm) : "-";
  const ice = conditions.ground.iceCm >= 1 ? Math.round(conditions.ground.iceCm) : "-";
  // Atmosphere moves only on the minute key above. These are the displayed
  // values that can change within that minute because the survivor acts or
  // local ground is changed directly: activity, clothing, wetness, fat,
  // shelter and fire all meet in feltTemperature.
  const felt = Math.round(feltTemperature(state, world, conditions.temperatureC));
  const displayed = [felt, snow, ice,
    groundDry(conditions.ground, _cal) ? 1 : 0].join(":");
  return `${state.seed}|${state.startDoy}|${Math.floor(state.minute)}|${Math.floor(state.minute + state.weather.elapsedMinutes)}|${cell}|${state.player.region}|${rate > 1 ? 1 : 0}|${Math.round(GAME_MINUTES_PER_REAL_SECOND * rate)}|${displayed}`;
}

/**
 * A second button offering the shortcut across thin ice, only while the ice
 * is thin (safe ice is already the plain route; no ice at all leaves nothing
 * to cross) and only when it beats the plain route: shorter, or the plain
 * route does not exist at all.
 */
export function thinIceButton(state: GameState, world: World, cal: Calendar, id: "walk" | "travel", arg: string, plain: TaskOption): string {
  const target = walkTarget(state, world, arg);
  if (!target) return "";
  const thin = check(state, world, cal, id, `${arg}:thin`);
  if (!thin.ok || (plain.ok && thin.duration >= plain.duration)) return "";
  const route = survivorRoute(state, world, cellOf(state, world), target.cell, "thin");
  const thinIce = (route ?? [])
    .filter((cell) => cellAt(world, cell).terrain === "water")
    .map((cell) => localWeather(state, world, cell))
    .filter((weather) => iceMode(weather) === "thin");
  if (!thinIce.length) return "";
  const weakest = thinIce.reduce((a, b) => a.iceCm < b.iceCm ? a : b);
  const pct = Math.round(Math.max(...thinIce.map((weather) => fallChance(weather.iceCm))) * 100);
  return ` <button class="mini" data-act="task" data-id="${id}" data-arg="${arg}:thin" title="${pct}% chance of falling through, per cell crossed">across the ice (${Math.round(weakest.iceCm)} cm, thin)</button>`;
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
 * region, then known ways out of it. Unmapped regions are survey targets in
 * Do > Explore, where they can be compared without crowding the map.
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
export function placesHtml(state: GameState, world: World, cal: Calendar, display: TravelDisplay = DEFAULT_TRAVEL_DISPLAY): string {
  const r = regionAt(world, state.player.region);
  const camp = campCellOf(state, world);
  const here = cellOf(state, world);
  const rows = r.spots
    .map((s) => {
      // A region has no camp until somebody makes one, and the generated
      // "camp" spot is ground rather than a camp: no row for it until there
      // is one to walk to.
      if (s.id === "camp" && camp === null) return "";
      const cell = s.id === "camp" ? camp! : s.cell;
      // A generated spot sitting on the live camp's own cell would draw a
      // second row for the same ground. The camp row, listed first, stands
      // for it.
      if (s.id !== "camp" && cell === camp) return "";
      const name = esc(SPOT_WORDS[s.id]);
      const shopping = shoppingPlaceCueHtml(state, world, cal, s.id);
      if (cell === here) return `<div class="way" data-place="${s.id}"><b>${name}</b> <small class="dim">you are here</small>${shopping}</div>`;
      const at = ` data-at="${cell}"`;
      const walk = check(state, world, cal, "walk", `spot:${s.id}`);
      const ice = thinIceButton(state, world, cal, "walk", `spot:${s.id}`, walk);
      const km = kmBetween(state, world, here, cell, "safe");
      if (!walk.ok) return `<div class="way" data-place="${s.id}"${at}><span class="dim">${name}: ${esc(plain(walk.why))}</span>${ice}${shopping}</div>`;
      // The whole row is the button, and what it costs is in its own label:
      // a name in a button beside a sentence saying "from here" spent two
      // thirds of the row on words that never change.
      const cost = km === null ? esc(fmtDuration(walk.duration)) : esc(formatTravel(km, walk.duration, display));
      return `<div class="way" data-place="${s.id}"${at}><button class="mini go" data-act="task" data-id="walk" data-arg="spot:${s.id}">${name} <small>${cost}</small></button>${ice}${shopping}</div>`;
    })
    .join("");
  // The ways out, under the places and in the same corner - but only those
  // that can be taken. Every neighbour listed with its own refusal was five
  // lines telling the player five times that the list held nothing for them.
  const out = regionAt(world, state.player.region).neighbours
    .filter((n) => knownShare(state, world, n.id) >= 1)
    .map((n) => wayIntoHtml(state, world, cal, n.id, true, display))
    .join("");
  return `<div class="waylabel">places</div>${rows}${out ? `<div class="waylabel">ways out</div>${out}` : ""}`;
}

/**
 * The way into one region: go there when its ground is known. The fallback
 * explore branch is retained for catalogue rendering, not the map corner.
 *
 * This is the whole of what leaving looks like, for one neighbour. The map
 * is where it is offered - point at a region and it says how to get in -
 * because a list of names in a corner is a second place to learn about
 * ground the map is already drawing.
 */
export function wayIntoHtml(state: GameState, world: World, cal: Calendar, region: number, offersOnly = false, display: TravelDisplay = DEFAULT_TRAVEL_DISPLAY): string {
  const destination = regionAt(world, region);
  if (destination.campCell === null) return "";
  const name = esc(destination.name);
  // Where the region lies, so hovering the row can point at it on the map.
  const at = ` data-at="${destination.campCell}"`;
  if (knownShare(state, world, region) >= 1) {
    const go = check(state, world, cal, "travel", `region:${region}`);
    const ice = thinIceButton(state, world, cal, "travel", `region:${region}`, go);
    if (!go.ok && offersOnly) return "";
    const km = kmBetween(state, world, cellOf(state, world), destination.campCell, "safe");
    const estimate = km === null ? fmtDuration(go.duration) : formatTravel(km, go.duration, display);
    return go.ok
      ? `<div class="way" data-way="${region}"${at}><button class="mini go" data-act="task" data-id="travel" data-arg="region:${region}">Go to ${name} <small>${esc(estimate)}</small></button>${ice}</div>`
      : `<div class="way" data-way="${region}"${at}><span class="dim">${name}: ${esc(plain(go.why))}</span>${ice}</div>`;
  }
  const ex = check(state, world, cal, "explore", `region:${region}`);
  if (!ex.ok && offersOnly) return "";
  return ex.ok
    ? `<div class="way" data-way="${region}"${at}><button class="mini go" data-act="task" data-id="explore" data-arg="region:${region}">Explore ${name}</button></div>`
    : `<div class="way" data-way="${region}"${at}><span class="dim">${name}: ${esc(plain(ex.why))}</span></div>`;
}

/**
 * Every way out of this region, for the tests that ask whether a thing can
 * be reached at all. The board offers these one at a time, on the map.
 */
export function travelHtml(state: GameState, world: World, cal: Calendar, display: TravelDisplay = DEFAULT_TRAVEL_DISPLAY): string {
  return regionAt(world, state.player.region).neighbours
    .filter((n) => knownShare(state, world, n.id) >= 1)
    .map((n) => wayIntoHtml(state, world, cal, n.id, false, display))
    .join("");
}

/** "mallard gone until April" for a species that cannot be met at all now, otherwise the density in words. */
function rosterEntry(state: GameState, world: World, id: number, s: Species, cal: Calendar): string {
  const def = SPECIES_DEFS[s];
  // The same predicate the hunt and fish rows use, so the card and the row cannot disagree.
  const region = regionAt(world, id);
  const sampleCell = region.campCell ?? region.cells[0];
  const gone = absence(def, cal, localWeather(state, world, sampleCell).iceCm);
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
  const lines = groups
    .map(([label, pick]) => {
      const list = here.filter(pick).map((s) => rosterEntry(state, world, id, s, cal));
      return list.length ? `<div>${label}: ${list.join(", ")}</div>` : "";
    })
    .join("");
  return lines;
}

export function campHtml(state: GameState, world: World, cal: Calendar): string {
  const id = state.player.region;
  const r = regionAt(world, id);
  const st = regionState(state, world, id);
  const site = campSite(st);
  const built: string[] = [];
  if (site?.structures.firePit) built.push(STRUCTURES.firePit.name);
  if (site?.structures.leanTo) built.push(needsMending(site, "leanTo") ? "lean-to (needs re-roofing)" : "lean-to");
  if (site?.structures.cabin) built.push("log cabin");
  if (site?.structures.turfHut) built.push(needsMending(site, "turfHut") ? "turf hut (needs re-roofing)" : "turf hut");
  if (site?.structures.dryingRack) built.push(needsMending(site, "dryingRack") ? "drying rack (needs relashing)" : "drying rack");
  if (site?.structures.boughBed) built.push("bough bed");
  if (site?.structures.waterStore) built.push("water trough");
  if (site?.structures.snowShelter) built.push("snow shelter");
  if (st.snares) built.push(`${st.snares} snare${st.snares > 1 ? "s" : ""}${st.snareCatch.count ? ` (${st.snareCatch.count} caught)` : ""}`);
  if (st.trap) built.push(`trap at ${esc(whereIs(state, world, st.trap.cell))}: ${st.trap.kg > 0 ? `${st.trap.kg.toFixed(1)} kg` : "empty"}`);
  const unfinished = site ? (Object.keys(site.build) as (keyof typeof site.build)[]).filter((k) => (site.build[k] ?? 0) > 0).map((k) => `${k} in progress`) : [];
  // A third word between burning and cold: coals are live but not fed, the
  // routine state after every tended night rather than an exception. How
  // long they last is the fuel bar's job, and the figure moves with every
  // minute the fire burns, so the bar names what it draws and bars.ts writes
  // the width; saying it in the markup would break the churn budget.
  const fireWord = st.fire.lit
    ? `<span class="good">burning${smoky(st.fire) ? ", smoking" : ""}</span>`
    : hasEmbers(st.fire)
      ? '<span class="ember">coals</span>'
      : '<span class="dim">cold</span>';
  const fire = site?.structures.firePit ? `<div>fire: ${fireWord}</div>${bar("fire", "fire", "Fuel", [{ at: FIRE_LOW_KG / FIRE_MAX_KG, title: "burning low below here" }])}` : "";
  const rack = site?.structures.dryingRack
    ? `<div>rack: ${st.rack.kg > 0 ? `${st.rack.kg.toFixed(1)} kg drying, ${Math.round((st.rack.dried / (48 * 60)) * 100)}%` : "empty"} <small>(${rackCapacity(site)} kg max)</small></div>`
    : "";
  const campPile = pileAt(state, st.campCell);
  const cap = campWaterCapacity(campPile, site);
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
  // What lives here is a region's reading, not a cell's, so the map's hover
  // has no place for it and the camp box does: the survivor knows what is
  // about without walking anywhere to look.
  const about = `<div class="roster">${rosterHtml(state, world, id, cal)}</div>`;
  return `<h2>Camp <span class="r">${esc(r.name)}</span></h2>${fire}${stands}${rack}${water}${heap}${limits}${about}`;
}


const TASK_BAR = `<div class="bar readout task"><div class="fill" data-bar="task"></div><span class="lbl"><span data-val="task"></span><span data-pct="task"></span></span></div>`;
/** The ranked list: each row its sentence, counters, state and buttons; progress lives only in the central activity strip. */
export function ordersHtml(state: GameState, world: World, cal: Calendar): string {
  const orders = ordersHere(state, world);
  const it = state.intent;
  // One judgement for the whole list: waitingLine reads it per row, and running
  // it per row would judge a ten-row list ten times a frame.
  const judged = judgeOrders(state, world, cal);
  // A pin is the only thing that stops the list, so the one moment the list
  // is stopped is the one moment it owes the player a banner: the row, why it
  // cannot run, and the one click that lets the rest of the list go on.
  const held = judged.blockedBy
    ? `<div class="held bad">Queue stopped at <b>${esc(orderSentence(state, world, cal, judged.blockedBy))}</b>${judged.blockedBy.skipped ? ` - ${esc(judged.blockedBy.skipped)}` : ""}</div>`
    : "";
  const blockedAt = judged.blockedBy ? orders.indexOf(judged.blockedBy) : -1;
  const rows = orders.map((o, i) => {
    const care = isCareRow(o);
    const blocked = blockedAt >= 0 && i >= blockedAt;
    const live = it?.orderId === o.id;
    const counts = !care && o.done > 0 ? ` <small>${esc(`${o.done} ${countWord(o.req.task, o.done)}, ${fmtDuration(o.minutes)}`)}</small>` : "";
    // Once or standing, on the row. The two are not the same promise - a
    // once order is done and gone, a standing one is kept - and the list
    // treats them differently enough that which is which has to be visible:
    // a once order works through the night and cuts into work in hand, a
    // standing one waits for the light and for the chunk to end.
    const once = !care && o.req.until.kind === "once";
    const kind = care ? "" : `<span class="kind">${once ? "once" : "standing"}</span>`;
    const blockedTag = blocked ? `<span class="kind blocked">blocked</span>` : "";
    // waitingLine is the plain reading and writes nothing; the scheduler's own read
    // is what moves a restart band's mark, so drawing a row never advances the list.
    // Task progress and the concrete step live in the central strip. The
    // queue row already names its purpose, so repeating either here would
    // create two competing places to read the same activity.
    const second = live
      ? ""
      : blocked && o !== judged.blockedBy
        ? ""
        : ((line) => line ? `<div class="step">${esc(cap(plain(line)))}</div>` : "")(waitingLine(state, world, cal, o, judged));
    // A care row ranks like any other row and draws the same up and down,
    // since where it sits against the work is the whole of what the player
    // says to it. It draws no x: it cannot be struck off, and a button that
    // does nothing when clicked is worse than none - which is why the top
    // row draws no up and the bottom row no down, rather than drawing one
    // greyed out.
    const up = i > 0 ? `<button class="mini" data-act="order-up" data-id="${o.id}">up</button>` : "";
    const down = i < orders.length - 1 ? `<button class="mini" data-act="order-down" data-id="${o.id}">down</button>` : "";
    const move = `${up} ${down}`;
    // The pin is not "run this sooner" - moving the row up is that. It is
    // "do not fall through": hold the whole list here rather than quietly
    // running the row below. So it belongs only on a row that cannot run,
    // which is the only row a fall-through can happen at, and on one already
    // pinned, which would otherwise have no way back off. A pin on a care
    // row would mean nothing: the list never goes past those rows.
    // A switch showing the state it is in, not the click it takes. It is
    // drawn only where it decides anything: on a row that cannot run, which
    // is the only place a fall-through happens, and on one already blocking,
    // which would otherwise have no way back off.
    //
    // Not blocking is the red one. A row that cannot run while the list
    // walks past it is the state worth flagging - the player asked for that
    // work and it is not happening - and blocking is the settled answer to
    // it, so that one sits quiet.
    const pin = `<button class="mini pin ${o.pinned ? "blocking" : "skipping"}" data-act="order-pin" data-id="${o.id}" title="When this row cannot run, ${o.pinned ? "stop the queue here" : "skip it"}">on block: ${o.pinned ? "stop" : "skip"}</button>`;
    const btns = care
      ? `<span class="ctl">${move}</span>`
      : `<span class="ctl">${move} ${pin} <button class="mini" data-act="order-remove" data-id="${o.id}" title="Take it off the list">x</button></span>`;
    return `<div class="order${care ? " care" : ""}${once ? " once" : ""}${live ? " live" : ""}"><div class="head"><span class="ti"><b>${esc(orderSentence(state, world, cal, o))}</b><span class="meta">${kind}${blockedTag}</span>${counts}</span>${btns}</div>${second}</div>`;
  }).join("");
  return `${held}${rows}`;
}

/**
 * What the survivor is doing, right now, under the map.
 *
 * A strip and not a panel: one line saying idle, or the work in hand with
 * its bar. It had a heading, a row of buttons and a sentence telling the
 * player to pick something below, and all of that read as a queue with
 * something already in it on a survivor who had not been given an order in
 * their life. The bar is here rather than on the live order row because
 * one running job wants one bar.
 */
/**
 * What is happening, in two parts: what it is for, and what is being done
 * about it this minute.
 *
 * One reading, used by every surface that draws the doing rather than a
 * per-surface guess at it. The title is whatever owns the work - the order's
 * own sentence, "Self-care" for a body row, or the job itself when the
 * player started it by hand with no row behind it. The step is the minute:
 * sleeping, walking to the forest, felling a tree.
 *
 * Each surface takes what it needs and no more. The strip under the map has
 * no other context, so it draws both; a row in the queue has already said
 * its own title in its own heading, so it draws the step alone.
 */
export interface Activity { title: string; step: string; progress: boolean }

const CARE_ROUTE_PURPOSE = {
  sleep: "to sleep", storm: "for shelter", cold: "for warmth", hungry: "for food",
  thirsty: "for water", spent: "to rest", home: "to camp", fire: "for the fire", snares: "for the snares",
} as const;

function walkingStep(state: GameState, world: World, cal: Calendar, suffix = ""): string {
  if (!state.route) return "walking";
  const manner = walkManner(state, world, cal);
  return `${manner} ${remainingKm(state.route.path, state.player).toFixed(1)} km${suffix}`;
}

function activityStep(state: GameState, world: World, cal: Calendar): string {
  const it = state.intent;
  if (!it) return "";
  if (it.mode === "care") {
    if (state.task?.id === "walk" && state.route) {
      return walkingStep(state, world, cal, ` ${CARE_ROUTE_PURPOSE[it.need]}`);
    }
    if (state.task?.id === "sleep") return it.step.includes("dozing") ? "dozing" : "sleeping";
    if (state.task?.id === "rest") {
      if (it.need === "cold") return "warming up";
      if (it.need === "storm") return "waiting out storm";
      if (it.need === "thirsty") return "waiting for water";
      if (it.need === "home") return "at camp";
      return "resting";
    }
    return plain(it.step)
      .replace("clearing the fire site", "preparing fire")
      .replace("lighting the fire indoors", "lighting fire")
      .replace("lighting the fire", "lighting fire")
      .replace("splitting a log for the fire", "splitting firewood");
  }
  if (state.task?.id === "walk" && state.route) {
    const atCamp = it.campCell !== null && state.route.target === it.campCell;
    const ground = groundOf(it.task, it.arg);
    const destination = atCamp ? "camp" : ground ? SPOT_WORDS[ground].replace(/^the /, "") : "";
    return walkingStep(state, world, cal, destination ? ` to ${destination}` : "");
  }
  if (state.task?.id === it.task) return "";
  return plain(it.step)
    .replace("loading up", "loading")
    .replace("unloading at camp", "unloading")
    .replace("laying out materials at camp", "laying out materials");
}

export function activity(state: GameState, world: World, cal: Calendar): Activity | null {
  const it = state.intent;
  if (it) {
    return {
      title: isWorkIntent(it) ? plain(check(state, world, cal, it.task, it.arg, it.cell).label) : it.care === "camp" ? "Camp maintenance" : "Self-care",
      step: activityStep(state, world, cal),
      progress: !!state.task && state.task.duration > 0,
    };
  }
  const t = state.task;
  if (!t) return null;
  // A raw task with no intent behind it: started by hand, so it is its own
  // title and there is no step under it to name.
  const opts = availableTasks(state, world, cal);
  const title = opts.find((o) => o.id === t.id && (o.arg ?? "") === (t.arg ?? ""))?.label ?? t.id;
  if (t.id === "explore") {
    const step = t.surveyPhase === "read" ? "reading the water" : state.route ? walkingStep(state, world, cal) : "surveying";
    return { title, step, progress: t.duration > 0 };
  }
  if ((t.id === "walk" || t.id === "travel") && state.route) {
    const named = state.route.label.startsWith("a spot ") ? "" : ` to ${state.route.label.replace(/^the /, "")}`;
    return { title: t.id === "travel" ? "Travel" : "Walk", step: walkingStep(state, world, cal, named), progress: t.duration > 0 };
  }
  return { title, step: "", progress: t.duration > 0 };
}

/** A line that stands on its own starts with a capital, whoever wrote it. */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function taskHtml(state: GameState, world: World, cal: Calendar, hurryState?: HurryState): string {
  const it = state.intent;
  const orders = ordersHere(state, world);
  // A row's own work is stopped from its row; work started by hand is
  // stopped here, since there is no row to stop it from.
  const scheduled = it !== null && orders.some((o) => o.id === it.orderId);
  const stop = scheduled || (!it && !state.task) ? "" : `<button class="mini" data-act="stop" title="Stop; the share done is kept">stop</button>`;

  // One row, and one place for each fact: the row says what is happening,
  // the bar beside it says how far along and how long is left. A label over
  // a step line over a bar that repeated the step said the same thing three
  // times and spent three rows doing it.
  //
  // Both halves here, since the strip has nothing else around it to say what
  // the work is for: "Self-care: sleeping" rather than a bare "sleeping" the
  // player has to place for themselves.
  const now = activity(state, world, cal);
  const what = now
    ? `<b>${esc(cap(now.title))}</b>${now.step ? `<span class="sub">${esc(now.step)}</span>` : ""}`
    : `<span class="dim">${esc(idleLine(state, cal))}</span>`;
  const speedKind = hurryState ? hurryKind(state) : "none";
  const speeding = !!hurryState?.pulse;
  const speed = speedKind === "click" ? `<button class="mini speed-up${speeding ? " on" : ""}" data-act="hurry"${speeding ? " disabled" : ""}>speed up</button>` : "";
  return `<div class="now"><span class="what">${what}</span>${now?.progress ? TASK_BAR : ""}${speed}${stop}</div>`;
}

/**
 * What a survivor with nothing in hand is doing, which is never nothing.
 *
 * The row is the same height idle or working, so the page does not jump
 * as a job ends, and it says something rather than "Idle": a body standing
 * in a wood at noon is looking at something. It turns over with the hour
 * rather than the minute - a line that changed every frame would be
 * movement where the eye expects none, and would redraw the strip sixty
 * times for every time it had something new to say.
 */
export function idleLine(state: GameState, cal: Calendar): string {
  const lines = cal.isNight ? IDLE_NIGHT : IDLE_DAY;
  return lines[Math.floor(state.minute / 60) % lines.length];
}

const IDLE_DAY = [
  "Counting birds in the sky...",
  "Looking for funny shaped clouds...",
  "Watching the light move...",
  "Listening to the wood...",
  "Turning a stone over with a boot...",
  "Picking at a splinter...",
  "Whistling something half remembered...",
  "Working out which way is north again...",
  "Scratching a mark into the bark...",
  "Waiting for something to happen...",
];

const IDLE_NIGHT = [
  "Looking at the stars...",
  "Listening to the dark...",
  "Turning over, and over again...",
  "Naming the shapes in the trees...",
  "Thinking about the morning...",
  "Counting the hours till light...",
];

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
  // The count is of orders given. Both care rows are on every list from the
  // moment a region exists, so counting the rows would tell a player who has
  // given nothing that five things are standing.
  const given = ordersHere(state, world).filter((o) => !isCareRow(o)).length;
  const count = given ? ` <span class="r">${given}</span>` : "";
  return `<h2>Activity queue${count}</h2>${ordersHtml(state, world, cal)}`;
}

/** One compact risk line. */
export function forecastRowText(row: ForecastRow): string {
  if (row.died === 0) return `Risk 0/${row.runs}`;
  return `Risk ${row.died}/${row.runs}: ${CAUSE_WORD[row.cause!]}, day ${row.day}`;
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
  if (state.dead) return `<div class="row dim">Nothing ahead</div>`;
  const r = view?.rows.away;
  if (!r) return `<div class="row dim">Risk ...</div>`;
  const text = esc(forecastRowText(r));
  if (r.stale) return `<div class="row dim">${text} ...</div>`;
  return `<div class="row">${text}</div>`;
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
  const field = p.fieldFire?.cell === cellOf(state, world) && p.fieldFire.fuelKg > 0;
  const wood = camp && !field ? invs.reduce((a, inv) => a + qty(inv, "firewood") + qty(inv, "wetFirewood"), 0) : qty(p.pack, "firewood");
  const fire = (st.fire.lit && camp) || field
    ? `<button class="mini" data-act="feed" ${wood <= 0 ? "disabled" : ""}>add firewood <small>${fmtKg(wood)} within reach</small></button>`
    : "";
  const atSource = waterSource(state, world);
  const short = p.water < WATER_FULL - 1e-9;
  const shoreClosed = watersideCell(world, cellOf(state, world)) && localWeather(state, world).iceCm >= ICE_SHORE_CM;
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
function haulHtml(state: GameState, world: World, cal: Calendar, display: TravelDisplay): string {
  const camp = campCellOf(state, world);
  if (camp !== null && camp === cellOf(state, world)) return "";
  const o = check(state, world, cal, "haul");
  if (!o.ok) return o.why ? `<div style="margin-top:4px"><span class="dim">${esc(plain(o.why))}</span></div>` : "";
  const km = camp === null ? null : kmBetween(state, world, cellOf(state, world), camp, "safe");
  const estimate = km === null ? fmtDuration(o.duration) : formatTravel(km * 2, o.duration, display);
  return `<div style="margin-top:4px"><button class="mini" data-act="task" data-id="haul">haul it all to camp <small>${esc(plain(o.detail))}; ${esc(estimate)}</small></button></div>`;
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
export function inventoryHtml(state: GameState, world: World, cal: Calendar, display: TravelDisplay = DEFAULT_TRAVEL_DISPLAY): string {
  const p = state.player;
  const kg = weight(p.pack);
  const d = body(state);
  const over = kg > d.packHardKg ? "bad" : kg > d.packComfortableKg ? "accent" : "";
  const carried = listItems(p.pack);
  const here = herePile(state, world);
  const ground = listItems(here);
  const dropAll = carried.length ? `<div class="invact"><button class="mini" data-act="drop-all">drop everything here</button></div>` : "";
  // Eating, drinking and feeding the fire stand over what they are done
  // with. Under the map they read as a queue with something already in it,
  // on a survivor who had never been given an order.
  return `${instantHtml(state, world)}<div class="invsec carry" data-inv="carry">
<h2>Carried <span class="r ${over}">${fmtKg(kg)} of ${d.packComfortableKg} kg comfortable, ${d.packHardKg} kg max</span></h2>
${invRows(carried, "drop")}${dropAll}
</div>${ground.length ? `
<div class="invsec ground" data-inv="ground">
<h2>On the ground, ${esc(describeWhere(state, world))} <span class="r">${fmtKg(weight(here))}</span></h2>
${invRows(ground, "take")}${haulHtml(state, world, cal, display)}
</div>` : ""}`;
}

export function fmtLogTime(e: LogEntry): string {
  const abs = e.minute + 480;
  const day = Math.floor(e.minute / 1440) + 1;
  const hour = ((abs % 1440) / 60);
  return `d${day} ${fmtClock(hour)}`;
}

/** The log: "you" for what the player watched, the survivor's name for what happened while they were away. */
export function logHtml(state: GameState): string {
  const entries = state.log.slice(-60).reverse();
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
<p class="dim">Portraits use <a href="https://www.figma.com/community/file/1589627891082866389" target="_blank" rel="noopener">ToonHead by Johan Melin</a>, licensed CC BY 4.0.</p>
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
${entries.length ? `<div class="entries">${entries.slice(-40).reverse().map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(voice(e.text, e.away ? name : null))}</div>`).join("")}</div>` : "<p class=\"dim\">Nothing worth telling.</p>"}
<button class="act" data-act="dismiss">Continue</button>
</div>`;
}

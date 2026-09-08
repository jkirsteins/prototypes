import { edible, HUNGRY_LINE, itemLabel, refusalReason } from "../sim/actions";
import { absence, densityLabel, regionDensity } from "../sim/animals";
import { isCareRow } from "../sim/bodyorder";
import { type Calendar, fmtClock, fmtDate, monthName } from "../sim/calendar";
import { canMoveCamp, needsMending, rackCapacity, siteLine, siteReport } from "../sim/camp";
import { CAPABILITIES, standingHere } from "../sim/capabilities";
import { coldFeet, coldHands, garmentWet } from "../sim/clothing";
import { groundDry, hasEmbers, smoky } from "../sim/fire";
import { herePile, listItems, pile, pilesIn, qty, weight } from "../sim/inventory";
import { body } from "../sim/person";
import { intentSentence, WAITING_STEP } from "../sim/intent";
import { CLOTHING, FOODS, type FoodId, KCAL_FULL, KG_ITEMS, STRUCTURES, TOOLS } from "../sim/items";
import { fishLie, readCells } from "../sim/knowledge";
import { knownShare } from "../sim/mapped";
import { isFish, isVoiceOnly, SPECIES_DEFS, type Species } from "../sim/species";
import { entry, epitaph, epitaphTail, fmtWorldDate, monthOfDoy, stories } from "../sim/epitaph";
import { CAUSE_WORD, type ForecastRow, type HorizonId } from "../sim/forecast";
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
import { fmtDuration, fmtKg, fmtKm, fmtReal, GAME_MINUTES_PER_REAL_SECOND, shareWord } from "../units";
import { regionAt, speciesHere, type World } from "../world/gen";
import { hurryKind, PULSE_MIN } from "./hurry";
import { esc, type UiState } from "./render";
import { plain, voice } from "../sim/voice";
import { waterLine, waterList } from "./water";
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
  // Under the meal line means the meal did not happen: nothing left worth
  // taking, or the body's row waiting its turn behind the work. Either way
  // the fat behind it is paying, and that is the state worth a word.
  // Starving is what the fat running out is.
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

export function clockHtml(state: GameState, world: World, cal: Calendar, ambient: number, rate = 1): string {
  // What a person would call the light where they stand, which after dark is
  // the difference between a night's work and a night's groping about. The
  // lux behind it is never shown.
  const sun = lightWord(illuminance(state, world, cal, cellOf(state, world)));
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
<span class="${rate > 1 ? "hurrying" : "dim"}">1 s = ${Math.round(GAME_MINUTES_PER_REAL_SECOND * rate)} game min</span>
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
  const lines = groups
    .map(([label, pick]) => {
      const list = here.filter(pick).map((s) => rosterEntry(state, world, id, s, cal));
      return list.length ? `<div>${label}: ${list.join(", ")}</div>` : "";
    })
    .join("");
  return lines + readHtml(state, world, id);
}

/**
 * The shores of this region the survivor has read, with what lies where.
 * A reading is about the water rather than the cell, so shores that read
 * the same are one line: a coast-born survivor takes in every shore of a
 * ground at a glance, and a region has dozens of them. Empty when none is
 * read; nearest first, as readCells orders them.
 */
export function readHtml(state: GameState, world: World, id: number): string {
  const said = new Set<string>();
  const out: string[] = [];
  for (const c of readCells(state, world, id)) {
    const fish = state.player.known[c].fish;
    if (fish.length === 0) continue;
    const line = fish.map(fishLie).join(", ");
    if (said.has(line)) continue;
    said.add(line);
    out.push(`<div>Shore read: ${line}</div>`);
  }
  return out.join("");
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
        const km = kmBetween(state, world, campCellOf(state, world, id), s.cell);
        const dist = s.id === "camp" ? "" : km === null ? "no way there" : `${fmtKm(km)} from camp`;
        return `<div>${SPOT_WORDS[s.id]} <small>${[dist, lying].filter(Boolean).join(", ")}</small></div>`;
      }
      // The "camp" spot's cell is generated once and never moves; the live camp is campCellOf
      // (walkTarget's own "spot:camp" case resolves the same way, so the button below agrees).
      const cell = s.id === "camp" ? campCellOf(state, world, id) : s.cell;
      // A generated spot sited on the live camp's own cell would draw a second row for
      // the same cell (two "you are here" once you stand on it); the camp row above,
      // listed first, already stands for it.
      if (s.id !== "camp" && cell === campCellOf(state, world, id)) return "";
      if (cell === myCell) return `<div><b>@</b> ${SPOT_WORDS[s.id]} <small>${["you are here", lying].filter(Boolean).join(", ")}</small></div>`;
      // Distance and time from where the player stands, along the route.
      const walk = check(state, world, cal, "walk", `spot:${s.id}`);
      const km = kmBetween(state, world, myCell, cell, walkableIce(state.weather));
      // No known corridor to camp: the search for one is the only move left, and it promises no time.
      const home = s.id === "camp" && !walk.ok && walk.why === "{you} {know} no way there" ? check(state, world, cal, "searchHome") : null;
      const btn = walk.ok
        ? ` <button class="mini" data-act="task" data-id="walk" data-arg="spot:${s.id}">walk (${fmtDuration(walk.duration)}, ${fmtReal(walk.duration)})</button>`
        : home
          ? ` <small>${esc(plain(walk.why))}</small> <button class="mini" data-act="task" data-id="searchHome">search for a way home <small>(${esc(home.detail)})</small></button>`
          : ` <small>${esc(plain(walk.why))}</small>`;
      const thin = thinIceButton(state, world, cal, "walk", `spot:${s.id}`, walk);
      return `<div>${SPOT_WORDS[s.id]} <small>${[km === null ? "no way there" : `${fmtKm(km)} from here`, lying].filter(Boolean).join(", ")}</small>${btn}${thin}</div>`;
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
  // A third word between burning and cold: coals are live but not fed, the
  // routine state after every tended night rather than an exception. The
  // fuel bar below (shown only "here") already ticks off how long they last;
  // duplicating that count into this line would put a per-minute value into
  // markup the region panel's churn budget does not allow.
  const fireWord = st.fire.lit
    ? `<span class="good">burning${smoky(st.fire) ? ", smoking" : ""}</span>`
    : hasEmbers(st.fire)
      ? '<span class="ember">coals</span>'
      : '<span class="dim">cold</span>';
  const fire = st.structures.firePit ? `<div>fire: ${fireWord}</div>${here ? bar("fire", "fire", "Fuel") : ""}` : "";
  const rack = st.structures.dryingRack
    ? `<div>rack: ${st.rack.kg > 0 ? `${st.rack.kg.toFixed(1)} kg drying, ${Math.round((st.rack.dried / (48 * 60)) * 100)}%` : "empty"} <small>(${rackCapacity(st)} kg max)</small></div>`
    : "";
  const campPile = pile(state, st.campCell);
  const cap = campWaterCapacity(campPile, st);
  const water = cap > 0 || qty(campPile, "water") + qty(campPile, "ice") > 0
    ? `<div>water: ${qty(campPile, "water").toFixed(1)} of ${cap.toFixed(1)} l${qty(campPile, "ice") > 0 ? `, ${qty(campPile, "ice").toFixed(1)} l frozen` : ""}${st.iceHole ? ", ice hole open" : ""}</div>`
    : "";
  // What each producer standing here is limited by: the reason a camp that
  // makes its own food still runs out.
  const limits = CAPABILITIES.filter((c) => c.producer && standingHere(state, st, world, c))
    .map((c) => `<div><small>${esc(c.id)}: ${esc(c.limits)}</small></div>`)
    .join("");
  let travel = "";
  if (!here) {
    // Ground not yet known cannot be walked to - offer the way it opens instead.
    // A region already wholly known offers only Go.
    if (knownShare(state, world, id) >= 1) {
      const go = check(state, world, cal, "travel", `region:${id}`);
      travel = go.ok
        ? `<div style="margin-top:6px"><button class="act" data-act="task" data-id="travel" data-arg="region:${id}">Go to ${esc(r.name)} <small>${esc(go.detail)}, ${fmtDuration(go.duration)} (${fmtReal(go.duration)})${nb ? "" : "; not a neighbour, a long way round"}</small></button>${thinIceButton(state, world, cal, "travel", `region:${id}`, go)}</div>`
        : `<div style="margin-top:6px"><span class="dim">${esc(plain(go.why))}</span>${thinIceButton(state, world, cal, "travel", `region:${id}`, go)}</div>`;
    } else {
      const ex = check(state, world, cal, "explore", `region:${id}`);
      travel = ex.ok
        ? `<div style="margin-top:6px"><button class="act" data-act="task" data-id="explore" data-arg="region:${id}">Explore ${esc(r.name)} <small>${esc(ex.detail)}</small></button></div>`
        : `<div style="margin-top:6px"><span class="dim">${esc(plain(ex.why))}</span></div>`;
    }
  }
  // What this cell offers as a camp, shown only when it is not the camp already; a move
  // blocked at the old camp (a structure, a banked fire, a loose pile) says why beside it.
  const move = here && myCell !== campCellOf(state, world, id) ? canMoveCamp(state, world) : null;
  const asCamp = move
    ? `<dt>as a camp</dt><dd>${esc(siteLine(siteReport(state, world, myCell)))}${move.ok ? "" : ` (${esc(plain(move.why))})`}</dd>`
    : "";
  return `<h2>${here ? "Here" : "Region"} <span class="r">${r.area.toFixed(1)} km2</span></h2>
<div><b class="accent">${esc(r.name)}</b>${here ? ` <small>you are ${esc(describeWhere(state, world))}</small>` : ""}${ui.selected !== null ? ` <button class="mini" data-act="select" data-r="${p.region}">back to here</button>` : ""}</div>
<dl class="kv">
<dt>land</dt><dd>${terrain}</dd>
<dt>trees</dt><dd>${Math.floor(st.wood)} worth felling</dd>
<dt>animals</dt><dd>${rosterHtml(state, world, id, cal)}</dd>
<dt>places</dt><dd class="spots">${spots}${loose}</dd>
${here ? `<dt>water</dt><dd>${esc(waterLine(state, world, cal))}<br><small>${esc(waterList(state, world, cal))}</small></dd>` : ""}
${asCamp}
<dt>built</dt><dd>${built.length || unfinished.length ? [...built, ...unfinished].join(", ") : "<span class=\"dim\">nothing</span>"}${fire}${rack}${water}${limits}</dd>
</dl>${travel}`;
}

const TASK_BAR = `<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;
/** The pulse draining, on the live row of an order hurried by clicking; written by id each frame. */
const HURRY_BAR = `<div class="bar hurry"><div class="fill" id="bar-hurry"></div></div>`;

/**
 * The one sentence that answers "is this a queue or a stack": both, and
 * which one a row landed by is the difference between the two ends of the
 * list. It sits at the head of the list because that is where a player
 * looks after clicking something and not finding it where they expected.
 */
const LANDING_RULE = `<div class="rule"><small>A click goes to the top. A standing order goes to the bottom.</small></div>`;

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
  // Only the scheduler's own wait, the one belonging to no row, is drawn
  // loose above the list. The wait a care row starts is that row's
  // minute, and drawing it here as well would put the survivor's own doings
  // in two places at once, neither of them the rank the player set them at.
  const loose = it?.task === "wait" && it.orderId === null;
  const waiting = loose
    ? `<div class="step">${esc(waitWhere)}${idle ? "" : `: ${esc(plain(it!.step))}`}</div>${state.task && !idle ? TASK_BAR : ""}`
    : "";
  // One judgement for the whole list: waitingLine reads it per row, and running
  // it per row would judge a ten-row list ten times a frame.
  const judged = judgeOrders(state, world, cal);
  // A pin is the only thing that stops the list, so the one moment the list
  // is stopped is the one moment it owes the player a banner: the row, why it
  // cannot run, and the one click that lets the rest of the list go on.
  const held = judged.blockedBy
    ? `<div class="held bad">The list is held up by <b>${esc(orderSentence(state, world, cal, judged.blockedBy))}</b>${judged.blockedBy.skipped ? ` - ${esc(judged.blockedBy.skipped)}` : ""}. Unpin it - its "doing this first" button - to let the rest of the list run.</div>`
    : "";
  const rows = orders.map((o, i) => {
    const live = it?.orderId === o.id;
    // A counted or standing order goes ahead a pulse at a time when its head is clicked; a once order is hurried unasked.
    const clicks = live && hurryKind(state) === "click";
    const counts = o.done > 0 ? ` <small>${esc(`${o.done} ${countWord(o.req.task, o.done)}, ${fmtDuration(o.minutes)}`)}</small>` : "";
    // waitingLine is the plain reading and writes nothing; the scheduler's own read
    // is what moves a restart band's mark, so drawing a row never advances the list.
    const second = live
      ? `<div class="step">${esc(plain(it!.step))}</div>${state.task ? TASK_BAR : ""}${clicks ? HURRY_BAR : ""}`
      : `<div class="step">${esc(waitingLine(state, world, cal, o, judged))}</div>`;
    // A care row ranks like any other row and draws the same up and down,
    // since where it sits against the work is the whole of what the player
    // says to it. It draws no x: it cannot be struck off, and a button that
    // does nothing when clicked is worse than none.
    const move = `<button class="mini" data-act="order-up" data-id="${o.id}" ${i === 0 ? "disabled" : ""}>up</button> <button class="mini" data-act="order-down" data-id="${o.id}" ${i === orders.length - 1 ? "disabled" : ""}>down</button>`;
    // A row that can be passed over and a row that stops the list are two
    // behaviours of the same row, so the button says which one is switched on
    // and what the switched-on one costs. A pin on a care row would mean
    // nothing: the list never goes past those rows, so they have none.
    const pin = `<button class="mini${o.pinned ? " on" : ""}" data-act="order-pin" data-id="${o.id}" title="${o.pinned ? "Nothing under this runs until it is done" : "Hold the list here until this is done"}">${o.pinned ? "doing this first - holds the list" : "do this first"}</button>`;
    const btns = isCareRow(o)
      ? `<span class="ctl">${move}</span>`
      : `<span class="ctl">${move} ${pin} <button class="mini" data-act="order-remove" data-id="${o.id}" title="Take it off the list">x</button></span>`;
    const head = clicks
      ? `<div class="head hurry" data-act="hurry" title="Click to hurry it: ${Math.round(PULSE_MIN)} minutes in a moment, then wait for the bar">`
      : `<div class="head">`;
    // Words and not only the title: a touch device has no hover to show one, and
    // a mouse never rests on a row long enough to find it.
    const hint = clicks ? `<small class="hint">click to hurry</small>` : "";
    return `<div class="order${isCareRow(o) ? " care" : ""}${live ? " live" : ""}">${head}<b>${i + 1}. ${esc(orderSentence(state, world, cal, o))}</b>${counts}${hint}${btns}</div>${second}</div>`;
  }).join("");
  return `${waiting}${held}${LANDING_RULE}${rows}`;
}

export function taskHtml(state: GameState, world: World, cal: Calendar): string {
  const t = state.task;
  const it = state.intent;
  const orders = ordersHere(state, world);
  const work = orders.some((o) => !isCareRow(o));
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
  } else if (!it && !work) {
    head = `<div class="dim">Nothing. Pick something below.</div>`;
  }
  // The heading names what the panel is a list of, and a list holding only
  // the care rows is not a list of orders: nobody has given one. Counting
  // the rows cannot tell the two apart, since both care rows are on every
  // list from the moment a region exists.
  return `<h2>${work ? "Orders" : "Doing"}</h2>${head}${ordersHtml(state, world, cal)}${asideHtml}`;
}

const HORIZON_LABEL: Record<HorizonId, (state: GameState) => string> = {
  away: (s) => `until you are back (${s.awayHours} h)`,
  tonight: () => "tonight",
  week: () => "a week",
  month: () => "a month",
};

/** "N of 10 die: cause, day D", the tonight row counting nights; "none of 10 die" when nothing died. */
export function forecastRowText(row: ForecastRow): string {
  if (row.died === 0) return `none of ${row.runs} die`;
  const unit = row.id === "tonight" ? "night" : "day";
  return `${row.died} of ${row.runs} die: ${CAUSE_WORD[row.cause!]}, ${unit} ${row.day}`;
}

/** The Ahead panel: one line per horizon, the ones not yet landed for the latest request dimmed with "...". A dead survivor has nothing ahead: the stale rows from before death would otherwise linger. */
export function forecastHtml(view: ForecastView | null, state: GameState): string {
  if (state.dead) return `<h2>Ahead</h2><div class="row"><span class="dim">nothing ahead</span></div>`;
  const ids: HorizonId[] = ["away", "tonight", "week", "month"];
  const rows = ids.map((id) => {
    const r = view?.rows[id];
    const label = HORIZON_LABEL[id](state);
    if (!r) return `<div class="row"><span class="dim">${label}</span><span class="dim">...</span></div>`;
    if (r.stale) return `<div class="row"><span class="dim">${label}</span><span class="dim">${esc(forecastRowText(r))} ...</span></div>`;
    return `<div class="row"><span>${label}</span><span>${esc(forecastRowText(r))}</span></div>`;
  });
  return `<h2>Ahead</h2>${rows.join("")}`;
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
  return `<div style="margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:4px">${foods}${fire}${drink}${fill}</div>`;
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

export function inventoryHtml(state: GameState, world: World, cal: Calendar): string {
  const p = state.player;
  const kg = weight(p.pack);
  const d = body(state);
  const over = kg > d.packHardKg ? "bad" : kg > d.packComfortableKg ? "accent" : "";
  const here = herePile(state, world);
  return `<h2>Pack <span class="r ${over}">${fmtKg(kg)} of ${d.packComfortableKg} kg comfortable, ${d.packHardKg} kg max</span></h2>
${invRows(listItems(p.pack), "drop")}
${listItems(p.pack).length ? `<div style="margin-top:4px"><button class="mini" data-act="drop-all">drop everything here</button></div>` : ""}
<h2 style="margin-top:10px">On the ground here, ${esc(describeWhere(state, world))} <span class="r">${fmtKg(weight(here))}</span></h2>
${invRows(listItems(here), "take")}${haulHtml(state, world, cal)}`;
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
<p><label>Name <input data-name maxlength="40" value="${esc(fmtName(l.name))}" /></label></p>
<button class="act" data-act="land">Land</button>
<button class="mini" data-act="next-boat" title="A week later, and the world runs on without you">next boat (${esc(fmtWorldDate(next))})</button>
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

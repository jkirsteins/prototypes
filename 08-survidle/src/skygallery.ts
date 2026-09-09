/**
 * The sky self-test page (sky.html, reached from the game by ?sky=1): the
 * weather widget drawn in every condition it has, side by side, so a change
 * to the sky can be looked at rather than argued about.
 *
 * It renders the real widget through the real function with the real
 * stylesheet, and drives it with the same updateSky the game calls each
 * frame. The only thing invented here is the weather and the hour; every
 * colour, every cloud and everything falling is the game's own.
 *
 * scripts/sky-shots.mjs screenshots this page and compares the pictures
 * against the ones committed under docs/sky-shots, so a change that alters
 * a sky says so instead of being noticed months later.
 */
import "./style.css";
import { calendar, fmtClock } from "./sim/calendar";
import { newGame } from "./sim/newgame";
import type { GameState, Weather } from "./sim/types";
import { weatherHtml } from "./ui/panels";
import { updateSky } from "./ui/sky";
import { ambientTemperature } from "./sim/weather";

/**
 * One condition: the hour of the day it is drawn at, and what the weather
 * is doing. A new sky belongs here and nowhere else - the page and the
 * shots are both written from this table, so the list and the pictures
 * cannot drift apart.
 */
export interface SkyCase {
  name: string;
  note: string;
  /**
   * When in the day, either as a clock reading or as a place in that day's
   * own light. Midsummer sets at 22:38 and midwinter at 15:10, so a "dusk"
   * written as 21.4 was broad daylight in June: the card said dusk and drew
   * a blue noon.
   */
  hour: number | { of: "sunrise" | "sunset"; plus: number };
  /** Day of the year, which sets the season and the length of the light. */
  doy: number;
  weather: Partial<Weather>;
  /** Advances this many game minutes per real second in the live gallery. */
  motionMinutesPerSecond?: number;
}

export const SKY_CASES: SkyCase[] = [
  { name: "dawn-clear", note: "the sun on the horizon, coming up", hour: { of: "sunrise", plus: 0.1 }, doy: 150, weather: { clear: true, precip: "none" } },
  { name: "day-clear", note: "midsummer noon, nothing in the way", hour: 12, doy: 172, weather: { clear: true, precip: "none" } },
  { name: "day-cloudy", note: "cloud over a bright sky", hour: 12, doy: 172, weather: { clear: false, precip: "none" } },
  { name: "dusk", note: "the sun going down: the pink hour", hour: { of: "sunset", plus: -0.05 }, doy: 172, weather: { clear: true, precip: "none" } },
  { name: "golden", note: "the last light before the sun is gone", hour: { of: "sunset", plus: -0.9 }, doy: 200, weather: { clear: true, precip: "none" } },
  { name: "night-clear", note: "the moon up and the stars out", hour: 1, doy: 172, weather: { clear: true, precip: "none" } },
  { name: "galaxy-motion", note: "sidereal motion, accelerated through a September night", hour: 20.4, doy: 243, weather: { clear: true, precip: "none" }, motionMinutesPerSecond: 30 },
  { name: "perseids", note: "a clear night near the Perseid peak", hour: 1, doy: 223, weather: { clear: true, precip: "none" } },
  { name: "night-cloudy", note: "the same night with the stars shut out", hour: 1, doy: 172, weather: { clear: false, precip: "none" } },
  { name: "rain-light", note: "rain, falling straight", hour: 14, doy: 200, weather: { clear: false, precip: "light" } },
  { name: "rain-heavy", note: "heavier rain, thicker cloud", hour: 14, doy: 200, weather: { clear: false, precip: "heavy" } },
  { name: "snow", note: "snow, wandering down", hour: 11, doy: 20, weather: { clear: false, precip: "heavy", snowCm: 22 } },
  { name: "storm", note: "a storm: the fall leans over and hurries", hour: 16, doy: 300, weather: { clear: false, precip: "heavy" } },
  { name: "winter-night", note: "a long dark, deep snow on the ground", hour: 2, doy: 350, weather: { clear: true, precip: "none", snowCm: 40, iceCm: 30 } },
  { name: "winter-noon", note: "what passes for noon in December", hour: 12, doy: 350, weather: { clear: false, precip: "none", snowCm: 40, iceCm: 30 } },
];

/** Live motion is opt-in by context so capture tools can stop it before load. */
export function shouldAnimateMotion(search: string, reducedMotion: boolean): boolean {
  return !new URLSearchParams(search).has("still") && !reducedMotion;
}

/**
 * The minute at which the clock reads this hour on this day of the year.
 *
 * Not hour times sixty: a game day starts at eight in the morning, so a
 * minute count and a clock face are eight hours apart, and setting 21.4
 * directly gave a card labelled "dusk" showing twenty past five in the
 * morning. The calendar is asked rather than second-guessed.
 */
function minuteFor(startDoy: number, doy: number, hour: SkyCase["hour"]): number {
  let day = 0;
  for (let d = 0; d < 400; d++) {
    if (calendar(d * 1440, startDoy).dayOfYear === doy) {
      day = d;
      break;
    }
  }
  const cal = calendar(day * 1440, startDoy);
  const h = typeof hour === "number" ? hour : (hour.of === "sunrise" ? cal.sunrise : cal.sunset) + hour.plus;
  const within = (((Math.round(h * 60) - 480) % 1440) + 1440) % 1440;
  return day * 1440 + within;
}

/** A world at one condition: the clock moved and the weather set, nothing else touched. */
function at(c: SkyCase): { state: GameState; world: ReturnType<typeof newGame>["world"] } {
  const { state, world } = newGame(21);
  state.minute = minuteFor(state.startDoy, c.doy, c.hour);
  // The seed's own weather is cleared first: a card is what its row says and
  // nothing it inherited, or a September sky reports the snow seed 21 happened
  // to have lying about.
  Object.assign(state.weather, { clear: true, precip: "none", snowCm: 0, iceCm: 0, storm: null }, c.weather);
  if (c.name === "storm") state.weather.storm = { from: state.minute, until: state.minute + 180, warned: true };
  return { state, world };
}

function draw(): void {
  const root = document.querySelector("#gallery");
  if (!root) return;
  const cards = SKY_CASES.map((c) => {
    const { state, world } = at(c);
    const cal = calendar(state.minute, state.startDoy);
    const ambient = ambientTemperature(cal, state.weather);
    return `<figure class="skycase" data-case="${c.name}">
<div class="panel skycase-box" id="wx-${c.name}">${weatherHtml(state, world, cal, ambient, 1, c.name)}</div>
<figcaption><b>${c.name}</b><br>${c.note}${c.motionMinutesPerSecond ? `<br><span data-motion-clock>${fmtClock(calendar(state.minute, state.startDoy).hour)}</span>` : ""}</figcaption>
</figure>`;
  }).join("");
  root.innerHTML = cards;

  // Each widget is lit by the condition it stands for. updateSky writes onto
  // whatever skies it is given, so each card is dressed inside its own box.
  for (const c of SKY_CASES) {
    const box = document.querySelector(`#wx-${c.name}`);
    if (!box) continue;
    const { state, world } = at(c);
    const cal = calendar(state.minute, state.startDoy);
    updateSky(state, cal, ambientTemperature(cal, state.weather), box);
    if (c.motionMinutesPerSecond && shouldAnimateMotion(
      window.location.search,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    )) {
      animateMotion(c, state, box);
    }
    void world;
  }
  document.body.setAttribute("data-ready", "1");
}

/** Loops one September dark window quickly enough to judge the celestial motion. */
function animateMotion(c: SkyCase, state: GameState, box: Element): void {
  const startMinute = state.minute;
  const startCal = calendar(startMinute, state.startDoy);
  const darkMinutes = (startCal.sunrise + 24 - startCal.hour - 0.2) * 60;
  const started = performance.now();
  let drawnMinute = -1;
  const frame = (now: number) => {
    const elapsed = (now - started) / 1000;
    const minute = startMinute + Math.floor((elapsed * (c.motionMinutesPerSecond ?? 0)) % darkMinutes);
    if (minute !== drawnMinute) {
      drawnMinute = minute;
      state.minute = minute;
      const cal = calendar(state.minute, state.startDoy);
      updateSky(state, cal, ambientTemperature(cal, state.weather), box);
      const hour = box.querySelector(".wx-clock .hour");
      const live = box.parentElement?.querySelector("[data-motion-clock]");
      if (hour) hour.textContent = fmtClock(cal.hour);
      if (live) live.textContent = `live ${fmtClock(cal.hour)}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

draw();

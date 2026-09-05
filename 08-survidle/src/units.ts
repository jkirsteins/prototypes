/**
 * The one unreal number in the game. Everything else is a real-world
 * quantity; this says how many game minutes pass per real second.
 */
export const GAME_MINUTES_PER_REAL_SECOND = 1;

/** Real hours the world runs on without the player before the catch-up caps: the away dial's default and ceiling. */
export const AWAY_HOURS_DEFAULT = 8;
export const AWAY_HOURS_MAX = 24;

export const CELL_KM = 0.3;
/** Real paths wander; straight-line distance times this. */
export const PATH_FACTOR = 1.25;

/** Pack weights, kg. Above the comfortable limit you slow down; above the hard limit you cannot lift it. */
export const PACK_COMFORTABLE_KG = 25;
export const PACK_HARD_KG = 35;

export function realSecondsFor(gameMinutes: number): number {
  return gameMinutes / GAME_MINUTES_PER_REAL_SECOND;
}

/** "1 h 30 min" style game durations. */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** "90 s" or "2 min 30 s" of wall clock for a game duration. */
export function fmtReal(gameMinutes: number): string {
  const s = Math.round(realSecondsFor(gameMinutes));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return rest === 0 ? `${m} min` : `${m} min ${rest} s`;
}

export function fmtKg(kg: number): string {
  if (kg >= 10) return `${Math.round(kg)} kg`;
  if (kg >= 1) return `${kg.toFixed(1)} kg`;
  return `${Math.round(kg * 1000)} g`;
}

export function fmtKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

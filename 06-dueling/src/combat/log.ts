import type { DuelEvent } from "./engine";

/**
 * The side tag names the ACTOR, not an index: in a mirror match every
 * line's weapon name is identical, so "[P1]" was the only identity signal
 * and it read as noise - a player could not tell from the log who won a
 * bind. Side 0 is always the human in this prototype (createDuel), so the
 * tags can say so outright.
 */
const SIDE_TAG = ["YOU", "AI"] as const;

export function formatEvent(e: DuelEvent): string {
  const total = Math.floor(e.time / 100) / 10;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const ss = s < 10 ? `0${s.toFixed(1)}` : s.toFixed(1);
  return `${m}:${ss} [${SIDE_TAG[e.side]}] ${e.text}`;
}

export function lastLines(log: DuelEvent[], n: number): string[] {
  return log.slice(-n).map(formatEvent);
}

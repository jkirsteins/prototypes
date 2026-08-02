import type { DuelEvent } from "./engine";

export function formatEvent(e: DuelEvent): string {
  const total = Math.floor(e.time / 100) / 10;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const ss = s < 10 ? `0${s.toFixed(1)}` : s.toFixed(1);
  return `${m}:${ss} [P${e.side + 1}] ${e.text}`;
}

export function lastLines(log: DuelEvent[], n: number): string[] {
  return log.slice(-n).map(formatEvent);
}

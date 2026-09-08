export interface SpeedSample { at: number; rate: number }
export interface SpeedHistory { samples: SpeedSample[]; lastSample: number }

export const SPEED_WINDOW_MS = 60_000;
export const SPEED_SAMPLE_MS = 250;

export function newSpeedHistory(): SpeedHistory {
  return { samples: [], lastSample: -Infinity };
}

export function sampleSpeed(history: SpeedHistory, at: number, rate: number): void {
  if (at - history.lastSample < SPEED_SAMPLE_MS) return;
  history.lastSample = at;
  history.samples.push({ at, rate: Math.max(1, Math.min(6, rate)) });
  const cutoff = at - SPEED_WINDOW_MS;
  while (history.samples.length > 1 && history.samples[1].at < cutoff) history.samples.shift();
}

export function speedAreaPath(samples: readonly SpeedSample[], now: number, width = 100, height = 22): string {
  if (!samples.length) return "";
  const x = (at: number) => Math.max(0, Math.min(width, ((at - (now - SPEED_WINDOW_MS)) / SPEED_WINDOW_MS) * width));
  const y = (rate: number) => height - ((Math.max(1, Math.min(6, rate)) - 1) / 5) * height;
  const first = samples[0];
  let d = `M ${x(first.at).toFixed(2)} ${height} L ${x(first.at).toFixed(2)} ${y(first.rate).toFixed(2)}`;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    d += ` L ${x(cur.at).toFixed(2)} ${y(prev.rate).toFixed(2)} L ${x(cur.at).toFixed(2)} ${y(cur.rate).toFixed(2)}`;
  }
  d += ` L ${width} ${y(samples[samples.length - 1].rate).toFixed(2)} L ${width} ${height} Z`;
  return d;
}

export function updateSpeedHistory(root: ParentNode, history: SpeedHistory, now: number, rate: number): void {
  sampleSpeed(history, now, rate);
  const path = root.querySelector<SVGPathElement>("[data-speed-path]");
  if (path) path.setAttribute("d", speedAreaPath(history.samples, now));
  const label = root.querySelector<HTMLElement>("[data-speed-rate]");
  if (label) {
    label.textContent = `1 s = ${Math.round(rate)} game min`;
    label.classList.toggle("hurrying", rate > 1);
  }
}

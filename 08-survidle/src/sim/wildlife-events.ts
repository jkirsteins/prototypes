import type { WildlifeStartleEvent } from "./wildlife-encounter";

type WildlifeEventSink = (event: WildlifeStartleEvent) => void;
let sink: WildlifeEventSink | null = null;

/** Live presentation is transient and deliberately absent from saved state. */
export function setWildlifeEventSink(next: WildlifeEventSink | null): void {
  sink = next;
}

export function emitWildlifeEvent(event: WildlifeStartleEvent): void {
  sink?.(event);
}

/**
 * The line between terrain models. A save carries both numbers in its
 * envelope: the schema version for the shape of GameState, and the world
 * version for which terrain model generated it. Either one falling behind the
 * current pair makes the save unreadable, since a patch id means nothing
 * against a lattice of another shape or a world of another solve.
 */
export const SAVE_VERSION = 10;
export const WORLD_VERSION = 3;

export type SaveCompatibility = "current" | "old-world" | "invalid";

/**
 * Reads only the envelope around a save - version, worldVersion, savedAt,
 * and that state is present - never the shape inside state. That is what
 * lets an old-world save be recognised before anything tries to interpret
 * its old cell ids as fine patch ids.
 */
export function inspectSave(text: string): SaveCompatibility {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (!parsed || typeof parsed !== "object") return "invalid";
  const envelope = parsed as { version?: unknown; worldVersion?: unknown; savedAt?: unknown; state?: unknown };
  if (typeof envelope.version !== "number" || typeof envelope.savedAt !== "number" || !envelope.state || typeof envelope.state !== "object") {
    return "invalid";
  }
  return envelope.version === SAVE_VERSION && envelope.worldVersion === WORLD_VERSION ? "current" : "old-world";
}

/**
 * Whether a throwaway or fresh world may be written over the current save.
 * False only while an old-world save is on display: that world exists so
 * the page has something to render behind the message, and persisting it
 * - from the autosave timer, a hidden tab, or pagehide - would silently
 * discard the incompatible save before the player has chosen to replace it
 * through the message's own action.
 */
export function canPersist(oldWorldSave: boolean): boolean {
  return !oldWorldSave;
}

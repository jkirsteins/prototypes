/**
 * The line between the old 300 metre cell world and the authoritative fine
 * lattice. A save carries both numbers in its envelope: the schema version
 * for the shape of GameState, and the world version for which terrain model
 * generated it. Either one falling behind the current pair makes the save
 * unreadable, since the fine lattice's patch ids mean nothing against the
 * old cell grid.
 */
export const SAVE_VERSION = 10;
export const WORLD_VERSION = 2;

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

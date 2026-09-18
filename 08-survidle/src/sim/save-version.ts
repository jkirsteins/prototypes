/**
 * The shape of GameState a save carries, in its envelope. A save from
 * another schema version is not read: this build's migrate() fills in what
 * a save of the current version lacks, and nothing older exists to read.
 */
export const SAVE_VERSION = 10;

export type SaveCompatibility = "current" | "stale" | "invalid";

/**
 * Reads only the envelope around a save - version, savedAt, and that state
 * is present - never the shape inside state, so a save can be judged
 * before anything interprets it.
 */
export function inspectSave(text: string): SaveCompatibility {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (!parsed || typeof parsed !== "object") return "invalid";
  const envelope = parsed as { version?: unknown; savedAt?: unknown; state?: unknown };
  if (typeof envelope.version !== "number" || typeof envelope.savedAt !== "number" || !envelope.state || typeof envelope.state !== "object") {
    return "invalid";
  }
  return envelope.version === SAVE_VERSION ? "current" : "stale";
}

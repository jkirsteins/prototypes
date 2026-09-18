import { WORDS } from "./words";

/**
 * The sync code: three words from the list, joined by dashes, for example
 * `heron-pine-ember`. Thirty bits. The code is the world's address in the
 * store - the Durable Object's id is derived from it and nothing else - so
 * anyone with the code can read and take the world, and the settings
 * block says so in one line.
 */

export const CODE_WORDS = 3;

/** Draws a fresh code from the platform's own randomness. */
export function drawCode(random: (n: number) => number = randomIndex): string {
  const words: string[] = [];
  for (let i = 0; i < CODE_WORDS; i++) words.push(WORDS[random(WORDS.length)]);
  return words.join("-");
}

/**
 * A code as it may arrive from a link or a paste: lowercased, trimmed,
 * with any run of spaces or dashes read as one dash. Null when it is not
 * three words of the list, so a typo never names a world of its own.
 */
export function normalizeCode(raw: string): string | null {
  const words = raw.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (words.length !== CODE_WORDS) return null;
  if (!words.every((w) => WORDS.includes(w))) return null;
  return words.join("-");
}

/** A uniform index below `n`, from `crypto.getRandomValues`, rejecting the biased tail. */
function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

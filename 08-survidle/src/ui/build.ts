/**
 * What was built, and the footer that says so. The three figures are filled
 * in at build time by vite.config.ts, which asks git; a tree built where git
 * cannot answer (a tarball, a stale CI checkout) reads "dev" rather than
 * claiming a version it does not have.
 */
import { esc } from "./render";

declare const __VERSION__: string | undefined;
declare const __BUILT_AT__: string | undefined;

/** What `git describe --tags --always --dirty` said where this bundle was built. */
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";
/** When it was built, in UTC to the minute, or empty where git could not be asked. */
export const BUILT_AT = typeof __BUILT_AT__ === "string" ? __BUILT_AT__ : "";

/**
 * The footer line: the manual and the settings as links at one end, the
 * build's own name at the other with when it was built as its title. Both
 * live here and nowhere else on the page - things to look up or set once,
 * not controls to reach for - so no panel or strip spends a button on them.
 */
export function buildHtml(version = VERSION, builtAt = BUILT_AT): string {
  const when = builtAt ? ` title="built ${esc(builtAt)}"` : "";
  return `<span class="links"><button type="button" class="linkish" data-act="manual-open">how to survive</button><button type="button" class="linkish" data-act="settings-open">settings</button></span><span${when}>survidle ${esc(version)}</span>`;
}

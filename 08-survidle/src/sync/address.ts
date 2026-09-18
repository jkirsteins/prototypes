import { normalizeCode } from "./code";

/**
 * The world is in the address. `?w=heron-pine-ember` names it, and the
 * page keeps the parameter there, so a bookmark, a tab handed to the
 * phone or an address typed in brings the same world with nothing to copy.
 * Opened without one, the page goes to the world this browser last had,
 * or draws a new one; either way the address is rewritten to carry it.
 *
 * Pure: the page passes its query string and what it stored, and applies
 * what comes back.
 */

export const WORLD_PARAM = "w";
/** The parameter the first build used; still read, never written. */
const LEGACY_PARAM = "sync";

export interface WorldAddress {
  /** The world this page is for. */
  code: string;
  /** The query string to show, `?...` or empty. */
  search: string;
  /** The address needs rewriting to say `search`. */
  rewrite: boolean;
  /** The address named a world other than the one this browser had, so the save cached here is another world's. */
  switched: boolean;
}

export function resolveWorld(search: string, stored: string | null, draw: () => string): WorldAddress {
  const params = new URLSearchParams(search);
  const raw = params.get(WORLD_PARAM) ?? params.get(LEGACY_PARAM);
  const named = raw === null ? null : normalizeCode(raw);
  const code = named ?? stored ?? draw();
  const switched = named !== null && stored !== null && named !== stored;
  const before = params.toString();
  params.delete(LEGACY_PARAM);
  params.set(WORLD_PARAM, code);
  const after = params.toString();
  return { code, search: after ? `?${after}` : "", rewrite: after !== before, switched };
}

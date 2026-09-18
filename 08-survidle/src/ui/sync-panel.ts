import type { SessionView } from "../sync/session";
import { esc } from "./render";

/**
 * The sync's two faces: the settings block that names the world and
 * offers a new one, and the banner that stands over the page whenever
 * this device is not the one running the world.
 *
 * The block is static markup with its own listener, mounted once like the
 * beacon's, so a redraw never takes a button out from under a tap. The
 * banner is rendered through setPanel from `syncBannerHtml`, since its
 * text moves with the store.
 */

export interface SyncPanelDeps {
  /** A store URL is set for this build; blank keeps the whole block to one line. */
  configured: boolean;
  code(): string | null;
  view(): SessionView | null;
  newWorld(): void;
}

export interface SyncPanel { refresh(): void }

export function mountSyncPanel(root: HTMLElement, deps: SyncPanelDeps): SyncPanel {
  const line = root.querySelector<HTMLElement>("[data-sync=line]")!;
  const actions = root.querySelector<HTMLElement>("[data-sync=actions]")!;
  const fresh = document.createElement("button");
  fresh.type = "button";
  fresh.className = "mini";
  fresh.dataset.sync = "new";
  fresh.textContent = "new world";
  fresh.addEventListener("click", deps.newWorld);
  actions.append(fresh);
  const codeEl = document.createElement("code");
  codeEl.dataset.sync = "code";

  function refresh(): void {
    const code = deps.code();
    if (!deps.configured || !code) {
      line.replaceChildren(deps.configured ? "This survivor lives in this browser." : "no sync store is configured for this build");
      fresh.hidden = true;
      return;
    }
    codeEl.textContent = code;
    line.replaceChildren(codeEl, `. The address carries it: anyone with the address can read and take this world. ${stateLine(deps.view())}`);
    fresh.hidden = false;
  }

  refresh();
  return { refresh };
}

function stateLine(view: SessionView | null): string {
  switch (view?.state) {
    case "running": return "This device runs it.";
    case "readonly": return `The ${view.lease?.label ?? "other device"} runs it; this one reads it.`;
    case "checking": return "Checking the store.";
    case "revoked": return "Another device took it over.";
    case "unreachable": return "The store cannot be reached.";
    case "outdated": return "It was saved by a newer game.";
    case "older": return "The save in the store cannot be loaded by this build; start a new world.";
    default: return "";
  }
}

/** The banner's markup, or an empty string when nothing needs saying. */
export function syncBannerHtml(view: SessionView | null, now: number): string {
  if (!view) return "";
  const b = (act: string, text: string, cls = "mini") => `<button type="button" class="${cls}" data-act="${act}">${text}</button>`;
  switch (view.state) {
    case "off":
      return "";
    case "running":
      return view.lastPutFailedAt === null ? "" : `<span class="warn">Sync unreachable since ${esc(clock(view.lastPutFailedAt))}; the game runs on, the save stays here.</span>`;
    case "checking":
      return `<span class="dim">Checking the sync store…</span>`;
    case "readonly": {
      const who = esc(view.lease?.label ?? "other device");
      const when = view.savedAt === null ? "" : `, saved ${ago(now - view.savedAt)} ago`;
      return `<span>The ${who} has the world${when}.</span> ${b("sync-take-over", "take over")} ${b("sync-refresh", "refresh")}`;
    }
    case "unreachable":
      return `<span class="bad">The sync store cannot be reached.</span> ${b("sync-retry", "retry")} ${b("sync-offline", "play offline")}`;
    case "revoked": {
      const who = esc(view.revoked?.by ?? "another device");
      const at = view.revoked ? ` at ${esc(clock(view.revoked.at))}` : "";
      return `<span class="bad">The ${who} took over${at}.</span> ${b("sync-reload", "reload from its save")}`;
    }
    case "outdated":
      return `<span class="bad">This world was saved by a newer game. Update to run it.</span> ${b("sync-refresh", "refresh")}`;
    case "older":
      return `<span class="bad">The world in the store was saved by an older map and cannot be loaded here.</span> <span class="dim">Settings offers a new world.</span>`;
  }
}

/** "12 s", "3 min", "2 h", "3 d": how long ago, at the coarsest unit that is not zero. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

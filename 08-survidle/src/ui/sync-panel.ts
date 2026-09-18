import { normalizeCode } from "../sync/code";
import type { SessionView } from "../sync/session";
import { esc } from "./render";

/**
 * The sync's two faces: the settings block that turns it on and off, and
 * the banner that stands over the page whenever this device is not the
 * one running the world.
 *
 * The block is static markup with its own listeners, mounted once like the
 * beacon's, so a redraw never takes a button out from under a tap. The
 * banner is rendered through setPanel from `syncBannerHtml`, since its
 * text moves with the store.
 */

export interface SyncPanelDeps {
  /** A store URL is set for this build; blank keeps the whole block to one line. */
  configured: boolean;
  code(): string | null;
  view(): SessionView | null;
  turnOn(): void;
  turnOff(): void;
  copyLink(): void;
  newWorld(): void;
  /** A code typed in by hand, already normalized. */
  join(code: string): void;
}

export interface SyncPanel { refresh(): void }

export function mountSyncPanel(root: HTMLElement, deps: SyncPanelDeps): SyncPanel {
  const line = root.querySelector<HTMLElement>("[data-sync=line]")!;
  const actions = root.querySelector<HTMLElement>("[data-sync=actions]")!;
  const button = (act: string, text: string, onClick: () => void, cls = "mini") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.dataset.sync = act;
    b.textContent = text;
    b.addEventListener("click", onClick);
    actions.append(b, " ");
    return b;
  };
  const on = button("on", "turn on", deps.turnOn);
  const copy = button("copy", "copy link", deps.copyLink);
  const off = button("off", "turn off", deps.turnOff);
  const fresh = button("new", "start a new world on this code", deps.newWorld, "mini bad");
  const codeEl = document.createElement("code");
  codeEl.dataset.sync = "code";
  // The other way in: three words typed, for a phone with no link to tap.
  const joinRow = document.createElement("div");
  joinRow.dataset.sync = "joinrow";
  const joinInput = document.createElement("input");
  joinInput.dataset.sync = "join";
  joinInput.placeholder = "heron-pine-ember";
  joinInput.size = 20;
  joinInput.spellcheck = false;
  joinInput.autocapitalize = "none";
  joinInput.setAttribute("aria-label", "sync code to join");
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "mini";
  joinButton.dataset.sync = "joinbutton";
  joinButton.textContent = "join";
  const joinNote = document.createElement("span");
  joinNote.className = "dim";
  joinNote.dataset.sync = "joinnote";
  const tryJoin = () => {
    const code = normalizeCode(joinInput.value);
    if (!code) {
      joinNote.textContent = " not a code: three words, as on the other device";
      return;
    }
    joinNote.textContent = "";
    joinInput.value = "";
    deps.join(code);
  };
  joinButton.addEventListener("click", tryJoin);
  joinInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") tryJoin(); });
  joinRow.append("or join a world by its code: ", joinInput, " ", joinButton, joinNote);
  actions.append(joinRow);

  function refresh(): void {
    const code = deps.code();
    const view = deps.view();
    if (!deps.configured) {
      line.replaceChildren("no sync store is configured for this build");
      for (const b of [on, copy, off, fresh]) b.hidden = true;
      joinRow.hidden = true;
      return;
    }
    if (!code) {
      line.replaceChildren("This survivor lives in this browser.");
      on.hidden = false;
      joinRow.hidden = false;
      copy.hidden = off.hidden = fresh.hidden = true;
      return;
    }
    codeEl.textContent = code;
    line.replaceChildren("code ", codeEl, `. Anyone with the code can take this world. ${stateLine(view)}`);
    on.hidden = true;
    joinRow.hidden = true;
    copy.hidden = off.hidden = false;
    fresh.hidden = view?.state !== "older";
  }

  refresh();
  return { refresh };
}

function stateLine(view: SessionView | null): string {
  switch (view?.state) {
    case "running": return "This device runs the world.";
    case "readonly": return `The ${view.lease?.label ?? "other device"} runs the world; this one reads it.`;
    case "checking": return "Checking the store.";
    case "revoked": return "Another device took the world over.";
    case "unreachable": return "The store cannot be reached.";
    case "outdated": return "The world was saved by a newer game.";
    case "older": return "The world in the store cannot be loaded by this build.";
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
      return `<span class="bad">The world in the store was saved by an older map and cannot be loaded here.</span> <span class="dim">Settings offers a new world on this code.</span>`;
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

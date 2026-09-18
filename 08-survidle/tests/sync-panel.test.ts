import { describe, expect, it } from "vitest";
import type { SessionView } from "../src/sync/session";
import { ago, mountSyncPanel, syncBannerHtml } from "../src/ui/sync-panel";

const view = (over: Partial<SessionView>): SessionView => ({ state: "off", lease: null, savedAt: null, storeVersion: null, lastPutFailedAt: null, revoked: null, ...over });
const lease = { holder: "p1", label: "phone", since: 0, lastSeen: 0 };

describe("the sync banner", () => {
  it("says nothing without a session, off, or running with the store in reach", () => {
    expect(syncBannerHtml(null, 0)).toBe("");
    expect(syncBannerHtml(view({ state: "off" }), 0)).toBe("");
    expect(syncBannerHtml(view({ state: "running" }), 0)).toBe("");
  });

  it("names the holder and how old its save is, with take over and refresh", () => {
    const html = syncBannerHtml(view({ state: "readonly", lease, savedAt: 100_000 }), 145_000);
    expect(html).toContain("The phone has the world, saved 45 s ago.");
    expect(html).toContain('data-act="sync-take-over"');
    expect(html).toContain('data-act="sync-refresh"');
  });

  it("escapes the other device's label, which anyone with the code can send", () => {
    const html = syncBannerHtml(view({ state: "readonly", lease: { ...lease, label: "<img src=x>" } }), 0);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    const revoked = syncBannerHtml(view({ state: "revoked", revoked: { by: "<b>x</b>", at: 0 } }), 0);
    expect(revoked).not.toContain("<b>");
  });

  it("offers retry and offline when the store is out of reach, and a reload once revoked", () => {
    const down = syncBannerHtml(view({ state: "unreachable" }), 0);
    expect(down).toContain("cannot be reached");
    expect(down).toContain('data-act="sync-retry"');
    expect(down).toContain('data-act="sync-offline"');
    const gone = syncBannerHtml(view({ state: "revoked", revoked: { by: "phone", at: 0 } }), 0);
    expect(gone).toContain("The phone took over");
    expect(gone).toContain('data-act="sync-reload"');
  });

  it("warns, without stopping, while a put keeps failing", () => {
    expect(syncBannerHtml(view({ state: "running", lastPutFailedAt: 0 }), 0)).toContain("Sync unreachable since");
  });

  it("reads a span at the coarsest unit that is not zero", () => {
    expect(ago(4_000)).toBe("4 s");
    expect(ago(150_000)).toBe("3 min");
    expect(ago(5 * 3_600_000)).toBe("5 h");
    expect(ago(72 * 3_600_000)).toBe("3 d");
  });
});

describe("the settings block", () => {
  function mount(configured: boolean, code: string | null, state: SessionView["state"] = "off") {
    const root = document.createElement("div");
    root.innerHTML = '<span data-sync="line"></span><div data-sync="actions"></div>';
    const calls: string[] = [];
    const panel = mountSyncPanel(root, {
      configured,
      code: () => code,
      view: () => (code ? view({ state, lease }) : null),
      turnOn: () => calls.push("on"),
      turnOff: () => calls.push("off"),
      copyLink: () => calls.push("copy"),
      newWorld: () => calls.push("new"),
    });
    const visible = () => [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden).map((b) => b.dataset.sync);
    return { root, panel, calls, visible };
  }

  it("is one line and no buttons when no store is configured", () => {
    const { root, visible } = mount(false, null);
    expect(root.textContent).toContain("no sync store is configured");
    expect(visible()).toEqual([]);
  });

  it("offers turn on while off, and the code with copy and turn off while on", () => {
    const off = mount(true, null);
    expect(off.root.textContent).toContain("lives in this browser");
    expect(off.visible()).toEqual(["on"]);
    off.root.querySelector<HTMLButtonElement>("[data-sync=on]")!.click();
    expect(off.calls).toEqual(["on"]);

    const on = mount(true, "heron-birch-ember", "running");
    expect(on.root.querySelector("code")?.textContent).toBe("heron-birch-ember");
    expect(on.root.textContent).toContain("Anyone with the code can take this world");
    expect(on.root.textContent).toContain("This device runs the world");
    expect(on.visible()).toEqual(["copy", "off"]);
  });

  it("offers a new world only once the store's save is refused", () => {
    const { visible } = mount(true, "heron-birch-ember", "older");
    expect(visible()).toEqual(["copy", "off", "new"]);
  });
});

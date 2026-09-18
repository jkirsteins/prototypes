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
      newWorld: () => calls.push("new"),
    });
    const visible = () => [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden && !b.closest("[hidden]")).map((b) => b.dataset.sync);
    return { root, panel, calls, visible };
  }

  it("is one line and no buttons when no store is configured", () => {
    const { root, visible } = mount(false, null);
    expect(root.textContent).toContain("no sync store is configured");
    expect(visible()).toEqual([]);
  });

  it("names the world, says the address carries it, and offers a new one", () => {
    const on = mount(true, "heron-pine-ember", "running");
    expect(on.root.querySelector("code")?.textContent).toBe("heron-pine-ember");
    expect(on.root.textContent).toContain("anyone with the address can read and take this world");
    expect(on.root.textContent).toContain("This device runs it");
    expect(on.visible()).toEqual(["new"]);
    on.root.querySelector<HTMLButtonElement>("[data-sync=new]")!.click();
    expect(on.calls).toEqual(["new"]);
    expect(mount(true, "heron-pine-ember", "older").root.textContent).toContain("start a new world");
  });
});

/**
 * The panes remember where the player was.
 *
 * Four panes exist at once and three are hidden, so switching to the Log
 * and back costs nothing - not the subtab, not the purpose, not the scroll.
 * What a reload would otherwise cost is what this file is about.
 */
import { describe, expect, it } from "vitest";
import { loadPanes, PANES_KEY, paneTabsHtml, purposesHtml, savePanes, subtabsHtml } from "../src/ui/panes";

/** Storage without a browser, so the round trip is the thing under test rather than happy-dom's. */
class Mem implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe("the panes remember where the player was", () => {
  it("a fresh player lands on Do, Gather, and Gather's first purpose", () => {
    expect(loadPanes(new Mem())).toEqual({ pane: "do", subtab: "Gather", purpose: "Woodcutting" });
  });

  it("a choice survives a reload", () => {
    const s = new Mem();
    savePanes(s, { pane: "do", subtab: "Camp", purpose: "Water" });
    expect(loadPanes(s)).toEqual({ pane: "do", subtab: "Camp", purpose: "Water" });
  });

  it("a purpose the subtab does not offer falls back rather than showing an empty pane", () => {
    const s = new Mem();
    s.setItem(PANES_KEY, JSON.stringify({ pane: "do", subtab: "Gather", purpose: "Clothing" }));
    expect(loadPanes(s).purpose).toBe("Woodcutting");
  });

  it("a subtab that no longer exists falls back too", () => {
    const s = new Mem();
    s.setItem(PANES_KEY, JSON.stringify({ pane: "do", subtab: "Cooking", purpose: "Food" }));
    expect(loadPanes(s).subtab).toBe("Gather");
  });

  it("rubbish in storage is not fatal", () => {
    const s = new Mem();
    s.setItem(PANES_KEY, "{oh no");
    expect(loadPanes(s).pane).toBe("do");
  });
});

describe("what the strips draw", () => {
  const panes = { pane: "do", subtab: "Camp", purpose: "Water" } as const;

  it("one tab is on and it is the one showing", () => {
    const html = paneTabsHtml(panes);
    expect((html.match(/class="tab on"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-pane="do"');
    for (const id of ["log", "pack", "journal"]) expect(html).toContain(`data-pane="${id}"`);
  });

  it("Pack comes second, since it is the other half of acting on the world", () => {
    // It draws the pile on the ground under the survivor as well as what
    // they carry, with the take and haul buttons, so it belongs beside the
    // list of things to do rather than behind the log.
    const order = [...paneTabsHtml(panes).matchAll(/data-pane="([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["do", "camp", "pack", "log", "journal"]);
  });

  it("one subtab is on and it is the one showing", () => {
    const html = subtabsHtml(panes);
    expect((html.match(/class="sub on"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-subtab="Camp"');
  });

  it("a purpose says how many rows it holds, so an empty one reads as empty and not as broken", () => {
    const html = purposesHtml(panes, { Fire: 3, Water: 4 });
    expect(html).toContain("Fire <small>3</small>");
    expect(html).toContain("Water <small>4</small>");
    // A purpose the count map says nothing about is nought, not undefined.
    expect(html).toContain("Rest <small>0</small>");
  });

  it("every button carries a key, since these strips redraw under the pointer", () => {
    // keyOf names a node by its data-* attributes; an unkeyed one is matched
    // by position, which is wrong for anything whose siblings come and go.
    for (const html of [paneTabsHtml(panes), subtabsHtml(panes), purposesHtml(panes, {})]) {
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b).toMatch(/data-(pane|subtab|purpose)=/);
    }
  });
});

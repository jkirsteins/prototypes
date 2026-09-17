import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { hideLoading, showLoading } from "../src/ui/loading";

describe("atomic startup", () => {
  beforeEach(() => {
    const html = readFileSync("index.html", "utf8");
    document.documentElement.innerHTML = html.slice(html.indexOf("<head>"), html.indexOf("</html>")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    document.documentElement.dataset.loading = "";
  });

  it("has a loading screen before JavaScript begins initializing the game", () => {
    expect(document.getElementById("loading")?.hidden).toBe(false);
    expect(document.getElementById("loading")?.textContent).toContain("Loading");
  });

  it("keeps initialization covered until explicitly ready", () => {
    showLoading("catching up", 0.8);
    expect(document.documentElement.dataset.loading).toBe("true");
    expect(document.getElementById("loading")?.hidden).toBe(false);
    hideLoading();
    expect(document.documentElement.dataset.loading).toBeUndefined();
    expect(document.getElementById("loading")?.hidden).toBe(true);
  });

  it("keeps an initialization failure readable and the game covered", () => {
    showLoading("the world could not be made: disk unavailable", 0);
    expect(document.documentElement.dataset.loading).toBe("true");
    expect(document.getElementById("loading")?.textContent).toContain("disk unavailable");
    expect(document.getElementById("loading")?.hidden).toBe(false);
  });
});

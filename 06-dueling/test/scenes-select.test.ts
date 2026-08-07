// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { handleScenesAction, hideScenes, isScenesOpen, showScenes } from "../src/ui/scenes";

beforeEach(() => {
  document.body.innerHTML = `
    <div id="scenes" hidden>
      <div class="cols">
        <div class="col" data-scene="duel"></div>
        <div class="col" data-scene="move"></div>
        <div class="col" data-scene="arena"></div>
      </div>
      <p class="hint"></p>
    </div>`;
});

describe("the scene selector", () => {
  test("opens, highlights, confirms the highlighted scene", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    expect(isScenesOpen()).toBe(true);
    handleScenesAction("selRight");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
    expect(isScenesOpen()).toBe(false);
  });

  test("direct picks: 1 duels, 2 moves, 3 arenas", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    handleScenesAction("selPickSecond");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
    showScenes((s) => { picked = s; });
    handleScenesAction("selPickFirst");
    handleScenesAction("selConfirm");
    expect(picked).toBe("duel");
    showScenes((s) => { picked = s; });
    handleScenesAction("selPickThird");
    handleScenesAction("selConfirm");
    expect(picked).toBe("arena");
  });

  test("left and right cycle through all three, wrapping both ways", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    handleScenesAction("selRight");
    handleScenesAction("selRight");
    handleScenesAction("selConfirm");
    expect(picked).toBe("arena");
    showScenes((s) => { picked = s; });
    handleScenesAction("selLeft"); // wraps backward from duel
    handleScenesAction("selConfirm");
    expect(picked).toBe("arena");
    showScenes((s) => { picked = s; });
    handleScenesAction("selRight");
    handleScenesAction("selRight");
    handleScenesAction("selRight"); // wraps forward to duel
    handleScenesAction("selConfirm");
    expect(picked).toBe("duel");
  });

  test("toggle flips the column like the sword select's W/S", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    handleScenesAction("selToggle");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
  });

  test("hideScenes closes without picking", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    hideScenes();
    expect(isScenesOpen()).toBe(false);
    expect(picked).toBe("");
  });
});

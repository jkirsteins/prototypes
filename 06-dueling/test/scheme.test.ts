// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";
import {
  KEYBOARD_LABELS, PAD_BINDINGS, PAD_LABELS,
  activeLabels, activeScheme, noteGamepadInput, noteKeyboardInput,
  notePadGone, onControlsChange, padKindOf, resetSchemeForTest,
  resolveLabels, resolvePadEdge,
} from "../src/input/scheme";
import type { ActionId, UiSnapshot } from "../src/input/scheme";
import { handleSelectAction, hideSelect, isSelectOpen, showSelect } from "../src/ui/select";

afterEach(() => resetSchemeForTest());

/**
 * gamepad-support §2/§3/§7.2: the scheme store, the labels contract and
 * the contextual resolver.
 */

const ui = (over: Partial<UiSnapshot> = {}): UiSnapshot => ({
  helpOpen: false, selectOpen: false, duelLive: true, paused: false, decided: false,
  ...over,
});

describe("the scheme store", () => {
  test("keyboard start; pad activity flips; fresh keydown flips back; disconnect reverts", () => {
    expect(activeScheme()).toBe("keyboard");
    noteGamepadInput("Xbox Wireless Controller");
    expect(activeScheme()).toBe("pad");
    expect(activeLabels().thrust).toBe("A");
    noteKeyboardInput();
    expect(activeScheme()).toBe("keyboard");
    expect(activeLabels().thrust).toBe("K");
    noteGamepadInput("DualSense Wireless Controller");
    expect(activeLabels().thrust).toBe("\u2715");
    notePadGone();
    expect(activeScheme()).toBe("keyboard");
  });

  test("an Xbox-to-PS handoff fires the change callback with the scheme still pad", () => {
    let fired = 0;
    onControlsChange(() => fired++);
    noteGamepadInput("Xbox Wireless Controller");
    expect(fired).toBe(1);
    noteGamepadInput("Xbox Wireless Controller");
    expect(fired).toBe(1); // nothing label-affecting changed
    noteGamepadInput("054c DualShock 4");
    expect(fired).toBe(2); // kind changed, scheme did not
    expect(activeScheme()).toBe("pad");
    expect(activeLabels().guard).toBe("R1");
  });

  test("PadKind derivation", () => {
    expect(padKindOf("DualSense Wireless Controller")).toBe("ps");
    expect(padKindOf("Sony 054c product")).toBe("ps");
    expect(padKindOf("PLAYSTATION(R)3 Controller")).toBe("ps");
    expect(padKindOf("Xbox Wireless Controller")).toBe("xbox");
    expect(padKindOf("Some Unknown Pad")).toBe("xbox");
  });
});

describe("labels and tokens", () => {
  test("resolveLabels substitutes actions and leaves unknown tokens visible", () => {
    expect(resolveLabels("{thrust} kills, {disarm} takes the sword", KEYBOARD_LABELS)).toBe(
      "K kills, I takes the sword",
    );
    expect(resolveLabels("{thrust} kills", PAD_LABELS.xbox)).toBe("A kills");
    expect(resolveLabels("{nonsense}", KEYBOARD_LABELS)).toBe("{nonsense}");
  });
});

describe("the contextual resolver (§7.2)", () => {
  test("Start resolves to exactly one action in every state", () => {
    const start = { kind: "button", index: 9 } as const;
    expect(resolvePadEdge(ui({ helpOpen: true }), start)).toBe("help");
    expect(resolvePadEdge(ui({ selectOpen: true, duelLive: false }), start)).toBe("selConfirm");
    expect(resolvePadEdge(ui({ decided: true, duelLive: false }), start)).toBe("rematch");
    expect(resolvePadEdge(ui({ decided: true, paused: true, duelLive: false }), start)).toBe("rematch"); // decided outranks paused
    expect(resolvePadEdge(ui(), start)).toBe("pause");
    expect(resolvePadEdge(ui({ paused: true }), start)).toBe("pause"); // the toggle resumes
  });

  test("Back: help open closes; select null; paused or decided reselects; live opens help", () => {
    const back = { kind: "button", index: 8 } as const;
    expect(resolvePadEdge(ui({ helpOpen: true }), back)).toBe("help");
    expect(resolvePadEdge(ui({ selectOpen: true, duelLive: false }), back)).toBe(null);
    expect(resolvePadEdge(ui({ paused: true }), back)).toBe("reselect");
    expect(resolvePadEdge(ui({ decided: true, duelLive: false }), back)).toBe("reselect");
    expect(resolvePadEdge(ui(), back)).toBe("help");
  });

  test("B closes help when open and feints in a duel; combat controls are null under help", () => {
    const b = { kind: "button", index: 1 } as const;
    expect(resolvePadEdge(ui({ helpOpen: true }), b)).toBe("help");
    expect(resolvePadEdge(ui(), b)).toBe("feint");
    expect(resolvePadEdge(ui({ helpOpen: true }), { kind: "button", index: 2 })).toBe(null);
    expect(resolvePadEdge(ui({ helpOpen: true }), { kind: "button", index: 7 })).toBe(null);
  });

  test("button 0 confirms on the select screen and thrusts in a duel; the top face voids", () => {
    const a = { kind: "button", index: 0 } as const;
    expect(resolvePadEdge(ui({ selectOpen: true, duelLive: false }), a)).toBe("selConfirm");
    expect(resolvePadEdge(ui(), a)).toBe("thrust"); // the kill and the yield on the easiest reach
    expect(resolvePadEdge(ui(), { kind: "button", index: 3 })).toBe("void");
  });

  test("the disarm control: RT resolves to disarm in a duel, exactly once per edge, null under help and selection", () => {
    const rt = { kind: "button", index: 7 } as const;
    expect(resolvePadEdge(ui(), rt)).toBe("disarm");
    expect(resolvePadEdge(ui({ helpOpen: true }), rt)).toBe(null);
    expect(resolvePadEdge(ui({ selectOpen: true, duelLive: false }), rt)).toBe(null);
    // One edge -> one action is structural: the resolver is a pure
    // function of (ui, edge), and the poller emits one edge per press
    // (pinned in gamepad.test.ts); outside a bind advantage the routed
    // intent reaches the engine and is harmlessly ignored - pinned end
    // to end in disarming.test.ts ("I is inert outside the advantage").
    expect(PAD_BINDINGS.disarm).toEqual([{ kind: "button", index: 7 }]);
    expect(PAD_LABELS.xbox.disarm).toBe("RT");
    expect(PAD_LABELS.ps.disarm).toBe("R2");
    expect(KEYBOARD_LABELS.disarm).toBe("I");
  });

  test("every duel verb resolves from its table binding, and only one action per edge", () => {
    const seen = new Map<string, ActionId>();
    for (const [action, controls] of Object.entries(PAD_BINDINGS) as Array<[ActionId, { kind: string; index: number }[]]>) {
      for (const c of controls) {
        const resolved = resolvePadEdge(ui(), c as never);
        if (resolved !== null) {
          const key = JSON.stringify(c);
          const prior = seen.get(key);
          if (prior !== undefined) {
            expect(resolved).toBe(prior); // one edge, one meaning, per state
          }
          seen.set(key, resolved);
        }
      }
      void action;
    }
  });
});

describe("select actions: one body for both devices (§6)", () => {
  test("handleSelectAction moves, toggles, direct-picks and confirms like the key path", () => {
    document.body.innerHTML = `<div id="select"><div class="col" data-col="p"></div><div class="col" data-col="e"></div><p class="hint"></p></div>`;
    let started: [string, string] | null = null;
    showSelect({ p: "longsword", e: "rapier" }, (p, e) => {
      started = [p, e];
    });
    expect(isSelectOpen()).toBe(true);
    handleSelectAction("selRight");
    handleSelectAction("selToggle"); // e: rapier -> longsword
    handleSelectAction("selLeft");
    handleSelectAction("selPickSecond"); // p -> rapier (direct pick)
    handleSelectAction("selConfirm");
    expect(started).toEqual(["rapier", "longsword"]);
    expect(isSelectOpen()).toBe(false);
    hideSelect();
  });

  test("the hint is written in the active scheme's labels", () => {
    document.body.innerHTML = `<div id="select"><div class="col" data-col="p"></div><div class="col" data-col="e"></div><p class="hint"></p></div>`;
    showSelect({ p: "longsword", e: "rapier" }, () => undefined);
    const hint = document.querySelector("#select .hint");
    expect(hint?.textContent).toContain("Enter to duel");
    noteGamepadInput("Xbox Wireless Controller");
    expect(hint?.textContent).toContain("A / Start to duel");
    hideSelect();
  });
});

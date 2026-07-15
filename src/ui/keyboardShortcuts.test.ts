import { describe, expect, it } from "vitest";
import { verbs } from "../game/types";
import { getVerbForKeyboardShortcut, verbKeyboardShortcuts, type KeyboardShortcutEvent } from "./keyboardShortcuts";

function key(event: Partial<KeyboardShortcutEvent> & Pick<KeyboardShortcutEvent, "key">): KeyboardShortcutEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...event,
  };
}

describe("verb keyboard shortcuts", () => {
  it("defines a shortcut for every verb", () => {
    expect(Object.keys(verbKeyboardShortcuts).sort()).toEqual([...verbs].sort());
  });

  it("maps unmodified keys to verbs", () => {
    expect(getVerbForKeyboardShortcut(key({ key: "l" }))).toBe("Look at");
    expect(getVerbForKeyboardShortcut(key({ key: "u" }))).toBe("Use");
    expect(getVerbForKeyboardShortcut(key({ key: "t" }))).toBe("Take");
    expect(getVerbForKeyboardShortcut(key({ key: "o" }))).toBe("Open");
    expect(getVerbForKeyboardShortcut(key({ key: "p" }))).toBe("Push");
  });

  it("maps shifted duplicate initials to their second verbs", () => {
    expect(getVerbForKeyboardShortcut(key({ key: "P", shiftKey: true }))).toBe("Pull");
    expect(getVerbForKeyboardShortcut(key({ key: "T", shiftKey: true }))).toBe("Turn");
  });

  it("ignores platform modifier chords", () => {
    expect(getVerbForKeyboardShortcut(key({ key: "l", metaKey: true }))).toBeUndefined();
    expect(getVerbForKeyboardShortcut(key({ key: "u", ctrlKey: true }))).toBeUndefined();
    expect(getVerbForKeyboardShortcut(key({ key: "o", altKey: true }))).toBeUndefined();
  });
});

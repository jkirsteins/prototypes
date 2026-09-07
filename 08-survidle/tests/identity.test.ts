/**
 * A redraw takes nothing away.
 *
 * Scroll offset is a DOM property, not an attribute. It is not in the
 * markup, so morphing cannot put it back - it survives if and only if the
 * scrolling element itself is never replaced. The same is true of a
 * caret, a focus and the button between a mousedown and its mouseup.
 *
 * setPanel already earns all of this: it builds a panel's whole markup as
 * a string, returns early when the string is unchanged, and otherwise
 * walks the old children against the new, moving and changing and
 * dropping rather than replacing. keyOf names a node by its id or its
 * data-* attributes so it can be found again wherever it moved to.
 *
 * These tests are the ratchet on that. They are green before the Do panel
 * is rebuilt and must still be green after, because the failure they
 * catch is invisible in a screenshot and perfectly obvious to the person
 * whose place in the list just vanished.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { doHtml } from "../src/ui/dopanel";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";

describe("a redraw takes nothing away", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);

  beforeEach(() => {
    resetPanels();
    // The scroll container as index.html has it, and nothing else: what is
    // under test is what setPanel does to the children of a box it keeps.
    document.body.innerHTML = `<div id="doitems"></div>`;
  });

  function draw(ui: ReturnType<typeof newUiState>) {
    setPanel("doitems", doHtml(state, world, cal, ui));
  }

  it("the item pane is the same node across every redraw", () => {
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems");
    ui.filter = "fire";
    draw(ui);
    ui.filter = "";
    draw(ui);
    expect(document.getElementById("doitems")).toBe(pane);
  });

  it("a row present before and after is the same node", () => {
    const ui = newUiState();
    draw(ui);
    const before = document.querySelector('[data-opt^="intent:deadwood"]');
    expect(before).not.toBeNull();
    // A row has to survive its neighbours disappearing and coming back,
    // which is what a filter does to it several times a second while
    // somebody is typing.
    ui.filter = "wood";
    draw(ui);
    ui.filter = "";
    draw(ui);
    expect(document.querySelector('[data-opt^="intent:deadwood"]')).toBe(before);
  });

  it("a scroll position survives a redraw that changes the rows", () => {
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems") as HTMLElement;
    pane.scrollTop = 120;
    ui.filter = "wood";
    draw(ui);
    expect(pane.scrollTop).toBe(120);
  });

  it("a field being typed into keeps its text and its caret", () => {
    resetPanels();
    document.body.innerHTML = `<div id="probe"></div>`;
    const markup = (n: string) => `<div data-row="one"><input data-row-n value="${n}"></div>`;
    setPanel("probe", markup("1"));
    const field = document.querySelector("[data-row-n]") as HTMLInputElement;
    field.focus();
    field.value = "12";
    field.selectionStart = 2;
    // A redraw around the field, and the markup still saying what the state
    // said before the keystroke. What is half-typed is the player's: the
    // value follows the state only while nobody is in the field.
    setPanel("probe", `${markup("1")}<div data-row="two"></div>`);
    expect(document.querySelector("[data-row-n]")).toBe(field);
    expect(field.value).toBe("12");
    expect(field.selectionStart).toBe(2);
    expect(document.activeElement).toBe(field);
  });

  it("a field nobody is in follows the state, so a row's count is not stale", () => {
    resetPanels();
    document.body.innerHTML = `<div id="probe"></div>`;
    const markup = (n: string) => `<div data-row="one"><input data-row-n value="${n}"></div>`;
    setPanel("probe", markup("1"));
    const field = document.querySelector("[data-row-n]") as HTMLInputElement;
    field.blur();
    setPanel("probe", markup("7"));
    expect(document.querySelector("[data-row-n]")).toBe(field);
    expect(field.value).toBe("7");
  });

  it("every container in the pane carries a key morphChildren can find it by", () => {
    // keyOf returns null for an element with neither an id nor a data-*,
    // and a null-keyed node is matched by position - which is right for a
    // static layout div and wrong for anything whose siblings come and go.
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems") as HTMLElement;
    expect(pane.children.length).toBeGreaterThan(0);
    for (const el of [...pane.children]) {
      const keyed = el.id !== "" || Object.keys((el as HTMLElement).dataset).length > 0;
      expect(keyed, `unkeyed container: ${el.outerHTML.slice(0, 90)}`).toBe(true);
    }
  });
});

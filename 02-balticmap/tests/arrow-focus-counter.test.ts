// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&armies=ravalans:3&defense=ravalans:1&duel=harjuans&march=harjuans>ravalans&hand=raid,grow-crops"}
/** The one interaction that plays a card without ever arming one: a click on
 *  an arrow already answerable (`armArrowAsCounter`, wired from
 *  `renderMarchArrows` in src/main.ts) goes straight to `decide({kind:
 *  "play", ...})` on its own pointerup, with `armed` never set. `onPlayCard`'s
 *  `interaction.deselect()` - the ARM half of "a pin does not survive an
 *  interaction" - is never reached by this path at all, which is exactly the
 *  hole a pinned land, an incoming raid and a counter click found: the play
 *  committed while the pin, its panel, the log filter and the arrow's own dim
 *  all survived it.
 *
 *  A separate file and a separate boot rather than an extra test in
 *  `arrow-focus.test.ts`, because the counter click needs the OPPOSITE arrow
 *  that file boots: a march INTO the player's own land, not the player's own
 *  march out. `defense=ravalans:1` puts the defending land's raid ceiling at
 *  its floor (`spendCeilingFor` rounds up from a fraction of CURRENT
 *  defense), so `askSpend` finds nothing to ask - the click's own `decide`
 *  runs synchronously, with no slider modal this environment would have to
 *  drive to reach it. */
import { it, expect, vi } from "vitest";

let svg: SVGSVGElement;
let arrows: SVGGElement;

const clickOn = (el: Element): void => {
  el.dispatchEvent(new MouseEvent(
    "pointerdown", { bubbles: true, clientX: 10, clientY: 10 },
  ));
  el.dispatchEvent(new MouseEvent(
    "pointerup", { bubbles: true, clientX: 10, clientY: 10 },
  ));
};

const marchArrow = (): SVGGElement | null =>
  arrows.querySelector('g[data-from="harjuans"][data-target="ravalans"]');

/** A land the arrow runs between neither of, so the pin is about somebody
 *  else's business - the same reasoning `arrow-focus.test.ts` pins the
 *  general pin tests on. */
const elsewhere = (): Element =>
  [...svg.querySelectorAll("path.region[data-id]")].find((el) => {
    const id = (el as SVGElement).dataset.id ?? "";
    return id !== "ravala" && id !== "harjumaa";
  })!;

it("clears the pin on a counter click, which arms nothing on its way to deciding", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  // happy-dom's isPointInFill demands the deprecated SVGPoint where a browser
  // takes a DOMPoint, and there is no geometry behind it here to ask anyway.
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  svg = document.querySelector("#app svg.map") as SVGSVGElement;
  arrows = svg.querySelector(".march-arrows") as SVGGElement;

  const land = elsewhere();
  clickOn(land);
  expect(land.classList.contains("selected")).toBe(true);
  expect(
    document.querySelector(".activity-log")?.classList.contains("filter-realm"),
  ).toBe(true);

  const arrow = marchArrow();
  expect(arrow).not.toBeNull();
  // Confirms the click below is exercising the counter path and not silently
  // hitting nothing: `.march-counterable` is added only once `counterFor`
  // says this arrow is answerable right now.
  expect(arrow!.classList.contains("march-counterable")).toBe(true);
  expect(arrow!.classList.contains("arrow-dim")).toBe(true);

  // Fake timers from before the click: `runAnimation` falls back to a real
  // `setTimeout` where `Element.animate` does not exist, which happy-dom's
  // SVG elements do not, so the flight this click starts has to be flushed by
  // hand to reach the repaint on the far side of it - and a timer the click
  // itself schedules is only interceptable if the fake clock is already
  // installed when it is set.
  vi.useFakeTimers();

  // The pin clears synchronously, inside `decide` itself, before anything
  // touches the animation queue - so it is checked before the flush below,
  // not because the flush would undo it.
  clickOn(arrow!);
  expect(land.classList.contains("selected")).toBe(false);
  expect(
    document.querySelector(".activity-log")?.classList.contains("filter-realm"),
  ).toBe(false);

  // Confirms the click really reached `decide` and committed a play, rather
  // than the pin clearing on a stray deselect the click happened to cause for
  // an unrelated reason (any click while something is selected deselects,
  // per `withClick` in src/state.ts): the counter it declared stands on the
  // same border, back the other way, beside the raid it answers.
  vi.runAllTimers();
  vi.useRealTimers();
  expect(
    arrows.querySelector('g[data-from="ravalans"][data-target="harjuans"]'),
  ).not.toBeNull();
});

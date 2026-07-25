// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createPanel, createTooltip } from "../src/panel";
import type { Region } from "../src/types";

const kurzeme: Region = { id: "LV003", name: "Kurzeme", country: "LV", path: "M0 0Z" };

describe("panel", () => {
  it("is hidden initially, shows region details on show()", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {});
    const root = container.querySelector(".panel")!;
    expect(root.classList.contains("hidden")).toBe(true);

    panel.show(kurzeme);
    expect(root.classList.contains("hidden")).toBe(false);
    expect(container.querySelector(".panel-name")!.textContent).toBe("Kurzeme");
    expect(container.querySelector(".panel-country")!.textContent).toBe("Latvia");
    const fields = Array.from(container.querySelectorAll(".panel-fields dt"));
    expect(fields.map((f) => f.textContent)).toEqual([
      "Population", "Area", "GDP per capita",
    ]);

    panel.hide();
    expect(root.classList.contains("hidden")).toBe(true);
  });

  it("invokes onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const panel = createPanel(container, onClose);
    panel.show(kurzeme);
    (container.querySelector(".panel-close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("tooltip", () => {
  it("shows text near the cursor and hides", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    expect(el.classList.contains("hidden")).toBe(true);

    tooltip.show("Kurzeme", 100, 200);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kurzeme");
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });
});

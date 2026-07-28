import { describe, it, expect, beforeEach } from "vitest";
import { createNotice } from "../src/ui/notice";
import type { Notice } from "../src/notices";

const sample: Notice = {
  title: "Backhand",
  what: "He plays Backhand. You had no answer for it.",
  flavor: "It is not the pain, it is how easy it was for him.",
  rows: ["Your vigor 6 -> 4", "He is close"],
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("notice modal", () => {
  it("starts hidden", () => {
    const notice = createNotice();
    expect(notice.root.classList.contains("hidden")).toBe(true);
    expect(notice.isOpen()).toBe(false);
  });

  it("shows the title, what and flavor", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    expect(notice.isOpen()).toBe(true);
    expect(notice.root.querySelector(".notice-title")?.textContent).toBe("Backhand");
    expect(notice.root.querySelector(".notice-what")?.textContent).toBe(sample.what);
    expect(notice.root.querySelector(".notice-flavor")?.textContent).toBe(sample.flavor);
  });

  it("renders one row per vitals change", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    const rows = [...notice.root.querySelectorAll(".notice-row")].map((n) => n.textContent);
    expect(rows).toEqual(sample.rows);
  });

  it("hides the row block when nothing changed", () => {
    const notice = createNotice();
    notice.show({ ...sample, rows: [] }, () => {});
    expect(notice.root.querySelector(".notice-rows")?.classList.contains("hidden")).toBe(true);
  });

  it("dismisses on continue and reports it once", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    notice.root.querySelector<HTMLButtonElement>(".notice-continue")?.click();
    expect(dismissed).toBe(1);
    expect(notice.isOpen()).toBe(false);
  });

  it("does not report a second dismissal from a stale click", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    const button = notice.root.querySelector<HTMLButtonElement>(".notice-continue");
    button?.click();
    button?.click();
    expect(dismissed).toBe(1);
  });

  it("replaces its content rather than accumulating rows across shows", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    notice.root.querySelector<HTMLButtonElement>(".notice-continue")?.click();
    notice.show({ ...sample, rows: ["He is down"] }, () => {});
    expect(notice.root.querySelectorAll(".notice-row")).toHaveLength(1);
  });

  it("hides without reporting a dismissal", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    notice.hide();
    expect(notice.isOpen()).toBe(false);
    expect(dismissed).toBe(0);
  });
});

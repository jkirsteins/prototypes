import { describe, it, expect, beforeEach } from "vitest";
import { createSecrets, createTaken } from "../src/ui/secrets";
import { SECRETS, cardById } from "../src/content/cards";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("held secrets", () => {
  it("shows all three from the start, in a fixed order", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const ids = [...secrets.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(SECRETS);
  });

  it("names each secret by its card name", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const first = secrets.root.querySelector(".secret") as HTMLElement;
    expect(first.textContent).toContain(cardById(SECRETS[0]).name);
  });

  it("keeps a spent secret in place, marked and disabled", () => {
    const secrets = createSecrets();
    secrets.update([SECRETS[0], SECRETS[2]], null);
    const ids = [...secrets.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(SECRETS);
    const gone = secrets.root.querySelector<HTMLButtonElement>(
      `.secret[data-card-id='${SECRETS[1]}']`,
    );
    expect(gone?.classList.contains("spent")).toBe(true);
    expect(gone?.disabled).toBe(true);
  });

  it("is not pickable when no handler is supplied", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const first = secrets.root.querySelector<HTMLButtonElement>(".secret");
    expect(first?.disabled).toBe(true);
  });

  it("reports a pick for a held secret when a handler is supplied", () => {
    const picks: string[] = [];
    const secrets = createSecrets();
    secrets.update(SECRETS, (id) => picks.push(id));
    secrets.root.querySelector<HTMLButtonElement>(`.secret[data-card-id='${SECRETS[0]}']`)?.click();
    expect(picks).toEqual([SECRETS[0]]);
  });

  it("never reports a pick for a spent secret", () => {
    const picks: string[] = [];
    const secrets = createSecrets();
    secrets.update([SECRETS[0]], (id) => picks.push(id));
    secrets.root.querySelector<HTMLButtonElement>(`.secret[data-card-id='${SECRETS[1]}']`)?.click();
    expect(picks).toEqual([]);
  });
});

describe("taken secrets", () => {
  it("is empty while you still hold all three", () => {
    const taken = createTaken();
    taken.update(SECRETS);
    expect(taken.root.querySelectorAll(".secret")).toHaveLength(0);
  });

  it("shows exactly what he has taken", () => {
    const taken = createTaken();
    taken.update([SECRETS[0]]);
    const ids = [...taken.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual([SECRETS[1], SECRETS[2]]);
  });
});

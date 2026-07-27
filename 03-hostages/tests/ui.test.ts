import { describe, it, expect, beforeEach } from "vitest";
import { renderTitle } from "../src/ui/title";
import { renderEvent } from "../src/ui/event";
import { renderDuel } from "../src/ui/duel";
import { renderEnding } from "../src/ui/ending";
import { chooseOpening, newRun, playerLead } from "../src/game";
import type { Actions } from "../src/ui/render";
import type { GameState } from "../src/types";

let root: HTMLElement;
const calls: string[] = [];

const actions: Actions = {
  start: () => calls.push("start"),
  choose: (id) => calls.push(`choose:${id}`),
  lead: (id) => calls.push(`lead:${id}`),
  pass: () => calls.push("pass"),
  answer: (id) => calls.push(`answer:${id}`),
  surrender: (id) => calls.push(`surrender:${id}`),
  discard: (id) => calls.push(`discard:${id}`),
  restart: () => calls.push("restart"),
};

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

beforeEach(() => {
  document.body.innerHTML = "<div id='app'></div>";
  root = document.querySelector<HTMLElement>("#app") as HTMLElement;
  calls.length = 0;
});

describe("title screen", () => {
  it("renders and starts a run", () => {
    renderTitle(root, actions);
    expect(root.querySelector("[data-screen='title']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("#start")?.click();
    expect(calls).toEqual(["start"]);
  });
});

describe("event screen", () => {
  it("offers three choices that report back", () => {
    renderEvent(root, actions);
    const buttons = root.querySelectorAll<HTMLButtonElement>("button.choice");
    expect(buttons).toHaveLength(3);
    buttons[0].click();
    expect(calls[0]).toMatch(/^choose:/);
  });
});

describe("duel screen", () => {
  it("shows the lead banner, status and log", () => {
    const state = started();
    renderDuel(root, state, actions);
    expect(root.querySelector("#turn-banner")?.textContent).toBe("YOUR TURN - lead a card");
    expect(root.querySelector("[data-stat='player-vigor']")?.textContent).toBe("Your vigor 5");
    expect(root.querySelector("[data-stat='secrets']")?.textContent).toBe("Secrets left 3");
    expect(root.querySelectorAll("#log li.log-entry").length).toBeGreaterThan(0);
  });

  it("disables illegal cards and states the reason", () => {
    const state = started();
    state.playerPile.hand = ["kickHisKnee"];
    renderDuel(root, state, actions);
    const button = root.querySelector<HTMLButtonElement>("button.card[data-card-id='kickHisKnee']");
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector(".card-reason")?.textContent).toBe("needs: you are not bound");
  });

  it("fires the lead action for a legal card", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    renderDuel(root, state, actions);
    root.querySelector<HTMLButtonElement>("button.card[data-card-id='stallHim']")?.click();
    expect(calls).toEqual(["lead:stallHim"]);
  });

  it("switches to the answer banner and offers decline", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["backhand"];
    playerLead(state, "stallHim");
    renderDuel(root, state, actions);
    expect(root.querySelector("#turn-banner")?.textContent).toBe(
      "HE IS WAITING - answer or decline",
    );
    root.querySelector<HTMLButtonElement>("#decline")?.click();
    expect(calls).toEqual(["answer:null"]);
  });

  it("shows the surrender banner and only the remaining secrets", () => {
    const state = started();
    state.phase = "forcedSurrender";
    state.secretsRemaining = ["secretSafe", "secretFloorboard"];
    renderDuel(root, state, actions);
    expect(root.querySelector("#turn-banner")?.textContent).toBe("HE HAS YOU - give up a secret");
    const ids = [...root.querySelectorAll("button.card")].map(
      (b) => (b as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(["secretSafe", "secretFloorboard"]);
  });

  it("shows the discard banner and offers every held card", () => {
    const state = started();
    state.phase = "discardDown";
    state.playerPile.hand = ["stoic", "stallHim"];
    renderDuel(root, state, actions);
    expect(root.querySelector("#turn-banner")?.textContent).toBe(
      "YOUR HAND IS FULL - discard one",
    );
    const ids = [...root.querySelectorAll("button.card")].map(
      (b) => (b as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(["stoic", "stallHim"]);
    root.querySelector<HTMLButtonElement>("button.card[data-card-id='stoic']")?.click();
    expect(calls).toEqual(["discard:stoic"]);
  });
});

describe("ending screen", () => {
  it("shows the headline, the account and a restart", () => {
    const state = started();
    state.outcome = "victory";
    renderEnding(root, state, actions);
    expect(root.querySelector(".headline")?.textContent).toMatch(/You win/);
    expect(root.querySelectorAll(".summary-line").length).toBeGreaterThan(0);
    root.querySelector<HTMLButtonElement>("#restart")?.click();
    expect(calls).toEqual(["restart"]);
  });
});

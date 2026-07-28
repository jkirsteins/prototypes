import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTitle } from "../src/ui/title";
import { renderEvent } from "../src/ui/event";
import { renderEnding } from "../src/ui/ending";
import { createTable, bannerText } from "../src/ui/table";
import { chooseOpening, newRun, playerAnswer, playerLead } from "../src/game";
import { SECRETS } from "../src/content/cards";
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

/** Mounts a table and runs every pending beat so it is at rest. */
function settled(state: GameState) {
  const table = createTable(actions);
  root.append(table.root);
  let done = 0;
  table.present(state, () => {
    done += 1;
  });
  vi.advanceTimersByTime(20000);
  return { table, settledCount: () => done };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<div id='app'></div>";
  root = document.querySelector<HTMLElement>("#app") as HTMLElement;
  calls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
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

describe("bannerText", () => {
  it("names the phase without shouting a wall of text", () => {
    const state = started();
    expect(bannerText(state)).toContain("YOUR TURN");
    state.phase = "playerAnswer";
    expect(bannerText(state)).toContain("HE IS WAITING");
    state.phase = "forcedSurrender";
    expect(bannerText(state)).toContain("HE HAS YOU");
    state.phase = "discardDown";
    expect(bannerText(state)).toContain("HAND IS FULL");
  });
});

describe("table", () => {
  it("builds the three plates, four piles and both hands", () => {
    const { table } = settled(started());
    for (const who of ["convict", "player", "wife"]) {
      expect(table.root.querySelector(`[data-plate='${who}']`)).not.toBeNull();
    }
    for (const key of ["player-deck", "player-discard", "convict-deck", "convict-discard"]) {
      expect(table.root.querySelector(`[data-pile='${key}']`)).not.toBeNull();
    }
    expect(table.root.querySelector("[data-hand='player']")).not.toBeNull();
    expect(table.root.querySelector("[data-hand='convict']")).not.toBeNull();
    expect(table.root.querySelector("[data-log]")).not.toBeNull();
    expect(table.root.querySelector("[data-notice]")).not.toBeNull();
  });

  it("reports settled once the opening deal has played out", () => {
    const { settledCount } = settled(started());
    expect(settledCount()).toBe(1);
  });

  it("shows your current stats once at rest", () => {
    const state = started();
    const { table } = settled(state);
    expect(table.root.querySelector("[data-stat='player-vigor']")?.textContent).toBe(
      `VIG ${state.player.vigor}`,
    );
  });

  it("shows the real pile counts once at rest", () => {
    const state = started();
    const { table } = settled(state);
    expect(
      table.root.querySelector("[data-pile='player-deck'] .pile-count")?.textContent,
    ).toBe(String(state.playerPile.deck.length));
  });

  it("offers your hand plus a wait option on your turn", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const { table } = settled(state);
    expect(table.root.querySelector(".card[data-card-id='stallHim']")).not.toBeNull();
    expect(table.root.querySelector("#pass")).not.toBeNull();
  });

  it("fires the lead action for a legal card", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const { table } = settled(state);
    table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']")?.click();
    expect(calls).toEqual(["lead:stallHim"]);
  });

  it("keeps an illegal card in the fan, dimmed, with a reason", () => {
    const state = started();
    state.playerPile.hand = ["kickHisKnee"];
    const { table } = settled(state);
    const card = table.root.querySelector<HTMLButtonElement>(".card[data-card-id='kickHisKnee']");
    expect(card).not.toBeNull();
    expect(card?.disabled).toBe(true);
    expect(card?.querySelector(".card-reason")?.textContent).toBe("needs: you are not bound");
  });

  it("offers a decline while answering, and shows his lead in the center", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["backhand"];
    playerLead(state, "stallHim");
    const { table } = settled(state);
    expect(table.root.querySelector("[data-banner]")?.textContent).toContain("HE IS WAITING");
    expect(
      table.root.querySelector("[data-slot='lead'] .card-name")?.textContent,
    ).not.toBeUndefined();
    table.root.querySelector<HTMLButtonElement>("#decline")?.click();
    expect(calls).toEqual(["answer:null"]);
  });

  it("makes held secrets inert on your own turn", () => {
    const state = started();
    const { table } = settled(state);
    const held = table.root.querySelector<HTMLButtonElement>(
      `[data-secrets='held'] .secret[data-card-id='${SECRETS[0]}']`,
    );
    expect(held?.disabled).toBe(true);
  });

  it("keeps secrets out of the fan so they only live in their own row", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["whereIsIt"];
    playerLead(state, "stallHim");
    const { table } = settled(state);
    // A secret is a legal answer to his demand, but it belongs to the row.
    for (const secretId of SECRETS) {
      expect(table.root.querySelector(`.hand .card[data-card-id='${secretId}']`)).toBeNull();
    }
  });

  it("fires surrender for a held secret during forced surrender", () => {
    const state = started();
    state.phase = "forcedSurrender";
    const { table } = settled(state);
    table.root
      .querySelector<HTMLButtonElement>(
        `[data-secrets='held'] .secret[data-card-id='${SECRETS[0]}']`,
      )
      ?.click();
    expect(calls).toEqual([`surrender:${SECRETS[0]}`]);
  });

  it("offers every held card when discarding down", () => {
    const state = started();
    state.phase = "discardDown";
    state.playerPile.hand = ["stoic", "stallHim"];
    const { table } = settled(state);
    const ids = [...table.root.querySelectorAll(".hand .card")].map(
      (c) => (c as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(["stoic", "stallHim"]);
    table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stoic']")?.click();
    expect(calls).toEqual(["discard:stoic"]);
  });

  it("writes the whole event stream into the log drawer", () => {
    const state = started();
    const { table } = settled(state);
    expect(table.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("locks the hand while beats are still playing", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const table = createTable(actions);
    root.append(table.root);
    table.present(state, () => {});
    // mid-chain: the opening deal has not drained yet
    const card = table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']");
    if (card !== null) expect(card.disabled).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(
      table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']")?.disabled,
    ).toBe(false);
  });

  // His lead is emitted at the END of one input slice and only resolves in
  // the NEXT one, because you answer it in between. The segment that becomes
  // his modal therefore has to stay open across a settle. Segments are not
  // per-slice: this must produce exactly one modal, at the end of the second
  // chain - not one per slice, and not none.
  it("reports his exchange in one modal, from the settle that closes it", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["whereIsIt"];
    const table = createTable(actions);
    root.append(table.root);
    const overlay = table.root.querySelector(".notice-overlay") as HTMLElement;
    let settledCount = 0;
    const onSettled = (): void => {
      settledCount += 1;
    };

    table.present(state, onSettled);
    vi.advanceTimersByTime(20000);
    expect(settledCount).toBe(1);
    expect(overlay.classList.contains("hidden")).toBe(true);

    // Slice one: you lead, he takes his turn and leads back at you. The
    // queue genuinely drains here - the timers are fully advanced before the
    // second present().
    playerLead(state, "stallHim");
    expect(state.phase).toBe("playerAnswer");
    table.present(state, onSettled);
    vi.advanceTimersByTime(20000);
    expect(settledCount).toBe(2);
    // His lead has played, but the exchange is not over, so nothing has
    // interrupted you yet.
    expect(overlay.classList.contains("hidden")).toBe(true);

    // Slice two: you take it, and only now does his exchange close.
    playerAnswer(state, null);
    table.present(state, onSettled);
    vi.advanceTimersByTime(20000);
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(settledCount).toBe(2); // the chain is held open by the modal

    overlay.querySelector<HTMLButtonElement>(".notice-continue")?.click();
    vi.advanceTimersByTime(20000);
    // Exactly one: dismissing it does not reveal a second box behind it.
    expect(overlay.classList.contains("hidden")).toBe(true);
    expect(settledCount).toBe(3);
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

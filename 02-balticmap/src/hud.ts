import { CARDS } from "./cards";
import { isHumanTurn, type GameEvent, type GameState } from "./game";
import { flyCard } from "./animate";
import { allianceActive, allianceKey, leadsOf, realmOf } from "./relations";
import { buildNotices, type Notice, type NoticeCtx } from "./notices";
import { SUBJUGATE_THRESHOLD } from "./playability";

export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  /** Optional gate for cards that need a valid target; default: playable. */
  canPlayCard?(cardId: string): boolean;
  onTributeTrack?(track: "status" | "might"): void;
  isDiscardMode?(): boolean;
  /** Post-mortem loot row: unlockable cards seen this run. */
  lootInfo?(): { id: string; isNew: boolean }[];
  /** Renders the main-menu Reset progress control when provided. */
  onResetProgress?(): void;
}

export interface Hud {
  update(state: GameState): void;
  setArmed(index: number | null, cardName?: string): void;
  setTributePrompt(show: boolean): void;
}

const FAN_ANGLE_DEG = 5;
const FAN_DROP_PX = 6;

const CARD_W = 88; // matches .card in style.css
const CARD_H = 126;
const DRAW_MS = 350;
const PLAY_TO_CENTER_MS = 350;
const PLAY_HOLD_MS = 700;
const PLAY_TO_DISCARD_MS = 350;
const PLAY_CENTER_SCALE = 1.6;
const RESHUFFLE_PULSE_MS = 450;

const cardName = (id: string | undefined): string =>
  (id && CARDS[id]?.name) ?? id ?? "";

/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4. */
function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}

export function createHud(
  container: HTMLElement,
  cb: HudCallbacks,
  factionNames: Map<string, string> = new Map(),
): Hud {
  const factionName = (id: string | undefined): string =>
    (id !== undefined ? factionNames.get(id) : undefined) ?? id ?? "";

  function eventText(e: GameEvent): string {
    const you = e.playerId === 1;
    switch (e.type) {
      case "draw":
        return you ? `You drew ${cardName(e.cardId)}` : `Player ${e.playerId} drew a card`;
      case "play": {
        const target = e.targetFactionId !== undefined
          ? ` on ${factionName(e.targetFactionId)}`
          : "";
        return you
          ? `You played ${cardName(e.cardId)}${target}`
          : `Player ${e.playerId} played ${cardName(e.cardId)}${target}`;
      }
      case "reshuffle":
        return you
          ? "You reshuffled your discard"
          : `Player ${e.playerId} reshuffled their discard`;
      case "subjugated":
        return `${factionName(e.targetFactionId)} submits to ${factionName(e.overlordFactionId)}`;
      case "released":
        return `${factionName(e.targetFactionId)} breaks free`;
      case "incorporated":
        return `${factionName(e.targetFactionId)} is incorporated into ${factionName(e.overlordFactionId)}`;
      case "discard":
        return you
          ? "You discarded a card"
          : `Player ${e.playerId} discarded a card`;
      case "reclaimed":
        return `${factionName(e.targetFactionId)} reclaims independence from ${factionName(e.overlordFactionId)}`;
      case "tribute":
        return `${factionName(e.targetFactionId)} pays tribute to ${factionName(e.overlordFactionId)}`;
      case "victory":
        return "You rule the Baltic";
      case "defeat":
        return `Your realm has been incorporated by ${factionName(e.overlordFactionId)}`;
    }
  }

  function involvesHuman(e: GameEvent, humanFactionId: string | undefined): boolean {
    if (humanFactionId === undefined) return false;
    return (
      e.playerId === 1 ||
      e.targetFactionId === humanFactionId ||
      e.overlordFactionId === humanFactionId
    );
  }

  const menu = document.createElement("div");
  menu.className = "menu-overlay";
  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Baltic Tribes";
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "menu-new-game";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => cb.onNewGame());
  menu.append(title, newGameBtn);

  if (cb.onResetProgress) {
    const reset = document.createElement("button");
    reset.className = "menu-reset";
    reset.textContent = "Reset progress";
    let armedReset = false;
    const disarmReset = () => {
      armedReset = false;
      reset.textContent = "Reset progress";
      reset.classList.remove("confirm");
    };
    reset.addEventListener("click", () => {
      if (!armedReset) {
        armedReset = true;
        reset.textContent = "Really reset?";
        reset.classList.add("confirm");
        return;
      }
      disarmReset();
      cb.onResetProgress!();
    });
    newGameBtn.addEventListener("click", disarmReset);
    menu.appendChild(reset);
  }

  const postmortem = document.createElement("div");
  postmortem.className = "postmortem-overlay hidden";
  const pmSummary = document.createElement("div");
  pmSummary.className = "pm-summary";
  const pmTitle = document.createElement("h1");
  pmTitle.className = "menu-title pm-title";
  const pmCause = document.createElement("p");
  pmCause.className = "pm-cause";
  const pmDeltas = document.createElement("p");
  pmDeltas.className = "pm-deltas";
  const pmBuildup = document.createElement("div");
  pmBuildup.className = "pm-buildup";
  const pmSeenLabel = document.createElement("p");
  pmSeenLabel.className = "pm-seen-label";
  pmSeenLabel.textContent = "Cards seen this run:";
  const pmSeen = document.createElement("div");
  pmSeen.className = "pm-seen";
  const pmNewGame = document.createElement("button");
  pmNewGame.className = "menu-new-game";
  pmNewGame.textContent = "New game";
  pmNewGame.addEventListener("click", () => cb.onNewGame());
  pmSummary.append(pmTitle, pmCause, pmDeltas, pmBuildup, pmSeenLabel, pmSeen, pmNewGame);
  const pmLog = document.createElement("div");
  pmLog.className = "pm-log";
  postmortem.append(pmSummary, pmLog);

  const status = document.createElement("div");
  status.className = "status-bar hidden";
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  const tributeButtons = document.createElement("span");
  tributeButtons.className = "tribute-buttons hidden";
  for (const track of ["might", "status"] as const) {
    const b = document.createElement("button");
    b.className = "tribute-btn";
    b.textContent = track === "might" ? "Might" : "Status";
    b.addEventListener("click", () => cb.onTributeTrack?.(track));
    tributeButtons.appendChild(b);
  }
  status.append(statusText, tributeButtons);

  function makePile(kind: string, label: string) {
    const root = document.createElement("div");
    root.className = `pile pile-${kind} hidden`;
    const stack = document.createElement("div");
    stack.className = "pile-stack";
    const count = document.createElement("div");
    count.className = "pile-count";
    const lbl = document.createElement("div");
    lbl.className = "pile-label";
    lbl.textContent = label;
    root.append(stack, count, lbl);
    return { root, stack, count };
  }

  const deckPile = makePile("deck", "Deck");
  const discardPile = makePile("discard", "Discard");

  const hand = document.createElement("div");
  hand.className = "hand hidden";

  const logPanel = document.createElement("div");
  logPanel.className = "activity-log hidden";
  const logHeader = document.createElement("div");
  logHeader.className = "activity-log-header";
  const logTitle = document.createElement("span");
  logTitle.className = "activity-log-title";
  logTitle.textContent = "Activity";
  const logToggle = document.createElement("button");
  logToggle.className = "activity-log-toggle";
  logToggle.textContent = ">";
  logToggle.addEventListener("click", () => {
    const collapsed = logPanel.classList.toggle("collapsed");
    logToggle.textContent = collapsed ? "<" : ">";
    // entries have display:none while collapsed, so scrolls no-op until now
    if (!collapsed) logEntries.scrollTop = logEntries.scrollHeight;
  });
  logHeader.append(logTitle, logToggle);
  const logEntries = document.createElement("div");
  logEntries.className = "activity-log-entries";
  logPanel.append(logHeader, logEntries);

  const noticeOverlay = document.createElement("div");
  noticeOverlay.className = "notice-overlay hidden";
  const noticeCard = document.createElement("div");
  noticeCard.className = "notice-card";
  const noticeTitle = document.createElement("h2");
  noticeTitle.className = "notice-title";
  const noticeWhat = document.createElement("p");
  noticeWhat.className = "notice-what";
  const noticeDetails = document.createElement("div");
  noticeDetails.className = "notice-details";
  const noticeConsequence = document.createElement("p");
  noticeConsequence.className = "notice-consequence";
  const noticeContinue = document.createElement("button");
  noticeContinue.className = "notice-continue";
  noticeContinue.textContent = "Continue";
  noticeContinue.addEventListener("click", () => dismissNotice());
  noticeCard.append(
    noticeTitle, noticeWhat, noticeDetails, noticeConsequence, noticeContinue,
  );
  noticeOverlay.appendChild(noticeCard);

  let noticeQueue: Notice[] = [];

  function showNotice(n: Notice): void {
    noticeTitle.textContent = n.title;
    noticeWhat.textContent = n.what;
    noticeDetails.replaceChildren(
      ...n.details.map((line) => {
        const p = document.createElement("p");
        p.className = "notice-detail";
        p.textContent = line;
        return p;
      }),
    );
    noticeDetails.classList.toggle("hidden", n.details.length === 0);
    noticeDetails.classList.toggle("multi", n.details.length > 1);
    noticeConsequence.textContent = n.consequence ?? "";
    noticeConsequence.classList.toggle("hidden", n.consequence === undefined);
    noticeOverlay.classList.remove("hidden");
  }

  function dismissNotice(): void {
    const next = noticeQueue.shift();
    if (next !== undefined) showNotice(next);
    else noticeOverlay.classList.add("hidden");
  }

  function clearNotices(): void {
    noticeQueue = [];
    noticeOverlay.classList.add("hidden");
  }

  /** Player-affecting events interrupt: queue one modal per fresh notice. */
  function enqueueNotices(state: GameState, fresh: GameEvent[]): void {
    if (state.phase !== "playing") return;
    const human = state.players[0];
    if (!human) return;
    const ctx: NoticeCtx = {
      humanFactionId: human.factionId,
      factionName,
      factionOf: (playerId) =>
        state.players.find((pl) => pl.id === playerId)?.factionId,
      leads: (other) => leadsOf(state.relations, human.factionId, other),
      subjugationGrip: () =>
        SUBJUGATE_THRESHOLD *
        realmOf(human.factionId, state.overlords, state.incorporated).length,
      allianceExpiry: (other) =>
        allianceActive(state, human.factionId, other)
          ? state.alliances[allianceKey(human.factionId, other)]
          : undefined,
    };
    for (const n of buildNotices(fresh, ctx)) {
      if (noticeOverlay.classList.contains("hidden")) showNotice(n);
      else noticeQueue.push(n);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !noticeOverlay.classList.contains("hidden")) {
      dismissNotice();
    }
  });

  container.append(
    menu, postmortem, status, deckPile.root, discardPile.root, hand, logPanel,
    noticeOverlay,
  );

  let pendingPlayRect: DOMRect | null = null;
  let renderedEvents = 0;
  let lastRenderedTurn = 0;

  /** Appends entries for events not yet rendered; returns those events so
   *  animations can key off the same diff. */
  function renderLog(state: GameState): GameEvent[] {
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
      clearNotices();
    }
    const fresh = state.log.slice(renderedEvents);
    const humanFactionId = state.players[0]?.factionId;
    for (const e of fresh) {
      if (e.turn !== lastRenderedTurn) {
        const sep = document.createElement("div");
        sep.className = "log-turn";
        sep.textContent = `Turn ${e.turn}`;
        logEntries.appendChild(sep);
        lastRenderedTurn = e.turn;
      }
      const entry = document.createElement("div");
      entry.className = "log-entry log-new";
      entry.textContent = eventText(e);
      entry.classList.toggle("log-you", involvesHuman(e, humanFactionId));
      logEntries.appendChild(entry);
    }
    renderedEvents = state.log.length;
    if (fresh.length > 0) logEntries.scrollTop = logEntries.scrollHeight;
    return fresh;
  }

  function renderPile(
    pile: { stack: HTMLElement; count: HTMLElement },
    n: number,
  ): void {
    pile.count.textContent = String(n);
    pile.stack.classList.toggle("empty", n === 0);
    pile.stack.replaceChildren();
    for (let i = 0; i < pileLayers(n); i++) {
      const back = document.createElement("div");
      back.className = "card-back";
      back.style.translate = `${-2 * i}px ${-2 * i}px`;
      pile.stack.appendChild(back);
    }
  }

  function renderHand(state: GameState): void {
    hand.replaceChildren();
    const human = state.players[0];
    if (!human) return;
    const n = human.hand.length;
    const canPlay = isHumanTurn(state) && !state.playedThisTurn;
    const canPlayCardCb = cb.canPlayCard ?? (() => true);
    human.hand.forEach((cardId, i) => {
      const card = document.createElement("button");
      card.className = "card";
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = CARDS[cardId]?.name ?? cardId;
      const tip = document.createElement("div");
      tip.className = "card-tip";
      tip.textContent = CARDS[cardId]?.text ?? "";
      card.append(name, tip);
      const offset = i - (n - 1) / 2;
      card.style.transform =
        `rotate(${offset * FAN_ANGLE_DEG}deg) ` +
        `translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
      const discardMode = canPlay && (cb.isDiscardMode?.() ?? false);
      const playable = canPlay && (discardMode || canPlayCardCb(cardId));
      card.disabled = !playable;
      card.classList.toggle("discard-hint", discardMode);
      card.classList.toggle(
        "unplayable", canPlay && !discardMode && !canPlayCardCb(cardId),
      );
      if (playable)
        card.addEventListener("click", () => {
          pendingPlayRect = card.getBoundingClientRect();
          cb.onPlayCard(i);
        });
      hand.appendChild(card);
    });
  }

  const center = (r: DOMRect): { x: number; y: number } => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });

  function animateDraw(): void {
    const from = deckPile.root.getBoundingClientRect();
    flyCard(
      container,
      "back",
      "",
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [{ to: center(hand.getBoundingClientRect()), scale: 1, durationMs: DRAW_MS }],
    );
    const newest = hand.lastElementChild;
    if (newest) {
      newest.classList.add("card-incoming");
      setTimeout(() => newest.classList.remove("card-incoming"), DRAW_MS + 40);
    }
  }

  function animatePlay(cardId: string): void {
    const from = pendingPlayRect ?? hand.getBoundingClientRect();
    pendingPlayRect = null;
    flyCard(
      container,
      "",
      cardName(cardId),
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [
        {
          to: center(container.getBoundingClientRect()),
          scale: PLAY_CENTER_SCALE,
          durationMs: PLAY_TO_CENTER_MS,
          holdMs: PLAY_HOLD_MS,
        },
        {
          to: center(discardPile.root.getBoundingClientRect()),
          scale: 0.6,
          durationMs: PLAY_TO_DISCARD_MS,
        },
      ],
    );
  }

  function pulseDeck(): void {
    deckPile.root.classList.add("pulse");
    setTimeout(() => deckPile.root.classList.remove("pulse"), RESHUFFLE_PULSE_MS);
  }

  /** Human-only: AI actions surface as log entries, nothing moves on screen. */
  function animateEvents(fresh: GameEvent[]): void {
    for (const e of fresh) {
      if (e.playerId !== 1) continue;
      if (e.type === "draw") animateDraw();
      else if (e.type === "play") animatePlay(e.cardId ?? "");
      else if (e.type === "reshuffle") pulseDeck();
    }
  }

  let lastState: GameState | null = null;

  function renderStatus(state: GameState): void {
    if (state.phase === "pick-faction") {
      statusText.textContent = "Choose your faction";
    } else if (state.phase === "playing") {
      if (isHumanTurn(state)) {
        statusText.textContent = (cb.isDiscardMode?.() ?? false)
          ? "No playable card - discard one"
          : `Turn ${state.turn} - play a card`;
      } else {
        statusText.textContent = "Waiting on other players...";
      }
    }
  }

  function renderPostmortem(state: GameState): void {
    const human = state.players[0];
    const won = state.phase === "victory";
    pmTitle.textContent = won ? "Victory" : "Game over";
    if (won) {
      const size = realmOf(
        human.factionId, state.overlords, state.incorporated,
      ).length;
      pmCause.textContent = `You rule the Baltic - ${size} of 20 lands`;
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else {
      const defeatEvent = [...state.log].reverse().find((e) => e.type === "defeat");
      const killer = defeatEvent?.overlordFactionId;
      pmCause.textContent = `Incorporated by ${factionName(killer)}`;
      if (killer !== undefined) {
        const l = leadsOf(state.relations, killer, human.factionId);
        const line = (label: string, n: number) =>
          `${label}: ${n > 0 ? `they led by ${n}` : n < 0 ? `you led by ${-n}` : "even"}`;
        pmDeltas.textContent = `${line("Might", l.might)} / ${line("Status", l.status)}`;
        const killerPlayer = state.players.find((p) => p.factionId === killer);
        const plays = state.log
          .filter(
            (e) =>
              e.type === "play" &&
              e.playerId === killerPlayer?.id &&
              e.targetFactionId === human.factionId,
          )
          .slice(-5);
        pmBuildup.replaceChildren(
          ...plays.map((e) => {
            const d = document.createElement("div");
            d.className = "pm-buildup-entry";
            d.textContent = `${cardName(e.cardId)} (turn ${e.turn})`;
            return d;
          }),
        );
      }
    }
    const loot =
      cb.lootInfo?.() ??
      state.seenThisRun.map((id) => ({ id, isNew: false }));
    pmSeenLabel.textContent = cb.lootInfo
      ? "Unlock one of these when you start your next game."
      : "Cards seen this run:";
    pmSeen.replaceChildren(
      ...loot.map(({ id, isNew }) => {
        const d = document.createElement("div");
        d.className = "pm-card";
        const name = document.createElement("span");
        name.className = "pm-card-name";
        name.textContent = cardName(id);
        d.appendChild(name);
        if (isNew) {
          const tag = document.createElement("span");
          tag.className = "pm-card-new";
          tag.textContent = "NEW";
          d.appendChild(tag);
        }
        const text = document.createElement("span");
        text.className = "pm-card-text";
        text.textContent = CARDS[id]?.text ?? "";
        d.appendChild(text);
        return d;
      }),
    );
    pmSeenLabel.classList.toggle("hidden", loot.length === 0);
    pmLog.replaceChildren(
      ...state.log.map((e) => {
        const d = document.createElement("div");
        d.className = "log-entry";
        d.textContent = eventText(e);
        d.classList.toggle("log-you", involvesHuman(e, human?.factionId));
        return d;
      }),
    );
  }

  return {
    update(state) {
      lastState = state;
      if (state.phase !== "playing") clearNotices();
      const ended = state.phase === "victory" || state.phase === "defeat";
      menu.classList.toggle("hidden", state.phase !== "main-menu");
      status.classList.toggle(
        "hidden",
        state.phase === "main-menu" || state.phase === "deck-building" || ended,
      );
      deckPile.root.classList.toggle("hidden", state.phase !== "playing");
      discardPile.root.classList.toggle("hidden", state.phase !== "playing");
      hand.classList.toggle("hidden", state.phase !== "playing");
      logPanel.classList.toggle("hidden", state.phase !== "playing");
      postmortem.classList.toggle("hidden", !ended);

      renderStatus(state);

      if (state.phase === "playing") {
        const human = state.players[0];
        renderPile(deckPile, human.deck.length);
        renderPile(discardPile, human.discard.length);
        renderHand(state);
        const fresh = renderLog(state);
        enqueueNotices(state, fresh);
        animateEvents(fresh);
      } else if (ended) {
        renderPostmortem(state);
      }
    },
    setArmed(index, cardNameText) {
      [...hand.children].forEach((el, i) =>
        el.classList.toggle("card-armed", i === index),
      );
      if (index !== null && cardNameText !== undefined) {
        statusText.textContent = `Choose a target for ${cardNameText}`;
      } else if (lastState) {
        renderStatus(lastState);
      }
    },
    setTributePrompt(show) {
      tributeButtons.classList.toggle("hidden", !show);
      if (show) statusText.textContent = "Pay tribute with:";
      else if (lastState) renderStatus(lastState);
    },
  };
}

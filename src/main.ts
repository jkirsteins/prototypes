import "./styles.css";
import { items } from "./game/content";
import { createInitialState, getCurrentRoom, getVisibleItems, runCommand } from "./game/engine";
import { verbs, type Command, type GameItem, type GameState, type ItemId, type Verb } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;

let state: GameState = createInitialState();
let selectedVerb: Verb = "Look at";
let pendingUseTarget: ItemId | undefined;

function render(): void {
  const room = getCurrentRoom(state);
  const roomItems = getVisibleRoomItems();
  const inventoryItems = state.inventory.map((itemId) => items[itemId]);

  appElement.innerHTML = `
    <main class="shell">
      <section class="room" aria-labelledby="room-title">
        <h1 id="room-title">${escapeHtml(room.title)}</h1>
        <p class="description">${renderDescription(room.description, roomItems)}</p>
      </section>

      <section class="verbs" aria-label="Verbs">
        ${verbs
          .map(
            (verb) => `
              <button
                type="button"
                class="verb-button${verb === selectedVerb ? " is-selected" : ""}"
                data-verb="${escapeHtml(verb)}"
                aria-pressed="${verb === selectedVerb ? "true" : "false"}"
              >
                ${escapeHtml(verb)}
              </button>
            `,
          )
          .join("")}
      </section>

      <section class="inventory" aria-label="Inventory">
        <h2>Inventory</h2>
        <div class="inventory-row">
          ${
            inventoryItems.length > 0
              ? inventoryItems.map((item) => renderNounButton(item, "inventory")).join("")
              : '<span class="empty-inventory">Empty</span>'
          }
        </div>
      </section>

      <section class="command-preview" aria-live="polite">${escapeHtml(getCommandPreview())}</section>

      <section class="controls">
        <button type="button" data-reset="true">Reset</button>
      </section>

      <ol class="log" aria-label="Command log">
        ${state.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
      </ol>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-verb]")) {
    button.addEventListener("click", () => {
      selectedVerb = button.dataset.verb as Verb;
      pendingUseTarget = undefined;
      render();
    });
  }

  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-item-id]")) {
    button.addEventListener("click", () => {
      chooseItem(button.dataset.itemId as ItemId);
    });
  }

  appElement.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => {
    state = createInitialState();
    selectedVerb = "Look at";
    pendingUseTarget = undefined;
    render();
  });
}

function chooseItem(itemId: ItemId): void {
  if (selectedVerb !== "Use") {
    execute({ verb: selectedVerb, targetId: itemId });
    return;
  }

  if (!pendingUseTarget) {
    pendingUseTarget = itemId;
    render();
    return;
  }

  if (pendingUseTarget === itemId) {
    pendingUseTarget = undefined;
    render();
    return;
  }

  execute({ verb: "Use", targetId: pendingUseTarget, secondaryTargetId: itemId });
}

function execute(command: Command): void {
  const commandText = formatCommand(command);
  const commandState: GameState = {
    ...state,
    log: [...state.log, commandText],
  };
  const outcome = runCommand(commandState, command);

  state = outcome.state;
  pendingUseTarget = undefined;
  render();
}

function getCommandPreview(): string {
  if (selectedVerb === "Use" && pendingUseTarget) {
    return `> Use ${items[pendingUseTarget].label} with ...`;
  }

  return `> ${selectedVerb} ...`;
}

function formatCommand(command: Command): string {
  if (command.verb === "Use") {
    return `> Use ${items[command.targetId].label} with ${items[command.secondaryTargetId].label}`;
  }

  return `> ${command.verb} ${items[command.targetId].label}`;
}

function getVisibleRoomItems(): GameItem[] {
  const visibleIds = new Set(getVisibleItems(state).map((item) => item.id));
  return getCurrentRoom(state).itemIds.filter((itemId) => visibleIds.has(itemId)).map((itemId) => items[itemId]);
}

function renderDescription(description: string, roomItems: GameItem[]): string {
  let rendered = escapeHtml(description);
  const sortedItems = [...roomItems].sort((left, right) => right.label.length - left.label.length);

  for (const item of sortedItems) {
    const escapedLabel = escapeHtml(item.label);
    const labelPattern = new RegExp(`\\b${escapeRegExp(escapedLabel)}\\b`, "gi");
    rendered = rendered.replace(labelPattern, (match) => renderNounButton(item, "room", match));
  }

  return rendered;
}

function renderNounButton(item: GameItem, source: "room" | "inventory", label = item.label): string {
  const isPending = selectedVerb === "Use" && pendingUseTarget === item.id;

  return `
    <button
      type="button"
      class="noun-button${isPending ? " is-pending" : ""}"
      data-item-id="${escapeHtml(item.id)}"
      data-source="${source}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

render();

import "./styles.css";
import { Scene1, type Scene1Snapshot, type ItemVerb } from "./ink/scene1";
import { ITEM_LABELS } from "./itemLabels";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
let scene = new Scene1();
let debugVisible = false;

let selectedVerb: ItemVerb = "look";

const COFFIN_BACKGROUND = `${import.meta.env.BASE_URL}backgrounds/coffin.png`;

const BACKGROUNDS: Record<string, string> = {
  coffin: COFFIN_BACKGROUND,
  "coffin-strain": COFFIN_BACKGROUND,
  "coffin-echo": COFFIN_BACKGROUND,
  "coffin-lining": COFFIN_BACKGROUND,
  "coffin-nail": COFFIN_BACKGROUND,
  "coffin-hinge": COFFIN_BACKGROUND,
  "lid-open": `${import.meta.env.BASE_URL}backgrounds/lid-open.png`,
  "cell-room": `${import.meta.env.BASE_URL}backgrounds/cell-room.png`,
  "cell-room-lit": `${import.meta.env.BASE_URL}backgrounds/cell-room-lit.png`,
};

const DEFAULT_BACKGROUND = `${import.meta.env.BASE_URL}backgrounds/awakening.png`;

function render(): void {
  const snapshot = scene.snapshot;

  document.body.style.backgroundImage = `url("${BACKGROUNDS[snapshot.imageId] ?? DEFAULT_BACKGROUND}")`;

  appElement.innerHTML = `
    <main class="stage">
      ${renderStrip(snapshot)}
      <div class="story">
        ${snapshot.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        ${
          snapshot.choices.length > 0
            ? `
              <ul class="choices" aria-label="Choices">
                ${snapshot.choices
                  .map(
                    (choice) => `
                      <li>
                        <button type="button" class="choice" data-choice-index="${choice.index}">
                          ${escapeHtml(choice.text)}
                        </button>
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            `
            : ""
        }
      </div>
      ${debugVisible ? renderDebug(snapshot) : ""}
    </main>
  `;

  bindEvents();
}

function renderStrip(snapshot: Scene1Snapshot): string {
  if (snapshot.spotted.length === 0 && snapshot.inventory.length === 0) {
    return "";
  }

  const verbs = (["look", "use", "take"] as const)
    .map(
      (verb) => `
        <button type="button" class="verb${verb === selectedVerb ? " is-selected" : ""}" data-verb="${verb}">
          ${verb}
        </button>
      `,
    )
    .join("");

  const items = (ids: string[]) =>
    ids
      .map(
        (id) => `
          <button type="button" class="strip-item" data-item-id="${id}">
            ${escapeHtml(ITEM_LABELS[id] ?? id)}
          </button>
        `,
      )
      .join("");

  return `
    <div class="strip">
      <span class="strip-verbs">${verbs}</span>
      <span class="strip-items">${items(snapshot.spotted)}</span>
      <span class="strip-carried">${items(snapshot.inventory)}</span>
    </div>
  `;
}

function renderDebug(snapshot: Scene1Snapshot): string {
  return `
    <aside class="debug" aria-label="Debug information">
      <h2>DEBUG - not player-facing, remove before release</h2>
      <dl>
        <div><dt>build</dt><dd>${escapeHtml(snapshot.build)}</dd></div>
        <div><dt>strength</dt><dd>${snapshot.attributes.strength}</dd></div>
        <div><dt>caution</dt><dd>${snapshot.attributes.caution}</dd></div>
        <div><dt>ingenuity</dt><dd>${snapshot.attributes.ingenuity}</dd></div>
        <div><dt>perception</dt><dd>${snapshot.attributes.perception}</dd></div>
        <div><dt>sanity</dt><dd>${snapshot.attributes.sanity}</dd></div>
        <div><dt>escaped</dt><dd>${snapshot.escaped}</dd></div>
        <div><dt>image</dt><dd>${escapeHtml(snapshot.imageId)}</dd></div>
        <div><dt>spotted</dt><dd>${escapeHtml(snapshot.spotted.join(", ") || "-")}</dd></div>
        <div><dt>inventory</dt><dd>${escapeHtml(snapshot.inventory.join(", ") || "-")}</dd></div>
        <div><dt>verb</dt><dd>${escapeHtml(selectedVerb)}</dd></div>
      </dl>
      <button type="button" data-reset="true">Reset story</button>
    </aside>
  `;
}

function bindEvents(): void {
  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-choice-index]")) {
    button.addEventListener("click", () => {
      scene.choose(Number(button.dataset.choiceIndex));
      render();
    });
  }

  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-verb]")) {
    button.addEventListener("click", () => {
      const verb = button.dataset.verb;
      selectedVerb = verb === "use" || verb === "take" ? verb : "look";
      render();
    });
  }

  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-item-id]")) {
    button.addEventListener("click", () => {
      scene.interact(selectedVerb, button.dataset.itemId ?? "");
      render();
    });
  }

  appElement.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => {
    scene = new Scene1();
    selectedVerb = "look";
    render();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "`") {
    debugVisible = !debugVisible;
    render();
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    const choice = scene.snapshot.choices[Number(event.key) - 1];

    if (choice) {
      scene.choose(choice.index);
      render();
    }
  }
});

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

render();

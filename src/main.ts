import "./styles.css";
import { CoffinScene, type CoffinSnapshot } from "./ink/coffinScene";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
let scene = new CoffinScene();
let debugVisible = false;

function render(): void {
  const snapshot = scene.snapshot;

  appElement.innerHTML = `
    <main class="stage">
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

function renderDebug(snapshot: CoffinSnapshot): string {
  return `
    <aside class="debug" aria-label="Debug information">
      <h2>DEBUG - not player-facing, remove before release</h2>
      <dl>
        <div><dt>build</dt><dd>${escapeHtml(snapshot.build)}</dd></div>
        <div><dt>strength</dt><dd>${snapshot.attributes.strength}</dd></div>
        <div><dt>caution</dt><dd>${snapshot.attributes.caution}</dd></div>
        <div><dt>ingenuity</dt><dd>${snapshot.attributes.ingenuity}</dd></div>
        <div><dt>escaped</dt><dd>${snapshot.escaped}</dd></div>
        <div><dt>image</dt><dd>${escapeHtml(snapshot.imageId)}</dd></div>
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

  appElement.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => {
    scene = new CoffinScene();
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

import "./styles.css";
import { CoffinScene, type CoffinDiscovery, type CoffinSnapshot } from "./ink/coffinScene";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const appElement = app;
let scene = new CoffinScene();
let selectedDiscoveryId: string | undefined;

function render(): void {
  const snapshot = scene.snapshot;

  appElement.innerHTML = `
    <main class="shell">
      <section class="scene" aria-labelledby="scene-title">
        <div class="scene-copy">
          <p class="eyebrow">Coffin Tutorial</p>
          <h1 id="scene-title">Inside the Coffin</h1>
          <div class="story-text">
            ${snapshot.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </div>
        </div>

        <figure class="flavor-image flavor-image--${escapeHtml(snapshot.imageId)}" aria-label="${escapeHtml(snapshot.mood)}">
          <div class="coffin-plate"></div>
          <figcaption>${escapeHtml(snapshot.mood)}</figcaption>
        </figure>
      </section>

      <section class="choices" aria-label="Available choices">
        ${
          snapshot.choices.length > 0
            ? snapshot.choices
                .map(
                  (choice) => `
                    <button type="button" data-choice-index="${choice.index}">
                      ${escapeHtml(choice.text)}
                    </button>
                  `,
                )
                .join("")
            : `<p class="empty-state">The coffin scene is complete.</p>`
        }
      </section>

      <aside class="side-panel">
        ${renderBuild(snapshot)}
        ${renderDiscoveries(snapshot.discoveries, selectedDiscoveryId)}
      </aside>

      <section class="controls">
        <button type="button" data-reset="true">Reset</button>
      </section>
    </main>
  `;

  bindEvents();
}

function renderBuild(snapshot: CoffinSnapshot): string {
  return `
    <section class="build-panel" aria-label="Starting build">
      <h2>Starting Build</h2>
      <p class="build-name">${escapeHtml(formatBuild(snapshot.build))}</p>
      <dl class="stats">
        <div>
          <dt>Strength</dt>
          <dd>${snapshot.attributes.strength}</dd>
        </div>
        <div>
          <dt>Caution</dt>
          <dd>${snapshot.attributes.caution}</dd>
        </div>
        <div>
          <dt>Ingenuity</dt>
          <dd>${snapshot.attributes.ingenuity}</dd>
        </div>
      </dl>
    </section>
  `;
}

function renderDiscoveries(discoveries: CoffinDiscovery[], selectedId: string | undefined): string {
  return `
    <section class="discoveries" aria-label="Discoveries">
      <h2>Items, Clues, Memories</h2>
      ${selectedId ? `<p class="combine-hint">Choose another discovery to combine it with.</p>` : ""}
      ${
        discoveries.length > 0
          ? discoveries
              .map(
                (discovery) => `
                  <button
                    type="button"
                    class="discovery discovery--${discovery.kind}${selectedId === discovery.id ? " is-selected" : ""}"
                    data-discovery-id="${escapeHtml(discovery.id)}"
                  >
                    <span>${escapeHtml(discovery.kind)}</span>
                    ${escapeHtml(discovery.label)}
                  </button>
                `,
              )
              .join("")
          : `<p class="empty-state">Nothing useful has surfaced yet.</p>`
      }
    </section>
  `;
}

function bindEvents(): void {
  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-choice-index]")) {
    button.addEventListener("click", () => {
      scene.choose(Number(button.dataset.choiceIndex));
      selectedDiscoveryId = undefined;
      render();
    });
  }

  for (const button of appElement.querySelectorAll<HTMLButtonElement>("[data-discovery-id]")) {
    button.addEventListener("click", () => {
      showDiscovery(button.dataset.discoveryId ?? "");
    });
  }

  appElement.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => {
    scene = new CoffinScene();
    selectedDiscoveryId = undefined;
    render();
  });
}

function showDiscovery(discoveryId: string): void {
  const discovery = scene.snapshot.discoveries.find((candidate) => candidate.id === discoveryId);

  if (!discovery) {
    return;
  }

  if (!selectedDiscoveryId) {
    selectedDiscoveryId = discoveryId;
    render();
    insertInspection(discovery.description);
    return;
  }

  if (selectedDiscoveryId === discoveryId) {
    selectedDiscoveryId = undefined;
    render();
    return;
  }

  if (tryCombineDiscoveries(selectedDiscoveryId, discoveryId)) {
    selectedDiscoveryId = undefined;
    render();
    return;
  }

  const firstDiscovery = scene.snapshot.discoveries.find((candidate) => candidate.id === selectedDiscoveryId);
  selectedDiscoveryId = discoveryId;
  render();
  insertInspection(
    firstDiscovery
      ? `You compare ${firstDiscovery.label.toLowerCase()} with ${discovery.label.toLowerCase()}, but no useful deduction lands.`
      : discovery.description,
  );
}

function tryCombineDiscoveries(firstId: string, secondId: string): boolean {
  const pair = new Set([firstId, secondId]);

  if (pair.has("loose-nail") && pair.has("hinge-weak-point")) {
    const choice = scene.snapshot.choices.find((candidate) => candidate.text === "Break the hinge with the nail.");

    if (choice) {
      scene.choose(choice.index);
      return true;
    }
  }

  return false;
}

function insertInspection(description: string): void {
  appElement.querySelector(".story-text")?.insertAdjacentHTML(
    "afterbegin",
    `<p class="inspection">${escapeHtml(description)}</p>`,
  );
}

function formatBuild(build: CoffinSnapshot["build"]): string {
  switch (build) {
    case "strength":
      return "Strength-oriented";
    case "cautious":
      return "Caution-oriented";
    case "ingenious":
      return "Ingenuity-oriented";
    case "undetermined":
      return "Undetermined";
  }
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

render();

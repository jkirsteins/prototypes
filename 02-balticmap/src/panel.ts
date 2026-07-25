import type { People, Region } from "./types";

export interface Panel {
  show(region: Region): void;
  hide(): void;
}

function formatPeoples(ids: string[], peoples: People[]): string {
  const names = ids.map(
    (id) => peoples.find((p) => p.id === id)?.name ?? id,
  );
  if (names.length === 1) return names[0];
  return `Predominantly ${names[0]}, with ${names.slice(1).join(" and ")}`;
}

export function formatPopulation(population: number): string {
  return `~${population / 1000}k`;
}

export function tooltipText(region: Region): string {
  return `${region.name}\n${formatPopulation(region.population)} - ${region.cohesion} cohesion`;
}

export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
): Panel {
  const root = document.createElement("aside");
  root.className = "panel hidden";

  const close = document.createElement("button");
  close.className = "panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "x";
  close.addEventListener("click", onClose);

  const name = document.createElement("h2");
  name.className = "panel-name";
  const peoplesLine = document.createElement("p");
  peoplesLine.className = "panel-peoples";
  const population = document.createElement("p");
  population.className = "panel-population";
  const cohesion = document.createElement("p");
  cohesion.className = "panel-cohesion";
  const flavor = document.createElement("p");
  flavor.className = "panel-flavor";
  const places = document.createElement("p");
  places.className = "panel-places";

  root.append(close, name, peoplesLine, population, cohesion, flavor, places);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      peoplesLine.textContent = formatPeoples(region.peoples, peoples);
      population.textContent = `Population: ${formatPopulation(region.population)}`;
      cohesion.textContent = `Cohesion: ${region.cohesion}`;
      flavor.textContent = region.flavor;
      places.textContent = `Notable places: ${region.places.join(", ")}`;
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
  };
}

export interface Tooltip {
  show(text: string, clientX: number, clientY: number): void;
  hide(): void;
}

export function createTooltip(container: HTMLElement): Tooltip {
  const el = document.createElement("div");
  el.className = "tooltip hidden";
  container.appendChild(el);
  return {
    show(text, clientX, clientY) {
      el.textContent = text;
      el.style.left = `${clientX + 12}px`;
      el.style.top = `${clientY + 12}px`;
      el.classList.remove("hidden");
    },
    hide() {
      el.classList.add("hidden");
    },
  };
}

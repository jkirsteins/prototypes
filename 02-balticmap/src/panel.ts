import type { Faction, FactionType, People, Region, Settlement } from "./types";

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

export function formatFactionType(type: FactionType): string {
  return type.replace(/-/g, " ");
}

export function tooltipText(region: Region, faction: Faction): string {
  return (
    `${region.name}\n${faction.name} - ` +
    `${formatPopulation(region.population)} - ${region.cohesion} cohesion`
  );
}

export function settlementTooltipText(s: Settlement): string {
  return `${s.name}\n${s.note}`;
}

export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
  factions: Faction[],
  settlements: Settlement[],
  relationsInfo?: (region: Region) => string[],
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
  const factionLine = document.createElement("p");
  factionLine.className = "panel-faction";
  const relations = document.createElement("p");
  relations.className = "panel-relations hidden";
  const peoplesLine = document.createElement("p");
  peoplesLine.className = "panel-peoples";
  const population = document.createElement("p");
  population.className = "panel-population";
  const cohesion = document.createElement("p");
  cohesion.className = "panel-cohesion";
  const settlementsLine = document.createElement("p");
  settlementsLine.className = "panel-settlements";
  const flavor = document.createElement("p");
  flavor.className = "panel-flavor";
  const places = document.createElement("p");
  places.className = "panel-places";

  const factionById = new Map(factions.map((f) => [f.id, f]));

  root.append(close, name, factionLine, relations, peoplesLine, population, cohesion, settlementsLine, flavor, places);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      const faction = factionById.get(region.faction);
      factionLine.textContent = faction
        ? `Faction: ${faction.name} (${formatFactionType(faction.type)})`
        : "";
      const lines = relationsInfo?.(region) ?? [];
      relations.textContent = lines.join("\n");
      relations.classList.toggle("hidden", lines.length === 0);
      peoplesLine.textContent = formatPeoples(region.peoples, peoples);
      population.textContent = `Population: ${formatPopulation(region.population)}`;
      cohesion.textContent = `Cohesion: ${region.cohesion}`;
      const home = settlements.find((s) => s.land === region.id && s.unlocked);
      settlementsLine.textContent = home
        ? `Settlements: ${home.name} (1/${region.maxSettlements})`
        : "";
      flavor.textContent = region.flavor;
      places.textContent = `Notable places: ${region.places.join(", ")}`;
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
  };
}

export interface TooltipLine {
  text: string;
  tone?: "good" | "bad" | "neutral";
}

export interface Tooltip {
  show(text: string, clientX: number, clientY: number): void;
  showLines(lines: TooltipLine[], clientX: number, clientY: number): void;
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
    showLines(lines, clientX, clientY) {
      el.replaceChildren(
        ...lines.map((l) => {
          const div = document.createElement("div");
          div.className = `tooltip-line tone-${l.tone ?? "neutral"}`;
          div.textContent = l.text;
          return div;
        }),
      );
      el.style.left = `${clientX + 12}px`;
      el.style.top = `${clientY + 12}px`;
      el.classList.remove("hidden");
    },
    hide() {
      el.classList.add("hidden");
    },
  };
}

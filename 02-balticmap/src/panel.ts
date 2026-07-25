import type { Region } from "./types";

const COUNTRY_NAMES: Record<string, string> = {
  EE: "Estonia",
  LV: "Latvia",
  LT: "Lithuania",
};

const PLACEHOLDER_FIELDS = ["Population", "Area", "GDP per capita"];

export interface Panel {
  show(region: Region): void;
  hide(): void;
}

export function createPanel(container: HTMLElement, onClose: () => void): Panel {
  const root = document.createElement("aside");
  root.className = "panel hidden";

  const close = document.createElement("button");
  close.className = "panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "x";
  close.addEventListener("click", onClose);

  const name = document.createElement("h2");
  name.className = "panel-name";
  const country = document.createElement("p");
  country.className = "panel-country";
  const fields = document.createElement("dl");
  fields.className = "panel-fields";

  root.append(close, name, country, fields);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      country.textContent = COUNTRY_NAMES[region.country] ?? region.country;
      fields.textContent = "";
      for (const label of PLACEHOLDER_FIELDS) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = "(placeholder)";
        row.append(dt, dd);
        fields.appendChild(row);
      }
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

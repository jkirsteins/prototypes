import rawData from "./data/map.json";
import type { MapData } from "./types";
import { renderMap } from "./map-render";
import { createPanel, createTooltip, tooltipText } from "./panel";
import { attachInteraction } from "./interaction";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths } = renderMap(data, app);
const tooltip = createTooltip(app);
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const panel = createPanel(app, () => interaction.deselect(), data.peoples, data.factions);

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    if (region) {
      tooltip.show(
        tooltipText(region, factionById.get(region.faction)!),
        clientX,
        clientY,
      );
    } else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
});

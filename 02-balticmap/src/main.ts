import rawData from "./data/map.json";
import type { MapData } from "./types";
import { renderMap } from "./map-render";
import { createPanel, createTooltip } from "./panel";
import { attachInteraction } from "./interaction";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths } = renderMap(data, app);
const tooltip = createTooltip(app);
const panel = createPanel(app, () => interaction.deselect(), data.peoples);

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    if (region) tooltip.show(region.name, clientX, clientY);
    else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
});

import { el } from "./render";
import type { Vitals } from "../vitals";

export const POP_MS = 220;

export type Who = "convict" | "player" | "wife";

export interface Plate {
  root: HTMLElement;
  update(v: Vitals): void;
}

const NAME: Record<Who, string> = { convict: "HIM", player: "YOU", wife: "HER" };

function convictLine(v: Vitals): string {
  const parts: string[] = [v.range === "near" ? "near" : "away"];
  parts.push(v.weaponDown ? "knife down" : "knife up");
  if (v.incapacitated) parts.push("down");
  if (v.offBalance) parts.push("off-balance");
  if (v.distracted > 0) parts.push(`distracted (${v.distracted})`);
  return parts.join(" / ");
}

function playerLine(v: Vitals): string {
  const parts: string[] = [v.zone === "bedroom" ? "bedroom" : "living room"];
  if (v.bound) parts.push("bound");
  if (v.toppled) parts.push("on the floor");
  return parts.join(" / ");
}

export function createPlate(who: Who): Plate {
  const root = el("div", "plate");
  root.dataset.plate = who;
  root.append(el("span", "plate-name", NAME[who]));

  const stats = el("div", "plate-stats");
  const nodes = new Map<string, HTMLElement>();
  const add = (key: string, label: string): void => {
    const node = el("span", "plate-stat");
    node.dataset.stat = key;
    node.textContent = `${label} 0`;
    nodes.set(key, node);
    stats.append(node);
  };
  if (who !== "wife") add(`${who}-will`, "WILL");
  add(who === "wife" ? "wife-vigor" : `${who}-vigor`, "VIG");
  root.append(stats);

  const line = el("div", "plate-line");
  if (who !== "wife") {
    line.dataset.line = who;
    root.append(line);
  }

  // Held so a stat only pops on an actual change, and never on first paint.
  const last = new Map<string, number>();
  let painted = false;

  function setStat(key: string, label: string, value: number): void {
    const node = nodes.get(key);
    if (node === undefined) return;
    node.textContent = `${label} ${value}`;
    if (painted && last.get(key) !== value) {
      node.classList.add("pop");
      setTimeout(() => node.classList.remove("pop"), POP_MS);
    }
    last.set(key, value);
  }

  function update(v: Vitals): void {
    if (who === "convict") {
      setStat("convict-will", "WILL", v.convictWill);
      setStat("convict-vigor", "VIG", v.convictVigor);
      line.textContent = convictLine(v);
      root.classList.toggle("spent", v.convictVigor <= 0);
    } else if (who === "player") {
      setStat("player-will", "WILL", v.playerWill);
      setStat("player-vigor", "VIG", v.playerVigor);
      line.textContent = playerLine(v);
      root.classList.toggle("spent", v.playerVigor <= 0);
    } else {
      setStat("wife-vigor", "VIG", v.wifeVigor);
      root.classList.toggle("spent", v.wifeVigor <= 0);
    }
    painted = true;
  }

  return { root, update };
}

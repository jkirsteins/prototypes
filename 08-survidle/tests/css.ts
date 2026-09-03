import { readFileSync } from "node:fs";

export const css = readFileSync("src/style.css", "utf8");

/** The declaration block of the first rule whose selector list is exactly `selector`. */
export function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

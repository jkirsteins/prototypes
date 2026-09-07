/** The without probe (fat and carbohydrate design, section 7): a source shut for a year run, so no single resource can be mandatory. Empty in play. */
export type ProbeSource = "marrow" | "oilyFish" | "roe" | "eggs" | "roots" | "bark" | "sap" | "seaweed";
export const PROBE_SOURCES: ProbeSource[] = ["marrow", "oilyFish", "roe", "eggs", "roots", "bark", "sap", "seaweed"];
export const DISABLED = new Set<ProbeSource>();
export function disabled(s: ProbeSource): boolean {
  return DISABLED.has(s);
}

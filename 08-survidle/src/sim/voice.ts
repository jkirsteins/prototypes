/**
 * The voice: a log line is a template, and the same template reads "you"
 * while the player is here and by name for what happened while they were
 * away. Tokens: {You} {you} {Your} {your} for the subject and possessive,
 * and a verb in braces in its second-person form ({reach}, {are}, {have}),
 * which takes its third-person form by rule and a short irregular table.
 * The name is used at every subject, never a pronoun, so no gender is
 * needed and the agreement is always right.
 */

const IRREGULAR: Record<string, string> = { are: "is", have: "has", do: "does", were: "was" };

/** The third-person form of a second-person verb. */
export function third(verb: string): string {
  if (IRREGULAR[verb]) return IRREGULAR[verb];
  if (/(s|sh|ch|x|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** A panel string in plain second person: what a row, a step or a reason reads as while the player is here. */
export function plain(text: string): string {
  return voice(text, null);
}

/** Fills a templated line in second person (name null) or third person by name. */
export function voice(text: string, name: string | null): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_m, tok: string) => {
    switch (tok) {
      case "You": return name ?? "You";
      case "you": return name ?? "you";
      case "Your": return name ? `${name}'s` : "Your";
      case "your": return name ? `${name}'s` : "your";
      default: return name ? third(tok) : tok;
    }
  });
}

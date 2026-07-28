import { cardById, cardNameInProse } from "./content/cards";
import { lines } from "./vitals";
import type { VitalsChange } from "./vitals";
import type { EventKind, GameEvent } from "./types";

/**
 * What an event does to the interrupting modal.
 *
 * `headline` names the box. `detail` folds into whichever box is open.
 * `silent` never surfaces in one, and must say why in writing.
 *
 * The role belongs to the kind, not to who acted: a `lead` is a headline
 * whether you or he played it. Your own leads never reach a box because the
 * beat driver never opens a segment on your turn, not because the role
 * differs.
 */
export type ModalRole =
  | { role: "headline" }
  | { role: "detail" }
  | { role: "silent"; reason: string };

/** Exhaustive by construction: adding an EventKind is a compile error until
 *  someone decides whether it interrupts the player. */
export const MODAL_ROLES: Record<EventKind, ModalRole> = {
  lead: { role: "headline" },
  surrender: { role: "headline" },

  answer: { role: "detail" },
  decline: { role: "detail" },
  effect: { role: "detail" },
  coercion: { role: "detail" },
  recover: { role: "detail" },
  haulUp: { role: "detail" },

  draw: { role: "silent", reason: "routine; the deck pile animates it" },
  reshuffle: { role: "silent", reason: "routine; the pile pulses" },
  discard: { role: "silent", reason: "routine; visible in the log" },
  pass: { role: "silent", reason: "nothing happened; the banner says whose turn it is" },
  turn: { role: "silent", reason: "structural marker, not an occurrence" },
  scene: { role: "silent", reason: "the opening event has its own screen" },
  outcome: { role: "silent", reason: "the ending screen covers it" },
};

export interface Notice {
  title: string;
  what: string;
  flavor: string;
  rows: string[];
}

const SURRENDER_TITLE = "You Give Him Something";

function sentences(segment: GameEvent[], head: GameEvent): string[] {
  const out: string[] = [];

  if (head.kind === "surrender" && head.cardId !== undefined) {
    out.push(`You give up ${cardNameInProse(cardById(head.cardId).name)}.`);
  } else if (head.cardId !== undefined) {
    out.push(`He plays ${cardNameInProse(cardById(head.cardId).name)}.`);
    const answer = segment.find((e) => e.kind === "answer" && e.side === "player");
    const declined = segment.some((e) => e.kind === "decline");
    if (answer?.cardId !== undefined) {
      out.push(`You answered with ${cardNameInProse(cardById(answer.cardId).name)}.`);
    } else if (declined) {
      out.push("You had no answer for it.");
    }
  }

  for (const e of segment) {
    if (e.kind === "coercion" || e.kind === "recover" || e.kind === "haulUp") {
      if (e.text.length > 0) out.push(e.text);
    }
  }
  return out;
}

/**
 * Assembles at most one box from a segment of events plus the vitals that
 * moved across it. Returns null when the segment holds no headline, which is
 * how a turn where he only paced produces no interruption.
 */
export function buildNotice(segment: GameEvent[], changes: VitalsChange[]): Notice | null {
  const head = segment.find((e) => MODAL_ROLES[e.kind].role === "headline");
  if (head === undefined || head.cardId === undefined) return null;

  const card = cardById(head.cardId);
  const rows = lines(changes);
  const parts = sentences(segment, head);
  if (rows.length === 0 && parts.length <= 1) parts.push("Nothing came of it.");

  return {
    title: head.kind === "surrender" ? SURRENDER_TITLE : card.name,
    what: parts.join(" "),
    flavor: card.flavor,
    rows,
  };
}

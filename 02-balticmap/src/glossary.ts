/** The counters a land's hover puts a number beside, explained.
 *
 *  A third table beside `PASSIVES` (what a land is) and `LEADER_ABILITIES`
 *  (what a ruler can do), for what neither of those covers: a bare figure. The
 *  hover was printing "1 Kyrian", "Omens read 2" and "Miasma gathered 1" with
 *  nothing anywhere saying what the number was, whether it stacked, or what
 *  spent it - three numbers a player could see and not use.
 *
 *  A term ships when a surface prints its number, and the text answers the
 *  same three questions every time: what it is, what raises it, and what
 *  spends or ends it. */

export interface TermDef {
  id: string;
  name: string; // the label the number sits beside
  text: string;
}

export const TERMS: Record<string, TermDef> = {
  leadership: {
    id: "leadership", name: "Leadership",
    text: "This ruler's own worth in a fight. War council raises it by 1 and they stack; it dies with the ruler, and a successor starts at nothing. It does nothing by itself - it counts only where the leader holds an ability that spends it.",
  },
  omens: {
    id: "omens", name: "Omens read",
    text: "Unspent Favourable omens readings, and they stack. Each one doubles the next raid or fortify card again, and playing one spends the whole stack.",
  },
  miasma: {
    id: "miasma", name: "Miasma gathered",
    text: "Unspent Miasma readings, and they stack. Each one doubles what every disease stack of yours is worth to the next Plague, and cashing one spends the whole stack.",
  },
};

export const termName = (id: string): string => TERMS[id]?.name ?? id;

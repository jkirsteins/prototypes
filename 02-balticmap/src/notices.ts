import type { GameEvent, GameEventType } from "./game";
import type { TrackBars } from "./playability";
import { card, faction, t, theFaction, type Segment } from "./rich-text";
import { walkStandings, type StandingChange } from "./standings";
import { barPhrase } from "./view";

/** One notice-worthy event, rendered as one line: the card, who did it, and
 *  the standing it moved. See the rule in AGENTS.md - no second modal, no
 *  three-paragraph notices. */
export interface SummaryLine {
  text: Segment[];
  /** Before -> after for every track this event moved, in the human's signed
   *  view. Empty for events that move nothing (an alliance, a release, a
   *  failed poach). */
  changes: StandingChange[];
  /** "bad" = done to you, "good" = you gained or held, "neutral" = a fact
   *  with no clear direction. */
  tone: "good" | "bad" | "neutral";
}

/** Everything the AI round did to the human: one modal, one Continue. */
export interface RoundSummary {
  title: string;
  lines: SummaryLine[];
  /** Rules consequences not tied to one line - the Pay Tribute injection, the
   *  shrunk-realm subjugation bar. Deduplicated by rendered text and shown as
   *  a footer block, NOT appended to a line: they carry no before/after, and
   *  three vassals lost must not print the same warning three times. */
  footnotes: Segment[][];
}

export interface NoticeCtx {
  humanFactionId: string;
  factionOf(playerId: number): string | undefined;
  /** The human's leads over otherFactionId; positive = you lead. */
  leads(otherFactionId: string): { might: number; status: number };
  /** The lead an enemy needs over the human to subjugate them, per track
   *  (scaled by the human realm's size, and by its settlements on the Might
   *  track). No particular rival in mind - used only where the human's own
   *  realm shrinking is the point, not who threatens them. */
  subjugationGrip(): TrackBars;
  /** The lead this rival needs to subjugate the human on each track, or null
   *  when the rules forbid it outright - they already hold the human, or they
   *  are somebody's vassal themselves. The map's danger marker uses the same
   *  numbers, so the two surfaces cannot disagree. */
  subjugationBarAgainstYou(otherFactionId: string): TrackBars | null;
  /** Expiry turn of an active alliance between the human and otherFactionId;
   *  undefined when no pact is active. */
  allianceExpiry(otherFactionId: string): number | undefined;
}

/** Every GameEventType must decide: a line in the round summary, or silence
 *  with a written reason. The exhaustive Record makes adding an event type a
 *  compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      /** One call per group (same type + card + prevented + human role).
       *  `changes` is index-parallel to `events`, from a walk over the WHOLE
       *  batch - so a line's numbers are that event's own, not the round's
       *  total. */
      lines(events: GameEvent[], changes: StandingChange[][], ctx: NoticeCtx): SummaryLine[];
      /** What this group contributes to the footer, if anything. */
      footnotes?(events: GameEvent[], ctx: NoticeCtx): Segment[][];
    }
  | { kind: "silent"; reason: string };

/** Which side of an allegiance change the human is on: the faction that
 *  changed hands (`self`), or the overlord that lost it (`lord`). Null when
 *  the event misses the human, or when the human caused it and already knows.
 *
 *  A round can contain both - a rival can subjugate you and poach a different
 *  vassal in the same round - so the role is part of the batch key and is
 *  never inferred from the event type alone. */
export type HumanRole = "self" | "lord";

function humanRoleIn(e: GameEvent, ctx: NoticeCtx): HumanRole | null {
  if (e.playerId === 1) return null;
  if (e.targetFactionId === ctx.humanFactionId) return "self";
  // `subjugate-failed` names the incumbent lord in `formerOverlordFactionId`,
  // the same field `subjugated` uses, so both must read it there. Without this
  // a failed poach of the human's vassal fell through to the "self" role and
  // would be described with the wording meant for an attempt on the human.
  const lostTo =
    e.type === "subjugated" || e.type === "subjugate-failed"
      ? e.formerOverlordFactionId
      : e.overlordFactionId;
  return lostTo === ctx.humanFactionId ? "lord" : null;
}

/** Every way a vassal leaves the human shrinks the realm, which lowers the
 *  bar rivals need to subjugate the human in turn. */
function realmShrunkFootnote(ctx: NoticeCtx): Segment[] {
  return [
    t(`Your realm is smaller: a lead of ${barPhrase(ctx.subjugationGrip())} over `),
    t("you is now enough to subjugate you."),
  ];
}

/** Either of their leads over the human meets that track's bar for THIS rival
 *  specifically - false when the bars are null (they could never subjugate the
 *  human this way round) as well as when both leads fall short. Per track
 *  rather than best-lead-against-one-bar: the Status bar is the lower one on a
 *  settled realm, so a single number would understate the danger. */
function subjugationRisk(ctx: NoticeCtx, otherId: string): boolean {
  const bars = ctx.subjugationBarAgainstYou(otherId);
  if (bars === null) return false;
  const l = ctx.leads(otherId);
  return -l.might >= bars.might || -l.status >= bars.status;
}

const PAY_TRIBUTE_FOOTNOTE = (): Segment[] => [
  card("pay-tribute"), t(" cards were shuffled into your deck (x2). While one is in "),
  t("hand it must be played first."),
];

const RELEASE_FOOTNOTE = (): Segment[] => [
  t("All "), card("pay-tribute"), t(" cards were removed from your deck, hand and discard."),
];

/** Segment-key for footnote dedup: two "your realm is smaller" lines from two
 *  different lost vassals must collapse to one, so this compares rendered
 *  shape rather than object identity. Cards/factions key by id, not by their
 *  (possibly not-yet-resolved) display name. */
function footnoteKey(segs: Segment[]): string {
  return segs
    .map((s) => {
      if (s.kind === "text") return `t:${s.text}`;
      if (s.kind === "card") return `card:${s.cardId}`;
      return `faction:${s.factionId}`;
    })
    .join("|");
}

// -- per-type line builders --------------------------------------------

function actorId(e: GameEvent, ctx: NoticeCtx): string | undefined {
  return ctx.factionOf(e.playerId);
}

function changesFor(i: number, changes: StandingChange[][]): StandingChange[] {
  return changes[i] ?? [];
}

function raidOrMarriageLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      card(e.cardId ?? ""), t(" played against you by "), faction(actorId(e, ctx) ?? ""),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function raidOrMarriageFootnotes(events: GameEvent[], ctx: NoticeCtx): Segment[][] {
  const seen = new Set<string>();
  const out: Segment[][] = [];
  for (const e of events) {
    const id = actorId(e, ctx);
    if (id === undefined || seen.has(id) || !subjugationRisk(ctx, id)) continue;
    seen.add(id);
    const bars = ctx.subjugationBarAgainstYou(id);
    if (bars === null) continue;
    out.push([
      theFaction(id), t(` can subjugate you at a lead of ${barPhrase(bars)}.`),
    ]);
  }
  return out;
}

function assassinateLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => {
    if (e.prevented) {
      return {
        text: [
          card("assassinate-ruler"), t(" by "), faction(actorId(e, ctx) ?? ""),
          t(" - your bodyguard turned the blade"),
        ],
        changes: [],
        tone: "good" as const,
      };
    }
    const text: Segment[] = [card("assassinate-ruler")];
    if (e.targetRuler !== undefined) text.push(t(` took ${e.targetRuler}`));
    if (e.successorRuler !== undefined) text.push(t(`; ${e.successorRuler} now leads you`));
    text.push(t(" - by "), faction(actorId(e, ctx) ?? ""));
    return { text, changes: changesFor(i, changes), tone: "bad" as const };
  });
}

function allianceLines(
  events: GameEvent[],
  _changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e) => {
    const id = actorId(e, ctx);
    const expiry = id !== undefined ? ctx.allianceExpiry(id) : undefined;
    return {
      text: [
        card("alliance"), t(" sealed with you by "), faction(id ?? ""),
        ...(expiry !== undefined ? [t(`, until turn ${expiry}`)] : []),
      ],
      changes: [],
      tone: "good" as const,
    };
  });
}

function subjugatedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
  role: HumanRole,
): SummaryLine[] {
  if (role === "lord") {
    return events.map((e, i) => ({
      text: [
        card("subjugate"), t(" by "), faction(actorId(e, ctx) ?? ""),
        t(" took your vassal "), faction(e.targetFactionId ?? ""),
      ],
      changes: changesFor(i, changes),
      tone: "bad",
    }));
  }
  return events.map((e, i) => ({
    text: [
      card("subjugate"), t(" by "), faction(actorId(e, ctx) ?? ""),
      ...(e.formerOverlordFactionId !== undefined
        ? [t(" - your allegiance shifts from "), faction(e.formerOverlordFactionId), t(" to them")]
        : [t(" - you owe fealty to them")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function reclaimedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      card("revolt"), t(" by "), faction(e.targetFactionId ?? ""),
      t(" cast off your overlordship"),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function releasedLines(events: GameEvent[], ctx: NoticeCtx, role: HumanRole): SummaryLine[] {
  if (role === "lord") {
    if (events.length === 1) {
      return [{
        text: [t("Your subjugation released "), faction(events[0].targetFactionId ?? ""), t(" from your service")],
        changes: [],
        tone: "neutral",
      }];
    }
    const names: Segment[] = events.flatMap((e, i) => {
      const isLast = i === events.length - 1;
      const isSecondLast = i === events.length - 2;
      return [
        faction(e.targetFactionId ?? ""),
        ...(isLast ? [] : isSecondLast ? [t(" and ")] : [t(", ")]),
      ];
    });
    return [{
      text: [t("Your subjugation released "), ...names, t(" from your service")],
      changes: [],
      tone: "neutral",
    }];
  }
  return events.map((e) => ({
    text: [
      t("The fall of "),
      ...(e.overlordFactionId !== undefined ? [faction(e.overlordFactionId)] : [t("your overlord")]),
      t(" to "), faction(actorId(e, ctx) ?? ""),
      t(" released you from vassalage"),
    ],
    changes: [],
    tone: "good",
  }));
}

function unrestLines(events: GameEvent[]): SummaryLine[] {
  if (events.length === 1) {
    return [{
      text: [faction(events[0].targetFactionId ?? ""), t(" is preparing a revolt against you")],
      changes: [],
      tone: "bad",
    }];
  }
  const names: Segment[] = events.flatMap((e, i) => {
    const isLast = i === events.length - 1;
    const isSecondLast = i === events.length - 2;
    return [
      faction(e.targetFactionId ?? ""),
      ...(isLast ? [] : isSecondLast ? [t(" and ")] : [t(", ")]),
    ];
  });
  return [{
    text: [...names, t(" are preparing a revolt against you")],
    changes: [],
    tone: "bad",
  }];
}

function subjugateFailedLines(events: GameEvent[], ctx: NoticeCtx, role: HumanRole): SummaryLine[] {
  if (role === "lord") {
    return events.map((e) => ({
      text: [
        faction(e.overlordFactionId ?? ""), t(" failed to take "),
        faction(e.targetFactionId ?? ""), t(" from you"),
      ],
      changes: [],
      tone: "good",
    }));
  }
  return events.map((e) => ({
    text: [
      faction(e.overlordFactionId ?? e.targetFactionId ?? ""), t(" failed to take you from "),
      faction(e.formerOverlordFactionId ?? ""),
    ],
    changes: [],
    tone: "good",
  }));
}

function incorporateFailedLines(events: GameEvent[]): SummaryLine[] {
  return events.map((e) => ({
    text: [
      faction(e.overlordFactionId ?? ""), t(" failed to absorb your realm permanently"),
    ],
    changes: [],
    tone: "good",
  }));
}

// -- the registry ---------------------------------------------------------

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: {
    kind: "modal",
    appliesToHuman: (e, ctx) =>
      (e.cardId === "raid" ||
        e.cardId === "shrewd-marriage" ||
        e.cardId === "assassinate-ruler" ||
        e.cardId === "alliance") &&
      e.targetFactionId === ctx.humanFactionId &&
      e.playerId !== 1,
    lines: (events, changes, ctx) => {
      const cardId = events[0].cardId;
      if (cardId === "assassinate-ruler") return assassinateLines(events, changes, ctx);
      if (cardId === "alliance") return allianceLines(events, changes, ctx);
      return raidOrMarriageLines(events, changes, ctx);
    },
    // Raid, Shrewd marriage and Assassinate ruler are all hostile plays that
    // move (or tried to move) a lead against the human, so all three carry
    // the same danger cue: is this actor now able to subjugate the human?
    // That question is about the actor's CURRENT standing, not this play's
    // own effect, so a prevented Assassinate ruler still asks it.
    footnotes: (events, ctx) => {
      const cardId = events[0].cardId;
      if (cardId === "raid" || cardId === "shrewd-marriage" || cardId === "assassinate-ruler") {
        return raidOrMarriageFootnotes(events, ctx);
      }
      return [];
    },
  },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) !== null,
    lines: (events, changes, ctx) =>
      subjugatedLines(events, changes, ctx, humanRoleIn(events[0], ctx) ?? "self"),
    footnotes: (events, ctx) => {
      const role = humanRoleIn(events[0], ctx) ?? "self";
      return role === "self" ? [PAY_TRIBUTE_FOOTNOTE()] : [realmShrunkFootnote(ctx)];
    },
  },
  released: {
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) !== null,
    lines: (events, _changes, ctx) =>
      releasedLines(events, ctx, humanRoleIn(events[0], ctx) ?? "self"),
    footnotes: (events, ctx) => {
      const role = humanRoleIn(events[0], ctx) ?? "self";
      return role === "self" ? [RELEASE_FOOTNOTE()] : [];
    },
  },
  incorporated: {
    kind: "silent",
    reason: "human target always co-occurs with defeat; postmortem covers it",
  },
  reclaimed: {
    // Silent only when the human reclaims: they played the card. A vassal
    // walking out on the human is news, and used to pass unannounced.
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) === "lord",
    lines: reclaimedLines,
    footnotes: (_events, ctx) => [realmShrunkFootnote(ctx)],
  },
  tribute: {
    kind: "silent",
    reason: "self-initiated (human pays) or human merely benefits",
  },
  settled: {
    kind: "silent",
    // A rival settling raises the lead the human needs against it, and a
    // settlement in the human's own realm raises the lead rivals need against
    // them. Neither moves a lead, so neither is an interruption: both numbers
    // are already on the map badge, the hover tooltip and the land panel, and
    // the activity log names the land.
    reason: "changes a bar the map and tooltip already show, never a lead",
  },
  seeded: {
    kind: "modal",
    // Your own vassal sowing is the warning that starts the race: a Revolt is
    // now in their deck and will surface in a few turns. It is the only way to
    // learn this - you cannot see their hand - and it is what turns the
    // Incorporate odds into a decision rather than a readout.
    //
    // Only fires for the human's OWN vassal. The human's own sowing needs no
    // notice, and a rival's is genuinely unobservable - see the log filter in
    // hud.ts, which keeps other factions' sowings off the activity log for the
    // same reason.
    appliesToHuman: (e, ctx) =>
      e.overlordFactionId === ctx.humanFactionId && e.playerId !== 1,
    lines: (events) => unrestLines(events),
    footnotes: () => [[
      t("A "), card("revolt"), t(" is in their deck now. Incorporating them "),
      t("before it surfaces ends the threat for good."),
    ]],
  },
  "subjugate-failed": {
    kind: "modal",
    // A rival trying and failing is exactly the kind of near-miss the player
    // must see: nothing on the map changed, so without a notice the attempt
    // leaves no trace at all. Two ways it can touch the human - they kept a
    // vassal somebody reached for, or they were themselves the prize - and the
    // role split picks the wording.
    appliesToHuman: (e, ctx) =>
      e.playerId !== 1 &&
      (e.formerOverlordFactionId === ctx.humanFactionId ||
        e.targetFactionId === ctx.humanFactionId),
    lines: (events, _changes, ctx) =>
      subjugateFailedLines(events, ctx, humanRoleIn(events[0], ctx) ?? "self"),
    footnotes: (events, ctx) => {
      const role = humanRoleIn(events[0], ctx) ?? "self";
      return role === "self"
        ? [[t("Their card is spent. You are still your overlord's vassal, not theirs.")]]
        : [];
    },
  },
  "incorporate-failed": {
    kind: "modal",
    // Was silent, reasoned as "only ever the human's own play, since nobody
    // else can incorporate a land the human holds". That is wrong whenever the
    // human is somebody's vassal: their overlord can annex *them*, and the roll
    // can miss. Being one failed roll away from the run ending is the least
    // skippable thing that can happen, and nothing on the map records it.
    //
    // The human's own missed roll stays silent, as it always was - the hand and
    // activity log already show the card was spent, and a modal on your own
    // failed gamble is a nag. `playerId !== 1` is what keeps that true.
    appliesToHuman: (e, ctx) =>
      e.targetFactionId === ctx.humanFactionId && e.playerId !== 1,
    lines: (events) => incorporateFailedLines(events),
    footnotes: () => [[
      t("Their card is spent. The longer you stay their vassal, the better their "),
      t("next attempt's odds - breaking free resets that clock."),
    ]],
  },
  garrisoned: {
    kind: "silent",
    // A standing per-turn gain, not an event: every realm past the threshold
    // earns it every single turn, so a modal would fire continuously and mean
    // nothing. The player's own is in the activity log and stated as a standing
    // line on the scoreboard; a rival's shows up where it matters, in the Might
    // lead on their threat badge.
    reason: "continuous standing gain; log, scoreboard and badge all carry it",
  },
  victory: { kind: "silent", reason: "postmortem overlay covers it" },
  defeat: { kind: "silent", reason: "postmortem overlay covers it" },
  surrendered: { kind: "silent", reason: "postmortem overlay covers it" },
  // hud.ts renders unification in the activity log and the post-mortem
  // overlay; no modal notice is needed on top of that.
  unified: { kind: "silent", reason: "postmortem overlay covers it" },
};

/** The HUD's entry point: given a batch of fresh log events, walks the WHOLE
 *  batch for standings (see standings.ts - this needs the silent events too,
 *  not just the notice-worthy ones), groups the noticeable ones by event type
 *  + cardId + human role (so e.g. three Raids against the human in one AI
 *  round become three lines in one modal, ordered by first occurrence), and
 *  returns the round as one summary. Null when the round touched the human in
 *  no way worth interrupting for. */
export function buildRoundSummary(events: GameEvent[], ctx: NoticeCtx): RoundSummary | null {
  const walkCtx = {
    humanFactionId: ctx.humanFactionId,
    factionOf: ctx.factionOf,
    leads: ctx.leads,
  };
  const allChanges = walkStandings(events, walkCtx);

  const order: {
    type: GameEventType;
    events: GameEvent[];
    changes: StandingChange[][];
  }[] = [];
  const indexByKey = new Map<string, number>();
  events.forEach((e, i) => {
    const rule = NOTICE_RULES[e.type];
    if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) return;
    // The role is part of the key: being subjugated and having a different
    // vassal poached are both `subjugated` events, and merging them would
    // describe one with the other's wording.
    const role = humanRoleIn(e, ctx) ?? "self";
    const key = `${e.type}:${e.cardId ?? ""}:${e.prevented ? "prevented" : ""}:${role}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = order.length;
      indexByKey.set(key, idx);
      order.push({ type: e.type, events: [], changes: [] });
    }
    order[idx].events.push(e);
    order[idx].changes.push(allChanges[i]);
  });

  if (order.length === 0) return null;

  const lines = order.flatMap(({ type, events: groupEvents, changes: groupChanges }) => {
    const rule = NOTICE_RULES[type];
    if (rule.kind !== "modal") return [];
    return rule.lines(groupEvents, groupChanges, ctx);
  });

  const footnoteSeen = new Set<string>();
  const footnotes: Segment[][] = [];
  for (const { type, events: groupEvents } of order) {
    const rule = NOTICE_RULES[type];
    if (rule.kind !== "modal" || rule.footnotes === undefined) continue;
    for (const fn of rule.footnotes(groupEvents, ctx)) {
      const key = footnoteKey(fn);
      if (footnoteSeen.has(key)) continue;
      footnoteSeen.add(key);
      footnotes.push(fn);
    }
  }

  return { title: "What happened during their turns", lines, footnotes };
}

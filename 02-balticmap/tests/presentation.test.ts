import { describe, it, expect } from "vitest";
import {
  effectiveBeatLabel, PRESENTATION_RULES, presentCtxOf, presentEvents,
  involvesLocalSeats,
  type Beat, type PresentCtx, type PresentView,
} from "../src/presentation";
import type { GameEvent, GameEventType } from "../src/game";
import type { NoticeCtx } from "../src/notices";
import { walkCtxOf } from "../src/notices";
import { walkStandings } from "../src/standings";
import { EVENT_SOUNDS } from "../src/audio-manifest";
import { CARDS } from "../src/cards";
import raw from "../src/data/baltic.json";
import type { MapData } from "../src/types";

const data = raw as MapData;

/** Seat 1 plays beta, seat 2 plays alpha. Every land starts at 5 defense and
 *  3 stacks, so a walk over a batch has somewhere to walk back to. */
const notice = (over?: Partial<NoticeCtx>): NoticeCtx => ({
  humanFactionId: "beta",
  factionOf: (id) => (id === 1 ? "beta" : id === 2 ? "alpha" : undefined),
  defense: () => 5,
  defenseMax: () => 10,
  diseaseOf: () => 3,
  inHumanRealm: (p) => p === "beta",
  homeGateOpen: () => false,
  ...over,
});

const view = (over?: Partial<PresentView>): PresentView => ({
  seats: new Set([1]),
  realm: new Set(["beta"]),
  linked: new Set(["beta", "gamma"]),
  notice: notice(),
  ...over,
});

const ctxFor = (events: GameEvent[], over?: Partial<PresentView>): PresentCtx =>
  presentCtxOf(events, view(over));

const mapBeats = (beats: Beat[]): Extract<Beat, { kind: "map" }>[] =>
  beats.filter((b): b is Extract<Beat, { kind: "map" }> => b.kind === "map");

/** One event of every type, filled wide enough that any rule can build its
 *  label and any score move can be walked. Seat 2 does it: the disease tracks
 *  move the ACTOR's stacks, so an event out of a seat with no faction walks
 *  no disease and would take two rules out of the badge test's reach. */
const sample = (type: GameEventType, over?: Partial<GameEvent>): GameEvent => ({
  turn: 3, playerId: 2, type,
  targetFactionId: "beta", sourceFactionId: "gamma",
  overlordFactionId: "alpha", cardId: "raid", via: "conquest",
  amount: 1, incoming: 2, counter: 1, stacksSpent: 1, marchIds: [4],
  ...over,
});

describe("PRESENTATION_RULES", () => {
  it("covers every event type the sound table covers", () => {
    // The Record is exhaustive at compile time; this is what would notice a
    // type deleted from one table and left in the other.
    expect(Object.keys(PRESENTATION_RULES).sort())
      .toEqual(Object.keys(EVENT_SOUNDS).sort());
  });

  it("every never entry says why, in a sentence", () => {
    for (const rule of Object.values(PRESENTATION_RULES)) {
      if (rule.kind !== "never") continue;
      expect(rule.reason.length).toBeGreaterThan(20);
    }
  });

  it("a silent event type is never presented, or its rule names a sound", () => {
    // A null in `EVENT_SOUNDS` is a decision about where that event's moment
    // went, and there are two honest answers: it has no moment on screen at
    // all, or the beat that draws it names a sound of its own because the
    // table's default would be silence. A presented type with neither is an
    // event the player watches happen in silence, which is a decision nobody
    // wrote down.
    for (const [type, sound] of Object.entries(EVENT_SOUNDS)) {
      if (sound !== null) continue;
      const rule = PRESENTATION_RULES[type as GameEventType];
      if (rule.kind === "never") continue;
      const e = sample(type as GameEventType);
      const beats = presentEvents([e], ctxFor([e]));
      expect(beats.length, `${type} is silent and shows nothing`)
        .toBeGreaterThan(0);
      for (const beat of beats) {
        if (beat.kind === "ask") continue;
        expect(beat.sound, `${type} is silent and its beat plays nothing`)
          .not.toBeNull();
      }
    }
  });

  it("a never rule earns no beat for any event of its type", () => {
    for (const [type, rule] of Object.entries(PRESENTATION_RULES)) {
      if (rule.kind !== "never") continue;
      const e = sample(type as GameEventType, { playerId: 1 });
      expect(presentEvents([e], ctxFor([e]))).toEqual([]);
    }
  });

  it("no map label bakes a card or faction name into plain text", () => {
    // The rich-text rule, applied to this surface: a name in a label must be
    // a segment the player can point at, never dead text. The same check
    // tests/naming-convention.test.ts runs over the log.
    const cardNames = Object.values(CARDS).map((c) => c.name);
    const factionNames = data.factions.map((f) => f.name);
    let read = 0;
    for (const [type, rule] of Object.entries(PRESENTATION_RULES)) {
      if (rule.kind !== "presented") continue;
      const e = sample(type as GameEventType);
      for (const cause of [
        null,
        { kind: "card" as const, id: "fortify", playerId: 2 },
        { kind: "passive" as const, id: "wild-lands", playerId: 2 },
      ]) {
        const base = ctxFor([e]);
        const beats = rule.beats(e, { ...base, causeOf: () => cause });
        for (const beat of mapBeats(beats)) {
          // A beat this screen caused itself carries no label at all, and
          // there is nothing in it to bake a name into.
          if (beat.label === null) continue;
          read += 1;
          expect(beat.label.length).toBeGreaterThan(0);
          for (const seg of beat.label) {
            if (seg.kind !== "text") continue;
            for (const name of [...cardNames, ...factionNames]) {
              expect(seg.text).not.toContain(name);
            }
          }
        }
      }
    }
    // A label is only checked on a beat that was returned, so a rule that
    // stops framing anything would take its labels out of this test's reach
    // rather than fail it. Twelve framed rules times the three cause shapes
    // above: a new one only ever raises this, and a rule that dries up is
    // what the number is here to catch.
    expect(read).toBeGreaterThanOrEqual(36);
  });

  it("walks a badge for every score its rules can move", () => {
    // The float subsystem is gone, so a beat carrying no walk is a number
    // that changes on the map with nothing saying it moved.
    let walked = 0;
    for (const type of Object.keys(PRESENTATION_RULES) as GameEventType[]) {
      const e = sample(type);
      const expected = walkStandings([e], walkCtxOf(notice()))[0]
        .filter((c) => c.before !== c.after);
      if (expected.length === 0) continue;
      walked += 1;
      const beats = mapBeats(presentEvents([e], ctxFor([e])));
      expect(beats.length, `${type} moves a score and earns no map beat`)
        .toBeGreaterThan(0);
      // Field for field, `owner` included: a `StandingChange` and a
      // `BadgeWalk` are the same shape, and the walk is the badge's only
      // source for whose pips moved.
      for (const c of expected) expect(beats[0].badges).toContainEqual(c);
    }
    // Guards the loop itself: a sample that stopped moving a score would
    // otherwise pass this test by checking nothing. Six types move one -
    // march-resolved, healed, transferred, plagued and the two disease
    // tracks - and the count is what would notice a sample going quiet.
    expect(walked).toBeGreaterThanOrEqual(6);
  });
});

describe("presentEvents", () => {
  const march = (over?: Partial<GameEvent>): GameEvent => ({
    turn: 4, playerId: 3, type: "march-resolved", cardId: "raid",
    targetFactionId: "beta", sourceFactionId: "alpha", amount: 2,
    incoming: 2, counter: 0, marchIds: [4],
    ...over,
  });

  it("shows a march touching the realm at either end, and skips one touching neither", () => {
    const hit = mapBeats(presentEvents([march()], ctxFor([march()])));
    expect(hit).toHaveLength(1);
    expect(hit[0].polygon).toBe("beta");
    expect(hit[0].sound).toBe("clash");

    const away = march({ targetFactionId: "delta", sourceFactionId: "epsilon" });
    expect(presentEvents([away], ctxFor([away]))).toEqual([]);
  });

  it("leaves an arrival that met nothing to the subjugation it caused", () => {
    // `metNothing`: no amount and no counter. The subjugated beat names the
    // same card and says what became of the land, so presenting both would
    // visit one polygon twice for one arrival.
    const fresh: GameEvent[] = [
      march({ amount: undefined, counter: undefined }),
      {
        turn: 4, playerId: 3, type: "subjugated", targetFactionId: "beta",
        overlordFactionId: "alpha", via: "conquest", cardId: "raid",
        sourceFactionId: "alpha", consequence: true,
      },
    ];
    const beats = mapBeats(presentEvents(fresh, ctxFor(fresh)));
    expect(beats).toHaveLength(1);
    expect(beats[0].label).toContainEqual({
      kind: "text", text: "Taken - this land now answers to ",
    });
  });

  it("still calls a standoff answered in the field", () => {
    // A standoff keeps its counter - that is what separates it from an
    // arrival that met nothing, and the two must not read alike.
    const e = march({ amount: undefined, incoming: 2, counter: 2 });
    const beats = mapBeats(presentEvents([e], ctxFor([e])));
    expect(beats).toHaveLength(1);
    expect(beats[0].label).toContainEqual({
      kind: "text", text: " was answered in the field",
    });
  });

  it("draws a standoff as both armies spent, one arrow each way", () => {
    // The border must not be empty while a label talks about a fight that
    // happened on it. Nobody won, so neither arrow may be built as the
    // winner: the event's two ends are the axis's own SORTED ends, and one
    // arrow off them would be aimed by an alphabetic accident and labelled
    // with whichever side's strength happened to land in `incoming`. What is
    // not sorted is the pair of numbers, so each side is drawn with its own.
    const e = march({
      targetFactionId: "alpha", sourceFactionId: "beta",
      amount: undefined, incoming: 2, counter: 5, marchIds: [4, 9],
    });
    const beat = mapBeats(presentEvents([e], ctxFor([e])))[0];
    expect(beat.retires).toEqual([4, 9]);
    expect(beat.resolutions).toHaveLength(2);
    // `incoming` is what was thrown AT the target, `counter` what it threw
    // back, and nothing got through either way.
    expect(beat.resolutions.map((r) => [r.from, r.to, r.strength, r.label]))
      .toEqual([
        ["beta", "alpha", 2, "0/2 DMG"],
        ["alpha", "beta", 5, "0/5 DMG"],
      ]);
    // Ours going out, theirs coming in: the two arrows of one standoff are
    // not the same tone, which is the whole reason they are drawn as two.
    expect(beat.resolutions.map((r) => r.tone)).toEqual(["ours", "hostile"]);
    // Two arrows off one event, so the keys the scene draws them under have
    // to differ - and both are namespaced away from the `march:<id>` keys of
    // the arrows still standing.
    expect(new Set(beat.resolutions.map((r) => r.key)).size).toBe(2);
    for (const r of beat.resolutions) {
      expect(r.key.startsWith("march:")).toBe(false);
    }
  });

  it("retires the arrows the landing spent and draws one resolution at the loser", () => {
    // A clash retires both sides and reports once. The arrow it draws is
    // neither of them: winner at loser, at the strength that was actually
    // aimed, which is not what either side declared.
    const e = march({
      targetFactionId: "beta", sourceFactionId: "alpha",
      amount: 1, incoming: 3, counter: 2, marchIds: [4, 9],
    });
    const beat = mapBeats(presentEvents([e], ctxFor([e])))[0];
    expect(beat.retires).toEqual([4, 9]);
    expect(beat.resolutions).toHaveLength(1);
    expect(beat.resolutions[0].from).toBe("alpha");
    expect(beat.resolutions[0].to).toBe("beta");
    expect(beat.resolutions[0].strength).toBe(3);
    expect(beat.resolutions[0].label).toBe("1/3 DMG");
    // The loser is ours, so the force is aimed at us.
    expect(beat.resolutions[0].tone).toBe("hostile");
    // Namespaced away from the `march:<id>` keys of the arrows still
    // standing: this arrow is none of them.
    expect(beat.resolutions[0].key.startsWith("march:")).toBe(false);
  });

  it("presents nothing for a demand coming due, which has no arrow to draw", () => {
    // The one `march-resolved` no army caused: it clears no march, throws no
    // strength, and is `metNothing` by construction.
    const e = march({
      amount: undefined, counter: undefined, incoming: undefined,
      marchIds: undefined,
    });
    expect(presentEvents([e], ctxFor([e]))).toEqual([]);
  });

  it("gives the wild-lands regrowth its passive cause, its rustle and its land", () => {
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 7, type: "passive-fired",
        passiveId: "wild-lands", targetFactionId: "gamma",
      },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1 },
    ];
    const beats = mapBeats(presentEvents(fresh, ctxFor(fresh)));
    // The passive-fired line itself is never presented; its consequence
    // carries the moment.
    expect(beats).toHaveLength(1);
    expect(beats[0].polygon).toBe("gamma");
    expect(beats[0].sound).toBe("rustle");
    expect(beats[0].label).toContainEqual({
      kind: "passive", passiveId: "wild-lands",
    });
    expect(beats[0].badges).toEqual([
      { polygon: "gamma", track: "defense", before: 4, after: 5 },
    ]);
  });

  it("shows a neighbour's regrowth only while a line runs between us", () => {
    // The example this gate exists for: a wild land mending itself matters
    // when an arrow of yours is in the air toward it, because it changes what
    // that arrow will do. The same land mending itself with nothing between
    // you is a log line, not a camera move.
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 7, type: "passive-fired",
        passiveId: "wild-lands", targetFactionId: "gamma",
      },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1 },
    ];
    const withArrow = presentEvents(fresh, ctxFor(fresh, {
      realm: new Set(["beta"]), linked: new Set(["beta", "gamma"]),
    }));
    expect(withArrow).toHaveLength(1);
    const noArrow = presentEvents(fresh, ctxFor(fresh, {
      realm: new Set(["beta"]), linked: new Set(["beta"]),
    }));
    expect(noArrow).toEqual([]);
  });

  it("skips a regrowth outside the interest set", () => {
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 7, type: "passive-fired",
        passiveId: "wild-lands", targetFactionId: "delta",
      },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "delta", amount: 1 },
    ];
    expect(presentEvents(fresh, ctxFor(fresh))).toEqual([]);
  });

  it("frames nothing for what this screen's own play caused and no score followed", () => {
    // The card flew and the click landed: the player watched it happen. A
    // second telling on the map is their own turn, twice.
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 1, type: "play", cardId: "found-settlement",
        targetFactionId: "beta",
      },
      {
        turn: 4, playerId: 1, type: "settled", targetFactionId: "beta",
        consequence: true,
      },
    ];
    expect(mapBeats(presentEvents(fresh, ctxFor(fresh)))).toEqual([]);
    // The other seat watched no card fly, so the same batch is news there.
    const theirs = mapBeats(presentEvents(fresh, ctxFor(fresh, {
      seats: new Set([2]), realm: new Set(["alpha", "beta"]),
    })));
    expect(theirs).toHaveLength(1);
    expect(theirs[0].label).toContainEqual({
      kind: "text", text: "A new settlement founded",
    });
  });

  it("walks the badge for a score this screen's own play moved, and says nothing", () => {
    // The one thing the player did NOT watch is a number moving: a badge is
    // drawn as though it had always been that. So the own-play suppression
    // above stops exactly where a walk begins - and stops THERE. A label
    // naming the card still under their cursor is the turn told back to them,
    // and the input gate waits on it while it is read.
    const fresh: GameEvent[] = [
      { turn: 4, playerId: 1, type: "play", cardId: "fortify", targetFactionId: "beta" },
      {
        turn: 4, playerId: 1, type: "healed", targetFactionId: "beta",
        amount: 2, consequence: true,
      },
    ];
    const beats = presentEvents(fresh, ctxFor(fresh));
    expect(beats.filter((b) => b.kind === "hud")).toHaveLength(1);
    const map = mapBeats(beats);
    expect(map).toHaveLength(1);
    expect(map[0].badges).toEqual([
      { polygon: "beta", track: "defense", before: 3, after: 5 },
    ]);
    expect(map[0].label).toBeNull();
    // Silent it is not: the badge moving and the sound beside it are the two
    // halves of "your card did something", and the label is the only part
    // being dropped.
    expect(map[0].sound).toBe("hammer");
    // The sentence is not gone - it is kept in reserve for the land that has
    // no badge to walk at all, and it reads exactly as it would if this had
    // not been the player's own play.
    expect(map[0].causedLabel).toContainEqual({ kind: "card", cardId: "fortify" });
    // The same heal at the other screen is business it did not do, so it gets
    // the whole frame.
    const theirs = mapBeats(presentEvents(fresh, ctxFor(fresh, {
      seats: new Set([2]), realm: new Set(["alpha", "beta"]),
    })));
    expect(theirs[0].label).toContainEqual({ kind: "card", cardId: "fortify" });
    // Nothing held in reserve for a beat that was never suppressed - there is
    // no gap for it to fall into.
    expect(theirs[0].causedLabel).toBeNull();
  });

  it("falls back to the caused label when there is no badge to walk", () => {
    // The case `effectiveBeatLabel` exists for: your own play damages a
    // rival's land that `renderThreatBadges` draws no badge for (annexed, at
    // full defense, disease-free before this hit). The badge walk settles
    // without moving a pixel, so the label is the only news left - and
    // `runMapBeat` is the only caller with the DOM fact to ask for.
    const healed: GameEvent[] = [
      { turn: 4, playerId: 1, type: "play", cardId: "raid", targetFactionId: "beta" },
      {
        turn: 4, playerId: 1, type: "plagued", targetFactionId: "beta",
        amount: 3, consequence: true,
      },
    ];
    const beat = mapBeats(presentEvents(healed, ctxFor(healed)))[0];
    expect(beat.label).toBeNull();
    expect(beat.causedLabel).not.toBeNull();
    // A badge to walk: nothing falls back, the number is the whole story.
    expect(effectiveBeatLabel(beat, true)).toBeNull();
    // No badge to walk: the sentence held in reserve is what carries the
    // news, so the beat presents something rather than nothing.
    expect(effectiveBeatLabel(beat, false)).toEqual(beat.causedLabel);
    expect(effectiveBeatLabel(beat, false)).not.toBeNull();

    // A beat that was never suppressed ignores badgeExists entirely - its own
    // label is always what shows.
    const theirs = mapBeats(presentEvents(healed, ctxFor(healed, {
      seats: new Set([2]), realm: new Set(["alpha", "beta"]),
    })))[0];
    expect(effectiveBeatLabel(theirs, false)).toEqual(theirs.label);
    expect(effectiveBeatLabel(theirs, true)).toEqual(theirs.label);
  });

  it("says whose pips each disease walk is about", () => {
    // A claim on the sickness moves two owners' stacks on ONE polygon in one
    // beat. Without the owner the badge is handed two contradictory numbers
    // and has to guess which is its own.
    const e: GameEvent = {
      turn: 8, playerId: 2, type: "winds-shifted", cardId: "shifting-winds",
      targetFactionId: "beta", amount: 2, losses: { gamma: 2 },
    };
    const beat = mapBeats(presentEvents([e], ctxFor([e])))[0];
    expect(beat.badges).toEqual([
      { polygon: "beta", track: "disease", owner: "alpha", before: 1, after: 3 },
      { polygon: "beta", track: "disease", owner: "gamma", before: 5, after: 3 },
    ]);
  });

  it("a cause does not leak past the batch that carried it", () => {
    const fresh: GameEvent[] = [
      { turn: 4, playerId: 1, type: "play", cardId: "fortify", targetFactionId: "beta" },
      { turn: 4, playerId: 2, type: "draw", cardId: "raid" },
      { turn: 4, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1 },
    ];
    const beats = mapBeats(presentEvents(fresh, ctxFor(fresh)));
    // The heal after the unrelated draw is not "caused by" the local play,
    // so it is shown - with the no-cause label, not fortify's.
    expect(beats).toHaveLength(1);
    expect(beats[0].label).not.toContainEqual({ kind: "card", cardId: "fortify" });
  });

  it("a rival's declaration puts an arrow on the border with a sound, and yours does not", () => {
    const fresh: GameEvent[] = [
      {
        turn: 4, playerId: 3, type: "play", cardId: "raid",
        targetFactionId: "beta", sourceFactionId: "delta",
      },
      {
        turn: 4, playerId: 3, type: "march-declared", cardId: "raid",
        targetFactionId: "beta", sourceFactionId: "delta", marchId: 6,
        consequence: true,
      },
    ];
    const beats = mapBeats(presentEvents(fresh, ctxFor(fresh)));
    expect(beats).toHaveLength(1);
    expect(beats[0].polygon).toBe("beta");
    expect(beats[0].sound).toBe("march");
    expect(beats[0].label).toContainEqual({ kind: "card", cardId: "raid" });

    const mine = fresh.map((e) => ({ ...e, playerId: 1 }));
    expect(mapBeats(presentEvents(mine, ctxFor(mine)))).toEqual([]);
  });
});

describe("the hand's own motions", () => {
  const hand: [GameEventType, string][] = [
    ["draw", "draw"], ["play", "play"], ["reshuffle", "pulse"],
    ["harvest-picked", "reveal"],
  ];

  it("moves for the seat holding it and for nobody else", () => {
    for (const [type, motion] of hand) {
      const mine: GameEvent = { turn: 2, playerId: 1, type, cardId: "raid" };
      expect(presentEvents([mine], ctxFor([mine]))).toEqual([{
        kind: "hud", motion, cardId: "raid", sound: EVENT_SOUNDS[type],
      }]);
      const theirs: GameEvent = { ...mine, playerId: 2 };
      expect(presentEvents([theirs], ctxFor([theirs]))).toEqual([]);
    }
  });
});

describe("involvesLocalSeats", () => {
  it("answers for each seat of a two-seat game in its own terms", () => {
    // Host plays beta at seat 1, guest plays alpha at seat 2. One event, two
    // screens, and the answer is not the same on both.
    const host = view({ seats: new Set([1]), realm: new Set(["beta"]) });
    const guest = view({
      seats: new Set([2]), realm: new Set(["alpha"]),
      linked: new Set(["alpha"]),
      notice: notice({ humanFactionId: "alpha" }),
    });
    const atGuest: GameEvent = {
      turn: 5, playerId: 7, type: "healed", targetFactionId: "alpha", amount: 1,
    };
    expect(involvesLocalSeats(atGuest, presentCtxOf([atGuest], host))).toBe(false);
    expect(involvesLocalSeats(atGuest, presentCtxOf([atGuest], guest))).toBe(true);

    // A land the host has an arrow toward is the host's business and none of
    // the guest's.
    const linked: GameEvent = {
      turn: 5, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1,
    };
    expect(involvesLocalSeats(linked, presentCtxOf([linked], host))).toBe(true);
    expect(involvesLocalSeats(linked, presentCtxOf([linked], guest))).toBe(false);
  });

  it("frames a linked land itself, and not what that land then does elsewhere", () => {
    // `linked` holds gamma because gamma's arrow is aimed at us. Gamma's own
    // land is our business - what happens there changes what that arrow will
    // do. A raid gamma makes on a THIRD party is not: the beat would be drawn
    // on the land it names, which is one we have no relationship with at all,
    // and the camera would glide to a grey polygon for a fight between two
    // rivals.
    const atLinked: GameEvent = {
      turn: 5, playerId: 7, type: "healed", targetFactionId: "gamma", amount: 1,
    };
    expect(mapBeats(presentEvents([atLinked], ctxFor([atLinked])))).toHaveLength(1);

    const elsewhere: GameEvent = {
      turn: 5, playerId: 7, type: "march-resolved", cardId: "raid",
      targetFactionId: "delta", sourceFactionId: "gamma",
      amount: 1, incoming: 1, marchIds: [3],
    };
    expect(presentEvents([elsewhere], ctxFor([elsewhere]))).toEqual([]);
  });

  it("tells the lord that lost a vassal, whose land is no longer theirs", () => {
    // After the escape the vassal is out of the realm, so the land it names
    // is not the end that matters - the lord it left is.
    const e: GameEvent = {
      turn: 6, playerId: 4, type: "independence",
      targetFactionId: "delta", overlordFactionId: "beta",
    };
    const beats = mapBeats(presentEvents([e], ctxFor([e])));
    expect(beats).toHaveLength(1);
    expect(beats[0].polygon).toBe("delta");
    expect(beats[0].sound).toBe("door");
  });

  it("raises the question this screen owes about a land it took", () => {
    const fresh: GameEvent[] = [
      { turn: 7, playerId: 1, type: "play", cardId: "raid", targetFactionId: "delta" },
      {
        turn: 7, playerId: 1, type: "subjugated", targetFactionId: "delta",
        overlordFactionId: "beta", sourceFactionId: "beta", via: "conquest",
        cardId: "raid", consequence: true,
      },
    ];
    const beats = presentEvents(fresh, ctxFor(fresh));
    expect(beats).toContainEqual({ kind: "ask", polygon: "delta" });
    // A land handed over by a status asks nobody: nothing queues a transfer.
    const byStatus = fresh.map((e) =>
      e.type === "subjugated" ? { ...e, via: "passive" as const } : e);
    expect(presentEvents(byStatus, ctxFor(byStatus))
      .filter((b) => b.kind === "ask")).toEqual([]);
    // Nor does a conquest by a seat nobody at this screen sits in.
    const rival = fresh.map((e) => ({ ...e, playerId: 3, overlordFactionId: "alpha" }));
    expect(presentEvents(rival, ctxFor(rival))
      .filter((b) => b.kind === "ask")).toEqual([]);
  });
});

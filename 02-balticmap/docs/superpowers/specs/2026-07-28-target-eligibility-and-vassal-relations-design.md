# Balticmap: Target Eligibility and Vassal Relations

Date: 2026-07-28
Status: approved

## Goal

Fix targeted actions against subjugated factions so that a vassal keeps its
own pairwise Might and Status values. Also explain why nearby factions cannot
be targeted by a card, especially Subjugate.

## Political identity

Subjugation and incorporation use different identity rules:

- A subjugated faction remains a living political entity. It keeps its own
  pairwise Might and Status relationships and can be raided, courted,
  subjugated, or poached separately from its overlord.
- An incorporated faction is no longer an independent political entity. Its
  polygons resolve to the living faction that owns them.
- An overlord's map color on a vassal polygon is presentation only. It must
  never redirect a targeted action or relationship display to the overlord.

A Raid played against another faction's vassal therefore adds 1 Might from
the actor toward that vassal only. It does not change the actor's relationship
with the vassal's overlord.

## Central target eligibility

Target rules will be represented by one pure eligibility evaluator used by
gameplay and presentation. For a given actor, card, and candidate faction, it
returns one of:

- `available`: the action may target the candidate.
- `blocked`: the candidate is geographically relevant, but one or more rules
  prohibit the action.
- `irrelevant`: the candidate is outside the card's meaningful candidate set
  and should not be shown in the explanation.

The result includes structured reason codes and the values needed to explain
them. `validTargetsFor` becomes a projection of these results rather than a
separate rules implementation.

The same eligibility result must drive:

- card playability;
- target highlighting and click validation;
- AI target selection;
- card eligibility explanations.

This prevents the interface from describing different rules than the game
resolver enforces.

## Candidate identity resolution

Candidate polygons are resolved before eligibility evaluation:

1. If the polygon's faction is incorporated, use its living owner.
2. Otherwise use the polygon's own faction, even when that faction is
   subjugated.

Hover relationship values use the same identity. Hovering a vassal shows the
human-vassal relationship, while hovering an incorporated polygon shows the
human-owner relationship.

## Blocking reasons

The evaluator may return multiple blocking reasons for one candidate. The
initial reason set covers all current targeted-card rules:

- active alliance, including its expiry turn;
- insufficient Might and Status lead for Subjugate;
- candidate is already the actor's vassal;
- actor is subjugated and the card is prohibited;
- candidate is the actor's overlord where the card prohibits that target;
- candidate is incorporated;
- candidate is the actor;
- no required vassal relationship for Incorporate.

Reasons that make a faction geographically irrelevant, such as being outside
the actor realm's reach, are not displayed as candidate failures.

For Subjugate, the explanation includes:

- the required lead;
- the actor's current Might lead;
- the actor's current Status lead;
- the candidate's realm size when it scales the threshold.

Example:

```text
Semigallians
Need a Might or Status lead of 4 because their realm has 2 lands.
Current leads: Might 1, Status 0.

Curonians
Blocked by Alliance until turn 12.

Selonians
Available.
```

## Card interface

The existing card rules popup gains a `Potential targets` section for targeted
cards. It lists:

- geographically relevant available candidates;
- geographically relevant blocked candidates and all applicable reasons.

Faraway factions are omitted. The section is explanatory only and does not
change the existing click-to-arm interaction.

An unplayable targeted card must still expose its popup and candidate reasons,
even though playing it remains disabled. The implementation may separate the
visible card surface from its disabled play action so native disabled-button
behavior does not suppress inspection.

## Correctness fix

The Raid resolution path must preserve the selected living faction identity
from polygon click through card resolution and relationship display.
Territorial rendering may use an effective color faction, but targeting and
relations must not reuse that rendering identity.

The fix should remove or isolate any helper that ambiguously conflates:

- polygon faction;
- incorporated owner;
- vassal overlord;
- display color faction.

Each call site should request the specific identity it needs.

## Error handling

- A stale eligibility result is never trusted for resolution. `playCard`
  recomputes eligibility against current state.
- Multiple polygons resolving to one incorporated owner produce one candidate
  entry.
- If a faction is both out of reach and otherwise blocked, it remains
  irrelevant and is omitted.
- If multiple visible blocking rules apply, all are shown in stable priority
  order.
- Existing forced-card and discard rules continue to override ordinary card
  playability.

## Testing

Add focused automated coverage for:

- Raid against another overlord's vassal changes only the actor-vassal Might
  relation.
- The vassal's hover popup reflects the new value and the overlord's popup
  remains unchanged.
- A vassal polygon resolves to the vassal for targeting despite displaying its
  overlord's color.
- An incorporated polygon resolves to its living owner.
- Subjugate reports insufficient lead with current and required values.
- The required lead reflects the target realm size.
- An active alliance reports its expiry turn.
- Multiple blocking reasons are returned and displayed.
- Faraway factions are omitted from potential candidates.
- `validTargetsFor`, card playability, target highlighting, click validation,
  and AI selection agree with the centralized evaluator.
- An unplayable targeted card's explanations remain inspectable.

Run `npm test` and `npm run build`, then verify through the repository root
server at `http://127.0.0.1:4173/prototypes/`.

## Out of scope

- Changing the current Subjugate threshold or realm-size scaling.
- Treating a subjugated realm as one shared relationship tracker.
- Adding map labels for every blocked candidate.
- Redesigning the general card interaction beyond making explanations
  inspectable.

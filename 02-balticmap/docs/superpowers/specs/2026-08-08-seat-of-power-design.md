# Seat of power - a movable ruler's seat, and the wealth income cut

Status: accepted 2026-08-08.

## The card

**Seat of power** (`seat-of-power`) - targeted, 1 wealth, one copy per deck,
deck-buildable (pack pool), not secret, not forced. Rarity measured by the
full `npm run rarity` pass, never hand-tagged.

> Costs 1 wealth. Move your ruler's seat to a land you hold outright. Others
> need +2 more Might lead to subjugate you, and your raids on the seat's
> neighbours gain +1 Might. Only one seat stands at a time.

Playing it places (or moves) the actor's single seat onto one land of its
*directly-held* holdings: the actor's own land or a land it has incorporated -
`incorporatedRealmOf`, the same set `wealthIncomeFor` sums. Never a vassal's
land: a vassal acts on its own, and the seat is the owner's stake, not a
tenant's.

## Effects, precisely

- **+2 on the owner's subjugation bar.** "Threshold for might against enemy
  attacks" has exactly one home in the rules: the Subjugate lead check. The
  bonus is a new `seat` term in `GripParts`, so the map badge denominator, the
  hover itemisation, the `insufficient-lead` payload and the AI's `threatsTo`
  all follow from the one computation. It is a separate field, not a silent
  addition to `might`: `trackBlock` used to recover the base by subtraction,
  which a hidden term would corrupt.
- **+1 Might on the owner's raids against neighbours of the seat land.**
  Chosen direction: an *attack* rider, not a defence of the neighbours. The
  bonus applies when the raid target is adjacent to the seat land, adjacency
  resolved through `incorporated` the way `borderStrength` resolves it. It is
  added inside `raidGainFor` - the one call the card tip, the map preview, the
  AI and the resolution share - **after** the omen multiplier: a flat +1 the
  seat pays on top, not a term readings double.
- **One seat per faction, every faction.** AI factions play the card too;
  replaying it moves the seat. `seats` is a `Record<ownerFactionId, landId>`.
  A land id is the polygon's own permanent id (the tribe that founded it), so
  a realm of many polygons addresses each one individually, incorporated lands
  included.
- **The seat is lost, not relocated,** when the seat land leaves the owner's
  direct holdings or the owner becomes a vassal. A swept seat emits a
  `seat-lost` event so the log agrees with the vanished marker. While the
  owner has an overlord the card is unplayable - a seat that would lapse on
  the next sweep is a dead play, and the block reason says so.
- Reads go through `seatOf(view, factionId)`, the `respiteExpiry` idiom: a
  stale entry is inert by construction, the sweep only reports.

Not a timed status - the seat is permanent until moved or lost, so
`src/timed.ts` keeps its two consumers.

## The wealth income cut

Decided in the same discussion: the card should cost roughly a turn's income,
and income was cut rather than the cost raised. `wealthIncomeFor` drops the
free per-land coin:

- before: one coin per land of the incorporated realm, plus one per founded
  settlement (`sum(1 + founded)`), so a grown realm printed 4-6 a turn;
- after: **1 + founded settlements** across the incorporated realm. A fresh
  faction earns exactly 1 a turn; only founding settlements raises it.

Annexation no longer prints money - size buys tempo through the garrison
tick, not coins. Vassal tribute is untouched and still pays the lord on top;
with thinner treasuries more of it arrives as Might, which is the harsher
vassalage the cut accepts.

## Events and notices

Two new event types:

- `seat-moved` - consequence of the play, nests under it. Silent in
  `NOTICE_RULES`: like `settled`, it changes a bar the map marker and tooltip
  already show, never a lead.
- `seat-lost` - emitted by the `beginTurn` sweep, nests under nothing and
  stays out of `.log-mine` (a clock tick, like a pact lapsing). Modal, and
  critical for the human owner - the seat is a thing the player HOLDS, and
  its loss must pierce a muted round.

Neither carries `amount`: the raid rider's +1 lives inside Raid's existing
`amount = gain`, so the standings walk needs no new case.

## Showing it

Every active seat renders - the card is public, so the map says who sits
where:

- one keep silhouette per seat (a shape, deliberately not another circle, so
  it never reads as a settlement dot), in a `seatGroup` layer above
  settlements, below badges, `pointer-events: none`;
- the player's seat in gold with a dark casing; a rival's in the *owner's*
  colour with the same casing - on an annexed land the casing is what keeps
  it legible over a fill already in the owner's colour, and owner-colour is
  what makes a seat planted on conquered land read as the conqueror's;
- markers render at full opacity always, like the threat badges and unlike
  the vassal stripes - synced to a dimmed rival land the marker vanished at
  map rest, which contradicted "the map says who sits where" (seen in the
  first browser pass); redraw per `refresh()` like threat badges;
- hover on the seat land says whose ruler's seat it holds, as segments; the
  subjugation breakdown itemises "+2 ruler's seat".

## The gate

The 2026-08-02 raid Status rider was rejected on the `competent-full-deck`
pacing band (median first subjugation 9 against 22..55). This card touches
the same nerve twice - a raid bonus and a bar bonus - so the pacing bands and
`npm run balance` are the acceptance test, not a formality. The levers, if
the gate breaks: `SEAT_RAID_BONUS`, `SEAT_BAR_BONUS`, and the AI's placement
policy. Numbers go back to the discussion before any silent retune.

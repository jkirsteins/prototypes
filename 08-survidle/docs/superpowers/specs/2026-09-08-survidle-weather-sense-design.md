# Survidle: reading the weather, and what to do when it turns

A storm gives one hour's warning, and the only answer to it is to walk
home. This changes that: a survivor can learn to read the sky, and a
survivor caught out can light a fire and get a roof over their head where
they stand.

## What the code does today, surveyed at 87cf39c

A storm rolls in on a daily chance by season (`STORM_CHANCE`: winter 0.08,
spring and autumn 0.04, summer 0.02). It starts 60 to 180 minutes after the
roll and runs **6 to 19 hours** (`360 + rng.int(721)` minutes). While it
blows, precipitation is heavy and felt temperature drops 6 C
(`src/sim/player.ts`).

`stormComing` is true for exactly the hour before it starts, and that hour
is the whole warning. `stormStep` in `src/sim/body.ts` answers it: walk to
camp "before the storm", light the fire if the pit allows, feed it to
`SPREAD_FUEL_KG` with dry wood, and rest until it passes. With no camp
(`campCell === null`) it returns null and the survivor gets the notice "The
storm is coming, and {you} {have} no shelter within reach."

Nothing else is possible, because two things are camp-only. `light` is
behind `needCamp` and `fireStep` requires the camp site's `firePit`, so a
fire drill in the pack is inert anywhere but home. And the only
shelter-shaped verb away from camp is `makeCamp`, which moves the whole camp
rather than raising anything temporary.

### The measurements that shape this work

Every spot in a region is 4 to 28 minutes' walk from its camp, and a region
is about 4.2 km across. **So an hour is already comfortable for walking
home, and lengthening the warning does not change that decision.**

What a storm actually costs is fuel, and fuel depends on a roof, because
heavy rain on an unroofed fire doubles its burn (`burnPerHour`):

| | 6 h storm | 19 h storm |
|---|---|---|
| No roof | 36 kg | 114 kg |
| Lean-to | 18 kg | 57 kg |
| Turf hut | 7 kg | 23 kg |
| Cabin | 5 kg | 15 kg |

At -10 C, unroofed, 19 hours: 171 kg. The fire holds `FIRE_MAX_KG` = 36 kg
at once, so a long storm has to be fed through.

And an hour buys very different things depending on what is already down.
Splitting is 15 minutes a log for 20 kg, so an hour of splitting is 80 kg
and covers almost any storm - but felling is 55 minutes for four logs and no
burnable wood at all, and deadwood without an axe is `DEADWOOD_KG` = 10 kg
an hour. **No plausible warning length lets a survivor build a roof or lay
in 60 kg from nothing.** The warning is not the binding constraint; having a
roof and a woodpile before the storm is.

That is why this spec does not simply lengthen the hour. Foresight is only
worth having if running home is not the only thing it can buy.

## Decisions taken by the author

- **Foresight buys the choice to stay out.** A warning becomes a real
  decision - run for it, or dig in here - which requires that digging in be
  possible. Passed over: more minutes of the same errand, which only ever
  means starting the same walk sooner.
- **Every route to weather sense is wanted**: a skill that levels with use,
  storms actually survived, a deliberate act of reading the sky, and a
  quirk landed with. They stack rather than compete.
- **Being caught out kills only when it compounds.** A storm alone stays a
  hard night. Wet, cold, hungry and stormbound together should be able to
  end a run. Passed over: making the storm itself lethal, which would put
  the danger in the weather rather than in the survivor's choices.

## The design

### 1. A fire where you stand

`light` stops being camp-only. A survivor with a drill, tinder and a kilo of
dry wood can light a fire on any passable land cell.

What separates it from the camp's fire is that it is **nobody's home**:

- It needs no fire pit. Bare ground is enough, which is what a fire site
  already is - `firePit` costs 20 minutes and no materials, and exists to
  make a camp's fire permanent, not to make fire possible.
- It burns only while it is fed by hand. `autoFeed` reaches the camp's
  woodpile; a fire out on the heath has only what is in the pack.
- It dies when the survivor leaves the cell. No unattended clock, no
  embers kept overnight, no `litSince` and so no contribution to the
  fire-keeping goals. Those measure a hearth kept, and this is not one.
- It is not stored on the region. One fire per region remains true of
  *camp* fires; this one lives on the player, cleared on leaving.

This is the smallest change that fixes the fiction at its break point: a
fire is a thing you make, not a property of a place.

**Open question for the author.** Whether a fire out in the open should
be allowed to boil, cook or dry anything, or only to warm. Warming only is
the smaller change and keeps every cooking rule at the camp; allowing
cooking makes a hunting trip self-sufficient and is a bigger question about
whether camps still matter.

### 2. The rough shelter

A **bivouac**: a lean-to of deadfall and boughs thrown up where the survivor
stands. Distinct from every existing structure in that it belongs to nobody
and keeps nothing.

- Materials off the ground, no axe and no cordage - the point is that it can
  be built in a hurry with what is underfoot. Sticks alone.
- Roughly **45 minutes**, against the lean-to's 240. The reasoning: this is
  the emergency shelter of the handbooks rather than a built one, and the
  bough bed is already 30 minutes for 12 sticks. **The author should confirm
  the figure against the Swedish handbook and Kochanski before it ships** -
  the repo's standing rule is that a number comes from a real source, and
  this one is currently reasoned by analogy rather than read off a page.
- It counts as a roof: it feeds `roofed`, `shelterBonus` and `sheltered`
  exactly as a lean-to does, which after the camp-siting work already means
  "the site under the survivor's feet". So it halves a storm's fuel burn
  and keeps the rain off.
- It rots fast - days, not seasons - and is not mended. Coming back to a
  week-old bivouac should find nothing.
- It is **not** a camp. No pile, no rack, no orders, and it never becomes
  `campCell`. A region still has one camp.

Together these two make a storm caught out into a genuine fork: 45 minutes
of shelter plus a hand-fed fire, or 28 minutes of walking in heavy rain.

### 3. Reading the weather

All four routes, stacking:

- **Wayfinding levels it.** Reading the country already belongs to that
  skill, and reading the sky is the same act. **This is a decision worth
  challenging**: the alternative is an eighth skill, which is more legible
  but costs the idle curve a full set of jobs, grinds and keeps per the
  curve spec. Folding it into wayfinding is the cheaper and, I think,
  truer answer - but say so if you want weather to stand on its own.
- **Storms survived teach.** A counter on the life record: each storm lived
  through - not merely rolled, but blowing while the survivor was alive -
  lengthens the warning. This is the one route that cannot be ground; it
  needs weather to actually happen to you.
- **Reading the sky is an act.** A task costing minutes that buys a
  forecast now: what is coming, and roughly when. It reads better the higher
  wayfinding is, and it can be given as a standing order so a careful player
  checks each morning.
- **A weather eye is a quirk.** A sixth entry beside `coastBorn`,
  `forestBorn`, `sleepsLight`, `bigEater` and `steadyByTheFire`, granting
  the base warning a free step. It should clash with nothing.

**What the warning says** grows in three stages, so that skill changes the
*kind* of information and not only the number of minutes:

1. **That it is coming.** Today's hour, from nothing.
2. **When, and how hard.** Enough to judge whether the woodpile will do.
3. **How long.** The difference between a 6-hour blow and a 19-hour one is
   the difference between 20 kg and 100, and knowing it is what turns
   weather into a plan rather than an alarm.

The exact minutes per stage are the author's to set, and should come from
what the fuel table above makes meaningful rather than from round numbers.

### 4. When it compounds

The stack is largely already modelled and should be used rather than
replaced. Wetness costs 0.15 C of felt temperature per point, starvation up
to 4 C, a storm 6 C; warmth under 20 drains health at 6 an hour, and
`causeFrom` already names cold as a death. A soaked, starving survivor
stormbound in the open is therefore already in trouble.

What this spec adds is only what is missing: **wind on a wet body**. A storm
should drive wetness up faster on a survivor with no roof over them, so that
the difference between a bivouac and no bivouac is not just fuel but how
fast the body gets soaked. That single change makes being caught out
dangerous through the existing stack rather than through a new rule.

No new death cause. No storm-specific health drain.

## Not in scope

- Lengthening the plain one-hour warning as a fix on its own. The
  measurements say it is not the constraint.
- Any change to the camp's own fire, its embers, its keeping goals, or the
  one-camp-per-region rule.
- Weather beyond storms - the seasonal model, precipitation and ice are
  untouched.
- A second hearth, a second pile, or anything that makes a bivouac
  gradually become a camp.

## Testing

- A fire lights on open ground with a drill and dry wood, and no fire pit.
- That fire dies on leaving the cell, keeps no embers, and credits no
  fire-keeping goal.
- A bivouac raised away from camp feeds `roofed`, `shelterBonus` and
  `sheltered`, halves the storm burn rate, and is not the camp.
- A bivouac rots on its own clock and is gone when its days are up.
- The warning lengthens with wayfinding, with storms survived, and with the
  quirk, and the three stack without any one of them being able to skip a
  stage.
- Reading the sky costs its minutes and returns a forecast whose detail
  matches the reader's level.
- A soaked, starving survivor caught in the open dies; the same survivor
  under a bivouac with a fed fire lives.
- A survivor with a camp in reach still walks home - the fork must not make
  digging in the default when home is 10 minutes away.

## Gates

`stormStep` currently walks everyone home, so giving the runner a second
option will move the reference player. Expect movement in `reference` and
`year`, and read it rather than tuning it: a runner that digs in when it
should have walked is a policy bug, and a runner that walks when digging in
was right is the same bug mirrored. The standing rule holds - a gate
measures the sim, and no constant moves to restore a reading.

Seed 1 is the case to watch. It already regressed from day 29 to day 4 on
the camp-siting work because the reference player ranges too far on known
ground; a storm option that lets it stay out may make that better or much
worse, and either way it is the seed that will say so first.

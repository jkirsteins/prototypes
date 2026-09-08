# Roadmap additions

Items raised but not built, written here because the roadmap the specs cite
(`the roadmap's gate table`, `roadmap item B`) is not in this repo. Move them
into it when they meet.

## Burn scars

**Raised** 2026-09-08, during the seasonal colour pass.

Ground that has burned reads as burned: black at first, weathering to grey,
and eventually growing back. It is the one mark on the map the survivor makes
by living somewhere rather than by building something, and it would make a camp
you have kept for a season look like a camp you have kept for a season.

This is not part of the colour pass and was deliberately left out of it. A
colour is a rule about a cell the world already describes; a scar is a fact the
world has to remember, which means state, a cause, and a lifetime. Three
decisions before it can be specced, and none of them are mine to take:

**What burns.** The cheap version is only your own fire sites: a hearth
scorches the cell it sits on, and nothing else in the world ever burns. That is
one class on one cell, no new state beyond what `regionState` already keeps,
and it delivers most of the look - the camp you have lived at is ringed with
old fire. The expensive version is fire that spreads: a lit fire in dry weather
taking the ground around it, which is a hazard, a loss condition, and a reason
to site a camp carefully. The second is a mechanic, not a decoration, and it
would want its own spec.

**How long a scar lasts, and in what terms.** A fire site used for a week is
not a fire site used for a year, and the fade wants to be in days that mean
something rather than a number picked to look right - the same rule the rest of
this game's numbers hold to. Charcoal on a hearth outlasts the hearth; a burnt
meadow greens in a season. If the two differ, the scar is per terrain.

**Whether it survives a life.** Camps, knowledge and the journal all carry
between survivors in their own ways. An heir finding the ancestor's burnt hearth
is a good moment; an heir finding a map speckled with ninety years of soot is
not. Whatever the answer, it should be the same answer the dimmed journal
ground already gives, or a deliberately different one.

Once those are settled the drawing is small: a `scorched` class carrying a step
for age, excluded from marked cells the way every other conditional ground rule
in `style.css` is, plus a row in `scripts/map-shots.mjs` so the look is checked
with the rest.

## Seep: a low-effort water source read off the ground

**Raised** 2026-09-08, during the body-fat calibration pass.

A long walk with no vessel and no known water on the way is currently all or
nothing: the body drinks nothing until it reaches a real source, however
close the ground it is crossing gets to actually having some. The author's
ruling on a heir landing far from the old camp -
that a competent player routes around it, by camping anew or by drinking
along the way - assumes "drinking along the way" is actually available to
whoever or whatever is walking. Right now it is not; a walk crosses ground
that may well hold damp moss, a seep, a snow patch, without ever reading it
as water.

Seep would be that: a low-yield, low-effort water source read off the ground
itself rather than fetched from a mapped source or carried in a vessel -
enough to blunt a dry stretch, not enough to make carrying water pointless.
It would want its own small spec: what ground qualifies (damp/marsh cells,
snow in winter, a stream crossing not otherwise mapped), how much it gives
per minute spent at it, and whether the reference runner and the intent
runner reach for it automatically the way `autoDrink` already does for a
mapped source, since an heir walking home is exactly the case with no
standing order to reach for it by hand.

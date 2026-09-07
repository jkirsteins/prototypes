# Survidle: the list says what it is doing

From the guided playtest of 2026-09-07 (`docs/playtest-2026-09-07.md`).
One sentence in that record governs this item:

> "there is definitely something funny about the queue i dunno what that
> is, **i don't trust it**" [148]

He earned that across six incidents, and five of them are the same
fault seen from different sides: **the list acts, and does not say what
it did or why it did not.** A row reads `waiting` with no cause. A wait
says it is at camp while its step says it is walking. A gather order
completes and produces nothing. A click binds a camp with no question
asked. Clicking a row makes the thing under the pointer move.

None of that is the model being wrong. It is the model being silent.

## 1. What this item does not do

Two things in the report belong to other work, and saying so here keeps
them from being half-done:

- **Bug 1, clearing the queue stops a live sleep** [146, 147]. Its root
  cause is that the body tier is implicit and lives in three places:
  `serveBody` inside a runner intent (`src/sim/intent.ts`), `bodyAsks`
  called between orders by `runOrders` (`src/sim/orders.ts`), and a
  hard-coded collapse exception in `runIntent`. None of it is on the
  list, so `decideAgain`'s `setAside` and the `!st.orders.length` branch
  both cancel a sleep that no order asked for. The answer is to make the
  needs explicit orders, one per need, under a new **Physiology** group -
  which also answers finding 8 (the list is too constricting) and design
  question 3 (auto-eat during sleep). That is its own item. Patching
  `decideAgain` here would put a plaster over the thing the rework has to
  remove.
- **Finding 1's layout, and improvement 16.** Moving the Do list out of
  the stacked column is a restructure. This item fixes only the jump
  (section 6), which is a symptom of the layout and not the layout.

## 2. Bug 2 is already fixed, and here is the evidence

[235, 236] reported the filter typing as "SUPER laggy", and worsening
over the session. That is answered by two commits that landed after the
build under test (`694a7ab`) and are on main:

- **`62877f3`** - "a keystroke stops redrawing the game". At `694a7ab`
  the `input` listener in `src/main.ts` read:

  ```
  } else if (el.matches("[data-do=filter]")) {
    ui.filter = el.value;
    render();
  }
  ```

  Every keystroke rendered every panel, on top of the `requestAnimationFrame`
  loop that renders every frame anyway. Typing cost double a frame.
- **`2bda59e`** - one Do list. The advanced toggle governed a second,
  complete Do list rendered below the real one. Measured at `694a7ab`:
  the Do panel builds in 0.88 ms / 39633 chars with it off and 1.20 ms /
  43994 chars with it on, a 36% increase. Note **162** is where he found
  the toggle; note **235** is where he reported the lag.

The "grows over a session" half needs no leak to explain it. The
per-keystroke render redrew *every* panel, and a frame does get dearer
as a run goes on - the map fills in, and the Do list's far rows move
into near as skills rise. Measured: 82 rows at level 1, 95 at level 20.

What was ruled out, so nobody re-treads it: every panel builder is flat
against run length. Against one seeded run at days 1 / 31 / 91 / 181 /
271, warmed, per call: map 1.43 to 1.51 ms, Do 0.87 to 0.88 ms, task
0.00 to 0.35 ms, journal 0.03 ms throughout. The log is capped at 300
(`LOG_CAP`), life events are capped at 12 lines (`entry`), and every
listener is registered once on `document`. There is no unbounded state
behind this.

## 3. Every waiting row names its cause

**Findings 4 and 5; bugs 3 and 4.**

`ordersHtml` (`src/ui/panels.ts`) prints one bare word per non-live
order: `o.skipped || (met ? "met" : "waiting")`. `o.skipped` is written
only by the scheduler, and only for a row it actually refused. A row
that *could* run, and is simply not the one running, gets `""` and
therefore reads `waiting` with no cause at all.

That is the general case, and it swallows bug 3. `orderByHand`
(`src/sim/ladder.ts`) starts a once order on the click only when no
*hand* order is live; otherwise it queues the new one at `liveHand + 1`
and returns. The row then reads `waiting`. The second click lands after
the first hand order has ended, finds `liveHand < 0`, and starts. Two
independent reproductions [134, 152], one mechanism, and **the daylight
theory [153, 154] is not it**: `check` never refuses work for want of
light (`darkNote` states a price, not a reason), and `nightSkip` gates
the runner only.

### The rule

A new `waitingLine(state, world, cal, o, judged)` in `src/sim/orders.ts`
returns the second line for a non-live row, from the judgement
`judgeOrders` already computes:

| The row | Reads |
| --- | --- |
| Refused by the scheduler | its `o.skipped`, as now |
| Asking for nothing | `met`, as now |
| Held under a once order that cannot run | `held up by "<that order's sentence>"` |
| Able to run, but not the chosen one | `waiting its turn, behind "<the running order's sentence>"` |
| Able to run, nothing running | `waiting its turn` |

`judgeOrders` is run once per render and its result passed down, not
called per row.

The third case is the one worth naming: it is finding 8's textbook
complaint - "a blocked head stops everything behind it" [242] - and
today nothing on screen says that is what is happening.

### Two smaller faults in the same place

- **`Waiting at camp`** is composed as a fixed string with the wait
  intent's step appended (`panels.ts`), and that step includes the body
  tier's walks. Hence "Waiting at camp: walking to camp" [128, 129, 150].
  The header reads the intent's actual cell instead: at camp it says so,
  elsewhere it names where.
- **`orderByHand` discards `startIntent`'s `false`.** A once order whose
  check fails at the target cell is left on the list with nothing said.
  It logs the reason, so the click is never silent.

## 4. A yield that lands on the ground says so

**Bug 6, finding 9.**

`produce` (`src/sim/inventory.ts`) puts a yield in the pack when it fits
under `packComfortableKg`, and otherwise into the pile on the ground
where the work happened - silently. So a gather order ran, walked home,
and delivered nothing [245], and he inferred the cause rather than
reading it. The hunt path already says this ("more than {you} can carry;
it lies where it fell", `tasks.ts`); nothing else does.

`produce` logs when a yield is diverted **away from camp**, naming the
item and that it lies where it fell. At camp it stays quiet: the pile at
the camp cell is the camp store, and landing there is not a loss.

## 5. Make camp asks first, and says which camp you have

**Bug 5. One camp per region is the intended rule and stays.**

`campCell` is per region state, so a click in a second region makes a
second camp rather than moving the first. He did it without meaning to
[223, 224], immediately after learning siting is worth 5 km of walking
[220, 221], and could not tell afterwards which camp was his.

The row gets a confirm step, the way `abandon` already has one: the
first click asks, and names the camp this region already holds and where
it stands. Nothing else about camps changes.

## 6. The clicked row stays under the pointer

**Bug 8.**

Panels are morphed, not reassigned, so this is not innerHTML churn. The
Orders list lives in `#task` at the top of the right-hand column, and
the Do list lives in `#actions` further down the *same* `.col`, which is
the scrolling element. Giving an order grows `#task`, and everything
below it slides.

After a click that renders, the clicked element's viewport position is
measured before and after, and the enclosing `.col`'s `scrollTop` is
adjusted by the difference. The row a player clicked does not move under
their hand. This is a symptom fix and says so: the cause is the layout,
and the layout is improvement 16.

## 7. The concepts a row answers to become visible

**Finding 7, and improvements 12 and 13.**

`VOCABULARY` in `src/ui/dopanel.ts` already maps eleven concepts onto
the rows that serve them - `food` covers hunt, fish, cook, berries,
eggs, roots, inner bark, seaweed, sap, the snares and the drying rack.
Its own comment says: *"The words are never rendered."*

So the game already knew the answer to "everything makes sense but there
are no eggs, no nothing i can click" [254], and kept it invisible. He
did not know roots were food, though the row says so in its last two
words [257]; he did not know cooking existed until he searched for it
[268]. The route existed and nothing pointed at it.

### The rule

- Each `VOCABULARY` entry gains an explicit `name` - the concept's own
  word, rather than the first of its search words by convention.
- A Do row renders its concepts as small tags: `Dig roots [food]
  [water]`, `Light the fire [fire] [warmth] [firepit]`. All eleven
  concepts, every row they name. A row no concept names shows no tags,
  which is most rows and is not a fault.
- A tag is a button. Clicking it sets the filter to `kw:<name>`.
- **`kw:` is an exact concept match, not a substring one.** `kw:food` is
  every row the food concept names and nothing else - so it cannot drag
  in a row whose detail line happens to contain the letters. A plain
  typed word keeps the existing three-tier ranking (name, then lines,
  then keywords) untouched.
- Under a `kw:` filter the panel shows one list under the concept's
  word, with no "also answers to" section: there is no weaker tier to
  separate out.

This is improvement 13's one-click category filter reached through the
rows themselves rather than a separate control bar, and improvement 12's
categories in text rather than icons. His objection at [89] was to
typing, not to filtering - and the filter is what rescued him twice
[219, 268].

## 8. Testing

Failing test first for each:

| Test | Holds |
| --- | --- |
| `orders` | a row behind the running order names it; a row under a stalled once order says it is held up |
| `panels` | a wait away from camp does not claim to be at camp |
| `ladder` | a once order that cannot start logs why instead of sitting silent |
| `inventory` | a yield diverted away from camp logs; one diverted at camp does not |
| `camp` | the first Make camp click asks and changes no `campCell` |
| `dopanel` | every row a concept names renders that concept's tag |
| `dopanel` | `kw:food` matches by concept, and not a row that merely spells "food" |

Then `npm test`, `npm run lint`, `tsc --noEmit`, and a Chrome pass on
the built bundle.

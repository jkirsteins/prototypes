# Survidle: the UI overhaul

A tester played for an hour and a half, died once, survived the second
time, and finished with this:

> "super interesting game, but beyond the ui nuisances, **i would really
> want to try playing this**" [274]

The tense is the whole brief. After two hours he does not feel he has
played it yet. Everything in this document is aimed at that sentence and
nothing else. The record is `docs/playtest-2026-09-07.md`; every claim
here carries its note number.

## 1. The principle

Put to him afterwards that the lesson was to give players goals and
explain how to meet them, he refused it [278, 279]:

> "not necessarily in-game goals. It's just realizing all the things that
> are actions so to speak"
> "**discovering it is half the fun**"
> "and it's somewhat obscured in a long list of skills/actions"
> "**which is the bad part so to speak**"

**Discoverability, not instruction.** Having to work the fire out was
never the problem - he calls it intriguing in the same breath. The
problem is that the action space is obscured in a long list. Making the
list scannable preserves the "oh shit, I can build a fire?" moment.
Explaining how to build a fire destroys it.

Every decision below is checked against that line. Where a change would
teach the answer rather than reveal the question, it is out of this pass.

## 2. The information hierarchy

One rule decides where anything goes, and it is the only rule this pass
adds:

| Column | Holds | Test |
| --- | --- | --- |
| **Left** | Info | You, your camp, what is coming. Read-only. |
| **Middle** | Interactive | The map you click, the work you can stop, the list you choose from. |
| **Right** | The queue | What runs while you are not looking. Nothing else. |

The left column is read-only **except where a control only changes what
is being read** - the away slider, and nothing else. That exception is
written here so a later change has to argue with it rather than drift
past it.

## 3. The board

### Before

Three columns, and a 420px right column stacking seven panels: Doing,
Ahead, the away dial, Log, Do, Pack, Journal. The Do list - the thing a
player acts through - is the sixth item down, inside a nested scroll
region. He scrolled the main column offscreen and could not get back
[74], which hid his own queue from him and left him unable to tell he
was asleep [69, 72, 73].

### After

```
LEFT (info)          MIDDLE (interactive)        RIGHT (queue)
-----------          --------------------        -------------
Anu - body bars      Clock                       Orders
Camp                 Map  (tooltip, walk)          1. Pick lingon
Worn                 Doing (bar, then-step)           waiting until first light
Skills               Tabs: Do Log Pack Journal   2. Split logs
If you leave for..     Do: subtabs + split          waiting for dry weather
```

`index.html` changes shape accordingly. The right column narrows - Orders
alone does not need 420px - and the width goes to the middle, where the
Do split lives.

## 4. The tab container

The HERE panel is **deleted**. Its box becomes a tab container holding
**Do, Log, Pack, Journal**, which leave the right column.

Tabs are the only new navigation. The Do tab carries subtabs; the other
three do not.

### Why HERE dies

HERE is a *region* panel: `regionAt(world, id)` and
`regionState(state, world, id)`, describing 16.5 km². The map is *cells*,
300 m each. Only two of HERE's lines are per-cell (the named spots and
the piles). The rest - land composition, `9960 trees worth felling`, the
animal roster, the fish, the water line - is region-level and would print
identically on every glyph.

Worse, most of it is the Do list rendered a second time in a second
vocabulary:

| HERE said | A Do row already said |
| --- | --- |
| `trees 9960 worth felling` | **Fell a tree** - "50 min; 4 logs and 4 sticks" |
| `animals Game: roe deer many, elk many` | the **Hunt** subtab, one row per species |
| `Fish: perch many, pike many` | the Hunt subtab, one row per fish |
| `water: iced over; an axe opens an ice hole` | **Camp > Water** - Open an ice hole, Melt snow |
| `built: fire site, bough bed` | the **Build** subtab, those rows done |

Finding 7 is that seam. He stood in a region the panel described as thick
with hare, roe deer, elk and perch and said:

> "everything makes sense but there are no eggs, no nothing i can click"
> [254]

The prose advertised food the rows did not offer, in different words, in
a different place. **The rows become the only inventory of what this
ground offers.** That is the largest single cut of redundant text in this
pass, and it is what makes the two agree - by leaving one of them.

## 5. The Do tab

### Subtabs

The five existing groups: **Gather, Hunt, Camp, Make, Build**. One
change - `makeCamp` moves from Camp to Build, under a Site group. It is
siting, not chores, and it was the only orphan.

### The split

Inside a subtab, a vertical split: **purpose groups on the left, items on
the right.** Choosing a purpose filters the item pane. This is note 203 -
"show me the food" - made structural. He was lukewarm on the *typed*
filter [89] but it rescued him twice [219, 268]; the objection was to
typing, not to filtering.

Opening a row expands it **in the item pane**, not in the list, which is
why this layout also disposes of "it moves under the pointer" [140].

### The purpose groups

| Subtab | Groups |
| --- | --- |
| Gather | Fuel, Food, Material |
| Hunt | Food, Traps, Scout |
| Camp | Fire, Fuel, Food, Water, Rest, Tools |
| Make | Fire, Tools, Hunting, Clothing, Water |
| Build | Site, Fire, Shelter, Water, Food |

Camp is the one that mattered: 26 rows covering cooking, water, fire,
tools and rest under one heading. It becomes six groups of four or five.

Assignments, keyed the way `VOCABULARY` in `dopanel.ts` already keys
rows (a task id, or `craft:<recipe>` / `build:<structure>`):

- **Gather** - Fuel: chop, deadwood, sticks. Food: berries, eggs, roots,
  seaweed, innerBark, tapSap. Material: bark, stone.
- **Hunt** - Food: hunt (any and each species), fish (any and each
  species), emptyTrap. Traps: setTrap. Scout: read.
- **Camp** - Fire: light, lightIndoors, lightTorch. Fuel: split,
  splitWedges. Food: cook (each), hang, crack, grindBark. Water: melt,
  thaw, fill (each), iceHole. Rest: night, rest, sleep. Tools: repair,
  sharpen, hone.
- **Make** - Fire: fireDrill, torch. Tools: knife, flakedAxe, stoneAxe,
  whetstone, wedges, needle, cordage. Hunting: bow, arrows, fishingSpear,
  snare, basketTrap. Clothing: hideCoat, hideTrousers, hideBoots, furHat,
  furMittens, hideBlanket. Water: barkBucket, waterskin.
- **Build** - Site: makeCamp. Fire: firePit. Shelter: leanTo, cabin,
  turfHut, snowShelter, boughBed. Water: seep, waterStore. Food:
  dryingRack, snare.

**A row belongs to exactly one group**, chosen by its primary yield. Inner
bark is food and cordage stock; it is filed under Food, because that is
what a player wants it for first. Bark is Material.

**A coverage test enforces this**, in the manner of `02-balticmap`'s
`POLICY_COVERAGE`: every row every subtab can produce has exactly one
purpose, and every purpose has at least one row. A row added later with
no purpose fails the suite rather than landing in no pane. Prose did not
work for the AI policy and will not work here.

### The Do row

Today a row prints label, a recommended note, `50 min (50 s); 4 logs and
4 sticks left on the ground`, a mastery bar and, for a producer, what it
gives. He said plainly that he did not understand some of it.

**A row you can do says its name and its duration. A row you cannot says
why.** The prose detail moves into the row's `more` expansion - still
findable, out of the scan. Two things stay visible:

- **The mastery bar**, which is a bar and not text.
- **The producer line** ("this works while you don't"), which is the only
  thing on screen that says the game is idle.

And a blocked row must say **what it needs**, not merely that it is
blocked - he inferred the fire drill from greyed-out buttons, with a
question mark: "they're all disabled. I need a fire drill?" [218].

### Eating must not be tab-dependent

`instantHtml` - eat, drink, add firewood - sits at the top of the Do
panel today. Left where it is, it would vanish the moment a player opened
the Log or Pack tab, which is a regression on a control that answers a
body's need.

It moves into **the Doing box** in the middle. That satisfies improvement
19 ("put controls beside what they govern" [166, 227]) in the only way
the hierarchy allows - the food bar is in the info column and cannot take
a button - and it puts an immediate act in the band that is about right
now. It is permanent, whatever tab is open.

### The advanced panel goes

`actionsHtml` behind the `advanced: on` toggle is an older Do panel with
its own tabs - gather, hunt, camp, craft, build, move - listing raw tasks.
A second, hidden, differently-grouped action list is precisely the
redundancy this pass exists to remove, and it becomes absurd once the
real tabs arrive.

It is deleted, on one condition the coverage test in section 5 already
enforces: **every task it exposes must be reachable from the new split.**
If a task is only reachable there, it has no purpose group, and the test
fails rather than the task silently disappearing.

## 6. The map

It gets a job. Across two runs he found no use for it [210], and when
told it was not meant to be flavour he answered: "well then the map could
definitely benefit from interaction" [211].

### The tooltip

A **translucent tooltip**, hover on desktop, tap on touch, carrying what
is genuinely under the pointer:

- the terrain, and at coarse zoom the block's composition
- the distance and the walk time
- the spot's name, if the cell is one
- what is lying there
- the marks: fire, camp, trap, seep
- **the as-a-camp site report** - the siting lever he never knew existed,
  which cost him a 2.4 km each-way walk for sticks [220, 221]
- **the shore read** on water tiles - "perch along the reeds, pike in the
  deep water"

At the three closest zoom levels a glyph is one cell and the tooltip
describes that cell. Beyond them a glyph is a block, and it describes the
block. It always describes exactly what is under the pointer.

**The tooltip carries actions**, not only text: the walk button lives in
it. On touch it also carries a close button, so a tap can be undone
without walking somewhere.

### Travel

The travel button moves onto the map. A **stack of "go to <Region>"
buttons sits in a corner**, listing **neighbours only** - a short list
that matches the travel rule.

## 7. Doing, and the merged forecast

### Doing

Moves to the middle, between the map and the tabs, with a permanent
prominent progress bar. This is improvement 17, and his reason for
wanting it is worth keeping in mind: progress bars are "satisfying to
watch" [81]. He was not only confused; he liked them.

It carries **the next step as well as the current one**. One order runs
several steps - walk, work, walk back - so a bar finishing does not mean
the order is done [105, 141]. The "then:" line means a filling bar never
lies about what it stands for.

### If you leave for N hours

The Ahead panel and the away slider **become one control** in the middle,
under the map beside Doing.

`GAME_MINUTES_PER_REAL_SECOND = 1`, so eight real hours away is twenty
game days, and the slider's 1-24 range spans 2.5 to 60 game days. The
four fixed horizons - away, tonight, a week, a month - are redundant
against a control that already reaches further than a month. **One
horizon at a time, the slider's.**

The wording changes with it. He read "away up to 24 hours" as how long
the survivor *works* [135]. It becomes one sentence:

> **If you leave for 8 h** (20 days pass) - 10 of 10 die: cold, day 4

## 8. The Camp box

New, in the left column: fire lit or cold, fuel remaining, what is built,
what is lying at camp, and the **producer limits** - "the reason a camp
that makes its own food still runs out", which `CAPABILITIES` already
carries and nothing displays where it matters.

This is the one piece of HERE that could not go in a tooltip. Finding 3
is why:

> His fire went out and he found out by noticing [259].

Lighting the fire produced a delightful animation [252]; losing it
produced silence. **An idle game must be loudest when something the
player built stops.** State that critical cannot live behind a pointer.

## 9. The cheap tier

Small, unambiguous, and several are the same edit the layout pass makes
anyway.

1. **A log line when the body eats**, and when the fire goes out
   [101, 228, 259, 270, 271]. `auto-eat: on` was legible on screen the
   whole time he spent four notes unable to tell whether his survivor was
   eating; auto-eat then ate his whole meat stock while he slept. State
   is shown and events are not. This is the cheapest fix in the record.
2. **Name the cause on every `waiting` row.** `ui/panels.ts:391-393`
   prints one bare word - `skipped`, `met`, `waiting`. But cordage says
   "waiting until first light" [182], so the machinery exists and is
   applied inconsistently. Apply it everywhere. *This changes the words a
   row prints and nothing about how the queue behaves.*
3. **"missing 2 stone" while holding 4 stone** [180, 181] - the number is
   the recipe total and the word is wrong. Say what is missing, or rename
   it.
4. **Restore the Norwegian characters** [2, 9, 10]. There is currently
   zero non-ASCII in `src/` - verified, no files. "Bjorklia" should be
   "Bjørklia"; a plain `a` where `å` belongs is pronounced wrong by a
   native speaker.
5. **Per-item weights in the pack** [94, 95, 214], now in the Pack tab. A
   total with no breakdown cannot be reasoned about. Visible values, not
   hover - hover-only text is what hid the reroll for a whole run.
6. **Say what the landing kit is**, once, on the landing screen [208]. He
   was still guessing on his second life.
7. **Split the Dig roots detail line** [257, `tasks.ts:490`]. It does
   three unrelated jobs in one semicolon chain and produced three
   different misreadings - including his not knowing roots were food,
   though the line says so in its last two words.
8. **Make "next boat" say it rerolls**, in the button, not a `title=`
   [21, 193, 194]. He went a whole run and into the second without
   knowing he could reroll: "it makes total sense when you explain it,
   but i had no idea".
9. **A queued snare reads "snare"** [170] - a thing, not an act. "Make
   snare".
10. **The activity log runs newest-first** [96]; he expected newest-last
    and doubted himself rather than the log.

Superseded: `"Ahead"` → `"Looking ahead"` [42] folds into the merged
control's new wording in section 7.

## 10. Out of scope, and why

Named so the omissions are decisions rather than oversights.

- **The queue.** Postponed entire: bugs 1, 3, 4 and 8, and the design
  question of whether a blocked head halts the list [183, 242]. Bug 4 is
  already located - `panels.ts:377-379` composes `Waiting at camp` plus
  `: <step>`, so a walk step yields "Waiting at camp: walking" - and it
  keeps until the queue pass. Nothing here touches ordering,
  cancellation or blocking semantics.
- **Goals.** A short ladder naming what to achieve and never how - "Light
  a fire", not "gather sticks then cordage". Designed, deferred to its
  own pass. It must never grow a hint when the player is stuck; that is a
  tutorial wearing a goal's clothes, and it is the line at [279].
- **The intro flowchart** [276]. He asked for it *before* drawing that
  line. A flowchart showing the fire recipe teaches the answer; one
  showing that chains exist teaches the shape. It needs a two-message
  question to him and it is not needed to make this pass work.
- **The seven design questions for the author**, which are rules, not
  interface: per-task light and weather gates, auto-eat during sleep, the
  day-5 inheritance, the 2.4 km landing camp, refusing sleep.

Two things this pass fixes structurally rather than patching, and which
therefore need no entry above: **the nested scroll capture** [74] and
**the UI jumping on click** [140]. Both are consequences of the Do list
being a nested scroller in a stacked column with rows that expand in
place. Tabs plus a split pane remove the cause.

## 11. Identity, scroll and churn

The hardest requirement in this pass, and the one most likely to be
quietly broken by a later change. **Nothing a player is holding may be
taken away from them by a redraw.** Not a scroll position, not a caret,
not a button between mousedown and mouseup, not the row under the
pointer.

### What already guarantees this

`src/ui/render.ts` is not naive and this pass must not make it so:

- `setPanel` builds a panel's whole markup as a string and returns early
  when the string is unchanged. The cheapest redraw is the one that never
  happens.
- `morphChildren` walks the old children against the new, **moving,
  changing and dropping rather than replacing**. A node that survives a
  redraw is the same node, with the same scroll offset, focus and caret.
- `keyOf` names a node by its `id`, or by its sorted `data-*` attributes.
  A named node is found again wherever it moved to, so a row keeps its
  identity across an insertion above it.
- `morphAttrs` deliberately leaves `style` alone, because `src/ui/bars.ts`
  writes every bar's width straight onto the element each frame and the
  markup never mentions it.
- `tests/churn.test.ts` budgets how many times each panel may redraw over
  300 frames. A panel over budget is showing a value that moves faster
  than the panel has business redrawing, and that value belongs in a
  named fill instead.

### The trap this pass walks into

`keyOf` returns **null** for an element carrying neither an `id` nor a
`data-*`, and a null-keyed node is matched **by position**. Every
container this pass adds - the tab strip, the subtab strip, the purpose
pane, the item pane, the tooltip - is a plain layout div today's code
would not key. Position matching is fine for a static layout div and
wrong for anything whose siblings come and go.

And scroll offset is a **DOM property, not an attribute**. It is not in
the markup, so morphing cannot restore it. It survives if and only if the
scrolling element itself is never replaced.

### The rules

1. **Every structural container carries a stable `id`**, so `keyOf`
   names it: `#dotabs`, `#dosubs`, `#dopurposes`, `#doitems`, `#maptip`.
   None of them is ever replaced, only morphed.
2. **The item pane is the only scroll container in the Do tab**, and it
   is `#doitems`. Changing subtab or purpose changes which rows it holds;
   it does not change the pane. The pane element before and after must be
   the same node.
3. **All four tabs exist in the DOM at once.** Switching sets `hidden`
   on three of them. Rendering a tab on demand would destroy the other
   three and their scroll offsets, which is precisely the complaint - he
   scrolled the Do column offscreen and could not get back [74].
4. **A row keeps its key across every filter, purpose and subtab
   change.** Rows already carry `data-opt="intent:<id>:<arg>"`; that
   stays, and it is what lets a row survive its neighbours disappearing.
5. **The tooltip is one element, created once, never destroyed.** It is
   shown and hidden with `hidden` and moved by writing `style` directly -
   the exception `morphAttrs` already honours. **Its position must never
   enter the markup.** A pointer moves many times a second; a tooltip
   whose coordinates were in the panel string would change that string on
   every mousemove and put the map's redraw budget through the floor.
   Only its text morphs, and only when the cell under the pointer
   changes.
6. **The hovered cell is derived from pointer position, not from
   per-element enter and leave.** A glyph replaced under the pointer
   fires `enter`; a glyph detached under the pointer never fires `leave`.
   Deriving the hovered cell from where the pointer is, the way
   `02-balticmap` derives arrow hover, has no state to get stuck.
7. **`innerHTML` is assigned in exactly one place**, `setPanel`. A
   single hand-rolled `el.innerHTML = ...` reintroduces every problem
   above at once, and it is the kind of line that arrives in a hurry and
   is never noticed. The guard is a **test** that reads every file under
   `src/ui/` and fails on an assignment to `innerHTML` outside
   `render.ts` - the same shape as the churn budget, and certain, where a
   lint rule would depend on Biome carrying a restricted-syntax rule this
   repo has not established that it has. `main.ts`'s one existing
   assignment, the map legend written once at startup, is the single
   named exemption, and it is static markup.
8. **Tab, subtab and purpose selection live in `UiState`** and persist
   beside the folds, so a reload returns to the pane the player was in.

### The tests

`tests/churn.test.ts` gains budgets for the new panels and loses
`regionHtml`, which no longer exists. Two additions beyond a budget entry:

- **A pointer sweep.** Move the hovered cell across the map for 300
  frames and assert the map panel's redraw count is unchanged from a
  still pointer. This is the test that would catch tooltip coordinates
  leaking into the markup, which is the single most likely way rule 5
  gets broken.
- **An identity test**, new. Render the Do tab, switch subtab, switch
  purpose, type in the filter, switch back. Assert that `#doitems` is the
  same node throughout (`===`, not equal markup), and that a row present
  in the first and last render is the same node. Then set
  `#doitems.scrollTop`, redraw, and assert it held.

A structural container without a key, or a scroll container that is
replaced, fails the suite. This is the guard, not the prose - the prose
is here to say why it exists, so that whoever finds the test failing
knows what it is protecting rather than raising the budget.

### The browser pass

The tests cover node identity; they cannot see flicker. A browser pass
additionally confirms, by eye and at both widths:

- Sweeping the pointer across the map does not flicker the tooltip, and
  the tooltip never lingers on a cell the pointer has left.
- Scrolling the item pane, then letting the game run a minute, leaves the
  scroll where it was.
- Switching to Log and back leaves the Do tab where it was, at the same
  subtab, purpose and scroll position.
- Typing in the filter never loses the caret, and holding the mouse down
  on a row and releasing on it still counts as a click.

## 12. Browser pass rules

`docs/ux.md` gains, and every browser pass on this work checks:

- **The tooltip is verified visually**, at both widths, not merely
  present in the DOM. It is translucent and must stay legible over every
  terrain colour and both lighting states.
- **The tooltip works without a pointer.** At `390x844x3,mobile,touch`,
  a tap opens it, its actions are thumb-reachable, and its close button
  dismisses it without walking. A desktop window resized to 390 never
  trips `(hover: none)` and would pass a check that never ran.
- **The three-column rule holds:** nothing interactive in the left
  column except the away slider; nothing in the right column except
  Orders.
- **Nothing is taken away by a redraw** - the four checks at the end of
  section 11, which the identity tests cannot see.
- The existing rules stand: nothing off screen at 1440x900, a check-in
  above the fold, and every pass runs both widths and says so.

## 13. Traceability

`docs/playtest-2026-09-07.md` gains an appendix mapping every finding and
every proposed improvement to its status - addressed here, deferred to a
named pass, or discarded - and to the commit that did it. The record
above the appendix is not edited: it is what he said, and it stays what
he said.

# Rarity Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the 4px rarity band into a labelled tier-colour ribbon ("COMMON" / "RARE" / "EPIC") on the deck picker tiles and pack reveal cards, leaving the in-game hand band-only.

**Architecture:** `applyRarityBand` in `src/rarity-band.ts` grows a `{ labelled?: boolean }` option that stamps `data-rarity` and a `rarity-labelled` class; one CSS rule turns the existing `::after` band into a ribbon by reading `content: attr(data-rarity)`. No new data - the tier id is the display name, uppercased by CSS.

**Tech Stack:** Plain TypeScript + Vite, imperative DOM, vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-08-01-rarity-ribbon-design.md`

## Global Constraints

- `npm test` and `npm run build` must both pass before every commit.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- Verify in a browser before calling the work done. Run the dev server from the prototype directory (`cd 02-balticmap && npm run dev`); the page is at `http://127.0.0.1:5173/prototypes/02/`, not `/`. Stop the server when done.
- The deck picker's `grid-template-columns` / `grid-auto-rows` numbers in `src/style.css` are measured, not derived - re-measure with the spill snippet from `02-balticmap/CLAUDE.md` after any change that eats tile space.
- Read the text in every screenshot before moving on (dark-box text colour rule in `02-balticmap/CLAUDE.md`).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `labelled` option on `applyRarityBand` plus call-site wiring

**Files:**
- Modify: `src/rarity-band.ts`
- Modify: `src/deck-screen.ts:164` (pack card), `src/deck-screen.ts:206` (picker tile)
- Test: `tests/deck-screen.test.ts` (existing `describe("rarity band")` block at line 210)

**Interfaces:**
- Consumes: `ACQUIRABLE_CARDS`, `CARDS`, `RARITY_TIERS` from `src/cards.ts` (already imported by `src/rarity-band.ts`).
- Produces: `applyRarityBand(el: HTMLElement, cardId: string, opts?: { labelled?: boolean }): void`. When `labelled` is true and the card is acquirable, the element additionally gets `class="rarity-labelled"` and `data-rarity="<tier id>"` (e.g. `"common"`). Task 2's CSS relies on exactly those two hooks.

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("rarity band")` block in `tests/deck-screen.test.ts` (after the test ending at line 225):

```ts
  it("labels a pack-pool card with its tier when asked", () => {
    const el = document.createElement("div");
    const id = ACQUIRABLE_CARDS[0];
    applyRarityBand(el, id, { labelled: true });
    expect(el.classList.contains("rarity-labelled")).toBe(true);
    expect(el.dataset.rarity).toBe(CARDS[id].rarity);
  });

  it("stays band-only by default", () => {
    const el = document.createElement("div");
    applyRarityBand(el, ACQUIRABLE_CARDS[0]);
    expect(el.classList.contains("rarity-labelled")).toBe(false);
    expect(el.dataset.rarity).toBeUndefined();
  });

  it("never labels a card that never came from a pack", () => {
    const el = document.createElement("div");
    applyRarityBand(el, "grow-crops", { labelled: true });
    expect(el.classList.contains("rarity-labelled")).toBe(false);
    expect(el.dataset.rarity).toBeUndefined();
  });

  it("labels every picker tile that carries a band", () => {
    const { container, screen } = mount();
    screen.update(view({}));
    const tiles = [...container.querySelectorAll(".ds-deck .ds-card.rarity-band")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.classList.contains("rarity-labelled")).toBe(true);
      expect((tile as HTMLElement).dataset.rarity).toBeTruthy();
    }
  });
```

The last test reuses the file's existing `mount()` and `view()` helpers - copy the call shape from the test at line 200 (`screen.update(view({ knownCards: START }))`) if `view({})` needs arguments in the current file.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/deck-screen.test.ts`
Expected: the three unit tests fail (no `rarity-labelled` class, `dataset.rarity` undefined); the picker-tile test fails; the two pre-existing rarity-band tests still pass.

- [ ] **Step 3: Implement the option and wire the call sites**

In `src/rarity-band.ts`, replace the function (keep the doc comment, extend its last paragraph):

```ts
/** Paints a card element's tier band.
 *
 *  One helper rather than three call sites each reaching into RARITY_TIERS,
 *  for the reason CLAUDE.md records about `cardName` being written twice: a
 *  colour spelled in three files follows a rename in none of them. The colour
 *  travels as a custom property so `src/style.css` needs one rule for every
 *  tier, present and future.
 *
 *  A card outside the pack pool gets no band. Rarity says how a card is
 *  acquired, and Grow turnips, the tribute cards and Revolt are never drawn.
 *
 *  `labelled` grows the band into a ribbon naming the tier, for the two
 *  screens where rarity informs a decision - the deck picker and the pack
 *  reveal. The hand stays band-only. The tier id is the display text,
 *  uppercased by CSS, so a new tier needs no display-name field. */
export function applyRarityBand(
  el: HTMLElement,
  cardId: string,
  opts?: { labelled?: boolean },
): void {
  if (!ACQUIRABLE_CARDS.includes(cardId)) return;
  const tier = RARITY_TIERS.find((t) => t.id === CARDS[cardId]?.rarity);
  if (tier === undefined) return;
  el.classList.add("rarity-band");
  el.style.setProperty("--rarity", tier.colour);
  if (opts?.labelled) {
    el.classList.add("rarity-labelled");
    el.dataset.rarity = tier.id;
  }
}
```

In `src/deck-screen.ts`, both call sites gain the option:

```ts
applyRarityBand(el, r.id, { labelled: true });    // line 164, pack card
applyRarityBand(card, id, { labelled: true });    // line 206, picker tile
```

`src/hud.ts:1167` is untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/deck-screen.test.ts`
Expected: PASS, including the two pre-existing rarity-band tests.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 02-balticmap/src/rarity-band.ts 02-balticmap/src/deck-screen.ts 02-balticmap/tests/deck-screen.test.ts
git commit -m "feat(rarity): labelled option on applyRarityBand for picker and pack" -- 02-balticmap/src/rarity-band.ts 02-balticmap/src/deck-screen.ts 02-balticmap/tests/deck-screen.test.ts
```

(Trailer per Global Constraints.)

---

### Task 2: Ribbon CSS, padding, and the browser re-measure

**Files:**
- Modify: `src/style.css` - the `.rarity-band::after` rule (line 367), `.ds-card` padding (line 583), `.ds-pack-card` padding (line 1518), possibly `.ds-deck` `grid-auto-rows` (line 528)

**Interfaces:**
- Consumes: the `rarity-labelled` class and `data-rarity` attribute from Task 1, and the existing `--rarity` custom property.
- Produces: visual only - no exported names.

- [ ] **Step 1: Write the ribbon rule**

In `src/style.css`, directly under the existing `.rarity-band::after` rule (after line 375), add:

```css
/* The labelled ribbon: same element, grown to name its tier. content reads
   the data-rarity attribute applyRarityBand stamps, so the tier id is the
   display text and a new tier needs nothing here. Only the picker and the
   pack reveal are labelled; the hand keeps the 4px band above. White on
   every tier colour - all three are dark enough. */
.rarity-band.rarity-labelled::after {
  content: attr(data-rarity);
  height: auto;
  padding: 3px 0 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: #fff;
}
```

Then make room for it:

- `.ds-card` (line 583): `padding: 10px 10px 26px;` and update the comment above it - the bottom padding now clears the ~19px labelled ribbon, not a 4px band.
- `.ds-pack-card` (line 1518): `padding: 0.9rem 0.9rem 1.8rem;`

Do NOT touch `grid-auto-rows` yet - Step 3 measures whether it needs to move.

- [ ] **Step 2: Start the dev server and open the picker**

```bash
cd /Users/janis.kirsteins/Projects/prototypes/02-balticmap && npm run dev
```

Open `http://127.0.0.1:5173/prototypes/02/?screen=deck` in Chrome (claude-in-chrome MCP).

- [ ] **Step 3: Run the spill snippet and fix the row height if needed**

In the browser console (javascript_tool):

```js
[...document.querySelectorAll('.ds-deck .ds-card')]
  .map(c => [c.querySelector('.ds-card-name')?.textContent,
             c.scrollHeight - c.clientHeight])
  .filter(([, spill]) => spill > 0)
```

Expected: `[]`. If any card is listed, raise `grid-auto-rows` (line 528) by the largest spill plus a line of slack, re-run the snippet until empty, and update the measured-numbers comment at line 536-551 with the new measurement and why (the ribbon spent one text line).

- [ ] **Step 4: Read both screens**

Screenshot `?screen=deck` and `?screen=deck&xp=25&known=` (pack overlay; click a pack to reveal). Read the text in the screenshots: every acquirable tile shows its tier word in the ribbon, the word is legible on all three tier colours and on both the light picker tile and the dark pack card, Grow turnips filler tiles carry no ribbon, and no rules text is clipped mid-sentence.

- [ ] **Step 5: Check the hand is untouched**

Navigate to `http://127.0.0.1:5173/prototypes/02/?seed=7` (pick any deck tiles, choose lands, reach the map). Confirm hand cards show the thin 4px band with no text. Stop the dev server.

- [ ] **Step 6: Run the suite and build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit and push**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 02-balticmap/src/style.css
git commit -m "feat(rarity): grow the band into a labelled ribbon on picker and pack" -- 02-balticmap/src/style.css
git push
```

(Trailer per Global Constraints. The push closes out the whole feature - Task 1's commit rides along.)

# Baltic Map 1184 - Population and Cohesion - Design

Date: 2026-07-25
Status: Approved pending user review
Builds on: 2026-07-25-balticmap-1184-retheme-design.md

## Purpose

Attach population and political-cohesion data to the 15 lands so the future
game can distinguish raw population from usable power. Figures are deliberate
GAME ESTIMATES, not historical facts: anchored to the common ~150k-200k
estimate for Estonia around 1200 (we use 180k) and ~650,000 for the whole
map, rounded to the nearest 5,000. Display uses bands ("~45k") because finer
precision would be false.

## Core model

Two independent per-land scalars:

- **population** (integer, multiple of 5,000): people living in the polygon.
- **cohesion** ("low" | "medium" | "high"): how politically concentrated the
  land is. Population is NOT a resource pool; cohesion is what will later
  determine how much of it a faction can actually mobilize. Two lands with
  equal population play differently: Kursa (45k, high) out-mobilizes a
  fragmented giant like Aukstaitija (150k, low).

Distributing population across sub-land factions (Lietuva, Deltuva, Nalsia,
Upyte...) is deliberately deferred to the game spec's faction layer. The
"confidence" ratings from the estimate discussion stay out of the game data;
they may appear only as comments in the prepare-script config.

## The numbers

| Land | Population | Cohesion |
|------|-----------:|----------|
| Ravala | 30,000 | medium |
| Virumaa | 35,000 | medium |
| Jarvamaa | 25,000 | medium |
| Laanemaa-Saaremaa | 40,000 | medium |
| Ugandi-Sakala | 50,000 | medium |
| Livzeme | 20,000 | medium |
| Kursa | 45,000 | high |
| Zemgale-Selija | 45,000 | medium |
| Talava | 30,000 | high |
| Jersika | 35,000 | high |
| Pilsotas | 15,000 | medium |
| Zemaitija | 70,000 | low |
| Aukstaitija | 150,000 | low |
| Suduva | 30,000 | low |
| Dainava | 30,000 | low |
| **Total** | **650,000** | |

Rationale for cohesion tiers:
- high: Kursa (strong centres, comparatively cohesive), Talava (single
  chiefdom), Jersika (principality with a prince).
- medium: the five Estonian lands (organized elders per land, no
  unification), Livzeme (river-village confederations), Zemgale-Selija
  (cohesive Semigallians, but the polygon bundles the Selonians), Pilsotas
  (two small coastal lands).
- low: Zemaitija, Aukstaitija, Suduva, Dainava (rival lineages and
  competing local lands).

## Display

- **Panel** (on selection), between the peoples line and the flavor text,
  in the same muted style as the peoples line:
  - `Population: ~45k`
  - `Cohesion: high`
- **Tooltip** (on hover) becomes two lines rendered in one div using
  `white-space: pre-line`:
  - line 1: land name (as now)
  - line 2: `~45k - high cohesion` (same style as line 1 is acceptable)
- Band string is derived as `~<population/1000>k` (populations are multiples
  of 5,000, so e.g. 45000 -> `~45k`, 150000 -> `~150k`).

## Data model

`Region` (src/types.ts) gains:

```
population: number;               // multiple of 5000
cohesion: "low" | "medium" | "high";
```

Each LANDS entry in scripts/prepare-data.mjs gets the two fields, with a
config comment stating the figures are game estimates anchored to ~180k
Estonia / ~650k total. map.json is regenerated (committed as before).

A shared band-formatting helper lives in src/panel.ts (exported
`formatPopulation(population: number): string` returning `~45k` form) and is
used by both panel and tooltip call sites; main.ts passes the region to the
tooltip instead of just its name.

## Validation and testing

- prepare script: throw if any land lacks population/cohesion, if any
  population is not a positive multiple of 5,000, or if the total is not
  exactly 650,000 (update the constant intentionally when the roster
  changes).
- data test: every region has cohesion in {low, medium, high} and a
  population that is a positive multiple of 5,000; total is 650,000.
- panel test: shows `Population: ~30k` and `Cohesion: high` lines for a
  fixture; formatPopulation unit expectations (30000 -> "~30k",
  150000 -> "~150k").
- interaction/tooltip test: hovering a region shows name plus
  `~45k - high cohesion` second line.
- Full suite and build green; e2e verify in Chrome before claiming done.

## Out of scope

- Any mechanical effect of cohesion (mobilization, war, trade) - game spec.
- Sub-land faction population splits - game spec.
- Population growth/change over time - game spec.

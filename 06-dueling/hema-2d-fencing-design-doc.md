# 2D HEMA Fencing Platformer — Design & Prototyping Brief

**Status:** Pre-prototype. Nothing built yet.
**Purpose of this doc:** Give a dev team everything needed to build and evaluate a first playable prototype.
**Core pitch:** A 2D platformer whose combat translates real historical fencing principles — *measure* and *tempo* — into readable, satisfying inputs. Fights are short, lethal, and decided by reading the opponent rather than by trading blows.

---

## 1. Design Thesis

Movie swordfights are theater. Real fights ended in one or two exchanges. Historical fencing is not about clanging blades — it's about managing **distance** and **timing** so that you can strike in the window where your opponent cannot defend.

The game's promise: **the player should learn to read a fight, not memorize animations.** If the signaling grammar is consistent, a player who understands the system can face a brand-new enemy and read them correctly on the first try.

**Anti-goals:**
- Combo systems, extended blade-trading exchanges, DPS attrition
- Power fantasy pacing (spinning attacks, flourishes, dual-wielding)
- Enemy variety achieved through stat blocks rather than behavior
- Any mechanic where the correct answer is "press the button faster"

---

## 2. The Two Foundational Variables

Everything in the combat system is built from these. They are not flavor — they are the actual state space.

### Measure (distance, expressed in actions)

Not "how many pixels apart" but "what can each fighter do to the other from here, and in how many movements."

| Zone | Definition |
|---|---|
| Out of measure | Neither can hit without first stepping |
| Wide measure | Can hit with step + strike (one action each) |
| Narrow measure | Can hit by extending alone; reaction becomes nearly impossible |
| Grappling measure | Blades past each other; wrestling, pommel strikes, disarms |

Measure is **asymmetric**. A spear fighter's wide measure sits entirely outside a dagger fighter's reach. Crossing that gap is the dagger's whole problem.

### Tempo (time, expressed in actions)

One tempo = the duration of one simple action (a step, a strike, a parry, a guard change). The entire art is acting *during* the opponent's tempo, when they are committed and cannot defend.

| Kind | Meaning |
|---|---|
| Primo tempo | Strike while they're doing something that isn't attacking or defending (stepping, changing guard) |
| Mezzo tempo | Strike into their *preparation* — e.g. hit the hand as they raise the sword |
| Dui tempi | Parry, then counter. Two actions. The beginner's defense |
| Contratempo | Strike during their attack itself — void and hit in one motion |

**These are the same problem from two angles.** Every action costs a tempo *and* changes measure. A perfect strike lands at the measure where your weapon reaches and theirs doesn't, in the tempo when they cannot defend.

---

## 3. Core Combat Loop

```
Read pre-tempo tell
  → Read wind-up (tempo 1)
    → Choose defense: VOID / BIND / STRIKE-IN-TEMPO
      → If read was correct: strike into their recovery window
      → If read was wrong: eat the hit, or get baited into a worse bind
```

### The three defensive options

**VOID** — move the body offline. *Highest reward, highest risk.*
- Costs zero blade-tempos; your weapon stays free and threatening
- Opens the largest counter window (*Nachreisen* — striking into their recovery)
- **Directional**: voiding backward is safe but takes you out of measure (safe, no counter). Voiding *offline toward their weak side* keeps you in measure with a clean counter — but is harder to time and catastrophic against a feint
- This is the ideal outcome of any exchange. The whole system exists to make this feel earned

**BIND** — meet the blade, enter sustained contact. *Safer, lower reward.*
- Correct answer when you suspect a feint (commits your blade, not your body — you can read one more beat)
- Enters the bind mini-game (see §4)
- Smaller counter window than a successful void

**STRIKE IN TEMPO** — attack into their attack. *Risk/reward gamble.*
- Relies on geometry: your line threatens them before theirs completes
- Mess it up and both fighters die. Historically flavored, mechanically spicy

### Why voiding is preferred (and why the game should teach this)

Tempo economics. A parry costs a tempo with your blade, then a second tempo to counter — two against their one, and they can act in between. A void costs zero blade-tempos. The instant their attack misses, you're already in position.

---

## 4. The Bind Mini-Game

When blades make sustained contact, both fighters can feel the other's pressure through the blade. The German tradition calls this ***fühlen*** — feeling. Liechtenauer's system hinges on knowing what to do the *instant* blades touch, based on whether the opponent is *hart* (hard/pressing) or *weich* (soft/yielding).

### Proposed implementation

On a successful bind, enter a brief slow-motion state (~400–600ms real time, feels longer). A pressure indicator shows hard vs. soft. Four inputs:

| Their pressure | Correct response | Technique |
|---|---|---|
| Hard (pressing) | **Yield** — rotate your point around theirs, let their force carry them offline, thrust into the opening | *Winden* |
| Soft (light) | **Push through** — overpower their blade and strike through | *Oberhau* from the bind |
| Good geometry for you | **Thrust from the bind** without giving up contact | *Absetzen* |
| Bad geometry for both | **Step in and grapple** / pommel strike / seize their blade | *Ringen am Schwert* |

Read correctly → clean hit. Read wrong → they hit you, or a neutral break back to measure management.

### Progression curve

- **Early enemies:** always press hard. Yielding always works
- **Mid enemies:** vary their pressure
- **Late enemies/bosses:** *bait* — press hard to tempt a yield, then go soft the instant you commit, leaving you overextended

That's *fühlen* as a skill check, and it maps directly onto what the historical masters were actually training.

---

## 5. Feints and Committed Attacks

### Committed attack
Body, weight, and tempo fully invested. Cannot be recalled. Fastest and most powerful — **and the most punishable**, because a miss leaves a long recovery window where the fighter cannot defend. This is the exploitable core of the exchange.

### Feint
An attack that *looks* committed in tempo 1 but keeps enough reserve to redirect in tempo 2. Feints exist specifically to punish premature voids: you void based on the tempo-1 read, they disengage, your body is committed the wrong way, they hit you cleanly.

**Feints make the void/bind decision meaningful.** Without feints, voiding is always correct and there's no game. Feints should be **bidirectional** — the player needs them too, or enemies that always void become unbeatable.

---

## 6. Signaling Tempo (the hardest design problem)

The player must be able to read tempo without it collapsing into pure reaction time. Solution: **layered, phase-based signaling with a consistent grammar.**

### Full signaling cascade for a 2-tempo committed *Oberhau*

| Phase | Duration | Signal | Player option |
|---|---|---|---|
| **Pre-tempo** | 150–300ms | Weight shifts to back foot, shoulders square. No highlight, no sound. Very subtle | *Primo tempo* strike — fight one tempo ahead |
| **Tempo 1 (raise)** | ~400ms | Sword lifts to high guard, body coils. Yellow glow on arm/hand = interruptible. Low rising audio | *Mezzo tempo* — strike the hand/arm. Or begin positioning for the void |
| **Transition beat** | ~100ms | Sword pauses at apex. Real fencing phenomenon — stillness at peak commitment | Last moment to preempt |
| **Tempo 2 (strike)** | ~500ms | Descent along a visible line. Red line-of-attack indicator | Void / bind / mistime and eat it |
| **Recovery** | ~300ms | Gathering weight back to guard. Vulnerable | *Nachreisen* — cash in the counter |

A 1-tempo attack compresses this: minimal pre-tempo, no raise phase, just strike + recovery.

A feint keeps phases 1–3 identical to a committed cut, then redirects during tempo 2.

### Key principles
- **Recovery windows vary by attack.** A heavy committed cut has long recovery (big counter window). A conservative thrust from a stable guard has almost none
- **Grammar over memorization.** Pre-tempo always looks like pre-tempo; tempo 1 always looks interruptible; the transition beat always exists. A player who learns the grammar can read a new enemy cold
- **Audio matters.** Consider composing fight music where the beat corresponds to tempo. Use sparingly — can feel gimmicky

---

## 7. Weapons

### The axes that differentiate weapons

Weapons are **not stat blocks**. Each is defined by a profile across these axes:

1. **Measure** — reach, and at what range you're in danger
2. **Tempo of basic attack** — 1 tempo (extend a thrust) vs. 2–3 tempos (raise and swing)
3. **Recovery time** — how fast back to guard after committing
4. **Point vs. edge dominance** — determines which tempo game the weapon plays
5. **Bind capability** — whether the weapon can sustain pressure contact at all
6. **Armor interaction** — cut/thrust/percussive
7. **One-hand vs. two-hand** — frees or occupies the off-hand

### Measure profiles (the key concept)

Each weapon is a **graph across distance**, not a point:

| Weapon | Wide measure | Middle | Close/grapple |
|---|---|---|---|
| Longsword | Strong (cuts + thrusts) | Strong (bind, winding) | **Strong** (half-sword, pommel, grapple) |
| Rapier | Strong (1-tempo thrusts) | Moderate | Weak — no close game |
| Smallsword | Strong | Weak | **Helpless** |
| Spear | **Dominant** | Weak | Useless |
| Dagger | Useless | Weak | **Dominant** |
| Poleaxe | Strong | Moderate | Moderate (butt-end strikes) |

### Weapon identities

**Longsword — the generalist and recommended player weapon.**
Wide measure. 1-tempo thrusts from point-forward guards, 2-tempo cuts from raised guards. **Richest bind game** — the full Liechtenauer toolkit. Half-swording gives an anti-armor mode. Strong at *every* range because the system trained for every range. Weakness: outranged by polearms.

**Rapier — the thrust specialist.**
Long blade, one-handed, off-hand free (historically paired with dagger/buckler for exactly this reason). Almost exclusively 1-tempo thrusts. **Fastest weapon to land a clean attack** — the point is already halfway there. Bad in the bind (thin, flexible blade can't sustain pressure). Collapses if closed upon.

**Smallsword — pure thrust optimization.**
Extremely thin, stiff, triangular; often no edge at all. **Cannot bind** — the weapon is designed to defeat binding via disengages. Fastest sword in history at the cost of total versatility. Helpless at close measure — no edge, no pommel worth using, no grappling training.

**Spear — the measure dominator.**
6–8 feet of reach. 1-tempo thrusts, 2-tempo butt strikes. Massively advantaged in the approach phase, in serious trouble once closed upon. Encounter design should make this a *spatial puzzle*: how do you cross the threat zone?

**Dagger — the close-measure specialist.**
Loses to anything in wide/narrow measure. Once past the point of a longer weapon, the dagger's measure has become the *correct* measure. Fiore's dagger plays are full of disarms, arm locks, throws.

**Poleaxe — the armor-breaker.**
2–3 tempo swings, 1–2 tempo thrusts with the top spike. Percussive force ignores armor where cuts bounce. Slow recovery, no bind game.

**Messer/falchion/saber — the cut specialist.**
Fast 1–2 tempo cuts optimized for unarmored flesh. Weaker thrusts. Bad against plate.

### Why the bind's role varies by weapon (physics, not style)

A bind requires a blade that can exert and receive lateral force without buckling. Longswords are stiff, broad, two-handed — pressure transmits cleanly and the contact is *stable*. Rapiers are thin and one-handed; both blades flex and slide off. Smallswords literally cannot bind. Katanas *could* bind (stiff, two-handed) but the curve makes blades slip off, and edge-on-edge contact chips the hardened edge — so kenjutsu deflects rather than binds.

**Implication: the bind mini-game is central for longsword, marginal for rapier, absent for smallsword.** Don't force it where the physics says no.

### Cut vs. thrust

Thrust is generally superior when both are available: **shorter tempo** (1 vs. 2), **longer measure** (straight extension beats arc), **line superiority** (shortest path to target), and **more lethal** (narrow deep wound hits organs; cuts often don't immediately stop a fight).

Cuts persist because: multiple opponents (a thrust sticks in someone), armor and heavy clothing (percussive force through resistance), horseback, and lower skill floor.

**Masters taught both in combination: cuts open, thrusts close.** Threaten a cut → opponent raises to parry → transition into a thrust through the opening they just made.

**Design lever:** an armored enemy is a *thrust puzzle*. A fast lightly-armored enemy is a *cut opportunity*. A shielded enemy is *cut-to-open, thrust-to-finish*. Reading whether a cut or thrust is incoming requires *different voids* — sideways off the arc for a cut, offline to their outside for a thrust.

### Half-swording

Grip the blade with the forward hand, a third of the way up. Converts the longsword into a short precise thrusting weapon (aim into armor gaps) plus a hammer (pommel + crossguard = *Mordschlag*).

**It doesn't cut your hand because:** blades are less sharp near the hilt (often an unsharpened *ricasso* specifically for this), a static grip on the flat doesn't cut (cutting requires the blade to *slide*), and fighters wore gauntlets or heavy leather gloves. Modern HEMA practitioners do this routinely.

**In-game:** a contextual mode at close measure and against armor. Forward hand slides down the blade; moveset becomes short, fast, armor-piercing thrusts and pommel strikes. Visually distinctive, mechanically distinct, historically accurate.

---

## 8. Footwork

**Footwork is dictated by the weapon, not chosen independently.** The weapon determines the stance; the stance determines the footwork; the footwork determines the tempo of positioning decisions.

| Weapon | Stance | Movement vocabulary |
|---|---|---|
| Rapier/smallsword | Narrow, linear, feet offset, front foot pointing at opponent | Advance/retreat along a line. **The lunge** is the signature action. Minimal target profile |
| Longsword | Wider, more squared, rotates with guard changes | Advance/retreat + **passing steps** (rear foot crosses to front) + compass steps + diagonal offline steps |
| Spear/polearm | Wide, low, weight on rear foot | Small anchored advances/retreats. Front foot micro-adjusts, rear foot anchors. Hard to push off balance |
| Sword + shield | Like longsword but shield-side foot forward | Fewer passing steps (crossing exposes you during the transition). More shuffling and lateral steps |
| Kenjutsu | Squared hips | Gliding steps (*ayumi ashi*, *suri ashi*). Smoother, more floor-glued |

### Architecture recommendation: couple footwork to weapon

Three options were weighed:

| Approach | Verdict |
|---|---|
| **Full decoupling, exposed to player** | ✗ Contradicts the core design promise. Dilutes weapon identity from the first moment. Teaching becomes hard. Invites min-maxing. Requires the mismatch system to work on day one |
| **Full decoupling, hidden internally** | ~ Preserves future flexibility and enables narrative oddities (a villain with an idiosyncratic style), but you pay implementation cost for unused capability and face constant pressure to expose it prematurely |
| **Simple coupling** | ✓ **Recommended.** Maximum design clarity, fastest iteration, maximum weapon-identity payoff, easiest to balance and teach |

**Implementation note:** build it so stance is a logical property the *character* has, which the weapon *sets* — enforced at game-logic level, not baked into the weapon class. This costs almost nothing now and preserves the option to decouple later.

### If decoupling is ever exposed

Downsides must emerge from **physical reality, not arbitrary stat penalties**:
- **Capability losses, not stat maluses.** Longsword in a narrow stance simply *cannot do passing steps*. Rapier in a wide stance *cannot lunge properly*
- **Tempo costs.** A cut from the wrong stance needs a prep-step to reset — the most fencing-authentic penalty, and enemies can attack into that prep-step
- **Visible in animation.** The character should *look* strained and wrong, not just read as worse numbers
- **Enemies exploit mismatches intelligently.** A smart enemy binds the blade of a player whose stance has weakened their bind game

---

## 9. Weapon Matchups

**Matchups are deliberately asymmetric. Some are genuinely grim.** Don't flatten this.

| Matchup | Result |
|---|---|
| Spear vs. dagger, open ground | **Dire.** The dagger fighter has ~2m to cross while being thrust repeatedly. No viable strategy |
| Polearm vs. rapier, open ground | Strongly favors polearm — longer reach, more threat modes, mass to knock the light point offline |
| Armored knight vs. unarmored cutting sword | **Dire.** Cuts don't hurt plate. This is why armor was worth its expense |
| Longsword vs. rapier | **Genuinely contested** — the ideal matchup for game design. Rapier wins on tempo and reach; longsword wins if it can bind or close |
| Longsword vs. sword+shield | Contested |
| Rapier vs. saber | Contested, often favors saber (cutting power + heavier blade beats the light point offline) |
| Skill mismatch | **Skill differential dwarfs weapon matchup** except in extreme cases |

### What makes a matchup unwinnable
Not "one side is stronger" but **one side has no viable strategy at all**: measure asymmetry with no closing tool, tempo asymmetry that can't be answered, or damage asymmetry (cuts vs. plate).

### Design response
Don't balance matchups into fairness. Instead **give players tools to change the terms**:
- Terrain that neutralizes an advantage (a corridor where a spear can't be deployed)
- Weapon pickups and swaps between/during encounters
- Ambush and surprise
- Visible enemy weapons *before* combat, so the player can prepare
- Boss encounters designed as matchup puzzles ("this spearman is unbeatable on open ground — draw him into the stairwell")

**Rule:** every weapon must be the *best* choice in enough encounters that mastering it feels rewarded. The matchup system is the spice; encounter design is the meal.

---

## 10. Implementation Roadmap

**Governing rule: never add mechanic N+1 before mechanic N is fun.** Each step must end in a playable state you can evaluate. If you can't sit down and duel at the end of a step, you added too much.

### Phase 1 — Prove the core loop

| Step | What | Why here |
|---|---|---|
| 1 | **Idle + advance/retreat + facing.** Two fighters, player can move. Nothing else | Everything inherits this feel. See §11 — this is the most underrated step |
| 2 | **Enemy wind-up + strike** on a fixed timer. No AI. Player can move but not defend | Forces focus on *reading*. Tune wind-up duration here — one of the most important tuning moments in the project |
| 3 | **Void.** Player can now survive by reading and voiding | **The gate.** If this isn't fun, the project isn't viable. Expect to spend days here |
| 4 | **Player attack** (wind-up, strike, recovery). Counter into enemy recovery | *Nachreisen* becomes real. The counter should feel *great* |
| 5 | **Hit reactions + death** both sides | Enables fast iterate-and-retry |
| 6 | **Enemy movement AI** — approach, back off, choose attack timing | Measure becomes a real variable, not a fixed distance |

**End of Phase 1: a complete duel.** If it's not fun here, stop and rethink.

### Phase 2 — Depth

| Step | What |
|---|---|
| 7 | **Bind** as a second defensive option, resolving to neutral for now. Should feel *weaker* than voiding — safer, less rewarding |
| 8 | **Bind mini-game** — pressure reading and four responses. Significant step; budget accordingly |
| 9 | **Enemy feints** — punish premature voids, force real void/bind decisions |
| 9.5 | **Enemy defensive AI** (voiding, binding) |
| 10 | **Player feints** — symmetry; punish enemies that always void |
| 11 | **Multiple attack lines** (high/low at minimum) |

**End of Phase 2: the full decision tree.** One weapon, but genuinely deep.

### Phase 3 — Spatial and tactical richness

| Step | What |
|---|---|
| 12 | **Explicit measure** — weapon reach as a real quantity. Use debug indicators during iteration, strip later |
| 13 | **Recovery window tuning** — different attacks, different recovery lengths, readable |
| 14 | **Pre-tempo tells** — the expert-level reading layer |
| 15 | **First AI personality** — aggressive feinter vs. patient counter-striker. Tests whether the system supports distinct styles without new mechanics |

### Phase 4 — Variety

16. Second weapon (rapier) — first real test that the engine generalizes
17. Cut vs. thrust distinction for the player
18. Half-swording + armored enemies
19+. Grappling, multi-enemy encounters, weapon pickups, level structure, platforming integration

**Where the hard iteration lives:** Steps 2–4 (is it fun at all?) and 7–9 (does it have depth?). If both survive, this is a real project.

---

## 11. Step 1 In Detail — Movement Feel

**This is the most important and most underestimated step.** Everything built on top inherits its feel. Twitchy movement → twitchy combat. Floaty movement → floaty combat.

### What fencer movement is

Two properties most game movement lacks:
- **Committed balance** — always in a stance, weight distributed (~60/40), knees bent, feet offset
- **Reversibility** — at every moment during a step you could stop or reverse without losing balance. No leaning into a walk, no momentum carrying you past your feet

Translation: **responsive and cancelable, not momentum-driven.** But also *not* twitchy — each step is a decision, not a flick.

### The step as fundamental unit

Consider making the step discrete rather than continuous:
- Tap direction = one small step
- Hold = successive steps (not a smooth slide)
- Release = stop *in stance at the end of the current step*, not mid-motion

Why: it makes measure **negotiable rather than continuous** (you're at a specific measure after each step, not drifting), and it makes steps cost tempo — so a step at the wrong moment is exploitable.

### Minimum movement set

1. **Advance** — front foot first, rear follows. ~20–30% of character height. ~250ms. Stance preserved
2. **Retreat** — rear foot first, front follows. Symmetric with advance
3. **Facing turn** — visible pivot with a brief transitional vulnerability. Makes flanking enemies genuinely threatening

No sidestep yet (that's the void), no running. **Consider whether the platformer needs jumping at all**, or whether advances, retreats, voids, and ducks cover everything.

### Parameters to tune

| Parameter | Starting point | Notes |
|---|---|---|
| Step distance | 20–30% of character height | Calibrate against weapon reach — a step should meaningfully change measure |
| Step duration | ~250ms | Sets the tempo of the whole game. Relates to wind-up duration |
| Input latency | 1–2 frames max | No smoothing, no windup on movement inputs |
| Cancel window | Step completes; next input queues and fires on completion | Feels committed but responsive |
| Stance recovery | 50–100ms between chained steps | Creates a pulse to the movement |
| Animation | Must show weight transfer | Even a stick figure. No weight transfer = sliding = wrong |
| Audio | One footfall per step | Massively tightens the feel. Don't skip this |

### The test for Step 1

**You should be able to walk around a stationary dummy — advancing, retreating, turning — and find it satisfying in itself.** If you're impatient to skip ahead to "the real game," the movement isn't good enough yet. In fencing, footwork *is* most of the game.

**Reference:** Nidhogg (committed-yet-responsive footwork), Hellish Quart (real weight and balance). **Do not** reference Soulsborne or typical action games — their movement solves different problems.

---

## 12. Minimum Animation Set for Prototype

Placeholder art is fine — capsules, stick figures, flat silhouettes. **Readability of tempo matters far more than fidelity.**

### Player (9 animations, 6 at absolute floor)

| Animation | Must convey |
|---|---|
| Idle/guard | Ready but not committed |
| Advance/retreat (one reversible clip) | Weight transfer, stance preservation |
| Void/sidestep | Body has left the line of attack |
| Attack wind-up | **Interruptible but threatening.** The single most important animation in the game. Must hold for a perceptible beat |
| Attack strike | **Committed.** Ends in a distinct follow-through pose that reads as "I'm in recovery" |
| Bind contact | **Mutual and sustained.** Both fighters visibly pressing. Not a parry-and-bounce |
| Bind resolution | Generic for prototype — resolve outcomes in game state |
| Hit reaction | Flinch, knocked out of current state |
| Death | Can reuse hit reaction held longer |

### Enemy (5 animations for first prototype)

Idle, wind-up, strike, hit, death. The enemy doesn't need to void, bind, or step until you've built that AI.

**Start with the enemy as a dummy that attacks on a fixed schedule.** Iterate on whether the *defensive* game feels good before building anything else.

### Don't build combo animations yet

Let step + strike blend at runtime rather than pre-animating combinations. Reasons: independent tuning of step and strike timing; historically the extension often begins *before* the foot lands ("hand before foot"); and you'd need many combinations. **Exception:** a dedicated lunge animation, where step and strike genuinely are one committed motion.

### Defer entirely
Multiple weapons · multiple attack lines · grappling/half-swording/pommel · feints (needs two similar-looking wind-ups) · armor interactions · distinct recovery animations

---

## 13. Character Art Pipeline (recommended)

**3D-to-2D sprite rendering** — the Dead Cells approach. Model and animate in 3D, render to sprite sheets. Gives you consistent lighting, easy iteration on timing, and the ability to re-render at different angles.

- **Mixamo** — free auto-rigging and a library of stock sword animations. Good enough for a prototype
- **Blender** + Sprite Sheet Renderer addon — primary recommendation for the 3D stage
- **Cascadeur** — physics-driven animation with a free tier. Particularly relevant for weight and momentum, which are load-bearing for this project
- **Aseprite / SpriteStack / engine sprite tools** — atlas assembly and cleanup

Animation fidelity is **not** a secondary concern here. Placeholder-quality *feel* would undermine the core design in a way it wouldn't for most games.

---

## 14. 2D Constraints — What Translates and What Doesn't

| Concept | Translates to 2D? |
|---|---|
| Tempo | ✓ Fully. Dimension-independent |
| Measure | ✓ Cleanly, with minor abstraction |
| Height lines (high/mid/low) | ✓ Via vertical targeting |
| Committed attacks and recovery windows | ✓ Fully |
| Bind and pressure reading | ✓ Fully |
| **Inside/outside line** | ✗ **Poorly.** Which side of the opponent's blade your attack comes from is inherently 3D. Disengages lose their natural geometry |
| Offline voiding | ~ Partially. Diagonal stepping off the line becomes height or stylized lateral movement |
| Circling / compass steps | ~ Limited. 2D fights tend toward a linear axis |
| Posture and micro-tell reading | ~ Reduced. Silhouettes convey less than 3D bodies |

**Verdict:** 2D is a constrained but workable choice. The *tempo* layer — arguably the most important thing you're capturing — survives fully. The *line* layer suffers most. You're not building a fencing simulator; you're building a game that teaches fencing principles, and the principles survive.

**Compensating benefits:** dramatically lower art and tooling cost (likely the difference between shipping and not), clearer visual readability (no camera problems, no target confusion), and genre coherence with the platformer framing.

---

## 15. Prior Art and Reference

| Game | What to take |
|---|---|
| **Bushido Blade** (1997) | The ur-text. Lethal single-strike combat, committed strikes, real weapon identities, multiple stances. Philosophically closest of any commercial game |
| **Hellish Quart** (2021) | Closest living relative. Solo dev, plane-locked 3D, physics-based, distinct historical weapons. Small devoted audience, very positive reception. **The commercial benchmark** |
| **Nidhogg** (2014) | Proves 2D fencing works. Real measure (blade height, stance), tempo, committed attacks, one-hit lethality. Deliberately shallow — no bind, no feints, no weapon variety |
| **Prince of Persia** (1989) | Genuine precedent and an under-credited one. Committed strikes, active blocking, footwork that matters, lethality, enemies distinguished by tempo rather than stats, terrain (pits, edges) affecting fights. **Missing:** voids, bind, real feints, multiple lines, weapon variety. Roughly 15–20% of the depth targeted here — a foundation, not a destination |
| **Sifu** | Well-tuned parry/avoid/block trichotomy |
| **Kurosawa films** | The explosive brevity of real exchanges |
| **Rob Roy** (1995), **The Duelists** (1977) | Films HEMA practitioners cite as unusually accurate |

**Nobody has combined platformer conventions with fencing depth in 2D.** The lineage is thin but real, and the space is open.

---

## 16. Commercial Framing

Included so the team understands the constraints the design operates under.

- **Target outcome:** Hellish Quart-tier — a niche game with a small, devoted audience, very positive reviews, and modest sustained sales
- **Realistic estimate:** 10,000–30,000 lifetime units at $15–25
- **Scale that works:** solo or very small team, low overhead. The economics do not support a funded studio at this revenue ceiling — which is precisely why the space is unexplored
- **Publishing:** self-publish by default. A traditional publisher's 30–50% cut isn't justified at this revenue ceiling, and their instinct to broaden appeal would erode the faithfulness that is the project's only competitive advantage. Exception: a niche-focused indie publisher approaching with 75/25-or-better terms and genuine reach into the HEMA/historical-combat audience
- **The absence of prior exploration reflects audience size and builder rarity — not that the design doesn't work.** Adjacent projects proved the combat is fun for the people who want it

### Risks to actively manage

1. **Scope creep** — the primary killer of solo projects with runway. Set a ship date and cut ruthlessly
2. **Marketing** — niche audiences don't find you automatically. Budget real time for devlogs, HEMA community engagement, Steam Next Fest demos. Non-optional
3. **The Step 3 gate** — build to a playable void-and-read loop in a few weekends *before* committing serious runway. If the core loop isn't fun with placeholder art, no amount of polish fixes it later

---

## 17. Glossary

| Term | Meaning |
|---|---|
| **Measure** (*misura*, *maai*) | Distance expressed in actions required to hit |
| **Tempo** | Time expressed in complete fencing actions |
| **Void** | Moving the body offline so the attack passes; costs zero blade-tempos |
| **Bind** | Sustained blade contact under mutual pressure |
| ***Fühlen*** | "Feeling" — reading the opponent's pressure through the bind |
| ***Hart* / *Weich*** | Hard / soft — the two pressure states read in a bind |
| ***Winden*** | Winding — rotating your point around theirs from the bind |
| ***Absetzen*** | Thrusting from the bind without giving up contact |
| ***Nachreisen*** | "Travelling after" — striking into the opponent's recovery |
| ***Contratempo*** | Striking during the opponent's attack |
| ***Mezzo tempo*** | Striking into the opponent's preparation |
| ***Primo tempo*** | Striking during a non-attacking, non-defending action |
| **Committed attack** | Body, weight and tempo fully invested; cannot be recalled |
| **Feint** | Uncommitted attack mimicking commitment to bait a void |
| **Half-swording** | Gripping the blade to thrust precisely at close measure |
| ***Mordschlag* / *Mordhau*** | "Murder strike" — holding the blade, striking with pommel and crossguard |
| ***Ringen am Schwert*** | Wrestling at the sword |
| ***Bloßfechten* / *Harnischfechten*** | Unarmored / armored fighting |
| **Line** | The path an attack travels; height lines and inside/outside |
| **Passing step** | Rear foot crosses to become the front foot |
| ***Vom Tag* / *Pflug* / *Alber* / *Langort*** | German longsword guards: high / plough / fool / longpoint |

---

## 18. The One-Paragraph Version

A 2D platformer where combat is built on **measure** (distance in actions) and **tempo** (time in actions). The player reads an opponent's wind-up and chooses to **void** (move offline — highest reward, opens the counter into their recovery window, but commits your body and dies to feints), **bind** (meet the blade — safer, enters a pressure-reading mini-game where you feel hard vs. soft and respond with yield / push / thrust / grapple), or **strike in tempo**. Committed attacks are the exploitable core of every exchange; feints exist to punish premature voids and keep the void/bind decision live. Weapons are differentiated by measure profiles across range rather than by stats — longsword is the versatile generalist strong at every range because its system trained for every range; rapier owns wide measure with 1-tempo thrusts and collapses up close; spear dominates the approach and loses if closed upon — and footwork emerges from each weapon's physical demands rather than being separately selectable. Matchups are deliberately asymmetric, some genuinely unwinnable, and the design answer is terrain, weapon pickups, and encounter variety rather than flattened balance. Build incrementally: grounded fencer-like movement first (the most underrated step), then enemy wind-up, then the void — and stop there and evaluate honestly before adding anything else.

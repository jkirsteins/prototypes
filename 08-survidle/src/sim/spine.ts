/**
 * The capability spine (capability-spine spec, section 5): what is built
 * that a survivor can newly do, make, automate or survive, and what each
 * takes from outside its own skill and gives to something outside it. A
 * tier, a producer, a rung or a capability-unlocking structure that
 * reaches the tree without a row here fails the coverage test, the way a
 * card without a policy branch does. Species are not rows: a fish or a
 * deer is content under a class, reached by a method, a place and a
 * season. Mastery extras are rates between tiers and are not rows.
 */
import type { OrderKind, SkillId, StructureId } from "./types";

export interface Capability {
  /** The name the player remembers; never a percent. */
  name: string;
  /** A recommended-level key ("craft:bow"), a structure ("build:cabin") or a rung ("rung:keep"). */
  key: string;
  skill: SkillId | "all";
  /** The level the tier sits on; a rung's is its gate level. */
  tier: number;
  /** Skills other than its own it depends on, or the reason it stands alone. */
  receives: SkillId[] | { alone: string };
  /** What it makes true for something outside its own skill. */
  gives: string;
  /** What it leaves limiting: automation moves a bottleneck and never removes the problem. */
  leaves: string;
  /** Yields while the survivor does something else. */
  producer?: boolean;
}

/** Structures that yield without the survivor: each must have a producer row. */
export const PRODUCER_STRUCTURES: StructureId[] = ["snare", "dryingRack"];

/** Structures that unlock a capability rather than defend or decorate: each must have a row. The bough bed is defensive and has none. */
export const UNLOCKING_STRUCTURES: StructureId[] = ["firePit", "leanTo", "cabin"];

const rung = (kind: OrderKind, tier: number, name: string, gives: string, leaves: string): Capability => ({
  name, key: `rung:${kind}`, skill: "all", tier,
  receives: { alone: "the ladder's own rung: it takes the skill's own hours and gives every skill the away horizon" },
  gives, leaves,
});

export const CAPABILITIES: Capability[] = [
  { name: "fire", key: "build:firePit", skill: "building", tier: 1,
    receives: { alone: "foundational: it takes material and gives everything, and no test has to prove it" },
    gives: "warmth, cooking, melted snow, light", leaves: "fuel, wet wood, and a fire nobody feeds goes out" },
  { name: "the fire drill", key: "craft:fireDrill", skill: "crafting", tier: 1,
    receives: { alone: "the fire's own tool; see build:firePit" },
    gives: "a fire from nothing but sticks", leaves: "cordage, which the snare and the bow also want" },
  { name: "the stone knife", key: "craft:knife", skill: "crafting", tier: 1, receives: ["foraging", "woodcraft"],
    gives: "every tool recipe", leaves: "wear" },
  { name: "snares", key: "build:snare", skill: "hunting", tier: 1, receives: ["woodcraft", "crafting"], producer: true,
    gives: "food while working; fur, bone and sinew for crafting", leaves: "checking them, the fox, five a region, lean meat" },
  { name: "a roof", key: "build:leanTo", skill: "building", tier: 1, receives: ["woodcraft"],
    gives: "half the wetting and a night that does not kill; drying by the fire in front", leaves: "the open front: no fire inside, so nothing smokes" },
  { name: "the bark bucket", key: "craft:barkBucket", skill: "crafting", tier: 1, receives: ["woodcraft"],
    gives: "stored water and the water keep", leaves: "it splits at frost and competes for cordage" },
  { name: "the spear", key: "craft:fishingSpear", skill: "fishing", tier: 1, receives: ["woodcraft", "foraging", "crafting"],
    gives: "fish at the beginner rate", leaves: "it barely breaks even" },
  { name: "the drying rack", key: "build:dryingRack", skill: "building", tier: 1, receives: ["woodcraft", "hunting", "fishing"], producer: true,
    gives: "meat that keeps: 3 kg into 1", leaves: "6 kg at a time, two dry days, animals at the rack" },
  rung("job", 3, "jobs with a count or a target", "a task set and walked away from, in every skill", "a job is one trip and drops off"),
  rung("grind", 5, "grinds", "work that never ends, in every skill", "grinds wear tools and cut out the haul"),
  rung("keep", 10, "keeps", "a stock held at a number, in every skill", "a keep holds what the pile can count and nothing else"),
  { name: "the bone needle", key: "craft:needle", skill: "crafting", tier: 1, receives: ["hunting"],
    gives: "tailored clothing and the waterskin", leaves: "the first kill comes first" },
  { name: "the bow", key: "craft:bow", skill: "crafting", tier: 5, receives: ["woodcraft", "hunting"],
    gives: "roe deer and elk for hunting", leaves: "arrows, sinew, a lumpy larder" },
  { name: "the hide blanket", key: "craft:hideBlanket", skill: "crafting", tier: 6, receives: ["hunting"],
    gives: "a night asleep in the open that costs less warmth", leaves: "four hides and wear" },
  { name: "tailored hide clothing", key: "craft:hideCoat", skill: "crafting", tier: 8, receives: ["hunting"],
    gives: "winter under hide where wool wore out; the shell that wind reads", leaves: "wear, mending, a deer every eight days" },
  { name: "tailored hide clothing", key: "craft:hideTrousers", skill: "crafting", tier: 8, receives: ["hunting"],
    gives: "winter under hide where wool wore out", leaves: "wear, mending" },
  { name: "tailored hide clothing", key: "craft:hideBoots", skill: "crafting", tier: 8, receives: ["hunting"],
    gives: "feet that stay whole through a winter", leaves: "wear, wet through" },
  { name: "the cabin", key: "build:cabin", skill: "building", tier: 10, receives: ["woodcraft", "foraging"],
    gives: "+15 C, and the hearth, storehouse, cellar and smokehouse attach here", leaves: "sixty hours and a winter's firewood" },
];

export function capability(key: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.key === key);
}

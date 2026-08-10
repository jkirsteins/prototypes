export interface People {
  id: string;
  name: string;
  color: string;
}

/** Descriptive only. Deliberately free of modern political vocabulary - a
 *  "confederacy" or a "league" is a thing none of these lands were in 1184.
 *  The land (terra) is the unit; the types say how tightly a set of them held
 *  together. */
export type FactionType =
  | "land"
  | "island-lands"
  | "united-lands"
  | "principality"
  | "chiefdom"
  | "allied-lands";

export interface Faction {
  id: string;
  name: string;
  ethnicity: string; // id into MapData.peoples
  type: FactionType; // descriptive only - no mechanics yet
  color: string; // polygon fill; a shade within the ethnicity hue family
  /** True for the one faction named for a land rather than a people
   *  (Lietuva), which takes no article ("Lietuva", not "the Lietuva").
   *  Omitted (falsy) everywhere else. */
  placeName?: boolean;
}

export type Cohesion = "low" | "medium" | "high";

export interface Region {
  id: string;
  name: string;
  peoples: string[]; // primary ethnicity first (= faction ethnicity), minorities after
  faction: string; // id into MapData.factions; 1:1 with regions for now
  population: number; // deliberate game estimate; positive multiple of 5000
  cohesion: Cohesion; // political concentration - NOT derivable from population
  flavor: string;
  places: string[];
  path: string;
  maxSettlements: number; // population-correlated slot cap, baked by the pipeline
  adjacent: string[]; // region ids sharing a border or an authored sea link
}

export interface Neighbor {
  id: string;
  path: string;
}

export interface River {
  id: string;
  name: string;
  major: boolean; // wider stroke for the great trade rivers
  path: string;
}

export interface Settlement {
  id: string;
  name: string;
  note: string; // one-line tooltip, valid for ca. 1100
  land: string; // id into MapData.regions
  unlocked: boolean; // locked settlements are authored but not rendered
  x: number;
  y: number;
  labelDy?: number; // label offset override to dodge a colliding neighbour
}

export type LabelKind =
  | "people"
  | "people-minor"
  | "neighbor"
  | "river"
  | "group";

export interface MapLabel {
  text: string;
  x: number;
  y: number;
  kind: LabelKind;
}

export interface MapData {
  width: number;
  height: number;
  /** How far past the canvas the sea and neighbor geometry are baked, so
   *  letterboxed views at the zoom floor stay painted. */
  margin: number;
  attribution: string;
  year: number;
  peoples: People[];
  factions: Faction[];
  regions: Region[];
  neighbors: Neighbor[];
  rivers: River[];
  settlements: Settlement[];
  labels: MapLabel[];
}

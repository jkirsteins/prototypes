export interface People {
  id: string;
  name: string;
  color: string;
}

export type FactionType =
  | "county"
  | "island-league"
  | "regional-confederacy"
  | "principality"
  | "chiefdom"
  | "land-coalition";

export interface Faction {
  id: string;
  name: string;
  ethnicity: string; // id into MapData.peoples
  type: FactionType; // descriptive only - no mechanics yet
  color: string; // polygon fill; a shade within the ethnicity hue family
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

export type LabelKind =
  | "people"
  | "people-minor"
  | "neighbor"
  | "river"
  | "title"
  | "subtitle";

export interface MapLabel {
  text: string;
  x: number;
  y: number;
  kind: LabelKind;
}

export interface MapData {
  width: number;
  height: number;
  attribution: string;
  year: number;
  peoples: People[];
  factions: Faction[];
  regions: Region[];
  neighbors: Neighbor[];
  rivers: River[];
  labels: MapLabel[];
}

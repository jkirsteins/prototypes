export interface People {
  id: string;
  name: string;
  color: string;
}

export interface Region {
  id: string;
  name: string;
  peoples: string[]; // ids into MapData.peoples; first = primary = fill color
  flavor: string;
  places: string[];
  path: string;
}

export interface Neighbor {
  id: string;
  path: string;
}

export type LabelKind =
  | "people"
  | "people-minor"
  | "neighbor"
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
  regions: Region[];
  neighbors: Neighbor[];
  labels: MapLabel[];
}

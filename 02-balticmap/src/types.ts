export interface Region {
  id: string;
  name: string;
  country: string;
  path: string;
}

export interface Neighbor {
  id: string;
  path: string;
}

export interface CountryLabel {
  text: string;
  x: number;
  y: number;
}

export interface MapData {
  width: number;
  height: number;
  attribution: string;
  regions: Region[];
  neighbors: Neighbor[];
  labels: CountryLabel[];
}

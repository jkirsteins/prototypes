import { Story } from "inkjs";
import coffinStoryContent from "./coffin.json";

export type CoffinBuild = "undetermined" | "strength" | "cautious" | "ingenious";

export type CoffinChoice = {
  index: number;
  text: string;
};

export type CoffinDiscovery = {
  id: string;
  kind: "item" | "clue" | "memory";
  label: string;
  description: string;
};

export type CoffinSnapshot = {
  attributes: {
    caution: number;
    ingenuity: number;
    strength: number;
  };
  build: CoffinBuild;
  choices: CoffinChoice[];
  discoveries: CoffinDiscovery[];
  escaped: boolean;
  imageId: string;
  mood: string;
  paragraphs: string[];
};

export class CoffinScene {
  private readonly story = new Story(coffinStoryContent);
  private paragraphs: string[] = [];
  private imageId = "coffin";
  private mood = "stale dark";

  constructor() {
    this.continueStory();
  }

  get snapshot(): CoffinSnapshot {
    return {
      attributes: {
        caution: this.numberVariable("caution"),
        ingenuity: this.numberVariable("ingenuity"),
        strength: this.numberVariable("strength"),
      },
      build: this.stringVariable("build") as CoffinBuild,
      choices: this.story.currentChoices.map((choice, index) => ({
        index,
        text: choice.text,
      })),
      discoveries: this.getDiscoveries(),
      escaped: this.booleanVariable("escaped"),
      imageId: this.imageId,
      mood: this.mood,
      paragraphs: this.paragraphs,
    };
  }

  choose(choiceIndex: number): CoffinSnapshot {
    this.story.ChooseChoiceIndex(choiceIndex);
    this.continueStory();
    return this.snapshot;
  }

  private continueStory(): void {
    this.paragraphs = [];

    while (this.story.canContinue) {
      const text = this.story.Continue()?.trim() ?? "";
      this.applyTags(this.story.currentTags ?? []);

      if (text) {
        this.paragraphs.push(text);
      }
    }
  }

  private applyTags(tags: string[]): void {
    for (const tag of tags) {
      const [rawKey, ...rawValue] = tag.split(":");
      const key = rawKey.trim();
      const value = rawValue.join(":").trim();

      if (key === "image" && value) {
        this.imageId = value;
      }

      if (key === "mood" && value) {
        this.mood = value;
      }
    }
  }

  private getDiscoveries(): CoffinDiscovery[] {
    const discoveries: CoffinDiscovery[] = [];

    if (this.booleanVariable("unsafe_memory")) {
      discoveries.push({
        id: "unsafe-call",
        kind: "memory",
        label: "Calling out may be dangerous",
        description: "You stopped yourself before shouting. Something outside may be worse than silence.",
      });
    }

    if (this.booleanVariable("nail_seen")) {
      discoveries.push({
        id: "loose-nail",
        kind: this.booleanVariable("nail_taken") ? "item" : "clue",
        label: this.booleanVariable("nail_taken") ? "Loose nail" : "Hidden loose nail",
        description: "A bent nail in the velvet seam. Ugly, sharp, and possibly useful.",
      });
    }

    if (this.booleanVariable("hinge_seen")) {
      discoveries.push({
        id: "hinge-weak-point",
        kind: "clue",
        label: "Hinge weak point",
        description: "The lid resists at one cramped hinge behind the plaque.",
      });
    }

    return discoveries;
  }

  private booleanVariable(name: string): boolean {
    return Boolean(this.story.variablesState.$(name));
  }

  private numberVariable(name: string): number {
    return Number(this.story.variablesState.$(name));
  }

  private stringVariable(name: string): string {
    return String(this.story.variablesState.$(name));
  }
}

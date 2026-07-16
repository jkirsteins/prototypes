import { Story } from "inkjs";
import coffinStoryContent from "./coffin.json";

export type CoffinBuild = "undetermined" | "strength" | "cautious" | "ingenious";

export type CoffinChoice = {
  index: number;
  text: string;
};

export type CoffinSnapshot = {
  attributes: {
    caution: number;
    ingenuity: number;
    strength: number;
  };
  build: CoffinBuild;
  choices: CoffinChoice[];
  escaped: boolean;
  imageId: string;
  paragraphs: string[];
};

export class CoffinScene {
  private readonly story = new Story(coffinStoryContent);
  private paragraphs: string[] = [];
  private imageId = "coffin";

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
      escaped: this.booleanVariable("escaped"),
      imageId: this.imageId,
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
    }
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

import { SHEETS } from "./sheets";
import type { SheetName } from "./sheets";

export function loadImages(): Promise<Record<SheetName, HTMLImageElement>> {
  const entries = Object.entries(SHEETS).map(
    ([name, meta]) =>
      new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([name, img]);
        img.onerror = () => reject(new Error(`failed to load ${meta.file}`));
        img.src = `${import.meta.env.BASE_URL}sprites/${meta.file}`;
      }),
  );
  return Promise.all(entries).then((pairs) => Object.fromEntries(pairs) as Record<SheetName, HTMLImageElement>);
}

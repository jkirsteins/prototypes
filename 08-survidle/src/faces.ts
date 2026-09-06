/**
 * The face self-test page (faces.html, reached from the game by ?faces=1): a
 * page of generated faces at 8x8 and 12x12, each captioned with what the
 * seed and the grades picked, for a browser pass to judge one by one whether
 * each reads as a person by shape and colour.
 */
import "./style.css";
import { medianPerson } from "./sim/person";
import type { Grade, Person } from "./sim/types";
import { facePicks, faceSvg } from "./ui/face";

function people(): Person[] {
  const out: Person[] = [];
  for (const sex of ["f", "m"] as const) {
    for (const eyes of [-2, 0, 2] as Grade[]) {
      for (const build of [0, 2] as Grade[]) {
        for (let k = 0; k < 4; k++) {
          const p = medianPerson(sex);
          out.push({ ...p, axes: { ...p.axes, eyes, build }, face: 1000 * (sex === "f" ? 1 : 2) + 100 * (eyes + 2) + 10 * build + k });
        }
      }
    }
  }
  return out;
}

function cardHtml(p: Person, size: 8 | 12, px: number): string {
  const picks = facePicks(p);
  const caption = `${p.sex === "f" ? "woman" : "man"}, ${picks.hair}${picks.beard !== "none" ? `, ${picks.beard} beard` : ""}, eyes ${picks.eyes}, jaw ${picks.jaw}`;
  return `<figure style="margin:0;display:inline-block;width:${px + 24}px;vertical-align:top;text-align:center;font-size:11px;color:var(--dim)">${faceSvg(p, px, size)}<figcaption>${caption}</figcaption></figure>`;
}

const all = people();
document.querySelector("#faces")!.innerHTML = `
<div style="padding:16px;background:var(--bg);color:var(--text);min-height:100vh">
<h1 style="font-size:20px">Faces at 8x8, eight times</h1>
<div>${all.map((p) => cardHtml(p, 8, 64)).join("")}</div>
<h1 style="font-size:20px;margin-top:24px">The same at 12x12, five times</h1>
<div>${all.map((p) => cardHtml(p, 12, 60)).join("")}</div>
</div>`;

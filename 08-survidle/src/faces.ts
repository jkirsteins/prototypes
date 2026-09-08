/**
 * The face self-test page (faces.html, reached from the game by ?faces=1): a
 * page of generated Toon Head identities, each captioned with the stable
 * appearance picked from its seed.
 */
import "./style.css";
import { medianPerson } from "./sim/person";
import type { Person } from "./sim/types";
import { faceIdentity, faceSvg } from "./ui/face";

function people(): Person[] {
  const out: Person[] = [];
  for (const sex of ["f", "m"] as const) {
    for (let k = 0; k < 24; k++) {
      const p = medianPerson(sex);
      out.push({ ...p, face: 1000 * (sex === "f" ? 1 : 2) + k });
    }
  }
  return out;
}

function cardHtml(p: Person, px: number): string {
  const identity = faceIdentity(p);
  const caption = `${p.sex === "f" ? "woman" : "man"}, ${identity.hair}${identity.beard ? `, ${identity.beard}` : ""}, ${identity.clothes}`;
  return `<figure style="margin:0;display:inline-block;width:${px + 36}px;vertical-align:top;text-align:center;font-size:11px;color:var(--dim)">${faceSvg(p, px)}<figcaption>${caption}</figcaption></figure>`;
}

const all = people();
document.querySelector("#faces")!.innerHTML = `
<div style="padding:16px;background:var(--bg);color:var(--text);min-height:100vh">
<h1 style="font-size:20px">Toon Head identity contact sheet</h1>
<div>${all.map((p) => cardHtml(p, 72)).join("")}</div>
</div>`;

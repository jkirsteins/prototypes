/** Toon Head identity, expression, state, and motion review surface. */
import "./style.css";
import { medianPerson } from "./sim/person";
import type { Person } from "./sim/types";
import { faceIdentity, faceSvg } from "./ui/face";
import { createPortraitMotion } from "./ui/portrait-motion";
import { liveFaceHtml, type LivePortraitState, type PortraitExpression } from "./ui/portrait";
import type { Mood } from "./ui/mood";

function person(sex: "f" | "m", seed: number): Person {
  return { ...medianPerson(sex), face: seed };
}

const identities = Array.from({ length: 24 }, (_, i) => person(i % 2 === 0 ? "f" : "m", 1000 + i));

function identityCard(p: Person, px: number): string {
  const identity = faceIdentity(p);
  const caption = `${p.sex === "f" ? "woman" : "man"}, ${identity.hair}${identity.beard ? `, ${identity.beard}` : ""}, ${identity.clothes}`;
  return `<figure style="margin:4px;display:inline-block;width:${Math.max(86, px + 28)}px;vertical-align:top;text-align:center;font-size:11px;color:var(--dim)">${faceSvg(p, px)}<figcaption>${caption}</figcaption></figure>`;
}

function view(expression: PortraitExpression, activity: Mood = "idle", firelit = false): LivePortraitState {
  return {
    expression,
    activity,
    firelit,
    motion: expression === "dead" || expression === "sleep" ? "none" : expression === "happy" ? "awake" : "limited",
    signature: `0:${expression}:${activity}:${firelit ? 1 : 0}`,
  };
}

function stateCard(label: string, p: Person, state: LivePortraitState, extraClass = "", extraStyle = ""): string {
  let portrait = liveFaceHtml(p, 24, state);
  if (extraClass) portrait = portrait.replace('class="stat-face', `class="stat-face ${extraClass}`);
  if (extraStyle) portrait = portrait.replace('class="stat-face', `style="${extraStyle}" class="stat-face`);
  return `<figure style="margin:8px;display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:76px;font-size:11px;color:var(--dim)">${portrait}<figcaption>${label}</figcaption></figure>`;
}

const sample = person("m", 2031);
const expressions: PortraitExpression[] = ["happy", "focused", "cold", "hot", "unhappy", "tired", "hurt", "sleep", "dead"];
const stateCards = expressions.map((expression) => stateCard(expression, sample, view(expression, expression === "focused" ? "work" : expression === "sleep" ? "sleep" : "idle")));
stateCards.push(
  stateCard("focused left", person("f", 2040), view("focused", "work")),
  stateCard("focused right", person("f", 2041), view("focused", "work")),
  stateCard("firelit", sample, view("happy", "rest", true)),
  stateCard("blink", sample, view("happy"), "is-blinking"),
  stateCard("glance", sample, view("happy"), "", "left:1px"),
  stateCard("flavor", sample, view("happy"), "is-flavor"),
);

document.querySelector("#faces")!.innerHTML = `
<div style="padding:16px;background:var(--bg);color:var(--text);min-height:100vh">
<h1 style="font-size:20px">Toon Head portrait review</h1>
<p style="color:var(--dim)">Generated locally. ToonHead by Johan Melin, CC BY 4.0.</p>
<h2 style="font-size:16px">24 identities at 64px</h2>
<div>${identities.map((p) => identityCard(p, 64)).join("")}</div>
<h2 style="font-size:16px;margin-top:24px">The same identities at 24px</h2>
<div>${identities.map((p) => identityCard(p, 24)).join("")}</div>
<h2 style="font-size:16px;margin-top:24px">Expressions and layered states</h2>
<div style="display:flex;flex-wrap:wrap;align-items:flex-start">${stateCards.join("")}</div>
<h2 style="font-size:16px;margin-top:24px">Live ambient motion</h2>
<div id="motion-demo">${stateCard("live", person("f", 2050), view("happy"))}</div>
</div>`;

const motion = createPortraitMotion();
const motionRoot = document.querySelector<HTMLElement>("#motion-demo")!;
function motionFrame(now: number): void {
  motion.frame(motionRoot, now, document.visibilityState === "visible");
  requestAnimationFrame(motionFrame);
}
motion.frame(motionRoot, performance.now(), document.visibilityState === "visible");
requestAnimationFrame(motionFrame);

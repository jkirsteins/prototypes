// src/duel/main-duel.ts
import * as THREE from "three";
import { createStage } from "../scene";
import { createDuelist, handleEvent, tick } from "./states";
import { BIND_COUNTERPART, pickPose } from "./poses";
import { loadDuelRig } from "./rig";
import { LONGSWORD } from "./timings";
import type { DuelEvent } from "./states";

const CM_TO_M = 0.01;

const KEYS: Record<string, DuelEvent> = {
  KeyD: "stepFwd", KeyA: "stepBack", KeyS: "void",
  KeyJ: "cut", KeyK: "thrust",
  KeyH: "hitstun", KeyB: "bind", KeyU: "unarmed", KeyX: "death",
  KeyR: "reset", KeyF: "flip",
};

export async function runDuel(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const status = document.getElementById("status") as HTMLElement;
  const stage = createStage(canvas);
  const duelist = createDuelist();

  const rig = await loadDuelRig(import.meta.env.BASE_URL);
  stage.scene.add(rig.root);

  // The bind's static counterpart: same rig type, mirrored, frozen.
  const counterpart = await loadDuelRig(import.meta.env.BASE_URL);
  counterpart.applyPose(BIND_COUNTERPART);
  counterpart.root.visible = false;
  stage.scene.add(counterpart.root);

  // Reach debug line: a thin box on the floor at the weapon's reach.
  const reachLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.002, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xe6c229 }),
  );
  stage.scene.add(reachLine);

  status.textContent =
    "A/D step S void J cut K thrust L parry(hold) H hit B bind U unarmed X death F flip R reset Space pause";

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") { paused = !paused; return; }
    if (e.code === "KeyL") { handleEvent(duelist, "parryDown"); return; }
    const ev = KEYS[e.code];
    if (ev) handleEvent(duelist, ev);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyL") handleEvent(duelist, "parryUp");
  });

  let paused = false;
  let simTimeMs = 0;
  let lastPick = pickPose(duelist, 0);

  const frame = (dtMs: number): void => {
    simTimeMs += dtMs;
    tick(duelist, dtMs);
    lastPick = pickPose(duelist, simTimeMs);
    rig.applyPose(lastPick);
    rig.root.position.x = duelist.x * CM_TO_M;
    rig.root.rotation.y = (duelist.facing * Math.PI) / 2;
    const bind = duelist.state.kind === "bind";
    counterpart.root.visible = bind;
    if (bind) {
      // Face-to-face at blade contact: reach apart, mirrored facing.
      counterpart.root.position.x = (duelist.x + duelist.facing * LONGSWORD.reachCm) * CM_TO_M;
      counterpart.root.rotation.y = (-duelist.facing * Math.PI) / 2;
    }
    reachLine.position.set((duelist.x + duelist.facing * LONGSWORD.reachCm) * CM_TO_M, 0.001, 0);
    stage.renderer.render(stage.scene, stage.camera);
  };

  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta() * 1000, 100);
    if (!paused) frame(dt);
    else stage.renderer.render(stage.scene, stage.camera);
  });

  // e2e hook: deterministic stepping while paused makes mark-exact
  // assertions possible (06's Space/. pattern).
  Object.assign(window, {
    __duel: {
      duelist,
      pick: () => lastPick,
      sample: () => rig.sample(),
      timeline: () => (duelist.state.kind === "attack" ? duelist.state.timeline : null),
      get paused() { return paused; },
      setPaused(v: boolean) { paused = v; },
      step(ms: number) { frame(ms); },
    },
  });
}

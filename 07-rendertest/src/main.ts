import * as THREE from "three";
import { loadCharacter, pickModel } from "./character";
import { trackKeys } from "./input";
import { createMovement, updateMovement } from "./movement";
import { createStage } from "./scene";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const status = document.getElementById("status") as HTMLElement;

const stage = createStage(canvas);
const input = trackKeys();
const movement = createMovement();

loadCharacter(`${import.meta.env.BASE_URL}models/`, pickModel(location.search))
  .then((character) => {
    stage.scene.add(character.root);
    status.textContent = "A / D or arrow keys to walk";
    // e2e hooks: let a CDP driver assert position/facing and measure foot
    // skate (planted-foot world drift) without pixel-reading.
    Object.assign(window, { __movement: movement, __character: character.root });

    const clock = new THREE.Clock();
    stage.renderer.setAnimationLoop(() => {
      // Clamp so a background-tab pause cannot teleport the character.
      const dt = Math.min(clock.getDelta(), 0.1);
      updateMovement(movement, input, dt);
      character.update(movement, dt);
      stage.renderer.render(stage.scene, stage.camera);
    });
  })
  .catch((err: unknown) => {
    status.textContent = `failed to load model: ${String(err)}`;
  });

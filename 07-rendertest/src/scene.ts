import * as THREE from "three";

/** Half the vertical world extent the camera shows, in meters. The full
 *  view is 5.625 m tall by 10 m wide at the canvas's 16:9, sizing the
 *  ~1.8 m mannequin to about a third of the frame like 06's fighters. */
const VIEW_HALF_H = 2.8125;
/** Camera center height: floor (y = 0) lands ~71% down the frame, close
 *  to where 06 draws its floor line. */
const VIEW_CENTER_Y = 1.2;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

/**
 * A side-view orthographic stage styled after 06-dueling: dark backdrop,
 * flat floor band. The orthographic projection removes perspective
 * convergence so the frame reads as a 2D scene.
 *
 * The floor is a vertical quad facing the camera, not a ground plane: a
 * horizontal plane is edge-on to a straight side view and renders as
 * nothing. The band is unlit like 06's canvas fill, and the character's
 * feet at y = 0 rest on its top edge. Shadows are skipped for the same
 * reason - a ground shadow is invisible edge-on.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1e24);

  const aspect = canvas.width / canvas.height;
  const halfW = VIEW_HALF_H * aspect;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, VIEW_HALF_H, -VIEW_HALF_H, 0.1, 50);
  camera.position.set(0, VIEW_CENTER_Y, 10);
  camera.lookAt(0, VIEW_CENTER_Y, 0);

  const hemi = new THREE.HemisphereLight(0xcfd3da, 0x2a2e36, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 8, 5);
  scene.add(sun);

  const bandTop = 0;
  const bandBottom = VIEW_CENTER_Y - VIEW_HALF_H;
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * halfW, bandTop - bandBottom),
    new THREE.MeshBasicMaterial({ color: 0x2a2e36 }),
  );
  band.position.set(0, (bandTop + bandBottom) / 2, -1);
  scene.add(band);

  return { renderer, scene, camera };
}

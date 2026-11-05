import * as THREE from './vendor/three/three.module.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { buildDiagramPlates, iconPlacements } from './paper-solids.js?v=paper-journey-20261106-1';

export const PAPER_SIZE = {width: 1582, height: 1632};
export const PAPER_OVERVIEW = {yaw: .37, pitch: -.34};
const iconURL = new URL('./paper-figure/icons.glb', import.meta.url);
const printURL = new URL('./paper-figure/print.webp', import.meta.url);
export function buildPaperFigure(printTexture, iconLibrary) {
  printTexture.colorSpace = THREE.SRGBColorSpace;
  const art = new THREE.Group();
  art.name = 'Figure 3';
  art.rotation.order = 'YXZ';
  art.add(buildDiagramPlates(printTexture));
  const templates = new Map();
  for (const slot of iconPlacements) {
    if (!templates.has(slot.kind)) {
      const source = iconLibrary.getObjectByName(slot.kind);
      if (!source) throw new Error('Missing Figure 3 sculpture: ' + slot.kind);
      const object = source.clone(true);
      const bounds = new THREE.Box3().setFromObject(object, true);
      templates.set(slot.kind, {object, size: bounds.getSize(new THREE.Vector3()), bounds});
    }
    const {object, size, bounds} = templates.get(slot.kind);
    const sculpture = object.clone(true);
    const mount = new THREE.Group();
    const scale = Math.min(slot.width / size.x, slot.height / size.y);
    sculpture.position.x -= (bounds.min.x + bounds.max.x) / 2;
    sculpture.position.y -= (bounds.min.y + bounds.max.y) / 2;
    sculpture.position.z -= bounds.min.z;
    mount.name = slot.id;
    mount.userData = {part: 'sculpture', kind: slot.kind};
    mount.position.set(slot.x - PAPER_SIZE.width / 2, PAPER_SIZE.height / 2 - slot.y, slot.z);
    mount.scale.setScalar(scale);
    mount.add(sculpture);
    art.add(mount);
  }
  art.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const solid = materials.every(material => !material.transparent && !material.map);
    object.castShadow = solid;
    object.receiveShadow = solid;
  });
  return art;
}

export function addPaperLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0xa8bdd2, 1.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(-620, 920, 1650);
  key.castShadow = true;
  Object.assign(key.shadow.camera, {near: 350, far: 3300, left: -1260, right: 1260, top: 1260, bottom: -1260});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.normalBias = .8;
  key.shadow.bias = -.00009;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc7e2ff, .8);
  fill.position.set(1050, -350, 650);
  scene.add(fill);
}

export function releaseObjects(...roots) {
  const geometries = new Set(), materials = new Set();
  for (const root of roots) root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [].concat(object.material)) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export async function loadArtwork() {
  const [print, icons] = await Promise.allSettled([
    new THREE.TextureLoader().loadAsync(printURL.href),
    new GLTFLoader().loadAsync(iconURL.href),
  ]);
  if (print.status === 'fulfilled' && icons.status === 'fulfilled') {
    return {print: print.value, library: icons.value.scene};
  }
  if (print.status === 'fulfilled') print.value.dispose();
  if (icons.status === 'fulfilled') releaseObjects(icons.value.scene);
  throw (print.reason || icons.reason);
}


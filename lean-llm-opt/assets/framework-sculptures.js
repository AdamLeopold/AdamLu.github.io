import * as THREE from './vendor/three/three.module.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';

const libraryURL = new URL('./paper-figure/icons.glb', import.meta.url);
export const FLOW_SCULPTURES = Object.freeze({
  query: 'qa', classification: 'taxonomy', workflow: 'workflow', model: 'llm',
  codegen: 'workstation', solver: 'python-gurobi', solution: 'laptop',
  references: 'repository', csv: 'archive', csvqa: 'rag',
});

export async function loadSculptureLibrary() {
  return (await new GLTFLoader().loadAsync(libraryURL.href)).scene;
}

export function disposeSculptures(root) {
  const geometries = new Set(), materials = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function makeFlowSculpture(nodeId, library, footprint) {
  const kind = FLOW_SCULPTURES[nodeId];
  if (!kind) throw Error('Unknown flow sculpture: ' + nodeId);
  const model = new THREE.Group();
  function instance(name,x=0) {
    const original = library.getObjectByName(name);
    if (!original) throw Error('Missing flow sculpture: ' + name);
    const clone = original.clone(true);
    clone.position.x += x;
    clone.traverse(object => {
      if (!object.isMesh) return;
      object.geometry = object.geometry.clone();
      object.material = object.material.clone();
      object.material.transparent = true;
    });
    model.add(clone);
  }
  if (kind === 'python-gurobi') {instance('python',-.56);instance('gurobi',.56);}
  else instance(kind);
  model.rotation.set(.16,-.21,0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model,true);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = .94 * Math.min(footprint.width/size.x,footprint.height/size.y,footprint.depth/size.z);
  model.scale.setScalar(scale);
  const center = bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  model.position.set((footprint.minX+footprint.maxX)/2-center.x,
    (footprint.minY+footprint.maxY)/2-center.y,(footprint.minZ+footprint.maxZ)/2-center.z);
  model.name = 'flow-sculpture-' + nodeId;
  model.userData = {sculpture:kind, nodeId};
  return model;
}

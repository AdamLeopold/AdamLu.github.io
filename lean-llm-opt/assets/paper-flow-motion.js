import * as THREE from './vendor/three/three.module.js';
import {paths, samplePath} from './paper-solids.js?v=paper-journey-20261106-1';
import {sampleTeachingFlows, TEACHING_CYCLE} from './framework-topology.js';

export const PAPER_FLOW_COLORS = Object.freeze({query: '#1489ff', data: '#20bc83', output: '#f59730'});
export const PAPER_FLOW_DURATION_MS = TEACHING_CYCLE.durationMs;

// These short lanes belong to the agent interiors. Request and return never
// share a lane; the Figure 3 solids and their published connections stay intact.
export const PAPER_RETRIEVAL_PATHS = Object.freeze([
  {id: 'classifier-reference-request', kind: 'query', points: [[136,748,93],[174,748,93],[190,762,93],[239,762,93],[266,751,93]]},
  {id: 'classifier-reference-return', kind: 'query', points: [[269,796,93],[239,796,93],[181,796,93],[136,782,93]]},
  {id: 'workflow-reference-request', kind: 'query', points: [[690,773,91],[720,749,91],[802,749,91],[824,741,91]]},
  {id: 'workflow-reference-return', kind: 'query', points: [[824,776,91],[801,794,91],[714,794,91],[691,801,91]]},
  {id: 'model-data-request', kind: 'data', points: [[1284,667,94],[1307,693,94],[1329,714,94],[1414,714,94]]},
  {id: 'model-data-return', kind: 'data', points: [[1415,749,94],[1329,749,94],[1306,725,94],[1284,703,94]]},
]);

const LOWER_ROUTES = Object.freeze({
  tailored: ['identify-categories', 'category-to-dataset', 'retrieve-data', 'data-to-final'],
  agnostic: ['dataset-to-schema', 'schema-to-llm', 'query-to-llm', 'llm-to-plan'],
});
const CONDUITS = new Set([...paths.map(([id]) => id), ...PAPER_RETRIEVAL_PATHS.map(path => path.id)]);
CONDUITS.delete('workflow-callout'); // A magnifying callout, never an information channel.
const NODE_PARTS = Object.freeze({
  query: ['problem-description', 'query-answer'],
  csv: ['parameters', 'user-data-archive'],
  classification: ['classification-card', 'classifier-language-model'],
  type: ['type-junction'], workflow: ['workflow-card'],
  document: ['handoff-document'], model: ['model-card', 'model-language-model'],
  csvqa: ['model-rag', 'model-data-archive'],
  codegen: ['output-workbench', 'code-workstation'],
  solver: ['output-workbench', 'python-runtime', 'gurobi-solver'],
  solution: ['output-card'],
  tailored: ['type-tailored-panel'], agnostic: ['type-agnostic-panel'],
});
const STEP_NODES = Object.freeze({
  'inputs-ready': ['query', 'csv'],
  'query-to-classification': ['query', 'classification'],
  'classification-references': ['classification'],
  'workflow-references': ['type', 'workflow'],
  'workflow-to-model': ['workflow', 'document', 'model'],
  'csv-request': ['model', 'csvqa'], 'csv-response': ['csv', 'csvqa', 'model'],
  'formulation-ready': ['model'], 'code-generation': ['model', 'codegen'],
  'program-to-solver': ['codegen', 'solver'],
  'runtime-read-and-solve': ['solver'], 'result-collected': ['solution'],
});
const unit = value => Math.max(0, Math.min(1, Number(value) || 0));
const routeName = route => route === 'agnostic' ? 'agnostic' : 'tailored';
const selectedConduit = (edgeId, route) => CONDUITS.has(edgeId)
  && !LOWER_ROUTES[route === 'agnostic' ? 'tailored' : 'agnostic'].includes(edgeId);

/** Pure timeline sampler. Scroll and camera state deliberately are not inputs. */
export function samplePaperFlow(elapsedMs = 0, {route = 'tailored', live = false, frame = null} = {}) {
  route = routeName(frame?.route || route);
  if (live) {
    const packets = ['failed', 'cancelled', 'cancelling'].includes(frame?.status) ? []
      : (Array.isArray(frame?.packets) ? frame.packets : []).filter(packet =>
        packet && selectedConduit(packet.edgeId, route) && Number.isFinite(packet.progress),
      ).map((packet, index) => ({...packet, id: packet.id || `live-${index}`,
        streamId: packet.streamId || 'live', taskIndex: packet.taskIndex || 1,
        kind: Object.hasOwn(PAPER_FLOW_COLORS, packet.kind) ? packet.kind : 'query',
        progress: unit(packet.progress), direction: packet.direction === -1 ? -1 : 1,
        mark: packet.mark || '',
      }));
    let node = frame?.nodeId;
    if (node === 'references') node = Number(frame.stage) === 3 ? 'workflow' : Number(frame.stage) >= 5 ? 'codegen' : 'classification';
    return {live: true, waiting: !frame, route, elapsedMs, durationMs: PAPER_FLOW_DURATION_MS,
      status: frame?.status || 'waiting', streams: [], packets,
      nodes: node && NODE_PARTS[node] ? [node] : [],
      activeConduits: [...new Set(packets.map(packet => packet.edgeId))],
    };
  }

  const streams = sampleTeachingFlows(elapsedMs), packets = [], nodes = new Set();
  for (const stream of streams) {
    const progress = stream.localProgress, index = stream.taskIndex;
    const marks = {query: `Q${index}`, data: `D${index}`, output: `Q${index}`};
    const emit = (edgeId, kind = 'query', from = 0, to = 1, role = 'forward', local = progress) => {
      if (local < from || local >= to || !selectedConduit(edgeId, route)) return;
      packets.push({id: `${stream.streamId}:${edgeId}`, streamId: stream.streamId,
        taskIndex: index, mark: marks[kind], kind, edgeId, direction: 1,
        progress: unit((local - from) / (to - from)), role,
      });
    };
    for (const node of STEP_NODES[stream.stepId] || []) nodes.add(node);
    switch (stream.stepId) {
      case 'query-to-classification':
        emit('description-to-classifier'); break;
      case 'classification-references':
        emit('classifier-reference-request', 'query', 0, .5, 'request');
        emit('classifier-reference-return', 'query', .5, 1, 'return'); break;
      case 'workflow-references': {
        emit('classifier-to-type', 'query', 0, .13);
        emit('type-to-workflow', 'query', .13, .25);
        emit('workflow-reference-request', 'query', .25, .42, 'request');
        emit('workflow-reference-return', 'query', .42, .60, 'return');
        if (progress >= .60) {
          nodes.add(route);
          const detail = (progress - .60) / .40;
          if (route === 'tailored') {
            emit('identify-categories', 'query', 0, .20, 'identify', detail);
            emit('category-to-dataset', 'query', .20, .35, 'request', detail);
            emit('retrieve-data', 'data', .35, .80, 'return', detail);
            emit('data-to-final', 'data', .80, 1, 'formulate', detail);
          } else {
            emit('dataset-to-schema', 'data', 0, .32, 'schema', detail);
            emit('schema-to-llm', 'data', .32, .65, 'schema', detail);
            emit('query-to-llm', 'query', .10, .65, 'query', detail);
            emit('llm-to-plan', 'query', .65, 1, 'plan', detail);
          }
        }
        break;
      }
      case 'workflow-to-model':
        emit('workflow-to-document', 'query', 0, .35, 'workflow');
        emit('document-to-model', 'query', .35, 1, 'workflow'); break;
      case 'csv-request':
        emit('model-data-request', 'data', 0, 1, 'request'); break;
      case 'csv-response':
        emit('data-embedding-to-model', 'data', 0, .72, 'records');
        emit('model-data-return', 'data', .72, 1, 'return'); break;
      case 'code-generation':
        emit('model-to-code', 'output', 0, 1, 'program'); break;
      default: break; // Processing states stay at the actual module, with no invented edge.
    }
  }
  return {live: false, waiting: false, route, elapsedMs: streams[0].globalElapsedMs,
    durationMs: PAPER_FLOW_DURATION_MS, status: 'teaching', streams, packets,
    nodes: [...nodes], activeConduits: [...new Set(packets.map(packet => packet.edgeId))],
  };
}

/** Samples the very same 3D centerline used to construct the visible conduit. */
export function samplePaperCurve(curve, progress, direction = 1) {
  const reverse = direction === -1, u = reverse ? 1 - unit(progress) : unit(progress);
  const point = curve.getPointAt(u), tangent = curve.getTangentAt(u).normalize();
  if (reverse) tangent.negate();
  return {point: point.toArray(), tangent: tangent.toArray(), u};
}

const RINGS = 25, SIDES = 9;
const RING_DIRECTIONS = Array.from({length: SIDES}, (_, side) => {
  const angle = side / SIDES * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
});
function packetMesh() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RINGS * SIDES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RINGS * SIDES * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let ring = 0; ring < RINGS - 1; ring++) for (let side = 0; side < SIDES; side++) {
    const a = ring * SIDES + side, b = ring * SIDES + (side + 1) % SIDES;
    const c = a + SIDES, d = b + SIDES;
    indices.push(a, b, c, b, d, c);
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true,
    depthWrite: false, depthTest: true, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'information-packet'; mesh.frustumCulled = false; mesh.renderOrder = 3;
  mesh.userData.part = 'flow-packet';
  return mesh;
}

// A short colored sleeve and fading tail wrap the conduit. The radius clears
// its solid surface, while every ring's center remains exactly on its curve.
// This keeps depth testing enabled: foreground bodies can still occlude flow.
function placePacket(mesh, path, packet) {
  const {curve, radius, headLength = 0} = path, length = curve.getLength();
  const direction = packet.direction === -1 ? -1 : 1;
  const progress = unit(packet.progress), travel = progress * length;
  const head = Math.min(14, length * .30), tail = Math.min(44, length * .58);
  const begin = Math.max(0, travel - head - tail), end = Math.max(begin + .01, travel);
  const position = mesh.geometry.attributes.position, colors = mesh.geometry.attributes.color;
  const reference = new THREE.Vector3(0, 0, 1), vertical = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3(), binormal = new THREE.Vector3(), point = new THREE.Vector3(), tangent = new THREE.Vector3();
  for (let ring = 0; ring < RINGS; ring++) {
    const distance = THREE.MathUtils.lerp(begin, end, ring / (RINGS - 1));
    const u = direction === 1 ? distance / length : 1 - distance / length;
    curve.getPointAt(unit(u), point); curve.getTangentAt(unit(u), tangent).normalize();
    normal.crossVectors(tangent, Math.abs(tangent.z) > .95 ? vertical : reference).normalize();
    binormal.crossVectors(tangent, normal).normalize();
    const remaining = (1 - u) * length;
    const surface = headLength > 0 && remaining < headLength ? radius * 2.1 * remaining / headLength : radius;
    const age = travel - distance, core = age <= head;
    const sleeveRadius = Math.max(.8, surface) + (core ? 1.15 : .55);
    const alpha = core ? .98 : .55 * unit(1 - (age - head) / Math.max(.01, tail));
    for (let side = 0; side < SIDES; side++) {
      const [cos, sin] = RING_DIRECTIONS[side], vertex = ring * SIDES + side;
      position.setXYZ(vertex,
        point.x + sleeveRadius * (normal.x * cos + binormal.x * sin),
        point.y + sleeveRadius * (normal.y * cos + binormal.y * sin),
        point.z + sleeveRadius * (normal.z * cos + binormal.z * sin),
      );
      colors.setXYZW(vertex, 1, 1, 1, alpha);
    }
  }
  position.needsUpdate = true; colors.needsUpdate = true;
  mesh.material.color.set(PAPER_FLOW_COLORS[packet.kind]);
  mesh.userData.packet = packet; mesh.visible = true;
  return samplePaperCurve(curve, progress, direction).point;
}

function retrievalLane(definition) {
  const group = new THREE.Group(), curve = samplePath(definition.points, 9), radius = 1.8;
  group.name = definition.id; group.userData.part = 'retrieval-lane';
  const material = new THREE.MeshBasicMaterial({color: PAPER_FLOW_COLORS[definition.kind],
    transparent: true, opacity: .32, depthTest: true, depthWrite: false, toneMapped: false});
  const shaft = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.ceil(curve.getLength() / 6)), radius, SIDES, false), material);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(4.1, 9, SIDES), material);
  const endpoint = curve.getPointAt(1), tangent = curve.getTangentAt(1).normalize();
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  arrow.position.copy(endpoint).addScaledVector(tangent, -4.5);
  group.add(shaft, arrow); group.visible = false;
  return {group, curve, radius, headLength: 9};
}

function packetLabelTexture(mark, kind, cache) {
  const text = String(mark || '').slice(0, 16), key = `${kind}:${text}`;
  if (!text) return null;
  if (cache.has(key)) return cache.get(key);
  // The motion sampler and solid geometry are also used in DOM-free checks.
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') { cache.set(key, null); return null; }
  let canvas, context;
  try { canvas = document.createElement('canvas'); context = canvas.getContext?.('2d'); }
  catch { cache.set(key, null); return null; }
  if (!context?.measureText || !context?.fillText || !context?.strokeText) { cache.set(key, null); return null; }
  const font = '600 36px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.font = font;
  canvas.width = Math.min(384, Math.ceil(context.measureText(text).width + 16)); canvas.height = 56;
  context.font = font; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.lineJoin = 'round'; context.lineWidth = 3;
  context.strokeStyle = 'rgba(250,253,255,.94)';
  context.fillStyle = PAPER_FLOW_COLORS[kind];
  context.strokeText(text, canvas.width / 2, 28); context.fillText(text, canvas.width / 2, 28);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const record = {texture, width: canvas.width / 2, height: 28};
  cache.set(key, record); return record;
}

function placePacketLabel(label, record, path, packet, point) {
  if (label.material.map !== record.texture) {
    label.material.map = record.texture; label.material.needsUpdate = true;
  }
  // Half-size texture mapping gives a fixed 18-unit font in the paper's source
  // coordinate system. Camera zoom changes its apparent size naturally.
  label.scale.set(record.width, record.height, 1);
  const {tangent} = samplePaperCurve(path.curve, packet.progress, packet.direction);
  const lateral = new THREE.Vector3(-tangent[1], tangent[0], 0).normalize();
  label.position.set(...point).addScaledVector(lateral, 23);
  label.position.z += path.radius + 8;
  label.userData.packet = packet; label.visible = true;
}

/** Mounts animation on a separate buildPaperFigure instance. It owns no clock. */
export function createPaperFlow(art) {
  const group = new THREE.Group(); group.name = 'Figure 3 information flow';
  const pathMap = new Map(), highlights = new Map(), pool = [], lanes = [], labels = [], labelTextures = new Map();
  art.traverse(object => {
    if (CONDUITS.has(object.name) && object.userData.flowCurve) {
      pathMap.set(object.name, {curve: object.userData.flowCurve, radius: object.userData.flowRadius,
        headLength: object.userData.flowHeadLength || 0});
    }
  });
  for (const definition of PAPER_RETRIEVAL_PATHS) {
    const lane = retrievalLane(definition); pathMap.set(definition.id, lane);
    lanes.push(lane); group.add(lane.group);
  }
  for (const name of new Set(Object.values(NODE_PARTS).flat())) {
    const object = art.getObjectByName(name);
    if (!object) continue;
    object.traverse(child => {
      if (!child.isMesh || highlights.has(child)) return;
      const originals = Array.isArray(child.material) ? child.material : [child.material];
      if (!originals.some(material => material.emissive)) return;
      const materials = originals.map(material => material.clone());
      highlights.set(child, {original: child.material, materials, name});
      child.material = Array.isArray(child.material) ? materials : materials[0];
    });
  }
  art.add(group);
  let lastState = null, frozenElapsed = null, highlightKey = null, disposed = false;
  return {
    group,
    update(elapsedMs = 0, options = {}) {
      if (disposed) return lastState;
      if (options.reduced && !options.live) {
        if (frozenElapsed === null) frozenElapsed = elapsedMs;
        elapsedMs = frozenElapsed;
      } else frozenElapsed = null;
      // Camera-only redraws must not rebuild or re-upload unchanged flow meshes.
      if (!options.live && lastState && !lastState.live && lastState.elapsedMs === elapsedMs
        && lastState.route === routeName(options.frame?.route || options.route)) return lastState;
      const state = samplePaperFlow(elapsedMs, options);
      for (const mesh of pool) mesh.visible = false;
      for (const label of labels) if (label) label.visible = false;
      for (const lane of lanes) lane.group.visible = state.activeConduits.includes(lane.group.name);
      state.packets = state.packets.flatMap((packet, index) => {
        const path = pathMap.get(packet.edgeId);
        if (!path) return [];
        if (!pool[index]) { pool[index] = packetMesh(); group.add(pool[index]); }
        const point = placePacket(pool[index], path, packet);
        const record = packetLabelTexture(packet.mark, packet.kind, labelTextures);
        if (record) {
          if (!labels[index]) {
            const material = new THREE.SpriteMaterial({transparent: true, depthTest: true,
              depthWrite: false, toneMapped: false, alphaTest: .02, sizeAttenuation: true});
            labels[index] = new THREE.Sprite(material); labels[index].name = 'information-packet-label';
            labels[index].userData.part = 'flow-label'; labels[index].renderOrder = 4;
            group.add(labels[index]);
          }
          placePacketLabel(labels[index], record, path, packet, point);
        }
        return [{...packet, point}];
      });
      const nextHighlightKey = state.nodes.join('|');
      if (nextHighlightKey !== highlightKey) {
        const names = new Set(state.nodes.flatMap(node => NODE_PARTS[node] || []));
        for (const {materials, name} of highlights.values()) for (const material of materials) {
          if (!material.emissive) continue;
          const active = names.has(name), output = ['output-card', 'output-workbench', 'code-workstation', 'python-runtime', 'gurobi-solver'].includes(name);
          const data = ['parameters', 'user-data-archive', 'model-rag', 'model-data-archive'].includes(name);
          material.emissive.set(active ? PAPER_FLOW_COLORS[output ? 'output' : data ? 'data' : 'query'] : '#000000');
          material.emissiveIntensity = active ? .20 : 0;
        }
        highlightKey = nextHighlightKey;
      }
      lastState = state; return state;
    },
    getState() { return lastState; },
    dispose() {
      if (disposed) return;
      disposed = true; art.remove(group);
      const geometries = new Set(), materials = new Set();
      group.traverse(object => {
        if (object.geometry && !object.isSprite) geometries.add(object.geometry);
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const record of labelTextures.values()) if (record) record.texture.dispose();
      for (const [object, record] of highlights) {
        object.material = record.original;
        for (const material of record.materials) material.dispose();
      }
    },
  };
}

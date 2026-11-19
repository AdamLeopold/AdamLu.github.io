// Figure 3 as rigid parts. Each agent, module and route keeps its panels, tables, print and icons together,
// so the figure can lift apart and land again without breaking any unit into pieces.
import * as THREE from './vendor/three/three.module.js';

const PARTS = {
  input: ['input-card', 'problem-description', 'upload-dock', 'upload-query-pedestal', 'upload-archive-pedestal', 'parameters',
    'uploaders', 'query-answer', 'user-data-archive',
    'upload', 'input-head', 'datasets-head', 'dataset-name', 'input-paragraph'],
  classify: ['classification-card', 'classifier-llm-chip', 'classifier-language-model', 'classifier-openai', 'classifier-rag', 'classifier-library',
    'class-head', 'class-llm', 'class-llm-name', 'class-rag-title', 'class-rag-name', 'class-lib-name'],
  type: ['type-junction', 'type-caption', 'problem-type-symbol', 'type-names', 'type-label'],
  workflow: ['workflow-card', 'workflow-example-tree', 'workflow-query', 'workflow-rag', 'workflow-library',
    'example-repository-0', 'example-repository-1', 'example-repository-2', 'example-repository-3',
    'workflow-heading', 'workflow-descr', 'workflow-rag-top', 'workflow-rag-name', 'workflow-ref', 'workflow-types', 'workflow-ellipsis'],
  handoff: ['handoff-document', 'handoff-caption', 'inspection-arm', 'inspection-pin', 'handoff-workflow', 'detail-magnifier', 'workflow-label'],
  embedding: ['embedding-caption', 'embedding'],
  model: ['model-card', 'model-llm-chip', 'model-language-model', 'combine-workflow-and-model', 'model-workflow-document', 'model-openai',
    'model-rag', 'model-data-archive',
    'model-heading', 'model-mark', 'model-llm-name', 'model-rag-top', 'model-rag-name', 'model-datasets', 'model-workflow'],
  output: ['output-card', 'output-workbench', 'python-runtime', 'gurobi-solver', 'code-workstation', 'gurobi', 'outcome'],
  deck: ['detail-deck'],
  tailored: ['type-tailored-panel', 'tailored-problem', 'tailored-final-model', 'tailored-category', 'tailored-relevant-data',
    'tailored-example-pedestal', 'model-screen-pedestal', 'category-index-pedestal', 'retrieved-data-pedestal', 'product-archive-pedestal',
    'tailored-products', 'identify-categories', 'category-to-dataset', 'retrieve-data', 'data-to-final',
    'tailored-example-qa', 'tailored-model-screen', 'category-index', 'tailored-model-engine', 'retrieved-detail-symbol', 'sales-data-archive', 'retrieval-tools',
    'tailored-heading', 'tailored-para-head', 'tailored-para', 'final-head', 'final-model-print', 'identification', 'categories-head', 'categories-value',
    'tailored-dataset-head', 'final-llm', 'final-engine', 'detail-head', 'detail-data', 'detail-rag'],
  agnostic: ['type-agnostic-panel', 'agnostic-table-schema', 'agnostic-model-plan', 'agnostic-llm-chip', 'agnostic-problem',
    'economic-archive-pedestal', 'model-plan-pedestal', 'agnostic-demo-data', 'schema-grid',
    'dataset-to-schema', 'schema-to-llm', 'query-to-llm', 'llm-to-plan',
    'economic-data-archive', 'schema-python', 'plan-symbol', 'prompt-workflow', 'abstract-openai-symbol', 'abstract-model-engine', 'agnostic-example-qa',
    'agnostic-heading', 'agnostic-dataset-head', 'agnostic-python', 'schema-head', 'schema-print', 'prompt', 'abstract-openai', 'abstract-llm',
    'abstract-head', 'abstract-plan', 'economic-head', 'economic-text'],
};
const UNIT_OF = new Map(Object.entries(PARTS).flatMap(([unit, names]) => names.map(name => [name, unit])));
export const unitOf = name => UNIT_OF.get(name);

// The station of the architecture tour at which each unit lands.
export const UNIT_STAGE = Object.freeze({input: 1, classify: 2, type: 2, workflow: 3, handoff: 3, model: 4, embedding: 4, deck: 4, tailored: 4, agnostic: 4, output: 5});
// Arrows between units stay on the board and show once both ends have landed.
export const LINKS = Object.freeze({
  'description-to-classifier': ['input', 'classify'], 'classifier-to-type': ['classify', 'type'], 'type-to-workflow': ['type', 'workflow'],
  'workflow-to-document': ['workflow', 'handoff'], 'document-to-model': ['handoff', 'model'], 'data-embedding-to-model': ['input', 'embedding', 'model'],
  'model-to-code': ['model', 'output'], 'workflow-callout': ['handoff', 'deck'],
});
const LANE_UNITS = [['classifier-', 'classify'], ['workflow-', 'workflow'], ['model-', 'model']];
function edgeUnits(id) {
  if (LINKS[id]) return LINKS[id];
  if (UNIT_OF.has(id)) return [UNIT_OF.get(id)];
  const lane = LANE_UNITS.find(([prefix]) => id.startsWith(prefix));
  return lane ? [lane[1]] : [];
}

// Hover lift in figure units along the paper's up (y) and out of the paper (z), a slight tumble, and a start delay in seconds.
const AIR = {
  input: [150, 240, -.10, .06, .03, 0], classify: [120, 200, .08, -.10, -.04, .04], type: [170, 300, -.06, .14, .08, .07],
  workflow: [130, 230, .07, .09, -.03, .05], handoff: [190, 320, -.12, -.08, .07, .09], embedding: [210, 340, .10, .10, -.08, .10],
  model: [125, 220, -.07, -.10, .04, .03], output: [160, 270, .09, .07, -.05, .06], deck: [60, 120, .03, -.04, .01, .02],
  tailored: [100, 210, -.06, .07, .03, .05], agnostic: [110, 240, .06, -.06, -.03, .08],
};
// Flying away carries every unit well past the top of the frame, a little out of the paper, still turning.
const AWAY = {y: 2300, z: 420, spin: 2.2};
// Each unit rests at 0, hovers in view at 1 and is out of sight at 2.
export const BOARD = 0, HOVER = 1, AWAY_POSE = 2;

/** Regroups a freshly built Figure 3 into rigid units under the same root. Positions are unchanged. */
export function assembleUnits(art) {
  const holders = new Map();
  for (const id of Object.keys(PARTS)) {
    const group = new THREE.Group();
    group.name = 'unit:' + id;
    group.userData = {part: 'unit', unit: id, stage: UNIT_STAGE[id]};
    holders.set(id, group);
  }
  // Only top-level pieces move: panel meshes of the apparatus and the icon mounts. Icon internals keep their mounts.
  const apparatus = art.children.find(child => child.isGroup && child.userData.part !== 'sculpture');
  const moves = [];
  for (const object of [...(apparatus?.children || []), ...art.children]) {
    const unit = object.userData.part === 'typesetting' ? object.userData.group : UNIT_OF.get(object.name);
    if (unit && holders.has(unit)) moves.push([object, holders.get(unit)]);
  }
  for (const [object, group] of moves) group.add(object);
  for (const group of holders.values()) art.add(group);
  // Links get their own material so each one can fade independently.
  art.traverse(object => {
    if (!object.isMesh || !LINKS[object.name]) return;
    object.material = object.material.clone();
    object.material.transparent = true;
    object.userData.link = LINKS[object.name];
  });
  return holders;
}

const smooth = x => x * x * (3 - 2 * x);

/** Springs each unit between its pose on the board (0), hovering in view (1) and out of sight (2). */
export function createUnitMotion(art, {lift = 1} = {}) {
  const units = [];
  const links = [];
  art.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(art.matrixWorld).invert();
  for (const group of art.children) {
    if (group.userData.part !== 'unit') continue;
    const box = new THREE.Box3().setFromObject(group).applyMatrix4(inverse);
    const [y, z, rx, ry, rz, delay] = AIR[group.userData.unit];
    units.push({group, id: group.userData.unit, stage: group.userData.stage, pivot: box.getCenter(new THREE.Vector3()),
      lift: new THREE.Vector3(0, y * lift, z * lift), away: new THREE.Vector3(0, AWAY.y * (1 + delay * 2), AWAY.z),
      tumble: new THREE.Euler(rx, ry, rz), delay,
      h: 0, v: 0, target: 0, pending: 0, wait: 0});
  }
  art.traverse(object => { if (object.isMesh && object.userData.link) links.push(object); });
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const m = new THREE.Matrix4(), r = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const offset = new THREE.Vector3();
  function place(unit) {
    const hover = Math.min(1, unit.h), far = Math.max(0, unit.h - 1), turn = hover + far * AWAY.spin;
    offset.copy(unit.lift).multiplyScalar(hover).addScaledVector(unit.away, far);
    e.set(unit.tumble.x * turn, unit.tumble.y * turn, unit.tumble.z * turn);
    r.makeRotationFromQuaternion(q.setFromEuler(e));
    m.makeTranslation(unit.pivot.x + offset.x, unit.pivot.y + offset.y, unit.pivot.z + offset.z)
      .multiply(r).multiply(new THREE.Matrix4().makeTranslation(-unit.pivot.x, -unit.pivot.y, -unit.pivot.z));
    unit.group.matrix.copy(m);
    unit.group.matrixAutoUpdate = false;
    unit.group.matrixWorldNeedsUpdate = true;
  }
  function shade() {
    for (const link of links) {
      const air = Math.max(...link.userData.link.map(id => byId.get(id)?.h ?? 0));
      const opacity = 1 - smooth(Math.min(1, air * 3));
      link.material.opacity = opacity;
      link.visible = opacity > .01;
    }
  }
  const poseFor = (unit, stage) => (stage < 1 ? HOVER : stage >= unit.stage ? BOARD : AWAY_POSE);
  function aim(unit, target, wait) {
    if (unit.pending === target && (unit.wait > 0 || unit.target === target)) return;
    unit.pending = target;
    unit.wait = wait;
    if (wait <= 0) unit.target = target;
  }
  const api = {
    units,
    /** Every unit to the same pose (BOARD, HOVER or AWAY_POSE); spread staggers the start. */
    setAll(target, {spread = 1} = {}) { for (const unit of units) aim(unit, target, unit.delay * spread); },
    /** Before the tour starts every unit hovers; afterwards units of stations up to the given one land and the rest stay out of sight. */
    setStage(stage) { for (const unit of units) aim(unit, poseFor(unit, stage), unit.delay * .8); },
    /** Puts every unit at its pose for the station at once; true when anything moved. */
    settle(stage) {
      let changed = false;
      for (const unit of units) {
        const target = poseFor(unit, stage);
        if (unit.h !== target || unit.v !== 0 || unit.wait > 0 || unit.target !== target) changed = true;
        unit.pending = target;
      }
      if (changed) api.snap();
      return changed;
    },
    snap() {
      for (const unit of units) { unit.target = unit.pending; unit.wait = 0; unit.h = unit.target; unit.v = 0; place(unit); }
      shade();
    },
    /** Advances the springs; returns true while anything still moves. */
    step(dt) {
      let moving = false;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
      for (const unit of units) {
        if (unit.wait > 0) { unit.wait -= dt; moving = true; if (unit.wait > 0) continue; unit.target = unit.pending; }
        if (unit.h === unit.target && unit.v === 0) continue;
        // Long flights to and from out of sight run on a softer spring than the short hover.
        const up = unit.target > unit.h, long = Math.max(unit.target, unit.h) > 1.05;
        const k = long ? 26 : 70, c = long ? (up ? 9 : 6) : (up ? 12 : 8);
        for (let i = 0; i < steps; i++) {
          unit.v += (k * (unit.target - unit.h) - c * unit.v) * h;
          unit.h += unit.v * h;
          // Landing parts bounce off the board instead of sinking into it.
          if (unit.h < 0) { unit.h = 0; unit.v = unit.v < -.35 ? -unit.v * .3 : 0; }
        }
        if (Math.abs(unit.target - unit.h) < 1e-3 && Math.abs(unit.v) < 1e-3) { unit.h = unit.target; unit.v = 0; } else moving = true;
        place(unit);
      }
      shade();
      return moving;
    },
    level() { return units.reduce((max, unit) => Math.max(max, unit.h), 0); },
    landed(id) { const unit = byId.get(id); return !unit || (unit.h < .02 && unit.target === 0 && unit.wait <= 0); },
    /** Edges whose ends are not all on the board; flow packets skip them. */
    hiddenEdges(ids) { return new Set(ids.filter(id => edgeUnits(id).some(unit => !api.landed(unit)))); },
  };
  return api;
}

/** The unit that owns an object, if any. */
export function unitGroupOf(object) {
  for (let node = object; node; node = node.parent) if (node.userData?.part === 'unit') return node;
  return null;
}

/** Compact straight/rounded routes shared by lines, arrows, and payloads. */
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const valueAt = (collection, key) => collection instanceof Map ? collection.get(key) : collection?.[key];
const near = (a, b) => Math.abs(a - b) < 1e-8;
const coordinate = point => Array.isArray(point) ? [finite(point[0]), finite(point[1]), finite(point[2])] : [finite(point?.x), finite(point?.y), finite(point?.z)];
const canonical = (point, mobile) => mobile ? [-point[1], -point[0]] : [point[0], point[1]];
const world = (point, mobile, z) => (mobile ? [-point[1], -point[0], z] : [point[0], point[1], z]).map(value => value === 0 ? 0 : value);
const MAIN = ['query', 'classification', 'workflow', 'model', 'codegen', 'solver', 'solution'];

function boxesFor(positions, footprints, mobile) {
  const entries = positions instanceof Map ? [...positions] : Object.entries(positions || {});
  return new Map(entries.map(([id, position]) => {
    const [u, v] = canonical(coordinate(position), mobile), fp = valueAt(footprints, id) || {};
    const halfWidth = Math.max(.1, finite(fp.width, 1.8)) / 2, halfHeight = Math.max(.1, finite(fp.height, 1.8)) / 2;
    const minX = finite(fp.minX, -halfWidth), maxX = finite(fp.maxX, halfWidth);
    const minY = finite(fp.minY, -halfHeight), maxY = finite(fp.maxY, halfHeight);
    const offsets = mobile ? [-maxY, -minY, -maxX, -minX] : [minX, maxX, minY, maxY];
    const box = {id, minU: u + offsets[0], maxU: u + offsets[1], minV: v + offsets[2], maxV: v + offsets[3]};
    box.u = (box.minU + box.maxU) / 2; box.v = (box.minV + box.maxV) / 2;
    box.width = box.maxU - box.minU; box.height = box.maxV - box.minV;
    return [id, box];
  }));
}

function port(box, side, fraction = 0) {
  const f = clamp(fraction, -.4, .4);
  if (side === 'left' || side === 'right') return {point: [side === 'left' ? box.minU : box.maxU, box.v + box.height * f], normal: [side === 'left' ? -1 : 1, 0]};
  return {point: [box.u + box.width * f, side === 'front' ? box.minV : box.maxV], normal: [0, side === 'front' ? -1 : 1]};
}

function simplify(points) {
  const unique = points.filter((point, index) => !index || distance(point, points[index - 1]) > 1e-8), result = [];
  for (const point of unique) {
    while (result.length > 1) {
      const a = result.at(-2), b = result.at(-1);
      if ((near(a[0], b[0]) && near(b[0], point[0]) && (b[1] - a[1]) * (point[1] - b[1]) >= 0)
        || (near(a[1], b[1]) && near(b[1], point[1]) && (b[0] - a[0]) * (point[0] - b[0]) >= 0)) result.pop();
      else break;
    }
    result.push(point);
  }
  return result;
}

function intersects(a, b, box, padding = 0) {
  const left = box.minU - padding, right = box.maxU + padding, bottom = box.minV - padding, top = box.maxV + padding;
  if (near(a[0], b[0])) return a[0] > left + 1e-8 && a[0] < right - 1e-8 && Math.max(a[1], b[1]) > bottom + 1e-8 && Math.min(a[1], b[1]) < top - 1e-8;
  if (near(a[1], b[1])) return a[1] > bottom + 1e-8 && a[1] < top - 1e-8 && Math.max(a[0], b[0]) > left + 1e-8 && Math.min(a[0], b[0]) < right - 1e-8;
  return true;
}

/** Visibility-grid fallback for footprints wider than their normal station. */
function detour(start, end, boxes, preferred, padding, endpoints) {
  const xs = new Set([start[0], end[0], ...preferred.map(point => point[0])]);
  const ys = new Set([start[1], end[1], ...preferred.map(point => point[1])]);
  for (const box of boxes) {xs.add(box.minU - padding); xs.add(box.maxU + padding); ys.add(box.minV - padding); ys.add(box.maxV + padding);}
  const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b);
  x.unshift(x[0] - .6); x.push(x.at(-1) + .6); y.unshift(y[0] - .6); y.push(y.at(-1) + .6);
  const columns = x.length, rows = y.length, size = columns * rows, points = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) points.push([x[col], y[row]]);
  const indexOf = point => y.findIndex(value => near(value, point[1])) * columns + x.findIndex(value => near(value, point[0]));
  const first = indexOf(start), last = indexOf(end), costs = Array(size).fill(Infinity), previous = Array(size).fill(-1), used = new Set();
  const clear = (a, b) => boxes.every(box => !intersects(a, b, box, endpoints.has(box.id) ? 0 : padding));
  costs[first] = 0;
  for (let count = 0; count < size; count++) {
    let at = -1;
    for (let index = 0; index < size; index++) if (!used.has(index) && (at < 0 || costs[index] < costs[at])) at = index;
    if (at < 0 || !Number.isFinite(costs[at])) break;
    if (at === last) {
      const result = []; for (let index = last; index >= 0; index = previous[index]) {result.push(points[index]); if (index === first) break;}
      return simplify(result.reverse());
    }
    used.add(at);
    const row = Math.floor(at / columns), col = at % columns;
    const neighbors = [col ? at - 1 : -1, col < columns - 1 ? at + 1 : -1, row ? at - columns : -1, row < rows - 1 ? at + columns : -1].filter(index => index >= 0);
    for (const next of neighbors) {
      if (used.has(next) || !clear(points[at], points[next])) continue;
      const p = points[next], preference = preferred.length ? Math.min(...preferred.map(q => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]))) * .006 : 0;
      const bend = previous[at] >= 0 && !near(points[previous[at]][0], p[0]) && !near(points[previous[at]][1], p[1]) ? .12 : 0;
      const cost = costs[at] + distance(points[at], p) + preference + bend;
      if (cost < costs[next]) {costs[next] = cost; previous[next] = at;}
    }
  }
  throw new Error('No clear orthogonal route between module ports');
}

function rounded(points, radius, spacing) {
  const output = [], add = point => {if (!output.length || distance(output.at(-1), point) > 1e-8) output.push(point);};
  const line = (a, b) => {const steps = Math.max(1, Math.ceil(distance(a, b) / spacing)); for (let index = 1; index <= steps; index++) add(a.map((value, axis) => value + (b[axis] - value) * index / steps));};
  add(points[0]);
  for (let index = 1; index < points.length - 1; index++) {
    const a = points[index - 1], b = points[index], c = points[index + 1], incoming = distance(a, b), outgoing = distance(b, c);
    const r = Math.min(radius, incoming * .4, outgoing * .4);
    const before = b.map((value, axis) => value + (a[axis] - value) * r / incoming), after = b.map((value, axis) => value + (c[axis] - value) * r / outgoing);
    line(output.at(-1), before);
    const steps = Math.max(5, Math.ceil(r * 2 / spacing));
    for (let step = 1; step <= steps; step++) {const t = step / steps; add(b.map((value, axis) => (1 - t) ** 2 * before[axis] + 2 * (1 - t) * t * value + t ** 2 * after[axis]));}
  }
  line(output.at(-1), points.at(-1)); return output;
}

function crossesCurveSegment(a, b, box, padding) {
  let enter = 0, leave = 1;
  const min = [box.minU - padding + 1e-7, box.minV - padding + 1e-7], max = [box.maxU + padding - 1e-7, box.maxV + padding - 1e-7];
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {if (a[axis] <= min[axis] || a[axis] >= max[axis]) return false; continue;}
    const first = (min[axis] - a[axis]) / delta, last = (max[axis] - a[axis]) / delta;
    enter = Math.max(enter, Math.min(first, last)); leave = Math.min(leave, Math.max(first, last));
    if (leave <= enter) return false;
  }
  return leave > Math.max(0, enter) && enter < 1;
}

function clearsIcons(points, boxes, edge, padding) {
  return points.every((point, index) => !index || boxes.every(box => !crossesCurveSegment(points[index - 1], point, box,
    box.id === edge.from || box.id === edge.to ? 0 : padding)));
}

/** Positions and footprints are readonly Maps (or plain objects). No Three/DOM dependency. */
export function computeFlowRoute(edge, positions, footprints = new Map(), options = {}) {
  const mobile = Boolean(options.mobile), z = finite(options.z, .22), clearance = Math.max(.06, finite(options.clearance, .14));
  const radius = Math.max(.01, finite(options.cornerRadius, .10)), spacing = Math.max(.03, finite(options.spacing, .14));
  const boxes = boxesFor(positions, footprints, mobile), from = boxes.get(edge.from), to = boxes.get(edge.to);
  if (!from || !to || edge.from === edge.to) throw new TypeError('A route requires distinct known module endpoints');
  const main = MAIN.map(id => boxes.get(id)).filter(Boolean), all = [...boxes.values()];
  const rear = Math.max(...main.map(box => box.maxV)) + clearance;
  const front = Math.min(...all.map(box => box.minV)) - clearance;
  let source, target, middle = [], lane, routeClearance = clearance, routeRadius = radius;
  const trunk = MAIN.includes(edge.from) && MAIN.includes(edge.to) && edge.kind === 'flow';
  const request = edge.kind === 'request';
  if (trunk) {
    const offset = edge.route === 'tailored' ? -.065 : edge.route === 'agnostic' ? .065 : 0;
    source = port(from, 'right', offset); target = port(to, 'left', offset); lane = `trunk${edge.route ? ':' + edge.route : ''}`;
    const centerU = (source.point[0] + target.point[0]) / 2;
    middle = [[centerU, source.point[1]], [centerU, target.point[1]]];
  } else if (edge.from === 'references' || edge.to === 'references') {
    const owner = edge.from === 'references' ? edge.to : edge.from, archive = boxes.get('references');
    const ownerBox = boxes.get(owner), towardArchive = Math.sign(archive.u - ownerBox.u) || 1;
    const slots = {classification: -.25, workflow: .03, codegen: .28}, archiveFraction = (slots[owner] || 0) + towardArchive * (request ? .07 : -.07);
    const archivePort = port(archive, 'front', archiveFraction), ownerPort = port(ownerBox, 'rear', towardArchive * (request ? .17 : -.17));
    source = edge.from === 'references' ? archivePort : ownerPort; target = edge.to === 'references' ? archivePort : ownerPort;
    const bus = Math.max(rear + (request ? .12 : .43), ownerPort.point[1] + clearance + radius + (request ? .05 : .29));
    lane = request ? 'reference:request' : 'reference:return';
    middle = [[source.point[0], bus], [target.point[0], bus]];
  } else if ((edge.from === 'model' && edge.to === 'csvqa') || (edge.from === 'csvqa' && edge.to === 'model')) {
    const model = boxes.get('model'), reader = boxes.get('csvqa'), gap = model.minV - reader.maxV;
    if (gap > clearance * .7) {
      const modelPort = port(model, 'front', request ? -.20 : .20), readerPort = port(reader, 'rear', request ? -.20 : .20);
      source = edge.from === 'model' ? modelPort : readerPort; target = edge.to === 'model' ? modelPort : readerPort;
      const bus = reader.maxV + gap * (request ? .65 : .35); middle = [[source.point[0], bus], [target.point[0], bus]];
    } else {
      source = port(from, 'right', -.18); target = port(to, 'right', .18);
      const right = Math.max(model.maxU, reader.maxU), next = main.filter(box => box.minU > right).sort((a, b) => a.minU - b.minU)[0];
      const corridor = next ? next.minU - right : 1.0;
      routeClearance = Math.min(clearance, Math.max(.04, corridor / 7));
      routeRadius = Math.min(radius, routeClearance * .65);
      const bus = right + routeClearance + routeRadius + (request ? .015 : Math.min(.22, corridor * .38));
      middle = [[bus, source.point[1]], [bus, target.point[1]]];
    }
    lane = request ? 'csvqa:request' : 'csvqa:return';
  } else if ((edge.from === 'csvqa' && edge.to === 'csv') || (edge.from === 'csv' && edge.to === 'csvqa')) {
    source = port(from, 'front', -.18); target = port(to, 'front', .18);
    const bus = front - (request ? .24 : .50); middle = [[source.point[0], bus], [target.point[0], bus]];
    lane = request ? 'data:request' : 'data:return';
  } else if (edge.kind === 'runtime') {
    source = port(from, 'front', -.32); target = port(to, 'front', .30);
    const bus = front - .64; middle = [[source.point[0], bus], [target.point[0], bus]]; lane = 'runtime:full-csv';
  } else if (edge.kind === 'artifact') {
    const rearward = edge.from === 'model', side = rearward ? 'rear' : 'front';
    source = port(from, side, rearward ? .32 : -.30); target = port(to, side, rearward ? -.28 : -.10);
    const bus = rearward ? rear + 1.0 : front - .94; middle = [[source.point[0], bus], [target.point[0], bus]];
    lane = rearward ? 'artifact:formulation' : 'artifact:code';
  } else {
    source = port(from, 'right', -.22); target = port(to, 'front', -.25);
    const bus = Math.max(from.maxU, to.maxU) + clearance;
    middle = [[bus, source.point[1]], [bus, target.point[1] - clearance], [target.point[0], target.point[1] - clearance]];
    lane = 'data:field-mapping';
  }
  const escape = (p, toward) => {
    const available = toward?.reduce((sum, value, axis) => sum + (value - p.point[axis]) * p.normal[axis], 0);
    const extent = available > .025 ? Math.min(routeClearance + routeRadius, available) : routeClearance + routeRadius;
    return p.point.map((value, axis) => value + p.normal[axis] * extent);
  };
  const first = escape(source, middle[0]), last = escape(target, middle.at(-1)), endpoints = new Set([edge.from, edge.to]);
  let center = simplify([first, ...middle, last]);
  // Join every waypoint orthogonally, including any escape-to-bus adjustment.
  center = simplify(center.flatMap((point, index) => index && !near(center[index - 1][0], point[0]) && !near(center[index - 1][1], point[1]) ? [[point[0], center[index - 1][1]], point] : [point]));
  const padding = routeClearance + routeRadius * .6;
  if (center.some((point, index) => index && all.some(box => intersects(center[index - 1], point, box, endpoints.has(box.id) ? 0 : padding)))) center = detour(first, last, all, middle, padding, endpoints);
  const controls = simplify([source.point, ...center, target.point]);
  let samples = rounded(trunk ? [source.point, target.point] : controls, routeRadius, spacing), shape = trunk ? 'straight' : 'rounded-orthogonal';
  const guard = Math.min(.035, routeClearance * .4);
  if (!clearsIcons(samples, all, edge, guard)) {
    shape = 'rounded-orthogonal';
    for (const factor of [.7, .4, .1]) {
      samples = rounded(controls, Math.max(.005, routeRadius * factor), spacing);
      if (clearsIcons(samples, all, edge, guard)) break;
    }
    if (!clearsIcons(samples, all, edge, guard)) throw new Error('A route must stay outside unrelated modules');
  }
  const points = samples.map(point => world(point, mobile, z));
  const distances = [0]; for (let index = 1; index < points.length; index++) distances.push(distances.at(-1) + distance(points[index - 1], points[index]));
  return {points, fromPort: points[0], toPort: points.at(-1), lane, shape, length: distances.at(-1), distances};
}

/** Arc-length sampling; use this for every visual element attached to a route. */
export function sampleFlowRoute(route, progress = 0) {
  if (!route?.points?.length) throw new TypeError('A sampled route requires points');
  const points = route.points, distances = route.distances?.length === points.length ? route.distances : [0];
  if (distances.length !== points.length) for (let index = 1; index < points.length; index++) distances.push(distances.at(-1) + distance(points[index - 1], points[index]));
  const length = distances.at(-1), target = clamp(finite(progress), 0, 1) * length;
  let index = 1; while (index < points.length - 1 && distances[index] < target) index++;
  if (points.length === 1) return {point: [...points[0]], tangent: [1, 0, 0]};
  const a = points[index - 1], b = points[index], segment = distances[index] - distances[index - 1];
  const t = segment > 0 ? (target - distances[index - 1]) / segment : 0;
  const point = target === 0 ? [...points[0]] : target === length ? [...points.at(-1)] : a.map((value, axis) => value + (b[axis] - value) * t);
  return {point, tangent: b.map((value, axis) => (value - a[axis]) / (segment || 1))};
}

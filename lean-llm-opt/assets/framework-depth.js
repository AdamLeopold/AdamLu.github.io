/** Pure canonical-plane to upright, top-to-bottom world layout and camera math. */
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const xyz = point => Array.isArray(point) ? point.map(value => number(value)).concat([0, 0, 0]).slice(0, 3)
  : [number(point?.x), number(point?.y), number(point?.z)];
const get = (collection, key) => collection instanceof Map ? collection.get(key) : collection?.[key];
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

export function toDepthPoint(point) {
  const [x, y, z] = xyz(point); return [-y || 0, -x || 0, z];
}
export function toDepthDirection(direction) {
  const [x, y, z] = xyz(direction); return [-y || 0, -x || 0, z];
}

function boundsFor(footprint = {}) {
  const width = Math.max(.05, number(footprint.width, 1.8)), height = Math.max(.05, number(footprint.height, 1.8)), depth = Math.max(.05, number(footprint.depth, .8));
  return {
    minX: number(footprint.minX, -width / 2), maxX: number(footprint.maxX, width / 2),
    minY: number(footprint.minY, -height / 2), maxY: number(footprint.maxY, height / 2),
    minZ: number(footprint.minZ, -depth / 2), maxZ: number(footprint.maxZ, depth / 2),
  };
}

/** Inputs remain canonical; local mesh bounds stay upright in world XYZ. */
export function computeDepthCameraPose({center, span, aspect = 1, stage = 0, selected = null, mode,
  hero = false, zoom = 1, positions = new Map(), footprints = new Map(), focusIds = [], contextIds = [], routePoints = [], worldFitPoints = [], nodeFitPoints = []} = {}) {
  const mobile = number(aspect, 1) < 1, ratio = Math.max(.2, number(aspect, 1));
  const yaw = .42, pitch = .035, fov = 42;
  const outward = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)];
  const oriented = (anchor, point) => anchor.map((value, axis) => value + right[axis] * point[0] + up[axis] * point[1] + outward[axis] * point[2]);
  const entries = positions instanceof Map ? [...positions] : Object.entries(positions || {});
  const allIds = entries.map(([id]) => id), overview = hero || (mode ? mode === 'overview' : !selected && stage === 0);
  const localIds = (contextIds.length ? contextIds : focusIds).filter(id => get(positions, id));
  const requested = overview ? allIds : localIds.length ? localIds : selected && get(positions, selected) ? [selected] : [];
  const ids = requested.length ? requested : allIds, points = [], anchors = [];
  let planLeft = Infinity, planRight = -Infinity, planBottom = Infinity, planTop = -Infinity;
  for (const id of ids) {
    const canonical = xyz(get(positions, id)), anchor = toDepthPoint(canonical), box = boundsFor(get(footprints, id));
    anchors.push(anchor);
    planLeft = Math.min(planLeft, canonical[0] - box.maxY); planRight = Math.max(planRight, canonical[0] - box.minY);
    planBottom = Math.min(planBottom, canonical[1] - box.maxX); planTop = Math.max(planTop, canonical[1] - box.minX);
    for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) for (const z of [box.minZ, box.maxZ])
      points.push(oriented(anchor, [x, y, z]));
  }
  for (const point of routePoints) {
    const canonical = xyz(point); points.push(toDepthPoint(canonical));
    if (overview) {
      planLeft = Math.min(planLeft, canonical[0]); planRight = Math.max(planRight, canonical[0]);
      planBottom = Math.min(planBottom, canonical[1]); planTop = Math.max(planTop, canonical[1]);
    }
  }
  // Nameplates already have world-space bounds. Keep them in the default fit
  // without changing the canonical pan baseline or their physical mounts.
  for (const point of worldFitPoints) points.push(xyz(point));
  for (const point of nodeFitPoints) points.push(oriented(toDepthPoint(point.position), xyz(point.point)));
  // Stay on one side of the vertical diagram. The small elevation preserves
  // upright faces without turning a local shot into an overhead view.
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * ratio;
  let target, pan = [0, 0, 0];
  if (points.length) {
    const low = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis])));
    const high = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis])));
    target = low.map((value, axis) => (value + high[axis]) / 2);
    if (!overview && selected && anchors.length === 1) target = [...anchors[0]];
    // Existing framing supplies the canonical pan delta, independently of zoom.
    if (center && Number.isFinite(planLeft)) {
      const [cx, cy] = xyz(center);
      pan[0] = -(cy - (planBottom + planTop) / 2);
      pan[1] = -(cx - (planLeft + planRight) / 2);
    }
  } else target = toDepthPoint(center);
  const forward = outward.map(value => -value);
  let fitRadius = 1;
  for (const point of points) {
    const offset = point.map((value, axis) => value - target[axis]), depth = dot(offset, forward);
    fitRadius = Math.max(fitRadius, Math.abs(dot(offset, right)) / tanH - depth,
      Math.abs(dot(offset, up)) / tanV - depth, .5 - depth);
  }
  const minSpan = overview ? 7 : mobile ? 7.4 : 7;
  const fallbackSpan = points.length ? minSpan : Math.max(minSpan, number(span, minSpan));
  const fitMargin = overview ? 1.10 : 1.18;
  const radius = Math.max(fitRadius * fitMargin, fallbackSpan / (2 * tanV)) / (hero ? 1 : clamp(number(zoom, 1), .7, 1.6));
  target = target.map((value, axis) => value + pan[axis]);
  return {position: target.map((value, axis) => value + outward[axis] * radius), target,
    span: 2 * radius * tanV, fov, yaw, pitch};
}

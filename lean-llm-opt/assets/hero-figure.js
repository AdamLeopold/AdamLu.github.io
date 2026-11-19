// The cover's Figure 3: the published solid model, drawn straight onto the page and turned by dragging.
// Past the scroll line its units rise off the board in a wave and leave the top of the window; back above
// the line they drop into place together.
import * as THREE from './vendor/three/three.module.js';
import {PAPER_SIZE, PAPER_OVERVIEW, buildPaperFigure, addPaperLighting, loadArtwork, releaseObjects} from './paper-model.js?v=20261119-2';

const clamp = THREE.MathUtils.clamp;
const smooth = x => x * x * (3 - 2 * x);

export function createHeroFigure(host, {reduced = false} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 8000);
  const view = {yaw: PAPER_OVERVIEW.yaw, pitch: PAPER_OVERVIEW.pitch};
  const cleanups = [];
  const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  let renderer, art, assets, raf = 0, last = null, visible = true, disposed = false, lifted = false, drag = null;
  let width = 0, height = 0, scale = 1, center = [0, 0];
  const units = [], links = [];

  function layout() {
    width = host.clientWidth; height = host.clientHeight;
    const stacked = width <= 720 || width / Math.max(1, height) < .8;
    // Beside the copy on wide screens; above it on stacked layouts.
    // Stacked, the figure fills the space between the bar and the first line of copy.
    const copy = host.parentElement?.querySelector('.hero-eyebrow');
    const copyTop = copy ? copy.getBoundingClientRect().top - host.getBoundingClientRect().top - 20 : height * .5;
    const box = stacked
      ? {x: width * .04, y: 74, w: width * .92, h: Math.max(160, copyTop - 74)}
      : {x: width * .42, y: 92, w: width * .52, h: height - 92 - 120};
    scale = Math.min(box.w / PAPER_SIZE.width, box.h / PAPER_SIZE.height) * .96;
    center = [box.x + box.w / 2, box.y + box.h / 2];
  }
  function place() {
    Object.assign(camera, {left: -width / 2 / scale, right: width / 2 / scale, top: height / 2 / scale, bottom: -height / 2 / scale});
    camera.position.set(-(center[0] - width / 2) / scale, (center[1] - height / 2) / scale, 4000);
    camera.updateProjectionMatrix();
  }

  // Units travel straight up the screen, whatever the current turn of the figure.
  const up = new THREE.Vector3(), offset = new THREE.Vector3(), m = new THREE.Matrix4(), r = new THREE.Matrix4(), back = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  function pose(unit) {
    const k = unit.h, rise = (height + 260) / scale;
    up.set(0, 1, 0).applyQuaternion(q.copy(art.quaternion).invert());
    offset.copy(up).multiplyScalar(rise * k);
    // A gentle sway along the way, so the column of parts undulates as it rises.
    offset.x += Math.sin(k * Math.PI) * unit.sway;
    e.set(unit.tilt.x * k, unit.tilt.y * k, unit.tilt.z * k);
    r.makeRotationFromQuaternion(q.setFromEuler(e));
    m.makeTranslation(unit.pivot.x + offset.x, unit.pivot.y + offset.y, unit.pivot.z + offset.z).multiply(r).multiply(back.makeTranslation(-unit.pivot.x, -unit.pivot.y, -unit.pivot.z));
    unit.group.matrix.copy(m);
    unit.group.matrixWorldNeedsUpdate = true;
  }
  function shade() {
    for (const link of links) {
      const air = Math.max(...link.userData.link.map(id => units.find(u => u.id === id)?.h ?? 0));
      link.material.opacity = 1 - smooth(Math.min(1, air * 4));
      link.visible = link.material.opacity > .01;
    }
  }
  function step(dt) {
    let moving = false;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (const unit of units) {
      if (unit.wait > 0) { unit.wait -= dt; moving = true; continue; }
      if (unit.h === unit.target && unit.v === 0) continue;
      const rising = unit.target > unit.h, k = rising ? 30 : 34, c = rising ? 9 : 7.5;
      for (let i = 0; i < n; i++) {
        unit.v += (k * (unit.target - unit.h) - c * unit.v) * h;
        unit.h += unit.v * h;
        // Landing parts bounce off the board.
        if (unit.h < 0) { unit.h = 0; unit.v = unit.v < -.25 ? -unit.v * .28 : 0; }
      }
      if (Math.abs(unit.target - unit.h) < 1e-3 && Math.abs(unit.v) < 1e-3) { unit.h = unit.target; unit.v = 0; } else moving = true;
      pose(unit);
    }
    shade();
    return moving;
  }
  function draw(now) {
    raf = 0;
    if (disposed || !visible || document.hidden || !art) { last = null; return; }
    if (host.clientWidth !== width || host.clientHeight !== height) { layout(); renderer.setSize(width, height, false); }
    place();
    art.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
    art.updateMatrix();
    const moving = step(last === null ? 0 : Math.min(.05, (now - last) / 1000));
    last = moving ? now : null;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (moving) invalidate();
  }
  function invalidate() { if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(draw); }

  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    canvas.setPointerCapture?.(event.pointerId);
    host.classList.add('is-dragging');
  });
  listen(canvas, 'pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    view.yaw = clamp(view.yaw + (event.clientX - drag.x) * .006, -1.1, 1.1);
    view.pitch = clamp(view.pitch + (event.clientY - drag.y) * .006, -.8, .8);
    drag.x = event.clientX; drag.y = event.clientY;
    invalidate();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, () => { drag = null; host.classList.remove('is-dragging'); });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); host.classList.add('is-static'); });
  const resize = new ResizeObserver(() => invalidate());
  resize.observe(host);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); else { cancelAnimationFrame(raf); raf = 0; last = null; } });
  observer.observe(host);
  listen(document, 'visibilitychange', () => { last = null; if (!document.hidden) invalidate(); });

  async function initialize() {
    try {
      renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      assets = await loadArtwork();
      if (disposed) { releaseObjects(assets.library); assets.print.dispose(); return; }
      assets.print.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      art = buildPaperFigure(assets.print, assets.library);
      art.rotation.order = 'YXZ';
      art.traverse(object => { if (object !== art) { object.updateMatrix(); object.matrixAutoUpdate = false; } });
      art.matrixAutoUpdate = false;
      art.updateMatrixWorld(true);
      for (const group of art.children) {
        if (group.userData.part !== 'unit') continue;
        const box = new THREE.Box3().setFromObject(group);
        const pivot = box.getCenter(new THREE.Vector3());
        const along = (pivot.x + PAPER_SIZE.width / 2) / PAPER_SIZE.width, down = (PAPER_SIZE.height / 2 - pivot.y) / PAPER_SIZE.height;
        units.push({group, id: group.userData.unit, pivot, h: 0, v: 0, target: 0, wait: 0,
          // The wave runs from the top left of the figure to the bottom right.
          delay: along * .22 + down * .16,
          sway: (along - .5) * 90 + Math.sin(along * 9) * 30,
          tilt: new THREE.Vector3(.25 + down * .2, (along - .5) * .5, (along - .5) * -.35)});
      }
      art.traverse(object => { if (object.isMesh && object.userData.link) links.push(object); });
      scene.add(art);
      addPaperLighting(scene);
      host.append(canvas);
      host.classList.add('is-webgl');
      layout(); renderer.setSize(width, height, false);
      api.setLifted(lifted, {now: true});
      invalidate();
    } catch (error) {
      if (!disposed) { console.warn('Figure 3 is using its rendered view.', error); host.classList.add('is-static'); }
    }
  }
  const api = {
    setLifted(next, {now = false} = {}) {
      lifted = Boolean(next) && !reduced;
      for (const unit of units) {
        unit.target = lifted ? 1 : 0;
        unit.wait = now ? 0 : lifted ? unit.delay : unit.delay * .35;
        if (now) { unit.h = unit.target; unit.v = 0; pose(unit); }
      }
      if (art) { shade(); invalidate(); }
    },
    getState() { return {lifted, yaw: view.yaw, pitch: view.pitch, units: units.map(u => ({id: u.id, h: u.h}))}; },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf); resize.disconnect(); observer.disconnect(); cleanups.forEach(fn => fn());
      releaseObjects(art, assets?.library); assets?.print.dispose(); renderer?.dispose(); canvas.remove();
    },
  };
  api.ready = initialize();
  return api;
}

// Backdrop of the demo video: copies of the Figure 3 model at different angles and depths in a dark room.
// The camera sinks as the section scrolls past, so near copies slide by faster than distant ones, and each
// copy turns slowly on its own. While the video plays the copies hold still.
import * as THREE from './vendor/three/three.module.js';
import {buildPaperFigure, loadArtwork, releaseObjects} from './paper-model.js?v=20261119-2';

const FOG = 0x081120;
// Position, turn (yaw, pitch, roll) and scale of each copy; nearer copies sit to the sides of the video.
const POSES = [
  {at: [-1380, 360, -150], turn: [.78, -.46, .1], scale: .8},
  {at: [1420, -420, -650], turn: [-.8, -.28, -.06], scale: .9},
  {at: [620, 1500, -2500], turn: [-.42, .62, -.04], scale: 1.05},
  {at: [-980, -1750, -2300], turn: [.34, -1.04, .12], scale: 1.05},
  {at: [-2500, -150, -3900], turn: [1.12, -.14, .05], scale: 1.25},
];

export function createFilmBackdrop(host, {reduced = false} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'film-canvas';
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 2600, 7600);
  const camera = new THREE.PerspectiveCamera(34, 1, 10, 9000);
  const copies = [];
  const cleanups = [];
  const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  let renderer, assets, raf = 0, visible = false, disposed = false, playing = false, progress = .5, clock = 0, last = null;

  function size() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h || !renderer) return;
    const current = renderer.getSize(new THREE.Vector2());
    if (current.x === w && current.y === h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On narrow screens the camera pulls back and the copies close in, so they show above and below the player.
    const narrow = w / h < 1;
    camera.position.z = narrow ? 3300 : 2500;
    copies.forEach((copy, i) => { copy.position.x = POSES[i].at[0] * (narrow ? .5 : 1); });
    camera.updateProjectionMatrix();
  }
  function pose() {
    const y = 760 - progress * 1520;
    camera.position.set(Math.sin(progress * Math.PI) * 120 - 60, y, camera.position.z);
    camera.lookAt(0, y * .55 - 180, -1500);
    copies.forEach((copy, i) => {
      const {turn} = POSES[i], phase = i * 1.7, t = clock;
      copy.rotation.set(turn[1] + Math.sin(t * .09 + phase) * .07, turn[0] + Math.sin(t * .07 + phase) * .12, turn[2] + Math.sin(t * .05 + phase) * .03, 'YXZ');
      copy.position.y = POSES[i].at[1] + Math.sin(t * .11 + phase) * 26;
    });
  }
  function draw(now) {
    raf = 0;
    if (disposed || !visible || document.hidden || !renderer) { last = null; return; }
    const drifting = !reduced && !playing;
    if (drifting && last !== null) clock += Math.min(.05, (now - last) / 1000);
    last = drifting ? now : null;
    size();
    pose();
    renderer.render(scene, camera);
    if (drifting) raf = requestAnimationFrame(draw);
  }
  function invalidate() { if (!raf && !disposed && visible && !document.hidden && renderer) raf = requestAnimationFrame(draw); }

  const resize = new ResizeObserver(() => invalidate());
  resize.observe(host);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate(); else { cancelAnimationFrame(raf); raf = 0; last = null; }
  }, {rootMargin: '120px 0px'});
  observer.observe(host.parentElement || host);
  listen(document, 'visibilitychange', () => { last = null; if (!document.hidden) invalidate(); });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); host.classList.add('is-static'); });

  async function initialize() {
    renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0, 0);
    assets = await loadArtwork();
    if (disposed) { releaseObjects(assets.library); assets.print.dispose(); return null; }
    assets.print.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const model = buildPaperFigure(assets.print, assets.library);
    model.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    POSES.forEach((spot, i) => {
      const copy = i === 0 ? model : model.clone(true);
      copy.position.set(...spot.at);
      copy.scale.setScalar(spot.scale);
      scene.add(copy);
      copies.push(copy);
    });
    // Low, cool light: a soft fill, a pale key from the upper left and a blue rim from behind.
    scene.add(new THREE.HemisphereLight(0x8aa6d2, 0x04070d, .6));
    const key = new THREE.DirectionalLight(0xd6e4ff, .85);
    key.position.set(-900, 1500, 1700);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4f8fe0, 2.3);
    rim.position.set(1500, -400, -1800);
    scene.add(rim);
    host.append(canvas);
    host.classList.add('is-webgl');
    size();
    invalidate();
    return api;
  }

  const api = {
    // 0 when the section enters from below, 1 when it leaves at the top.
    setProgress(value) {
      const next = Math.min(1, Math.max(0, value));
      if (Math.abs(next - progress) < 1e-4) return;
      progress = next;
      invalidate();
    },
    setPlaying(value) { playing = Boolean(value); last = null; invalidate(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      observer.disconnect();
      cleanups.forEach(fn => fn());
      if (assets) { releaseObjects(assets.library); assets.print.dispose(); }
      renderer?.dispose();
      canvas.remove();
    },
  };
  return initialize().catch(error => { api.dispose(); throw error; });
}

import * as THREE from './vendor/three/three.module.js';

/*
  Figure 3 of the paper as a kit of parts. In the opening view every part floats in the
  air; scrolling drops each stage's parts onto the board and draws the arrows that tie
  them to the parts before, until the framework lies assembled as in the figure.
  Positions are the figure's own pixel coordinates: 100 px = 1 unit, origin at its centre.
*/

const FONT = 'Nunito, "Avenir Next", "Segoe UI", Arial, sans-serif';
const MONO = '"JetBrains Mono", Menlo, Consolas, monospace';
const X = px => (px - 790) / 100;
const Z = py => (py - 800) / 100;
const CARD_H = .3;
const ARROW_H = .05;

const THEMES = {
  light: {
    bg: '#f5f8fc', dot: '#d2dcea', card: '#ffffff', line: '#8db6e2', ink: '#141d2e', mute: '#4c5a70',
    title: '#13213d', red: '#cf3424', navy: '#1e3f78', head: '#e6eef8', grid: '#c4d0de', arrow: '#8d939c', face: .85,
    upload: '#79c983', lens: '#89aedb', glowA: '#dde9f8', glowB: '#e8e5f8',
    tones: { input: '#b9cce6', classify: '#b9aaf0', workflow: '#a5c0e6', model: '#95cfb1', output: '#ecb97a', tailored: '#c5bce9', agnostic: '#a9d2c8' }, shadow: '#1d3557', skirt: .2, shadowOpacity: .2, hemi: 1.7, key: 2.1, fill: .5, env: .35,
  },
  dark: {
    bg: '#0b1220', dot: '#1d2a3e', card: '#15223a', line: '#4a76ab', ink: '#edf2f9', mute: '#adbbce',
    title: '#f7f9fd', red: '#ff8577', navy: '#a6c8ef', head: '#1d2d48', grid: '#34476a', arrow: '#6c7788', face: 1.2,
    upload: '#4f9f62', lens: '#4d78ac', glowA: '#12233c', glowB: '#191d3a',
    tones: { input: '#2a3e5c', classify: '#3d3369', workflow: '#29466a', model: '#235542', output: '#664a26', tailored: '#363057', agnostic: '#25504a' }, shadow: '#000000', skirt: .5, shadowOpacity: .45, hemi: 1.05, key: 1.5, fill: .35, env: .25,
  },
};

// Camera keyframes in orbit form around a target; f moves the subject right of the copy column.
// On portrait screens the distance is scaled by pf, the target moved along x by px and the
// subject raised by py of the frame height. The cover looks at the assembled figure through a long lens, rolled by
// tilt so the figure stays upright like a tilted paper model.
const SHOTS = [
  { t: [0, 0, .2], dist: 80, yaw: -.86, pitch: 1.07, f: .15, pf: 1.75, px: 0, py: .26, fov: 16, tilt: 1 },
  { t: [-2.45, .2, -5], dist: 21.5, yaw: .03, pitch: .96, f: .19, pf: 1.7, px: -.42, py: .185, fov: 28, tilt: 0 },
  { t: [-4.85, .3, -.55], dist: 13, yaw: -.12, pitch: .9, f: .18, pf: 1.65, px: -.2, py: .185, fov: 28, tilt: 0 },
  { t: [.45, .3, -.6], dist: 12.6, yaw: .12, pitch: .92, f: .18, pf: 1.6, px: 0, py: .185, fov: 28, tilt: 0 },
  { t: [1.6, .1, 4.75], dist: 22.5, yaw: 0, pitch: 1.04, f: .15, pf: 1.8, px: 0, py: .185, fov: 28, tilt: 0 },
  { t: [5.6, .4, -2.15], dist: 14.5, yaw: -.2, pitch: .9, f: .18, pf: 1.6, px: 0, py: .185, fov: 28, tilt: 0 },
  { t: [.1, 0, .45], dist: 35, yaw: 0, pitch: 1.12, f: .21, pf: 1.55, px: 0, py: .185, fov: 28, tilt: 0 },
];
// Screen-up of the cover shot: the figure's top edge, leaning back toward the viewer.
const PAPER_UP = new THREE.Vector3(0, .333, -.943);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = x => x * x * (3 - 2 * x);
const smoother = x => x * x * x * (x * (x * 6 - 15) + 10);
const inOut = x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
function random(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (_) { return false; }
}

/* ---------- geometry ---------- */
function rrShape(w, h, r) {
  r = Math.max(.001, Math.min(r, w / 2, h / 2));
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function circleShape(r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}
// Rounded box standing on y = 0: w along x, h up, d along z.
function boxGeo(w, h, d, r = .04) {
  const b = Math.min(r, w / 4, h / 4, d / 4);
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, r - b), {
    depth: Math.max(.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6,
  });
  g.translate(0, h / 2, -(d - 2 * b) / 2);
  return g;
}
// Flat slab lying on the floor, from a shape in the xz plane.
function slabGeo(shape, h, b) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * .9, bevelSegments: 3, curveSegments: 14,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  return g;
}
function faceGeo(shape, w, d) {
  const g = new THREE.ShapeGeometry(shape, 14);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / d + .5);
  g.rotateX(-Math.PI / 2);
  return g;
}
function gearShape(r, teeth = 9) {
  const s = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, rr = i % 4 === 1 || i % 4 === 2 ? r : r * .76;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * .34, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}
// A head in profile, facing +x, inside the unit square.
function headShape() {
  const s = new THREE.Shape();
  s.moveTo(.34, 0);
  s.lineTo(.34, .17);
  s.bezierCurveTo(.2, .25, .08, .37, .08, .57);
  s.bezierCurveTo(.08, .85, .3, 1, .53, 1);
  s.bezierCurveTo(.77, 1, .9, .84, .9, .64);
  s.lineTo(.9, .6);
  s.lineTo(.98, .47);
  s.lineTo(.91, .44);
  s.lineTo(.925, .37);
  s.lineTo(.895, .335);
  s.lineTo(.91, .285);
  s.quadraticCurveTo(.9, .22, .8, .22);
  s.lineTo(.67, .22);
  s.lineTo(.65, 0);
  s.lineTo(.34, 0);
  return s;
}

/* ---------- canvas drawing ---------- */
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function text(ctx, s, x, y, size, color, { weight = 800, font = FONT, align = 'left', underline = false } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
  if (underline) {
    const m = ctx.measureText(s).width;
    const x0 = align === 'center' ? x - m / 2 : align === 'right' ? x - m : x;
    ctx.fillRect(x0, y + size * .17, m, Math.max(1.2, size * .075));
  }
}
// Word-wrapped runs of [text, color]; a "\n" inside a run starts a new line.
function rich(ctx, runs, x, y, width, size, lead, { font = FONT, weight = 700 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const space = ctx.measureText(' ').width;
  let cx = x, cy = y, pending = false;
  for (const [s, color] of runs) {
    ctx.fillStyle = color;
    for (const word of s.split(/(\s+)/)) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        if (word.includes('\n')) { cx = x; cy += lead * (word.split('\n').length - 1); pending = false; } else pending = cx > x;
        continue;
      }
      const m = ctx.measureText(word).width, gap = pending ? space : 0;
      if (cx + gap + m > x + width && cx > x) { cx = x; cy += lead; } else cx += gap;
      ctx.fillText(word, cx, cy);
      cx += m;
      pending = false;
    }
  }
  return cy;
}
function table(ctx, x, y, cols, rowH, rows, size, c) {
  const width = cols.reduce((a, b) => a + b, 0);
  ctx.fillStyle = c.head;
  ctx.fillRect(x, y, width, rowH);
  ctx.fillRect(x, y, cols[0], rowH * rows.length);
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows.length; r++) { ctx.beginPath(); ctx.moveTo(x, y + r * rowH); ctx.lineTo(x + width, y + r * rowH); ctx.stroke(); }
  let cx = x;
  for (let i = 0; i <= cols.length; i++) { ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + rows.length * rowH); ctx.stroke(); cx += cols[i] || 0; }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.ink;
  rows.forEach((row, r) => {
    let cx2 = x;
    row.forEach((cell, i) => {
      const head = r === 0 || i === 0;
      ctx.font = `${head ? 900 : 600} ${size}px ${head ? FONT : MONO}`;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(String(cell), i === 0 ? cx2 + size * .45 : cx2 + cols[i] - size * .45, y + r * rowH + rowH / 2 + 1);
      cx2 += cols[i];
    });
  });
  ctx.textBaseline = 'alphabetic';
}
export async function createScene(canvas, { theme = 'light', reduced = false } = {}) {
  if (!webglAvailable()) return null;
  try {
    await Promise.all([`900 40px ${FONT}`, `800 40px ${FONT}`, `700 40px ${FONT}`, `600 40px ${FONT}`, `500 20px ${MONO}`, `600 20px ${MONO}`, `700 20px ${MONO}`].map(f => document.fonts.load(f)));
  } catch (_) { /* fallback fonts */ }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, .6, 260);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const compact = Math.min(innerWidth, innerHeight) < 700;
  const PPU = compact ? 170 : 250;
  const MAX_TEX = 2048;
  let pal = THEMES[theme] || THEMES.light;
  const rand = random(11);
  const disposables = [];

  /* environment: a soft white studio */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x7c8592, side: THREE.BackSide })));
  for (const [x, y, z, w, h, k] of [[0, 6.9, 0, 18, 10, 3], [-14.9, 3, 4, 10, 6, 1.8], [14.9, 4, -6, 8, 5, 1.2], [0, 3, 14.9, 16, 5, 1.4]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    panel.position.set(x, y, z); panel.lookAt(0, 0, 0); room.add(panel);
  }
  scene.environment = pmrem.fromScene(room, .04).texture;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xdfe6ef, 1);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-7, 22, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 4, far: 60 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.radius = 4;
  key.shadow.bias = -.0005;
  key.shadow.normalBias = .02;
  const fill = new THREE.DirectionalLight(0xf2f6ff, .5);
  fill.position.set(10, 6, 6);
  scene.add(hemi, key, key.target, fill);

  /* floor: the page colour with a faint dot grid */
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uBg: { value: new THREE.Color() }, uDot: { value: new THREE.Color() }, uGlowA: { value: new THREE.Color() }, uGlowB: { value: new THREE.Color() }, uCover: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform vec3 uBg; uniform vec3 uDot; uniform vec3 uGlowA; uniform vec3 uGlowB; uniform float uCover; varying vec3 vW;
      void main(){
        vec2 p = vW.xz * 2.5;
        vec2 q = (fract(p + 0.5) - 0.5) / max(fwidth(p), vec2(1e-4));
        float dotMask = 1.0 - smoothstep(0.7, 1.6, length(q));
        dotMask *= 1.0 - smoothstep(0.08, 0.2, max(fwidth(p).x, fwidth(p).y));
        dotMask *= smoothstep(26.0, 8.0, length(vW.xz)) * (1.0 - uCover);
        vec3 c = mix(uBg, uGlowA, uCover * exp(-dot(vW.xz - vec2(4.0, -3.0), vW.xz - vec2(4.0, -3.0)) / 90.0));
        c = mix(c, uGlowB, uCover * .8 * exp(-dot(vW.xz - vec2(-5.0, 6.0), vW.xz - vec2(-5.0, 6.0)) / 70.0));
        gl_FragColor = vec4(mix(c, uDot, dotMask), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadowMat = new THREE.ShadowMaterial({ opacity: .2 });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(26, 24), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, .001, .3);
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  /* materials */
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: 0, ...extra });
  const M = {
    paper: std(0xffffff, { roughness: .75 }),
    beige: std(0xebe3c9, { roughness: .6 }),
    beigeDark: std(0xcdbd93, { roughness: .6 }),
    slot: std(0x4a505a, { roughness: .5 }),
    steel: std(0xa5adb7, { roughness: .35, metalness: .15 }),
    steelTop: std(0xd5dae0, { roughness: .35, metalness: .1 }),
    red: std(0xd9503f, { roughness: .4 }),
    blue: std(0x6d93bc, { roughness: .4 }),
    ink: std(0x2b313b, { roughness: .4 }),
    plus: std(0x3a7dd3, { roughness: .4 }),
    navy: std(0x2f4569, { roughness: .5 }),
    navySoft: std(0x6a80a6, { roughness: .5 }),
    head: std(0xf3f5f8, { roughness: .6 }),
    frame: std(0xe1e6ec, { roughness: .45 }),
    gear: std(0x8a95a3, { roughness: .35, metalness: .2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe3f7, roughness: .1, transparent: true, opacity: .45 }),
    card: std(0xffffff, { roughness: .7 }),
    arrow: std(0xffffff, { roughness: .7 }),
  };
  // Card bodies are tinted by station, after the paper-model cover.
  const tones = Object.fromEntries(Object.keys(THEMES.light.tones).map(k => [k, std(0xffffff, { roughness: .6 })]));
  const beadMats = {
    red: std(0xe0503e, { roughness: .3, emissive: 0x4a0d06 }),
    gold: std(0xe9b43c, { roughness: .3, emissive: 0x3b2802 }),
    blue: std(0x3b7fd6, { roughness: .3, emissive: 0x08203f }),
  };
  const tintMats = [];
  const tinted = (keyName, extra = {}) => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...extra });
    tintMats.push({ mat, key: keyName });
    return mat;
  };
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m; };

  /* canvas textures; themed ones are repainted when the theme changes */
  const paints = [];
  function paint(w, h, draw, themed = false) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    const p = { canvas: c, tex, draw, themed };
    paints.push(p);
    disposables.push(tex);
    if (!themed) repaint(p);
    return p;
  }
  function repaint(p) {
    const ctx = p.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    ctx.save();
    p.draw(ctx, p.canvas.width, p.canvas.height, pal);
    ctx.restore();
    p.tex.needsUpdate = true;
  }
  const glyphs = {};
  function glyph(s, { size = 200, weight = 900, color = '#ffffff', stroke = null, w = 256, h = 256 } = {}) {
    const k = `${s}|${weight}|${color}|${stroke}|${w}x${h}`;
    if (!glyphs[k]) {
      glyphs[k] = paint(w, h, ctx => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (stroke) { ctx.lineWidth = size * .14; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, w / 2, h / 2 + size * .06); }
        ctx.fillStyle = color;
        ctx.fillText(s, w / 2, h / 2 + size * .06);
      }).tex;
    }
    return glyphs[k];
  }

  const world = new THREE.Group();
  scene.add(world);

  /* ---------- parts ---------- */
  const pieces = [], links = [], named = {};
  function addPiece(name, obj, { stage, order, at, kind = 'icon', ry = 0, tilt = 0 }) {
    // The holder carries the flight transform, so an icon's own scale survives.
    const holder = new THREE.Group();
    holder.add(obj);
    const p = {
      name, obj: holder, inner: obj, stage, kind,
      th: stage - .28 + order * .22,
      slot: new THREE.Vector3(...at),
      slotQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0)),
      a: 0, hopT: 9, hopA: 0, phase: rand() * Math.PI * 2, casting: null, spin: 0,
    };
    world.add(holder);
    pieces.push(p);
    named[name] = p;
    return p;
  }

  // Soft drop shadow under a card, like the boxes in the figure.
  const skirts = {};
  function skirtTexture(circle) {
    const k = circle ? 'c' : 'r';
    skirts[k] ||= paint(256, 256, (ctx, w, h) => {
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetX = w * 2;
      ctx.fillStyle = '#000';
      if (circle) { ctx.beginPath(); ctx.arc(-w * 2 + w / 2, h / 2, w * .34, 0, Math.PI * 2); ctx.fill(); } else { roundRectPath(ctx, -w * 2 + w * .16, h * .16, w * .68, h * .68, 18); ctx.fill(); }
    }).tex;
    return skirts[k];
  }

  const faceMats = [];
  const STAGE_TONES = [null, 'input', 'classify', 'workflow', null, 'model'];
  function card(name, rect, draw, { stage, order, r = 18, circle = false, tone = STAGE_TONES[stage] || (rect[0] < 1020 ? 'tailored' : 'agnostic') }) {
    const [x0, y0, x1, y1] = rect;
    const w = (x1 - x0) / 100, d = (y1 - y0) / 100, b = .03;
    const rad = Math.min(r / 100, w / 2, d / 2);
    const fw = w - 2 * b, fd = d - 2 * b;
    const outline = circle ? circleShape(fw / 2) : rrShape(fw, fd, rad - b);
    const group = new THREE.Group();
    const body = mesh(slabGeo(outline, CARD_H, b), tones[tone]);
    const ppu = Math.min(PPU, MAX_TEX / Math.max(fw, fd));
    const u = ppu / 100;
    const face = paint(fw * ppu, fd * ppu, (ctx, cw, ch, c) => {
      ctx.fillStyle = c.card;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 2.4 * u;
      if (circle) { ctx.beginPath(); ctx.arc(cw / 2, ch / 2, cw / 2 - ctx.lineWidth, 0, Math.PI * 2); } else roundRectPath(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth, (rad - b) * ppu);
      ctx.stroke();
      ctx.translate(-(x0 + b * 100) * u, -(y0 + b * 100) * u);
      ctx.scale(u, u);
      draw?.(ctx, c);
    }, true);
    const faceMat = new THREE.MeshLambertMaterial({ map: face.tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    faceMats.push(faceMat);
    const top = mesh(faceGeo(outline, fw, fd), faceMat);
    top.position.y = CARD_H + .003;
    top.userData.noShadow = true;
    group.add(body, top);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(w / .68, d / .68), tinted('shadow', { map: skirtTexture(circle), opacity: 0 }));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(X((x0 + x1) / 2) + .05, .0015, Z((y0 + y1) / 2) + .09);
    skirt.renderOrder = -1;
    scene.add(skirt);
    const p = addPiece(name, group, { stage, order, at: [X((x0 + x1) / 2), 0, Z((y0 + y1) / 2)], kind: 'card' });
    p.skirt = skirt;
    p.size = Math.max(w, d);
    return p;
  }

  /* icons, each standing on y = 0 and facing +z */
  function qa(s = 1) {
    const g = new THREE.Group();
    const bubble = (mat, letter, x, y, z, side) => {
      const b = new THREE.Group();
      b.add(mesh(boxGeo(.5, .44, .1, .12), mat));
      const tail = new THREE.Shape([new THREE.Vector2(side * .02, .06), new THREE.Vector2(side * .16, .06), new THREE.Vector2(side * .2, -.12)]);
      const tg = new THREE.ExtrudeGeometry(tail, { depth: .07, bevelEnabled: false });
      tg.translate(0, 0, -.035);
      b.add(mesh(tg, mat));
      const l = new THREE.Mesh(new THREE.PlaneGeometry(.34, .34), new THREE.MeshStandardMaterial({ map: glyph(letter), transparent: true, roughness: .5 }));
      l.position.set(0, .22, .051);
      b.add(l);
      b.position.set(x, y, z);
      g.add(b);
    };
    bubble(M.blue, 'A', .17, .14, -.07, 1);
    bubble(M.red, 'Q', -.1, .36, .04, -1);
    g.scale.setScalar(s);
    return g;
  }
  function cabinet(s = 1) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(.72, .46, .56, .05), M.beige));
    const front = mesh(boxGeo(.6, .3, .05, .025), M.beigeDark);
    front.position.set(0, .07, .27);
    const handle = mesh(boxGeo(.18, .045, .05, .02), M.ink);
    handle.position.set(0, .3, .3);
    const label = mesh(boxGeo(.16, .07, .02, .01), M.paper);
    label.position.set(0, .18, .3);
    g.add(front, handle, label);
    [-.15, -.02, .11].forEach((z, i) => {
      const f = mesh(boxGeo(.56, .26, .018, .01), i === 1 ? M.beigeDark : M.paper);
      f.position.set((i - 1) * .02, .3, z);
      f.rotation.x = -.18 + i * .12;
      g.add(f);
    });
    g.scale.setScalar(s);
    return g;
  }
  function server(s = 1) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(.52, .94, .56, .05), M.beige));
    for (let i = 0; i < 5; i++) {
      const slot = mesh(boxGeo(.38, .03, .02, .01), M.slot);
      slot.position.set(0, .17 + i * .16, .285);
      g.add(slot);
    }
    for (let i = 0; i < 3; i++) {
      const can = mesh(new THREE.CylinderGeometry(.17, .17, .1, 36), M.steel);
      can.position.set(.42, .055 + i * .118, .2);
      const cap = mesh(new THREE.CylinderGeometry(.168, .168, .012, 36), M.steelTop);
      cap.position.set(.42, .055 + i * .118 + .052, .2);
      g.add(can, cap);
    }
    g.scale.setScalar(s);
    return g;
  }
  let headTex = null;
  function head(s = 1) {
    headTex ||= paint(512, 512, (ctx, w) => {
      const P = (x, y) => [x * w, (1 - y) * w];
      ctx.fillStyle = '#f6f8fb';
      ctx.fillRect(0, 0, w, w);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const brain = random(5);
      ctx.strokeStyle = '#5f6b7d';
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i / 40 * Math.PI * 2, r = 1 + Math.sin(a * 7) * .05;
        const [x, y] = P(.5 + Math.cos(a) * .3 * r, .74 + Math.sin(a) * .19 * r);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 5;
      for (let i = 0; i < 9; i++) {
        const cx = .3 + brain() * .4, cy = .64 + brain() * .2;
        ctx.beginPath();
        ctx.moveTo(...P(cx - .08, cy));
        ctx.bezierCurveTo(...P(cx - .03, cy + .07), ...P(cx + .02, cy - .07), ...P(cx + .08, cy + .01));
        ctx.stroke();
      }
      ctx.strokeStyle = '#262e3b';
      ctx.lineWidth = 14;
      ctx.beginPath();
      headShape().getPoints(24).forEach(({ x, y }, i) => (i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y))));
      ctx.closePath();
      ctx.stroke();
    }).tex;
    const geo = new THREE.ExtrudeGeometry(headShape(), { depth: .1, bevelEnabled: true, bevelThickness: .03, bevelSize: .02, bevelSegments: 3, curveSegments: 16 });
    geo.translate(-.53, 0, -.05);
    geo.scale(.86 * s, .86 * s, .86 * s);
    const g = new THREE.Group();
    const printed = new THREE.MeshLambertMaterial({ map: headTex });
    faceMats.push(printed);
    g.add(mesh(geo, [printed, M.head]));
    return g;
  }
  function rag(s = 1) {
    const g = new THREE.Group(), arcs = new THREE.Group();
    arcs.position.y = .46;
    for (const start of [.45, .45 + Math.PI]) {
      const arc = mesh(new THREE.TorusGeometry(.29, .038, 10, 40, 2.25), M.ink);
      arc.rotation.z = start;
      const end = start + 2.25;
      const cone = mesh(new THREE.ConeGeometry(.085, .17, 18), M.ink);
      cone.position.set(Math.cos(end) * .29, Math.sin(end) * .29, 0);
      cone.rotation.z = end;
      arcs.add(arc, cone);
    }
    const tools = new THREE.Group();
    tools.position.y = .46;
    const wrench = mesh(boxGeo(.34, .06, .035, .02), M.gear);
    wrench.geometry.translate(0, -.03, 0);
    wrench.rotation.z = Math.PI / 4;
    const driver = mesh(boxGeo(.3, .04, .035, .015), M.ink);
    driver.geometry.translate(0, -.02, 0);
    driver.rotation.z = -Math.PI / 4;
    tools.add(wrench, driver);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.5, .25), new THREE.MeshBasicMaterial({ map: glyph('RAG', { size: 110, color: '#3f86d4', stroke: '#ffffff', w: 320, h: 160 }), transparent: true, toneMapped: false }));
    label.position.set(0, .16, .07);
    g.add(arcs, tools, label);
    g.userData.arcs = arcs;
    g.scale.setScalar(s);
    return g;
  }
  let docTex = null;
  function doc(s = 1) {
    docTex ||= paint(256, 340, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9aa6b6';
      ctx.fillRect(28, 34, 120, 16);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 3 === 1 ? '#3f7fd0' : '#b9c3d0'; ctx.fillRect(28 + (i % 2) * 18, 74 + i * 26, 150 - (i % 3) * 30, 9); }
      ctx.strokeStyle = '#3f7fd0';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(40, 110); ctx.lineTo(150, 168); ctx.lineTo(56, 230); ctx.stroke();
    }).tex;
    const g = new THREE.Group(), sheet = new THREE.Group();
    sheet.add(mesh(boxGeo(.5, .66, .025, .012), M.paper));
    const printed = new THREE.MeshLambertMaterial({ map: docTex });
    faceMats.push(printed);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.47, .63), printed);
    face.position.set(0, .33, .0135);
    const badge = mesh(new THREE.CylinderGeometry(.11, .11, .04, 32), M.ink);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(.2, .34, .04);
    const gear = mesh(new THREE.ExtrudeGeometry(gearShape(.07, 8), { depth: .02, bevelEnabled: false }), M.paper);
    gear.position.set(.2, .34, .055);
    sheet.add(face, badge, gear);
    sheet.rotation.x = -.1;
    g.add(sheet);
    g.scale.setScalar(s);
    return g;
  }
  function magnifier(s = 1) {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(.18, .035, 12, 40), M.ink);
    ring.position.y = .44;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .01, 32), M.glass);
    glass.rotation.x = Math.PI / 2;
    glass.position.y = .44;
    const handle = mesh(new THREE.CylinderGeometry(.035, .042, .3, 16), M.ink);
    handle.position.set(.25, .2, 0);
    handle.rotation.z = Math.PI / 4;
    g.add(ring, glass, handle);
    g.scale.setScalar(s);
    return g;
  }
  let screen = null;
  function monitor(s = 1) {
    // Code for the running example's model in Section 3.
    const code = [
      ['import gurobipy as gp', '#8fb8ff'],
      ['from gurobipy import GRB', '#8fb8ff'],
      ['', ''],
      ["m = gp.Model('truck_scheduling')", '#e6edf6'],
      ['w = m.addVars(I, T, lb=0)', '#e6edf6'],
      ['y = m.addVars(I, T, vtype=GRB.BINARY)', '#e6edf6'],
      ['u = m.addVars(I, T, vtype=GRB.BINARY)', '#e6edf6'],
      ['m.setObjective(gp.quicksum(C[i] * w[i, t]', '#e6edf6'],
      ['    for i in I for t in T) + …, GRB.MINIMIZE)', '#e6edf6'],
      ["m.addConstrs(w.sum('*', t) >= d[t] for t in T)", '#e6edf6'],
      ['m.addConstrs(w[i, t] <= Q[i] * y[i, t] for i, t in w)', '#e6edf6'],
      ['# spare capacity, runtime, cooldown, load limits …', '#7fe0a8'],
      ['m.optimize()', '#ffd479'],
    ];
    const p = paint(1024, 612, (ctx, w) => {
      ctx.fillStyle = '#1b2331';
      ctx.fillRect(0, 0, w, 612);
      ctx.fillStyle = '#273246';
      ctx.fillRect(0, 0, w, 50);
      ['#ff6b5c', '#ffcc4d', '#4fd38a'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(32 + i * 26, 25, 8, 0, Math.PI * 2); ctx.fill(); });
      ctx.font = `500 30px ${MONO}`;
      ctx.textBaseline = 'alphabetic';
      code.forEach(([line, col], i) => { ctx.fillStyle = col; ctx.fillText(line, 36, 100 + i * 39); });
    });
    const g = new THREE.Group();
    const base = mesh(boxGeo(.5, .04, .3, .018), M.frame);
    const neck = mesh(boxGeo(.09, .24, .06, .02), M.frame);
    neck.position.set(0, .03, -.05);
    const frame = mesh(boxGeo(1.3, .82, .07, .045), M.frame);
    frame.position.set(0, .24, 0);
    screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .72), new THREE.MeshBasicMaterial({ map: p.tex, toneMapped: false }));
    screen.position.set(0, .65, .036);
    const gear = mesh(new THREE.ExtrudeGeometry(gearShape(.19, 9), { depth: .06, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 2 }), M.gear);
    gear.position.set(.62, .2, .08);
    g.add(base, neck, frame, screen, gear);
    g.scale.setScalar(s);
    return g;
  }
  function users(s = 1) {
    const g = new THREE.Group();
    const person = (mat, x, z, k) => {
      const h = mesh(new THREE.SphereGeometry(.11 * k, 24, 16), mat);
      h.position.set(x, .55 * k, z);
      const body = mesh(new THREE.CapsuleGeometry(.17 * k, .1 * k, 6, 18), mat);
      body.position.set(x, .22 * k, z);
      body.scale.set(1, 1, .72);
      g.add(h, body);
    };
    person(M.navySoft, -.16, -.06, .9);
    person(M.navy, .08, .06, 1);
    g.scale.setScalar(s);
    return g;
  }
  function plus(s = 1) {
    const g = new THREE.Group();
    const a = mesh(boxGeo(.32, .1, .1, .03), M.plus);
    a.position.y = .17;
    const b = mesh(boxGeo(.1, .32, .1, .03), M.plus);
    b.position.y = .06;
    g.add(a, b);
    g.scale.setScalar(s);
    return g;
  }
  function rack(s = 1) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(.26, .34, .26, .03), M.beige));
    for (let i = 0; i < 3; i++) {
      const slot = mesh(boxGeo(.18, .022, .02, .008), M.slot);
      slot.position.set(0, .07 + i * .09, .132);
      g.add(slot);
    }
    g.scale.setScalar(s);
    return g;
  }
  function token(name) {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(.36, .07, .18, .035), M.card));
    const mat = tinted('ink', { map: glyph(name, { size: 92, weight: 900, w: 320, h: 140 }), opacity: 1, depthWrite: true });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.34, .15), mat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = .072;
    g.add(label);
    return g;
  }
  // Flat-fronted icons lean back slightly, like easels, so they still read from above.
  function icon(name, obj, fx, fy, { stage, order, onCard = true, ry = 0, lean = false }) {
    return addPiece(name, obj, { stage, order, at: [X(fx), onCard ? CARD_H : 0, Z(fy)], ry, tilt: lean ? -.32 : 0 });
  }

  /* arrows, outlines and labels lying on the floor */
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function figPath(pts, radius) {
    const P = pts.map(([px, py]) => new THREE.Vector3(X(px), 0, Z(py)));
    const path = new THREE.CurvePath();
    let cur = P[0].clone();
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      if (!c) { path.add(new THREE.LineCurve3(cur, b.clone())); break; }
      const r = Math.min(radius, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
      const pin = b.clone().addScaledVector(tmpA.subVectors(a, b).normalize(), r);
      const pout = b.clone().addScaledVector(tmpB.subVectors(c, b).normalize(), r);
      path.add(new THREE.LineCurve3(cur, pin));
      path.add(new THREE.QuadraticBezierCurve3(pin, b.clone(), pout));
      cur = pout;
    }
    return path;
  }
  function ribbon(path, length, width, h, { dashed = false, dash = .16, walls = true } = {}) {
    const seg = .035, n = Math.max(2, Math.ceil(length / seg)), L = path.getLength();
    const pos = [], nor = [], idx = [], idxAt = [0];
    const pt = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = Math.min(1, i / n * length / L);
      path.getPointAt(u, pt);
      path.getTangentAt(u, tan);
      side.set(-tan.z, 0, tan.x).normalize();
      const sx = side.x * width / 2, sz = side.z * width / 2;
      pos.push(pt.x + sx, h, pt.z + sz, pt.x - sx, h, pt.z - sz,
        pt.x + sx, 0, pt.z + sz, pt.x + sx, h, pt.z + sz,
        pt.x - sx, 0, pt.z - sz, pt.x - sx, h, pt.z - sz);
      nor.push(0, 1, 0, 0, 1, 0, side.x, 0, side.z, side.x, 0, side.z, -side.x, 0, -side.z, -side.x, 0, -side.z);
    }
    for (let i = 0; i < n; i++) {
      if (!dashed || Math.floor(i * length / n / dash) % 2 === 0) {
        const a = i * 6, b = (i + 1) * 6;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        if (walls) idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3, a + 4, a + 5, b + 4, a + 5, b + 5, b + 4);
      }
      idxAt.push(idx.length);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return { geo: g, idxAt, n };
  }
  const arrows = {};
  let headGeo = null;
  const HEAD_L = .3;
  function arrow(name, pts, { stage, order, dashed = false, radius = .3, width = .13 }) {
    const path = figPath(pts, radius), L = path.getLength();
    const shaft = Math.max(.01, L - HEAD_L);
    const r = ribbon(path, shaft, width, ARROW_H, { dashed });
    const body = mesh(r.geo, M.arrow);
    if (!headGeo) {
      const tri = new THREE.Shape([new THREE.Vector2(-.17, 0), new THREE.Vector2(.17, 0), new THREE.Vector2(0, HEAD_L)]);
      headGeo = new THREE.ExtrudeGeometry(tri, { depth: ARROW_H, bevelEnabled: false });
      headGeo.rotateX(-Math.PI / 2);
    }
    const tip = mesh(headGeo, M.arrow);
    world.add(body, tip);
    const link = {
      name, stage, th: stage - .28 + order * .22, g: 0, path, L, h: ARROW_H,
      apply(g) {
        const s = g * L, end = Math.min(shaft, Math.max(0, s - HEAD_L));
        r.geo.setDrawRange(0, r.idxAt[Math.min(r.n, Math.floor(end / shaft * r.n))]);
        tip.visible = g > .002;
        path.getPointAt(end / L, tmpA);
        path.getTangentAt(Math.min(1, end / L), tmpB);
        tip.position.set(tmpA.x, 0, tmpA.z);
        tip.rotation.y = Math.atan2(-tmpB.x, -tmpB.z);
        tip.scale.set(1, 1, clamp(s / HEAD_L, .001, 1));
        body.castShadow = tip.castShadow = g > .02;
      },
    };
    links.push(link);
    arrows[name] = link;
    return link;
  }
  function outline(colorKey, pts, { stage, order, radius = .5, closed = false, width = .035 }) {
    const path = figPath(closed ? [...pts, pts[0], pts[1]] : pts, radius);
    let L = path.getLength();
    if (closed) L -= Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 100;
    const r = ribbon(path, L, width, .006, { dashed: true, dash: .12, walls: false });
    const m = new THREE.Mesh(r.geo, tinted(colorKey, { transparent: false, depthWrite: true }));
    world.add(m);
    links.push({ stage, th: stage - .28 + order * .22, g: 0, apply(g) { r.geo.setDrawRange(0, r.idxAt[Math.floor(clamp(g) * r.n)]); } });
  }
  const probe = document.createElement('canvas').getContext('2d');
  function floorText(lines, fx, fy, size, { stage, order, colorKey = 'ink', weight = 800, lead = 1.15 }) {
    const list = Array.isArray(lines) ? lines : [lines];
    probe.font = `${weight} ${size}px ${FONT}`;
    const wpx = Math.max(...list.map(l => probe.measureText(l).width)) + size * .6;
    const hpx = size * (lead * (list.length - 1) + 1.4);
    const u = PPU / 100;
    const p = paint(wpx * u, hpx * u, ctx => {
      ctx.scale(u, u);
      list.forEach((l, i) => text(ctx, l, wpx / 2, size * (1 + i * lead), size, '#ffffff', { weight, align: 'center' }));
    });
    const mat = tinted(colorKey, { map: p.tex, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wpx / 100, hpx / 100), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(X(fx), .004, Z(fy - size + hpx / 2));
    world.add(m);
    links.push({ stage, th: stage - .28 + order * .22, g: 0, apply(g) { mat.opacity = smooth(clamp(g)); m.visible = g > .002; } });
  }

  /* ---------- the figure ---------- */
  // The running example of Section 3, as printed in Figure 3.
  const query = 'A logistics company needs to schedule ten trucks daily to transport goods and meet customer demand across four time periods. Each truck has specific startup and transportation costs. The customer demand for the four time periods is [1,500 kg, 2,000 kg, 1,800 kg, 1,000 kg]. The company must follow these operating rules: First, trucks have minimum runtime and cooldown requirements. Once a truck is started, it must run continuously for at least 2 hours before being shut down …. Second, there are limits on load fluctuations. For each individual truck, the change in transported weight between two adjacent periods cannot exceed 300 kg … The goal is to find the lowest-cost scheduling solution that meets all the above constraints while fulfilling customer demand. The necessary data for optimization is provided in `parameters.csv’, including the maximum capacity (Q), startup cost (S), and unit transportation cost (C) for each truck, along with the customer demand (dt) for periods t=1 through 4.';
  const TRUCKS = [[1000, 500, '2.0'], [800, 300, '3.0'], [1200, 400, '2.5'], [600, 250, '3.0'], [900, 450, '2.2'], [700, 280, '2.8'], [1100, 420, '2.4'], [500, 200, '3.2'], [1000, 480, '2.1'], [650, 260, '2.9']];

  // Demo datasets as printed in the figure: the first rows of Nike Shoes Sales.csv, and the input-output table.
  const NIKE = [['Product Name', 'Revenue', 'Demand', 'Initial'],
    ['Air Jordan 1 Jester XX Low Laced', 7995, 48, 309],
    ['Air Jordan 1 Jester XX Low Laced SE', 7197, 14, 131],
    ['Air Jordan 1 Low', 8995, 67, 372],
    ['Air Jordan 1 Low SE', 8995, 43, 254],
    ['Air Jordan 1 Mid', 9995, 131, 923],
    ['Air Jordan 1 Mid SE', 9995, 50, 293],
    ['Air Jordan 1 Nova XX', 10495, 72, 598],
    ['Air Jordan 10 Retro', 15995, 49, 329],
    ['Air Jordan 11 Low', 13597, 63, 440],
    ['Air Jordan 11 Retro Low', 11897, 50, 479],
    ['Air Jordan 12 Retro', 15995, 168, 1516],
    ['Air Jordan 13 Retro', 15995, 100, 699],
    ['Air Jordan 13 Retro Chinese New Year', 19995, 17, 166]];
  const IO_TABLE = [['Producer', 'Coal', 'Power', 'Steel'], ['Coal', '0', '0.4', '0.6'], ['Power', '0.6', '0.1', '0.2'], ['Steel', '0.4', '0.5', '0.2']];

  // 1 · User upload
  outline('upload', [[500, 82], [985, 82], [985, 468], [22, 468], [22, 82]], { stage: 1, order: 0, radius: .4, closed: true });
  icon('users', users(1.05), 590, 54, { stage: 1, order: .05, onCard: false });
  floorText('User Upload', 740, 64, 34, { stage: 1, order: .1, weight: 900, colorKey: 'title' });
  card('pd', [38, 100, 535, 448], (ctx, c) => {
    text(ctx, 'Problem Description', 62, 142, 27, c.title, { underline: true });
    rich(ctx, [[query, c.ink]], 62, 180, 456, 11.6, 16.4, { font: MONO, weight: 700 });
  }, { stage: 1, order: .12 });
  icon('pdQa', qa(1.15), 492, 128, { stage: 1, order: .42, lean: true });
  card('ds', [580, 100, 925, 448], (ctx, c) => {
    text(ctx, 'Datasets', 600, 142, 27, c.title, { underline: true });
    text(ctx, 'parameters', 752, 177, 13, c.ink, { weight: 800, align: 'center' });
    const rows = [['truck_id', 'Q', 'S', 'C', 'd1', 'd2', 'd3', 'd4']];
    TRUCKS.forEach((t, i) => rows.push([String(i + 1), ...t, 1500, 2000, 1800, 1000]));
    table(ctx, 598, 188, [56, 40, 34, 30, 38, 38, 38, 38], 22.5, rows, 11, c);
  }, { stage: 1, order: .26 });
  icon('dsCab', cabinet(1.05), 880, 128, { stage: 1, order: .55 });

  // 2 · Classification agent
  arrow('A1', [[215, 448], [215, 613]], { stage: 2, order: .02 });
  card('cls', [20, 615, 372, 890], (ctx, c) => {
    text(ctx, 'Classification Agent', 196, 654, 25, c.title, { underline: true, align: 'center' });
    text(ctx, 'Similar problem', 200, 690, 14.5, c.mute, { weight: 800, align: 'center' });
    text(ctx, 'description', 200, 707, 14.5, c.mute, { weight: 800, align: 'center' });
    text(ctx, 'LLM', 92, 874, 21, c.ink, { align: 'center' });
    text(ctx, 'Ref-Data', 300, 874, 21, c.ink, { align: 'center' });
  }, { stage: 2, order: .12 });
  icon('clsHead', head(.95), 92, 808, { stage: 2, order: .3, lean: true });
  icon('clsRag', rag(.95), 198, 812, { stage: 2, order: .38, lean: true });
  icon('clsServer', server(.78), 282, 818, { stage: 2, order: .46 });
  arrow('A2', [[372, 742], [409, 742]], { stage: 2, order: .55 });
  card('disc', [412, 674, 548, 810], (ctx, c) => text(ctx, '…', 511, 760, 22, c.ink, { align: 'center' }), { stage: 2, order: .58, circle: true });
  const TYPES = [['Others', 456, 711], ['SBLP', 505, 726], ['NRM', 449, 751], ['FLP', 483, 781]];
  TYPES.forEach(([name, fx, fy], i) => icon(`tok-${name}`, token(name), fx, fy, { stage: 2, order: .64 + i * .04 }));
  floorText('Problem Type', 480, 846, 22, { stage: 2, order: .8 });

  // 3 · Workflow generation agent
  const RACKS = [['NRM', 774], ['RA', 812], ['TP', 850], ['Others', 914]];
  arrow('A3', [[548, 742], [593, 742]], { stage: 3, order: .02 });
  card('wg', [595, 618, 960, 890], (ctx, c) => {
    text(ctx, 'Workflow Generation Agent', 777, 657, 23, c.title, { underline: true, align: 'center' });
    text(ctx, 'Problem', 652, 690, 16, c.ink, { align: 'center' });
    text(ctx, 'Description', 652, 708, 16, c.ink, { align: 'center' });
    text(ctx, 'Relevant', 757, 690, 13.5, c.mute, { weight: 800, align: 'center' });
    text(ctx, 'information', 757, 706, 13.5, c.mute, { weight: 800, align: 'center' });
    text(ctx, 'Ref-Data', 874, 699, 16, c.ink, { align: 'center' });
    RACKS.forEach(([s, x]) => text(ctx, s, x, 883, 11, c.ink, { weight: 900, align: 'center' }));
    text(ctx, '…', 884, 868, 14, c.mute, { align: 'center' });
  }, { stage: 3, order: .1 });
  icon('wgQa', qa(.82), 652, 792, { stage: 3, order: .26, lean: true });
  icon('wgRag', rag(.9), 757, 798, { stage: 3, order: .34, lean: true });
  icon('wgServer', server(.6), 866, 788, { stage: 3, order: .42 });
  RACKS.forEach(([s, x], i) => icon(`rack-${s}`, rack(.92), x, 856, { stage: 3, order: .5 + i * .04 }));
  arrow('A4', [[960, 742], [993, 742]], { stage: 3, order: .72 });
  icon('wfDoc', doc(1.05), 1022, 742, { stage: 3, order: .76, onCard: false, lean: true });
  floorText('Workflow', 1026, 806, 22, { stage: 3, order: .86 });

  // 4 · The two workflows, seen through the lens
  icon('lens', magnifier(1), 1102, 874, { stage: 4, order: 0, onCard: false, lean: true });
  arrow('A6', [[1022, 822], [1022, 933]], { stage: 4, order: .04, dashed: true, width: .1 });
  outline('lens', [[950, 935], [1512, 935], [1512, 1612], [385, 1612], [385, 935]], { stage: 4, order: .06, radius: .6, closed: true });
  outline('lens', [[1020, 1000], [1020, 1598]], { stage: 4, order: .1 });
  floorText('Type-Tailored', 880, 966, 25, { stage: 4, order: .1, colorKey: 'navy' });
  floorText('(classified as NRM/RA)', 880, 992, 16, { stage: 4, order: .12, colorKey: 'navy', weight: 700 });
  floorText('Type-Agnostic', 1162, 966, 25, { stage: 4, order: .14, colorKey: 'navy' });
  floorText('(classified as Others/Mixture)', 1162, 992, 16, { stage: 4, order: .16, colorKey: 'navy', weight: 700 });
  card('tPD', [420, 962, 740, 1166], (ctx, c) => {
    text(ctx, 'Demo Problem Description', 440, 992, 19, c.title, { underline: true });
    rich(ctx, [['The sales dataset stored in “Nike Shoes Sales.csv” contains information on multiple Nike shoe models/styles …… With predetermined initial stock levels specified in the “inventory” column for the', c.ink], [' Nike x Olivia Kim collaboration products,', c.red], [' the store aims to optimize total projected revenue under non-replenishable conditions ……', c.ink]], 440, 1022, 285, 12.6, 17.6, { weight: 700 });
  }, { stage: 4, order: .14 });
  icon('tQa', qa(.7), 712, 968, { stage: 4, order: .22, lean: true });
  arrow('ident', [[585, 1166], [585, 1221]], { stage: 4, order: .3, width: .11 });
  floorText('Identification', 665, 1200, 18, { stage: 4, order: .3 });
  card('tCat', [430, 1222, 735, 1289], (ctx, c) => {
    text(ctx, 'Data Categories', 450, 1247, 17, c.title, { underline: true });
    text(ctx, 'Nike x OliviaKim brand', 462, 1276, 14, c.red, { weight: 700 });
  }, { stage: 4, order: .34 });
  card('tData', [430, 1297, 735, 1550], (ctx, c) => {
    text(ctx, 'Demo Datasets', 446, 1322, 17, c.title, { underline: true });
    table(ctx, 446, 1334, [156, 42, 42, 38], 14.4, NIKE, 7.2, c);
  }, { stage: 4, order: .28 });
  arrow('ragT', [[585, 1550], [585, 1588], [880, 1588], [880, 1532]], { stage: 4, order: .44, radius: .22, width: .11 });
  floorText('RAG', 732, 1578, 18, { stage: 4, order: .44, colorKey: 'navy', weight: 900 });
  card('tRel', [757, 1266, 1000, 1530], (ctx, c) => {
    text(ctx, 'Details of Relevant Data', 772, 1294, 16.5, c.title, { underline: true });
    rich(ctx, [['1. Product Name: Nike x Olivia Kim Air Mowabb, Revenue: 11197, Demand: 17, Initial Inventory: 97\n2. Product Name: Nike x Olivia Kim Air Footscape, Revenue: 9097, Demand: 26, Initial Inventory: 240\n3. Product Name: Nike x Olivia Kim Air Max 98, Revenue: 11197, Demand: 50, …', c.ink]], 772, 1322, 214, 12.4, 17, { weight: 700 });
  }, { stage: 4, order: .48 });
  arrow('llmT', [[868, 1265], [868, 1198]], { stage: 4, order: .56, width: .11 });
  floorText('LLM', 904, 1238, 18, { stage: 4, order: .56 });
  card('tFinal', [758, 1004, 995, 1196], (ctx, c) => {
    text(ctx, 'Final Model', 776, 1030, 17, c.title, { underline: true });
    text(ctx, 'Objective Function', 776, 1054, 12.5, c.ink, { weight: 800, underline: true });
    text(ctx, 'max Σᵢ Aᵢ · xᵢ …', 776, 1072, 12.5, c.red, { weight: 700 });
    text(ctx, 'Constraints', 776, 1092, 12.5, c.ink, { weight: 800, underline: true });
    text(ctx, '1. Inventory Constraints: …', 776, 1110, 12.5, c.red, { weight: 700 });
    text(ctx, '2. Demand Constraints: …', 776, 1127, 12.5, c.red, { weight: 700 });
    text(ctx, 'Retrieved Information:', 776, 1148, 12.5, c.ink, { weight: 800, underline: true });
    text(ctx, 'I = [97, 240, 322, 281] …', 776, 1167, 12.5, c.red, { weight: 700 });
  }, { stage: 4, order: .6 });
  card('aData', [1030, 1006, 1208, 1132], (ctx, c) => {
    text(ctx, 'Demo Datasets', 1044, 1030, 15, c.title, { underline: true });
    table(ctx, 1042, 1040, [44, 34, 34, 34], 20, IO_TABLE, 9.5, c);
  }, { stage: 4, order: .66 });
  arrow('py', [[1208, 1069], [1297, 1069]], { stage: 4, order: .7, width: .11 });
  floorText('Python', 1252, 1104, 18, { stage: 4, order: .7 });
  card('aSchema', [1298, 990, 1492, 1132], (ctx, c) => {
    text(ctx, 'Table Scheme', 1312, 1015, 15, c.title, { underline: true });
    const y = rich(ctx, [['Successfully read the first 3 rows from input_output_table.csv.\nColumns: [Producer, Coal, Power, Steel]\nData Head:', c.ink]], 1312, 1034, 170, 9, 11.6, { weight: 700 });
    table(ctx, 1312, y + 5, [44, 40, 40, 40], 11.4, IO_TABLE, 7.4, c);
  }, { stage: 4, order: .72 });
  arrow('sDown', [[1418, 1132], [1418, 1203]], { stage: 4, order: .76, width: .11 });
  card('aTile', [1370, 1205, 1468, 1302], null, { stage: 4, order: .78 });
  icon('aHead', head(.62), 1419, 1262, { stage: 4, order: .82, lean: true });
  floorText('LLM', 1419, 1330, 18, { stage: 4, order: .82 });
  card('aPD', [1255, 1352, 1468, 1598], (ctx, c) => {
    text(ctx, 'Demo Problem', 1270, 1380, 16, c.title, { underline: true });
    text(ctx, 'Description', 1270, 1402, 16, c.title, { underline: true });
    rich(ctx, [['A closed economic system consists of three sectors … in input_output_table.csv shows the distribution of each sector’s output to the other sectors as proportions of total output. Determine equilibrium prices (if steel is 10000) for each sector such that the value….', c.ink]], 1270, 1428, 186, 11.6, 16, { weight: 700 });
  }, { stage: 4, order: .8 });
  icon('aQa', qa(.62), 1458, 1374, { stage: 4, order: .84, lean: true });
  arrow('pd2llm', [[1468, 1452], [1500, 1452], [1500, 1254], [1468, 1254]], { stage: 4, order: .86, radius: .14, width: .1 });
  arrow('prompt', [[1370, 1254], [1244, 1254]], { stage: 4, order: .9, width: .11 });
  floorText('Prompt', 1306, 1290, 18, { stage: 4, order: .9 });
  card('aPlan', [1030, 1224, 1242, 1598], (ctx, c) => {
    text(ctx, 'Abstract Model Plan', 1044, 1252, 16, c.title, { underline: true });
    const steps = [['1. Analyze Query:', 'User wants to …'], ['2. Identify Model Type:', 'A system of linear equations…'], ['3. Define Index Sets:', '* $I = {1, 2, 3}$ …'], ['4. Define Decision Variables:', '* $p[i]$ = … Type: …'], ['5. Identify Parameters (from\nSchema):', '* $a[j,i]$ …'], ['6. Formulate Objective:', 'dummy objective.'], ['7. Formulate Constraints:', '* Equilibrium Balance: …', '* Fixed Price: …', '* Domain: non-negative.']];
    let y = 1278;
    for (const [h, ...body] of steps) {
      for (const line of h.split('\n')) { text(ctx, line, 1042, y, 11, c.ink, { weight: 800, underline: true }); y += 15; }
      for (const b of body) y = rich(ctx, [[b, c.red]], 1054, y + 1.5, 180, 10.8, 15, { weight: 700 }) + 15;
      y += 2.5;
    }
  }, { stage: 4, order: .9 });

  // 5 · Model generation agent and its output
  card('mg', [1170, 555, 1515, 893], (ctx, c) => {
    text(ctx, 'Model Generation Agent', 1342, 594, 23, c.title, { underline: true, align: 'center' });
    text(ctx, 'LLM', 1248, 727, 20, c.ink, { align: 'center' });
    text(ctx, 'Workflow', 1250, 880, 19, c.ink, { align: 'center' });
    text(ctx, 'Relevant data', 1362, 668, 14, c.mute, { weight: 800, align: 'center' });
    text(ctx, 'Datasets', 1457, 812, 19, c.ink, { align: 'center' });
  }, { stage: 5, order: .05 });
  icon('mgHead', head(.72), 1248, 690, { stage: 5, order: .2, lean: true });
  icon('mgPlus', plus(.9), 1248, 762, { stage: 5, order: .26, lean: true });
  icon('mgDoc', doc(.82), 1250, 840, { stage: 5, order: .3, lean: true });
  icon('mgRag', rag(.9), 1362, 760, { stage: 5, order: .36, lean: true });
  icon('mgCab', cabinet(.82), 1456, 768, { stage: 5, order: .42 });
  arrow('A5', [[1053, 742], [1168, 742]], { stage: 5, order: .5 });
  arrow('A7', [[760, 448], [760, 603], [1168, 603]], { stage: 5, order: .56, radius: .4 });
  floorText('Embedding', 966, 584, 24, { stage: 5, order: .6 });
  arrow('A8', [[1345, 555], [1345, 469]], { stage: 5, order: .68 });
  card('out', [1188, 372, 1548, 467], (ctx, c) => {
    text(ctx, 'Optimization Model', 1368, 412, 28, c.title, { align: 'center', weight: 900 });
    text(ctx, '& Executable Code', 1368, 446, 28, c.title, { align: 'center', weight: 900 });
  }, { stage: 5, order: .72, tone: 'output' });
  icon('monitor', monitor(1), 1368, 318, { stage: 5, order: .82, onCard: false, lean: true });

  /* whole units: each agent, module or panel of the figure flies as one block */
  const figX = p => p.slot.x * 100 + 790;
  const figY = p => p.slot.z * 100 + 800;
  function unitKey(p) {
    if (p.stage === 1) return 'input';
    if (p.stage === 2) return figX(p) > 395 ? 'type' : 'classify';
    if (p.stage === 3) return figX(p) > 960 ? 'handoff' : 'workflow';
    if (p.stage === 4) return p.name === 'lens' ? 'lens' : figX(p) < 1020 ? 'tailored' : 'agnostic';
    return figY(p) < 480 ? 'output' : 'model';
  }
  const units = [];
  for (const p of pieces) {
    const key = unitKey(p);
    let u = units.find(x => x.key === key);
    if (!u) { u = { key, stage: p.stage, pieces: [], order: Infinity, a: 1, pivot: new THREE.Vector3() }; units.push(u); }
    u.pieces.push(p);
    u.order = Math.min(u.order, p.th);
    p.unit = u;
  }
  for (const stage of [1, 2, 3, 4, 5]) {
    // Units of a station land in figure order, all before the station is centred.
    const list = units.filter(u => u.stage === stage).sort((a, b) => a.order - b.order);
    list.forEach((u, rank) => { u.th = stage - .5 + rank * .3 / list.length; });
  }
  for (const u of units) {
    for (const p of u.pieces) u.pivot.add(p.slot);
    u.pivot.divideScalar(u.pieces.length);
    // Out of sight: high above and behind the board, spread a little sideways, turned.
    u.away = new THREE.Vector3(u.pivot.x * .35 + (rand() - .5) * 4, 15 + rand() * 5, -9 - rand() * 4);
    u.tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * 1.1, (rand() - .5) * 1.3, (rand() - .5) * .7));
  }

  /* ---------- flow along the assembled arrows ---------- */
  const beadGeo = new THREE.SphereGeometry(.085, 20, 14);
  const beadPool = [];
  function takeBead() {
    let b = beadPool.find(x => !x.userData.busy);
    if (!b) { b = new THREE.Mesh(beadGeo, beadMats.red); b.castShadow = true; world.add(b); beadPool.push(b); }
    b.userData.busy = true;
    return b;
  }
  const runs = [];
  const ready = name => arrows[name] && arrows[name].g >= 1;
  function hop(name, amount = .22) {
    const p = named[name];
    if (p && p.a === 1 && !reduced) { p.hopT = 0; p.hopA = amount; }
  }
  function spin(name) { const p = named[name]; if (p) p.spin = 1; }
  function startRun(legs, wait = 0) { if (ready(legs[0].arrow)) runs.push({ legs, i: 0, d: 0, wait, bead: null }); }
  let flash = 0;
  const LANE = [
    { arrow: 'ident', color: 'red', arrive: () => hop('tCat', .1) },
    { arrow: 'ragT', color: 'gold', arrive: () => hop('tRel', .08) },
    { arrow: 'llmT', color: 'blue', arrive: () => hop('tFinal', .08) },
  ];
  const LENS = [{ arrow: 'A6', color: 'blue', arrive: () => { hop('lens', .3); hop('tPD', .08); startRun(LANE, .2); } }];
  const MAIN = [
    { arrow: 'A1', color: 'red', arrive: () => { hop('cls', .05); hop('clsHead'); spin('clsRag'); hop('clsServer', .14); }, pause: .55 },
    { arrow: 'A2', color: 'red', arrive: () => TYPES.forEach(([name]) => hop(`tok-${name}`, .2)), pause: .45 },
    // The running example is a resource allocation problem.
    { arrow: 'A3', color: 'red', arrive: () => { hop('wg', .05); hop('wgQa'); spin('wgRag'); hop('rack-RA', .26); hop('wgServer', .12); }, pause: .55 },
    { arrow: 'A4', color: 'blue', arrive: () => { hop('wfDoc', .3); startRun(LENS, .1); }, pause: .4 },
    { arrow: 'A5', color: 'blue', arrive: () => { hop('mg', .05); hop('mgHead'); hop('mgDoc'); spin('mgRag'); hop('mgCab', .14); }, pause: .55 },
    { arrow: 'A8', color: 'blue', arrive: () => { hop('out', .08); hop('monitor', .2); flash = 1; } },
  ];
  const AGN = [
    { arrow: 'py', color: 'gold', arrive: () => hop('aSchema', .08) },
    { arrow: 'sDown', color: 'gold', arrive: () => { hop('aTile', .06); hop('aHead', .2); } },
    { arrow: 'prompt', color: 'blue', arrive: () => hop('aPlan', .06) },
  ];
  let mainClock = 1, embedClock = .4, agnClock = 3.6;
  function stepFlow(dt) {
    if ((mainClock -= dt) <= 0) { mainClock = 7.4; startRun(MAIN); }
    if ((embedClock -= dt) <= 0) { embedClock = 1.25; startRun([{ arrow: 'A7', color: 'gold', speed: 3.4, arrive: () => hop('mgCab', .06) }]); }
    if ((agnClock -= dt) <= 0) {
      agnClock = 7.4;
      startRun(AGN);
      startRun([{ arrow: 'pd2llm', color: 'red', arrive: () => hop('aHead', .2) }]);
    }
    for (const r of runs) {
      if (r.wait > 0) { r.wait -= dt; if (r.bead) r.bead.visible = false; continue; }
      const leg = r.legs[r.i], ar = arrows[leg.arrow];
      if (!ar || ar.g < 1) { r.done = true; continue; }
      r.bead ||= takeBead();
      r.bead.material = beadMats[leg.color];
      r.d += dt * (leg.speed || 2.8);
      const end = ar.L - .16;
      ar.path.getPointAt(clamp(Math.min(r.d, end) / ar.L), tmpA);
      r.bead.position.set(tmpA.x, ar.h + .085, tmpA.z);
      r.bead.visible = true;
      if (r.d >= end) {
        leg.arrive?.();
        r.i++; r.d = 0; r.wait = leg.pause ?? .3;
        if (r.i >= r.legs.length) r.done = true;
      }
    }
    for (let i = runs.length - 1; i >= 0; i--) {
      if (!runs[i].done) continue;
      if (runs[i].bead) { runs[i].bead.visible = false; runs[i].bead.userData.busy = false; }
      runs.splice(i, 1);
    }
  }

  /* ---------- per-frame updates ---------- */
  // `built` follows the scroll position at a bounded pace, so a jump still assembles part by part.
  // The cover shows the whole figure; leaving it, the later stations come apart in reverse order
  // so the tour can rebuild them one at a time.
  // Units wait out of sight and land when the tour reaches their station; `built` follows the scroll position at a
  // bounded pace. With `lifted` off (no cover figure on the page) every unit is shown in place.
  let progress = 0, built = 0, time = 0, settle = true, lifted = true;
  const q = new THREE.Quaternion(), turn = new THREE.Quaternion(), rel = new THREE.Vector3(), none = new THREE.Quaternion();
  function updateParts(dt) {
    const snap = settle || reduced;
    built = snap ? progress : approach(built, progress, dt * 1.5);
    for (const u of units) {
      const target = !lifted || built >= u.th ? 1 : 0;
      const before = u.a;
      u.a = snap ? target : approach(u.a, target, dt / (target ? .9 : .55));
      if (before < 1 && u.a === 1 && !snap) for (const p of u.pieces) { p.hopT = 0; p.hopA = p.kind === 'card' ? .12 : .26; }
      const e = inOut(u.a), k = 1 - e;
      turn.slerpQuaternions(none, u.tumble, k);
      for (const p of u.pieces) {
        p.a = u.a;
        // Rigid: every piece keeps its place in the unit while the unit travels and turns.
        rel.subVectors(p.slot, u.pivot).applyQuaternion(turn);
        p.obj.position.copy(u.pivot).add(rel).addScaledVector(u.away, k);
        if (!reduced && p.hopT < 2) { p.hopT += dt; p.obj.position.y += p.hopA * Math.exp(-5.2 * p.hopT) * Math.abs(Math.sin(p.hopT * 9.5)); }
        p.obj.quaternion.copy(q.copy(turn).multiply(p.slotQ));
      }
    }
    for (const p of pieces) {
      const cast = p.a > .02;
      if (cast !== p.casting) {
        p.casting = cast;
        p.obj.traverse(o => { if (o.isMesh) o.castShadow = cast && !o.userData.noShadow; });
      }
      if (p.skirt) { p.skirt.material.opacity = smooth(clamp((p.a - .8) / .2)) * pal.skirt; p.skirt.visible = p.a > .8; }
      const arcs = p.inner.userData.arcs;
      if (arcs && !reduced) { p.spin = Math.max(0, p.spin - dt * .9); arcs.rotation.z += dt * (p.a === 1 ? .5 + p.spin * 7 : .3); }
    }
    for (const l of links) {
      const target = !lifted || built >= l.th ? 1 : 0;
      const before = l.g;
      l.g = snap ? target : approach(l.g, target, dt / .7);
      if (l.g !== before || settle) l.apply(l.g);
    }
    flash = Math.max(0, flash - dt * 1.2);
    if (screen) screen.material.color.setScalar(1 + flash * .35);
  }

  /* ---------- theme ---------- */
  function setTheme(next) {
    pal = THEMES[next] || THEMES.light;
    scene.background = new THREE.Color(pal.bg);
    floorMat.uniforms.uBg.value.set(pal.bg);
    floorMat.uniforms.uDot.value.set(pal.dot);
    floorMat.uniforms.uGlowA.value.set(pal.glowA);
    floorMat.uniforms.uGlowB.value.set(pal.glowB);
    hemi.intensity = pal.hemi;
    hemi.groundColor.set(next === 'dark' ? '#1a2333' : '#dfe6ef');
    key.intensity = pal.key;
    fill.intensity = pal.fill;
    shadowMat.opacity = pal.shadowOpacity;
    shadowMat.color.set(pal.shadow);
    for (const [k, m] of Object.entries(tones)) { m.color.set(pal.tones[k]); m.envMapIntensity = pal.env; }
    M.card.color.set(pal.card);
    M.ink.color.set(next === 'dark' ? '#c9d4e3' : '#2b313b');
    M.arrow.color.set(pal.arrow);
    for (const m of Object.values(M)) m.envMapIntensity = pal.env;
    // Card faces are lit without clipping, so the printed text keeps its contrast.
    for (const m of faceMats) m.color.setScalar(pal.face);
    for (const { mat, key: k } of tintMats) mat.color.set(pal[k]);
    for (const p of paints) if (p.themed) repaint(p);
    requestRender();
  }

  /* ---------- camera ---------- */
  const KEYS = ['dist', 'yaw', 'pitch', 'f', 'pf', 'px', 'py', 'fov', 'tilt'];
  const cam = { t: new THREE.Vector3(), dist: 0, yaw: 0, pitch: 0, f: 0, pf: 1, px: 0, py: 0, fov: 28, tilt: 0 };
  const goal = { t: new THREE.Vector3(), dist: 0, yaw: 0, pitch: 0, f: 0, pf: 1, px: 0, py: 0, fov: 28, tilt: 0 };
  const shotB = new THREE.Vector3(), lift = new THREE.Vector3();
  let pointerX = 0, pointerY = 0, aspect = 1, portrait = false;
  function shotAt(p) {
    const i = Math.min(SHOTS.length - 2, Math.floor(clamp(p, 0, SHOTS.length - 1)));
    const k = smoother(clamp(p - i));
    const a = SHOTS[i], b = SHOTS[i + 1];
    goal.t.set(...a.t).lerp(shotB.set(...b.t), k);
    for (const n of KEYS) goal[n] = a[n] + (b[n] - a[n]) * k;
  }
  function placeCamera() {
    const fit = portrait ? cam.pf : aspect < 1.25 ? 1.2 : 1;
    const dist = cam.dist * fit;
    const yaw = cam.yaw + pointerX * .03, pitch = cam.pitch + pointerY * .018;
    const target = lift.copy(cam.t);
    if (portrait) target.x += cam.px;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.up.set(0, 1, 0).lerp(PAPER_UP, cam.tilt).normalize();
    camera.lookAt(target);
    camera.fov = portrait ? cam.fov * 9 / 7 : cam.fov;
    if (portrait) camera.translateY(-2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * cam.py);
    floorMat.uniforms.uCover.value = cam.tilt;
    const shift = portrait ? 0 : cam.f * (aspect < 1.25 ? .5 : 1);
    camera.filmOffset = -shift * camera.getFilmWidth() * camera.aspect * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    aspect = w / h;
    portrait = aspect < .82;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < 820 ? 1.6 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    requestRender();
  }

  /* ---------- loop ---------- */
  let active = true, visible = !document.hidden, raf = 0, last = performance.now();
  function requestRender() { if (!raf && active && visible) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    time += dt;
    shotAt(progress);
    let moving = false;
    if (settle) {
      cam.t.copy(goal.t);
      for (const k of KEYS) cam[k] = goal[k];
    } else {
      const lambda = reduced ? 60 : 3;
      for (const k of KEYS) { const before = cam[k]; cam[k] = damp(cam[k], goal[k], lambda, dt); if (Math.abs(cam[k] - before) > 1e-5) moving = true; }
      const before = shotB.copy(cam.t);
      cam.t.lerp(goal.t, 1 - Math.exp(-lambda * dt));
      if (before.distanceToSquared(cam.t) > 1e-9) moving = true;
    }
    placeCamera();
    updateParts(dt);
    if (!reduced) stepFlow(dt);
    settle = false;
    renderer.render(scene, camera);
    if (active && visible && (!reduced || moving)) raf = requestAnimationFrame(frame);
  }
  function setActive(next) {
    if (next === active) return;
    active = next;
    canvas.style.visibility = active ? 'visible' : 'hidden';
    if (active) { last = performance.now(); requestRender(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  const onVisibility = () => { visible = !document.hidden; if (visible) { last = performance.now(); requestRender(); } };
  const onPointer = event => { pointerX = event.clientX / innerWidth * 2 - 1; pointerY = event.clientY / innerHeight * 2 - 1; };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', resize);
  const pointerFine = !reduced && matchMedia('(pointer: fine)').matches;
  if (pointerFine) addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); document.documentElement.classList.add('no-webgl'); });

  setTheme(theme);
  resize();

  return {
    setProgress(p) { progress = p; requestRender(); },
    setLifted(next) { lifted = Boolean(next); requestRender(); },
    setActive,
    setTheme,
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', resize);
      if (pointerFine) removeEventListener('pointermove', onPointer);
      scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => m.dispose()); } });
      disposables.forEach(t => t.dispose());
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

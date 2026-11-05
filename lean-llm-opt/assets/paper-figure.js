import * as THREE from './vendor/three/three.module.js';
import {PAPER_SIZE, PAPER_OVERVIEW, buildPaperFigure, addPaperLighting, releaseObjects, loadArtwork} from './paper-model.js';
export {PAPER_SIZE, PAPER_OVERVIEW, buildPaperFigure, addPaperLighting} from './paper-model.js';
const clamp = THREE.MathUtils.clamp;

// Source coordinates, measured from the top left of the published diagram.
const DETAILS = {
  input: [18, 10, 989, 480],
  classifier: [18, 613, 540, 897],
  workflow: [584, 612, 1092, 897],
  model: [1167, 548, 1525, 900],
  output: [1175, 165, 1558, 476],
  tailored: [380, 931, 1020, 1615],
  agnostic: [1019, 931, 1520, 1615],
  routes: [381, 930, 1520, 1618],
};

function project(x, y, z, state) {
  const point = new THREE.Vector3(x - PAPER_SIZE.width / 2, PAPER_SIZE.height / 2 - y, z);
  if (state.view === 'spatial') point.applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
  return point;
}

export function paperPose(width, height, viewportWidth, viewportHeight, state) {
  const spatial = state.view === 'spatial';
  const scale = Math.min(viewportWidth / width, viewportHeight / height) * (spatial ? .92 : .95) * state.zoom;
  const box = DETAILS[state.focus];
  const target = box ? project((box[0]+box[2])/2, (box[1]+box[3])/2, 55, state) : new THREE.Vector3();
  return {halfWidth: viewportWidth/(2*scale), halfHeight: viewportHeight/(2*scale),
    x: target.x + state.pan.x, y: target.y + state.pan.y, scale};
}

function sectionZoom(section, state, width, height) {
  const [x0,y0,x1,y1] = DETAILS[section];
  const bounds = new THREE.Box3();
  for (const x of [x0,x1]) for (const y of [y0,y1]) for (const z of [0,130]) bounds.expandByPoint(project(x,y,z,state));
  const span = bounds.getSize(new THREE.Vector3());
  const overviewScale = paperPose(PAPER_SIZE.width,PAPER_SIZE.height,width,height,{...state,zoom:1}).scale;
  return clamp(.92*Math.min(width/span.x,height/span.y)/overviewScale,1,8);
}

export function mountPaperFigure(root, {rendererFactory, loadAssets = loadArtwork} = {}) {
  const viewport = root.querySelector('#paper-viewport');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const controls = [...root.querySelectorAll('button')];
  const focusControl = root.querySelector('[data-paper-section]');
  const state = {view:'spatial', ...PAPER_OVERVIEW, focus:null, zoom:1, pan:{x:0,y:0}, tool:'rotate', fallback:false};
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,.1,8000);
  const scene = new THREE.Scene();
  const cleanups = [];
  let renderer, art, assets, drag, raf = 0, visible = true, disposed = false;
  let lastPose, transition;

  function listen(target, event, fn) {
    target.addEventListener(event,fn);
    cleanups.push(() => target.removeEventListener(event,fn));
  }
  function controlsChanged() {
    viewport.dataset.zoomed = String(state.zoom > 1);
    viewport.dataset.tool = state.tool;
    root.dataset.paperView = state.view;
    root.toggleAttribute('data-paper-static',state.fallback);
    if (focusControl) focusControl.value = state.focus || '';
    for (const button of controls) {
      const {paperView,paperAction} = button.dataset;
      if (paperView) button.setAttribute('aria-pressed',String(state.view === paperView));
      if (paperAction === 'zoom-in') button.disabled = state.zoom >= 8;
      if (paperAction === 'zoom-out') button.disabled = state.zoom <= 1;
      if (paperAction === 'pan') {
        button.setAttribute('aria-pressed',String(state.tool === 'pan'));
        button.disabled = state.fallback || state.view === 'front';
      }
    }
  }
  function draw(now) {
    raf = 0;
    if (!visible || document.hidden || disposed) return;
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    const pose = paperPose(PAPER_SIZE.width,PAPER_SIZE.height,w,h,state);
    // Static renders use the same framing as the model at 1x.
    viewport.style.setProperty('--paper-scale',String(state.zoom));
    viewport.style.setProperty('--paper-x',(-pose.x*pose.scale)+'px');
    viewport.style.setProperty('--paper-y',(pose.y*pose.scale)+'px');
    if (!art || !renderer || state.fallback) return;

    const target = {...pose, pitch:state.view === 'spatial' ? state.pitch : 0, yaw:state.view === 'spatial' ? state.yaw : 0};
    if (transition) {
      const t = clamp((now - transition.start)/320,0,1);
      for (const key of ['x','y','halfWidth','halfHeight','yaw','pitch']) {
        target[key] = THREE.MathUtils.lerp(transition.from[key],target[key],1 - (1-t)**3);
      }
      if (t >= 1) transition = null;
    }
    lastPose = target;
    const ratio = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.round(w*ratio) || renderer.domElement.height !== Math.round(h*ratio)) renderer.setSize(w,h,false);
    art.rotation.set(target.pitch,target.yaw,0,'YXZ');
    Object.assign(camera,{left:-target.halfWidth,right:target.halfWidth,top:target.halfHeight,bottom:-target.halfHeight});
    camera.position.set(target.x,target.y,4000);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    root.classList.add('is-webgl');
    if (transition) invalidate();
  }
  function invalidate() {
    if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(draw);
  }
  function update(animate = false) {
    transition = animate && lastPose && document.documentElement?.dataset.motion !== 'reduced'
      ? {from:lastPose,start:performance.now()} : null;
    controlsChanged();
    invalidate();
  }
  function reset() {
    Object.assign(state,{...PAPER_OVERVIEW, view:'spatial', zoom:1, focus:null, pan:{x:0,y:0}, tool:state.fallback?'pan':'rotate'});
  }
  function selectSection(section) {
    if (!DETAILS[section]) {reset();return;}
    Object.assign(state,{...PAPER_OVERVIEW, focus:section, pan:{x:0,y:0}});
    state.zoom = sectionZoom(section,state,viewport.clientWidth,viewport.clientHeight);
  }
  function zoom(factor) {
    state.zoom = clamp(state.zoom*factor,1,8);
    if (state.zoom === 1) {state.focus = null;state.pan = {x:0,y:0};}
  }
  function pan(dx,dy) {
    const pose = paperPose(PAPER_SIZE.width,PAPER_SIZE.height,viewport.clientWidth,viewport.clientHeight,state);
    state.pan.x = clamp(state.pan.x - dx/pose.scale,-PAPER_SIZE.width*.85,PAPER_SIZE.width*.85);
    state.pan.y = clamp(state.pan.y + dy/pose.scale,-PAPER_SIZE.height*.85,PAPER_SIZE.height*.85);
  }
  function move(dx,dy,shift) {
    if (state.tool === 'pan' || state.fallback || state.view === 'front' || shift) pan(dx,dy);
    else {
      state.yaw = clamp(state.yaw + dx*.006,-1.14,1.14);
      state.pitch = clamp(state.pitch + dy*.006,-.82,.82);
    }
  }
  function inspectPoint(clientX,clientY) {
    if (!art || state.fallback) return;
    const rect = viewport.getBoundingClientRect();
    const pointer = new THREE.Vector2(2*(clientX-rect.left)/rect.width-1,1-2*(clientY-rect.top)/rect.height);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer,camera);
    const hit = ray.intersectObject(art,true).find(({object}) => object.isMesh && object.userData.part !== 'typesetting');
    if (!hit) return;
    const location = art.worldToLocal(hit.point.clone());
    const x = location.x + PAPER_SIZE.width/2, y = PAPER_SIZE.height/2 - location.y;
    const section = Object.keys(DETAILS).find(key => {
      const [left,top,right,bottom] = DETAILS[key];
      return x >= left && x <= right && y >= top && y <= bottom;
    });
    if (section) {selectSection(section);update(true);}
  }
  for (const button of controls) listen(button,'click',() => {
    const {paperAction,paperView} = button.dataset;
    if (paperView) {
      state.view = paperView;
      state.tool = paperView === 'front' || state.fallback ? 'pan' : 'rotate';
      if (state.focus) selectSection(state.focus);
    }
    if (paperAction === 'zoom-in') zoom(1.4);
    if (paperAction === 'zoom-out') zoom(1/1.4);
    if (paperAction === 'reset') reset();
    if (paperAction === 'pan') state.tool = state.tool === 'rotate' ? 'pan' : 'rotate';
    update(paperAction !== 'pan');
  });
  if (focusControl) listen(focusControl,'change',() => {selectSection(focusControl.value);update(true);});
  listen(viewport,'pointerdown',event => {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,travel:0};
    viewport.dataset.dragging = 'true';
    viewport.setPointerCapture?.(drag.id);
  });
  listen(viewport,'pointermove',event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.travel += Math.hypot(dx,dy);
    move(dx,dy,event.shiftKey);
    drag.x = event.clientX;drag.y = event.clientY;
    update();
  });
  const release = event => {
    if (drag?.id !== event.pointerId) return;
    if (event.type === 'pointerup' && drag.travel < 5 && state.tool === 'rotate') inspectPoint(event.clientX,event.clientY);
    drag = null;viewport.dataset.dragging = 'false';
  };
  for (const event of ['pointerup','pointercancel','lostpointercapture']) listen(viewport,event,release);
  listen(viewport,'keydown',event => {
    const directions = {ArrowLeft:[-32,0],ArrowRight:[32,0],ArrowUp:[0,-32],ArrowDown:[0,32]};
    if (directions[event.key]) move(...directions[event.key],event.shiftKey);
    else if (event.key === '+' || event.key === '=') zoom(1.4);
    else if (event.key === '-') zoom(1/1.4);
    else if (event.key === 'Escape' || event.key === 'Home') reset();
    else return;
    event.preventDefault();update();
  });
  function fallback() {
    state.fallback = true;
    state.tool = 'pan';
    Object.assign(state,PAPER_OVERVIEW);
    transition = null;
    root.classList.remove('is-webgl');
    canvas.hidden = true;
    update();
  }
  listen(canvas,'webglcontextlost',event => {event.preventDefault();fallback();});
  listen(canvas,'webglcontextrestored',() => {
    if (!art || disposed) return;
    state.fallback = false;state.tool = state.view === 'front' ? 'pan' : 'rotate';
    canvas.hidden = false;update();
  });
  const resize = new ResizeObserver(() => {transition = null;invalidate();});
  const observer = new IntersectionObserver(([entry]) => {visible = entry.isIntersecting;if (visible) invalidate();});
  resize.observe(viewport);observer.observe(viewport);
  listen(document,'visibilitychange',invalidate);
  controlsChanged();
  async function initialize() {
    try {
      renderer = rendererFactory ? rendererFactory(canvas) : new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
      renderer.setClearColor(0,0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      assets = await loadAssets();
      if (disposed) {releaseObjects(assets.library);assets.print.dispose();return;}
      assets.print.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
      art = buildPaperFigure(assets.print,assets.library);
      scene.add(art);
      addPaperLighting(scene);
      viewport.append(canvas);
      invalidate();
    } catch (error) {
      if (!disposed) {console.warn('Figure 3 is using its rendered views.',error);fallback();}
    }
  }
  return {ready:initialize(), getState:() => ({...state,pan:{...state.pan}}), dispose() {
    if (disposed) return;
    disposed = true;cancelAnimationFrame(raf);resize.disconnect();observer.disconnect();
    cleanups.forEach(fn => fn());releaseObjects(art,assets?.library);assets?.print.dispose();
    scene.traverse(object => object.shadow?.dispose());
    renderer?.dispose();canvas.remove();root.classList.remove('is-webgl');
  }};
}

const root = globalThis.document?.getElementById?.('paper-figure');
if (root) mountPaperFigure(root);

import * as THREE from './vendor/three/three.module.js';

const INITIAL = {yaw:-.33, pitch:.17};
const FOCUS = {agents:{u:.50,v:.46,zoom:1.06}, routes:{u:.60,v:.78,zoom:1.35}};
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const atlasUrl = new URL('./paper-figure/figure3.webp', import.meta.url);
const regionsUrl = new URL('./paper-figure/regions.png', import.meta.url);
const layoutUrl = new URL('./paper-figure/segments.json', import.meta.url);

export function paperPose(width, height, viewportWidth, viewportHeight, state) {
  const spatial = state.view === 'spatial';
  const scale = Math.min(viewportWidth / width, viewportHeight / height) * (spatial ? .94 : 1) * state.zoom;
  const focus = FOCUS[state.focus] || {u:.5, v:.5};
  const target = new THREE.Vector3((focus.u-.5)*width, (.5-focus.v)*height, 0);
  if (spatial) target.applyEuler(new THREE.Euler(state.pitch,state.yaw,0,'YXZ'));
  return {halfWidth:viewportWidth/(2*scale), halfHeight:viewportHeight/(2*scale),
    x:target.x + state.pan.x, y:target.y + state.pan.y, scale};
}

// Each face reads only the pixels assigned to it in the original figure.
const vertex = `
  varying vec2 paperUv;
  void main() {
    paperUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;
const maskShader = `
  uniform sampler2D regions;
  uniform float region;
  varying vec2 paperUv;
  float belongs(vec2 p) {
    if (any(lessThan(p, vec2(0.))) || any(greaterThan(p, vec2(1.)))) return 0.;
    return 1. - step(.5, abs(floor(texture2D(regions,p).r*255.+.5) - region));
  }`;
const faceShader = maskShader + `
  uniform sampler2D atlas;
  void main() {
    if (belongs(paperUv) < .5) discard;
    gl_FragColor = vec4(texture2D(atlas,paperUv).rgb,1.);
  }`;
const shadowShader = maskShader + `
  uniform vec2 texel;
  void main() {
    float alpha = 0.;
    for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++)
      alpha += belongs(paperUv + vec2(float(i),float(j))*texel);
    if(alpha==0.) discard;
    gl_FragColor=vec4(.12,.20,.28,alpha*.018);
  }`;

function quad(layout, bounds, z, pad=0) {
  const [bx,by,bw,bh]=bounds;
  const l=bx-pad, r=bx+bw+pad, t=by-pad, b=by+bh+pad;
  const geometry=new THREE.BufferGeometry();
  const points=[[l,t],[l,b],[r,b],[r,t]];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,y])=>[x-layout.width/2,layout.height/2-y,z]),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(points.flatMap(([x,y])=>[x/layout.width,1-y/layout.height]),2));
  geometry.setIndex([0,1,2,0,2,3]);
  return geometry;
}

function walls(layout,layer) {
  const vertices=[], indices=[];
  for(const {outer,holes} of layer.polygons) {
    for(const loop of [outer,...holes]) {
      for(let i=0;i<loop.length;i++) {
        const a=loop[i], b=loop[(i+1)%loop.length];
        if(a[0]===b[0] && a[1]===b[1]) continue;
        const first=vertices.length/3;
        for(const [p,z] of [[a,layer.z],[a,layer.z-layer.depth],[b,layer.z-layer.depth],[b,layer.z]]) {
          vertices.push(p[0]-layout.width/2,layout.height/2-p[1],z);
        }
        indices.push(first,first+2,first+1,first,first+3,first+2);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPaperFigure(layout,atlas,regions) {
  const group=new THREE.Group();
  group.rotation.order='YXZ';
  // The atlas is already in display RGB. The ID map contains integer data.
  atlas.colorSpace=regions.colorSpace=THREE.NoColorSpace;
  regions.minFilter=regions.magFilter=THREE.NearestFilter;
  regions.generateMipmaps=false;
  for(const texture of [atlas,regions]) texture.needsUpdate=true;
  const sheet=new THREE.Mesh(new THREE.BoxGeometry(layout.width,layout.height,6),
    new THREE.MeshStandardMaterial({color:0xfafbf9,roughness:.9}));
  sheet.position.z=-3.1;
  group.add(sheet);
  const panelWall=new THREE.MeshStandardMaterial({color:0x91a5b1,side:THREE.DoubleSide,roughness:.74});
  const detailWall=new THREE.MeshStandardMaterial({color:0x748896,side:THREE.DoubleSide,roughness:.7});
  const inkWall=new THREE.MeshStandardMaterial({color:0xc5cdd0,side:THREE.DoubleSide,roughness:.84});
  const byId=new Map(layout.layers.map(l=>[l.id,l]));
  for(const layer of layout.layers) {
    const uniforms={atlas:{value:atlas},regions:{value:regions},region:{value:layer.region}};
    const face=new THREE.Mesh(quad(layout,layer.bbox,layer.z),new THREE.ShaderMaterial({
      uniforms,vertexShader:vertex,fragmentShader:faceShader,toneMapped:false}));
    face.userData={part:'face',region:layer.region,id:layer.id};
    group.add(face);
    if(!layer.depth) continue;
    // Fine printed headings keep their relief without a second dark outline.
    const lettering=/-(title|label)$/.test(layer.id);
    const substrate=layer.id.includes('card')||layer.id.includes('panel') ? panelWall : detailWall;
    const wall=new THREE.Mesh(walls(layout,layer),lettering ? inkWall : substrate);
    wall.userData={part:'wall',region:layer.region,id:layer.id};
    group.add(wall);
    const receiver=byId.get(layer.parent)?.z ?? 0;
    const distance=layer.z-receiver;
    if(distance<=1 || lettering) continue;
    const blur=Math.min(4, distance*.12);
    const shadow=new THREE.Mesh(quad(layout,layer.bbox,receiver+.22,blur+1),new THREE.ShaderMaterial({
      uniforms:{...uniforms,texel:{value:new THREE.Vector2(blur/layout.width,blur/layout.height)}},
      vertexShader:vertex,fragmentShader:shadowShader,transparent:true,depthWrite:false,toneMapped:false}));
    shadow.position.set(distance*.12,-distance*.15,0);
    shadow.userData={part:'shadow',region:layer.region};
    group.add(shadow);
  }
  return group;
}

async function loadArtwork() {
  const loader=new THREE.TextureLoader();
  const textures=[];
  const load=url=>loader.loadAsync(url.href).then(texture=>{textures.push(texture);return texture;});
  const results=await Promise.allSettled([fetch(layoutUrl).then(response=>{
    if(!response.ok) throw new Error('Unable to load the paper figure layout');
    return response.json();
  }),load(atlasUrl),load(regionsUrl)]);
  const failure=results.find(result=>result.status==='rejected');
  if(failure){textures.forEach(texture=>texture.dispose());throw failure.reason;}
  return {layout:results[0].value,atlas:results[1].value,regions:results[2].value};
}

export function mountPaperFigure(root,{rendererFactory,loadAssets=loadArtwork}={}) {
  const viewport=root.querySelector('#paper-viewport');
  const canvas=document.createElement('canvas');
  canvas.setAttribute('aria-hidden','true');
  const state={view:'spatial',...INITIAL,zoom:1,pan:{x:0,y:0},focus:null,fallback:false};
  const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,8000);
  const buttons=[...root.querySelectorAll('button')], cleanup=[];
  let renderer,art,layout={width:1582,height:1632},assets,frame=0,disposed=false,drag=null;
  let visible=true;
  function on(el,event,fn,options){
    el.addEventListener(event,fn,options);cleanup.push(()=>el.removeEventListener(event,fn,options));
  }
  function applyControls(){
    for(const button of buttons){
      const {paperView,paperFocus,paperAction}=button.dataset;
      if(paperView) {
        button.setAttribute('aria-pressed',String(state.view===paperView));
        button.disabled=paperView==='spatial'&&state.fallback;
      }
      if(paperFocus) button.setAttribute('aria-pressed',String(state.focus===paperFocus));
      if(paperAction==='zoom-in') button.disabled=state.zoom>=8;
      if(paperAction==='zoom-out') button.disabled=state.zoom<=1;
    }
    viewport.dataset.zoomed=String(state.zoom>1);
  }
  function draw(){
    frame=0;
    if(disposed || !visible || document.hidden) return;
    const w=viewport.clientWidth,h=viewport.clientHeight;
    if(!w||!h) return;
    const pose=paperPose(layout.width,layout.height,w,h,state);
    viewport.style.setProperty('--paper-x',(-pose.x*pose.scale)+'px');
    viewport.style.setProperty('--paper-y',(pose.y*pose.scale)+'px');
    viewport.style.setProperty('--paper-scale',String(state.zoom));
    if(!art||!renderer||state.fallback) return;
    if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||
       renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())) renderer.setSize(w,h,false);
    const spatial=state.view==='spatial';
    art.rotation.set(spatial?state.pitch:0,spatial?state.yaw:0,0,'YXZ');
    for(const child of art.children) if(child.userData.part==='shadow') child.visible=spatial;
    Object.assign(camera,{left:-pose.halfWidth,right:pose.halfWidth,top:pose.halfHeight,bottom:-pose.halfHeight});
    camera.position.set(pose.x,pose.y,4000);camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    root.classList.add('is-webgl');
  }
  function invalidate(){
    if(!frame&&!disposed&&visible&&!document.hidden) frame=requestAnimationFrame(draw);
  }
  function reset(){
    Object.assign(state,{...INITIAL,zoom:1,focus:null,pan:{x:0,y:0},view:state.fallback?'front':'spatial'});
  }
  function zoom(factor) {
    state.zoom=clamp(state.zoom*factor,1,8);
    if(state.zoom===1){state.focus=null;state.pan={x:0,y:0};}
  }
  function pan(dx,dy){
    const pose=paperPose(layout.width,layout.height,viewport.clientWidth,viewport.clientHeight,state);
    if(!pose.scale) return;
    state.pan.x=clamp(state.pan.x-dx/pose.scale,-layout.width*.85,layout.width*.85);
    state.pan.y=clamp(state.pan.y+dy/pose.scale,-layout.height*.85,layout.height*.85);
  }
  function update(){applyControls();invalidate();}
  for(const button of buttons) on(button,'click',()=>{
    const {paperView,paperAction,paperFocus}=button.dataset;
    if(paperView) state.view=paperView;
    if(paperAction==='reset') reset();
    if(paperAction==='zoom-in') zoom(1.4);
    if(paperAction==='zoom-out') zoom(1/1.4);
    if(FOCUS[paperFocus]) {
      state.focus=paperFocus;state.zoom=FOCUS[paperFocus].zoom;
      state.pan={x:0,y:0};Object.assign(state,INITIAL);
    }
    update();
  });
  on(viewport,'pointerdown',e=>{
    if(e.button!==0||!e.isPrimary||drag) return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    viewport.dataset.dragging='true';
    viewport.setPointerCapture?.(drag.id);
  });
  on(viewport,'pointermove',e=>{
    if(!drag||drag.id!==e.pointerId) return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
    if(state.zoom>1) pan(dx,dy);
    else if(state.view==='spatial') {
      state.yaw=clamp(state.yaw+dx*.007,-.88,.88);
      state.pitch=clamp(state.pitch+dy*.006,-.55,.55);
    }
    invalidate();
  });
  const release=e=>{if(drag?.id===e.pointerId){drag=null;viewport.dataset.dragging='false';}};
  for(const event of ['pointerup','pointercancel','lostpointercapture']) on(viewport,event,release);
  on(viewport,'keydown',e=>{
    const directions={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]};
    if(directions[e.key]){
      const [dx,dy]=directions[e.key];
      if(state.zoom>1) pan(dx,dy);
      else if(state.view==='spatial'){
        state.yaw=clamp(state.yaw+dx*.004,-.88,.88);state.pitch=clamp(state.pitch+dy*.004,-.55,.55);
      }
    }else if(e.key==='+'||e.key==='=') zoom(1.4);
    else if(e.key==='-') zoom(1/1.4);
    else if(e.key==='Escape'||e.key==='Home') reset();
    else return;
    e.preventDefault();update();
  });
  function fallback(){
    state.fallback=true;state.view='front';root.classList.remove('is-webgl');canvas.hidden=true;update();
  }
  on(canvas,'webglcontextlost',e=>{e.preventDefault();fallback();});
  const resize=new ResizeObserver(invalidate);resize.observe(viewport);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible) invalidate();});
  observer.observe(viewport);
  on(document,'visibilitychange',invalidate);
  applyControls();
  async function init(){
    try {
      renderer=rendererFactory?rendererFactory(canvas):new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);
      assets=await loadAssets();
      if(disposed){assets.atlas.dispose();assets.regions.dispose();return;}
      layout=assets.layout;
      art=buildPaperFigure(layout,assets.atlas,assets.regions);scene.add(art);
      scene.add(new THREE.AmbientLight(0xffffff,1.2));
      const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-400,650,1000);scene.add(key);
      viewport.append(canvas);invalidate();
    }catch{if(!disposed) fallback();}
  }
  return {ready:init(),getState:()=>({...state,pan:{...state.pan}}),dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();
    cleanup.forEach(fn=>fn());const materials=new Set();
    art?.traverse(child=>{child.geometry?.dispose();if(child.material)materials.add(child.material);});
    materials.forEach(material=>material.dispose());
    if(art){assets.atlas.dispose();assets.regions.dispose();}
    renderer?.dispose();canvas.remove();root.classList.remove('is-webgl');
  }};
}

const root=globalThis.document?.getElementById?.('paper-figure');
if(root) mountPaperFigure(root);

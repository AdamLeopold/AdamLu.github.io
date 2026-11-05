import * as THREE from './vendor/three/three.module.js';
import {loadSculptureLibrary,makeFlowSculpture,disposeSculptures} from './framework-sculptures.js';
import {buildFrameworkObject,svgFrameworkObject,OBJECT_PROFILES} from './framework-objects.js?v=blender-flow-20261105-1';
import {computeFlowRoute,sampleFlowRoute} from './framework-routes.js?v=local-partitions-20261104-1';
import {toDepthPoint,toDepthDirection,computeDepthCameraPose} from './framework-depth.js?v=facing-nodes-20261104-1';
export {toDepthPoint,toDepthDirection} from './framework-depth.js?v=facing-nodes-20261104-1';
import * as topology from './framework-topology.js?v=vertical-side-20261104-1';
export {TOPOLOGY,STAGES,TEACHING_CYCLE,sampleTeachingCycle,sampleTeachingFlows} from './framework-topology.js?v=vertical-side-20261104-1';
const {TOPOLOGY,STAGES,NODE_BY_ID,activeEdges,resolveRunEvent,TEACHING_CYCLE,sampleTeachingCycle,sampleTeachingFlows}=topology;
export const STATIONS=TOPOLOGY.groups||[];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const tr=(value,lang)=>typeof value==='string'?value:value?.[lang]??value?.en??'';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PALETTES={
 dark:{query:0x70b7ff,data:0x4cd5b7,reference:0xbba1ef,agent:0x8ec6f5,code:0x83a9e3,solver:0x81b8d7,output:0xd8bb81,edge:0x4a6178,ink:0xdbeafa,faceInk:0x102b40,panel:0x122638},
 light:{query:0x246ac0,data:0x087e6b,reference:0x7855ab,agent:0x36759f,code:0x466f9f,solver:0x386b87,output:0x94722e,edge:0x9baec0,ink:0x25455e,faceInk:0xf1f7ff,panel:0xddebf5}
};
const BASE_IDS=new Set(['query','classification','workflow','model','codegen','solver','solution','references','csv','csvqa']);
const FLOW_IDS={query:topology.JOURNEY_EXAMPLE?.query?.id||'example-query',data:topology.JOURNEY_EXAMPLE?.data?.id||'example-data',reference:'lean-reference-library',artifact:'example-artifact'};
const labelForKind=(kind,lang)=>({query:{zh:'问题描述',en:'Query'},data:{zh:'CSV 数据',en:'CSV data'},reference:{zh:'参考示例',en:'Reference'},artifact:{zh:'求解产物',en:'Output'}}[kind]?.[lang]||'');
// Frame the two endpoints of the operation, including the tool or record it uses.
const SHOT_FOCUS=[null,['query','csv'],['classification','references'],['workflow','references'],['model','csvqa'],['codegen','solver'],['solver','solution']];
const SHOT_CONTEXT=[null,['query','classification','workflow','csv'],['query','classification','workflow','references'],['classification','workflow','model','references'],['workflow','model','codegen','csvqa'],['model','codegen','solver','solution'],['codegen','solver','solution']];
function chapterForNode(id, currentStage){
 return SHOT_FOCUS[currentStage]?.includes(id) ? currentStage : NODE_BY_ID.get(id)?.stage;
}
export const OBJECT_SCALE=.64;
export const flowStrokeWidth=active=>active?1.6:1.1;
export const flowWorldWidth=(pixelWidth,depth,viewportHeight,fov=42)=>pixelWidth*2*Math.max(.1,depth)*Math.tan(fov*Math.PI/360)/Math.max(1,viewportHeight);
export const scaledFootprint=(fp,scale=OBJECT_SCALE)=>Object.fromEntries(Object.entries(fp).map(([k,v])=>[k,['width','height','depth','minX','maxX','minY','maxY','minZ','maxZ'].includes(k)?v*scale:v]));
export function depthRoutingFootprint(fp){const minY=fp.minY??-fp.height/2,maxY=fp.maxY??fp.height/2,minX=fp.minX??-fp.width/2,maxX=fp.maxX??fp.width/2;return{width:maxY-minY,height:maxX-minX,minX:-maxY,maxX:-minY,minY:-maxX,maxY:-minX};}
class FlowCurve extends THREE.Curve{
 constructor(route){super();this.route=route;}
 getPoint(t,target=new THREE.Vector3()){return target.fromArray(sampleFlowRoute(this.route,t).point);}
 getTangent(t,target=new THREE.Vector3()){return target.fromArray(sampleFlowRoute(this.route,t).tangent).normalize();}
}

/** Keep the selected operation within a broad, connected semantic neighborhood. */
export function computeFraming({positions,footprints=new Map(),stage=0,selected=null,hero=false,runNode=null,aspect=1,zoom=1,pan={x:0,y:0},routePoints=[]}){
 const full=hero||(!selected&&!runNode&&stage===0);
 const chapter=selected?chapterForNode(selected,stage):stage;
 const requested=full?[...positions.keys()]:runNode?[runNode]:SHOT_FOCUS[chapter]||[selected];
 const focusIds=requested.filter(id=>positions.has(id)),context=[...new Set([...(full?[...positions.keys()]:SHOT_CONTEXT[chapter]||requested),...(runNode?[runNode]:[])])].filter(id=>positions.has(id)),ids=context.length?context:focusIds.length?focusIds:[...positions.keys()];
 let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
 for(const id of ids){const p=positions.get(id),fp=footprints.get(id)||{width:2.9,height:2.8};left=Math.min(left,p.x+(fp.minX??-fp.width/2));right=Math.max(right,p.x+(fp.maxX??fp.width/2));top=Math.max(top,p.y+(fp.maxY??fp.height/2));bottom=Math.min(bottom,p.y+(fp.minY??-fp.height/2));}
 if(full)for(const p of routePoints){left=Math.min(left,p[0]);right=Math.max(right,p[0]);top=Math.max(top,p[1]);bottom=Math.min(bottom,p[1]);}
 const ratio=Math.max(.2,Number(aspect)||1),padding=full?1.4:1.2;
 let span=Math.max(right-left+padding,(top-bottom+padding)/ratio,full?6:ratio<1?8:7)/(hero?1:clamp(zoom,.7,1.6));
 const center={x:(left+right)/2+(hero?0:pan.x||0),y:(top+bottom)/2+(hero?0:pan.y||0)};
 const worldBounds={left:center.x-span/2,right:center.x+span/2,top:center.y+span*ratio/2,bottom:center.y-span*ratio/2};
 const visibleNodeIds=[...positions].filter(([id,p])=>{const fp=footprints.get(id)||{width:2.9,height:2.8};return p.x+fp.width/2>worldBounds.left&&p.x-fp.width/2<worldBounds.right&&p.y+fp.height/2>worldBounds.bottom&&p.y-fp.height/2<worldBounds.top;}).map(([id])=>id);
 return{center,span,aspect:ratio,worldBounds,focusIds:focusIds.length?focusIds:ids,contextIds:ids,visibleNodeIds,mode:full?'overview':selected?'module':'step'};
}

export function computeCameraPose(options){return computeDepthCameraPose(options);}
const scrollCurveCache=new WeakMap();
export function sampleScrollCamera(poses,progress){
 if(!poses?.length)throw new TypeError('Scroll camera poses are required');
 const value=clamp(Number(progress)||0),scaled=value*Math.max(0,poses.length-1),segment=Math.min(Math.max(0,poses.length-2),Math.floor(scaled)),local=value===1?1:scaled-segment;
 let curves=scrollCurveCache.get(poses);if(!curves){curves=Object.fromEntries(['position','target'].map(key=>[key,poses.length===1?null:new THREE.CatmullRomCurve3(poses.map(p=>new THREE.Vector3(...p[key])),false,'centripetal')]));scrollCurveCache.set(poses,curves);}
 const position=curves.position?curves.position.getPoint(value).toArray():[...poses[0].position],target=curves.target?curves.target.getPoint(value).toArray():[...poses[0].target],base=poses[Math.min(poses.length-1,Math.round(scaled))],fov=base.fov||42,direction=position.map((v,i)=>v-target[i]),distance=Math.hypot(...direction);
 return{...base,position,target,span:2*distance*Math.tan(fov*Math.PI/360),yaw:Math.atan2(direction[0],direction[2]),pitch:Math.asin(clamp(direction[1]/Math.max(.001,distance),-1,1)),scrollProgress:value,segment,segmentProgress:local,mode:'scroll'};
}

export function sampleCameraFlight(from,to,progress,{reduced=false}={}){
 if(reduced)return{...to,position:[...to.position],target:[...to.target]};
 const t=clamp(progress),u=t*t*(3-2*t),wave=Math.sin(Math.PI*u),direction=pose=>pose.position.map((value,index)=>value-pose.target[index]);
 const a=direction(from),b=direction(to),radiusA=Math.hypot(...a),radiusB=Math.hypot(...b);
 const yaw=lerp(Math.atan2(a[0],a[2]),Math.atan2(b[0],b[2]),u),pitch=lerp(Math.asin(a[1]/Math.max(.001,radiusA)),Math.asin(b[1]/Math.max(.001,radiusB)),u);
 const radius=lerp(radiusA,radiusB,u)+Math.min(1,Math.abs(radiusB-radiusA)*.04+.22)*wave,target=from.target.map((value,index)=>lerp(value,to.target[index],u));
 const outward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],position=target.map((value,index)=>value+outward[index]*radius),fov=lerp(from.fov||42,to.fov||42,u);
 return{...to,position,target,span:2*radius*Math.tan(fov*Math.PI/360),fov,yaw,pitch};
}

// Fixed physical scale, calibrated at the centre of the desktop overview.
const PLATE_UNIT = 0.015;
const PLATE_MOUNT_RISE = 0.132;
export const PLATE_FONT = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
let measureContext;
const plateMetrics = new Map();
export function measureNameplateText(name, tools = '') {
  const key = JSON.stringify([name, tools]);
  if (plateMetrics.has(key)) return plateMetrics.get(key);
  if (measureContext === undefined) {
    try { measureContext = globalThis.document?.createElement('canvas')?.getContext('2d') || null; }
    catch { measureContext = null; }
  }
  function lineWidth(text, size, weight) {
    if (!text) return 0;
    if (measureContext?.measureText) {
      measureContext.font = `${weight} ${size}px ${PLATE_FONT}`;
      return Math.ceil(measureContext.measureText(text).width);
    }
    // Deterministic metrics for renderers without a 2D text measurement context.
    return Math.ceil(Array.from(text).reduce((sum, char) => sum + size * (char.codePointAt(0) > 255 ? 1 : 0.6), 0));
  }
  const result = {nameWidth:lineWidth(name,12,500),toolWidth:lineWidth(tools,10,400)};
  plateMetrics.set(key, result);
  return result;
}

const nodeQuaternion = value => value?.isQuaternion ? value : new THREE.Quaternion(...(Array.isArray(value)?value:[value?.x||0,value?.y||0,value?.z||0,value?.w??1]));
const nodeVector = value => Array.isArray(value) ? new THREE.Vector3(...value) : new THREE.Vector3(value?.x||0,value?.y||0,value?.z||0);
export function transformNodeDirection(direction, quaternion = [0,0,0,1]) {
  return nodeVector(direction).applyQuaternion(nodeQuaternion(quaternion)).toArray();
}
export function transformNodePoint(position, localPoint, quaternion = [0,0,0,1]) {
  return nodeVector(localPoint).applyQuaternion(nodeQuaternion(quaternion)).add(new THREE.Vector3(...toDepthPoint(position))).toArray();
}

export function computeNameplateGeometry(position, footprint, nameWidth, toolWidth = 0, hasTool = false, quaternion = [0,0,0,1]) {
  const right = footprint.maxX ?? footprint.width / 2;
  const midHeight = ((footprint.minY ?? -footprint.height / 2) + (footprint.maxY ?? footprint.height / 2)) / 2;
  const rear = footprint.minZ ?? -(footprint.depth ?? 0) / 2;
  const localAnchor = [right + 0.10, midHeight + PLATE_MOUNT_RISE, rear - 0.02];
  const width = (Math.max(1, nameWidth, hasTool ? toolWidth : 0) + 2) * PLATE_UNIT, height = (hasTool ? 28 : 15) * PLATE_UNIT;
  const corners = [[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>transformNodePoint(position,[localAnchor[0]+x,localAnchor[1]-y,localAnchor[2]],quaternion));
  return {
    anchor: corners[0], localAnchor, corners, quaternion: nodeQuaternion(quaternion).toArray(), width, height,
    nameSize: 12 * PLATE_UNIT, toolSize: 10 * PLATE_UNIT, lineStep: 14 * PLATE_UNIT,
    nameBaseline: 11 * PLATE_UNIT, toolBaseline: 25 * PLATE_UNIT,
  };
}

// The routing plane stores vertical progress as x and lateral position as y.
function facingRoutePoint(node, point, quaternion) {
  const center = toDepthPoint(node);
  const local = toDepthPoint(point).map((value, axis) => value - center[axis]);
  const [x, y, z] = transformNodePoint(node, local, quaternion);
  return [-y, -x, z];
}

// Rotate the short approach to either port along with its icon. The trunk and
// intermediate bends stay in the routing plane as the two cameras move.
export function attachFacingPorts(route, from, to, quaternion) {
  const reach = Math.min(0.65, route.length / 2);
  if (!reach) return route;
  const points = route.points.map((point, index) => {
    const distance = route.distances[index];
    const nearest = Math.min(distance, route.length - distance);
    if (nearest >= reach) return point;
    const node = distance <= route.length / 2 ? from : to;
    const rotated = facingRoutePoint(node, point, quaternion);
    const t = 1 - nearest / reach;
    const weight = t * t * (3 - 2 * t);
    return point.map((value, axis) => lerp(value, rotated[axis], weight));
  });
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const [dx, dy, dz] = points[i].map((value, axis) => value - previous[axis]);
    distances.push(distances[i - 1] + Math.hypot(dx, dy, dz));
  }
  return {...route, points, fromPort:points[0], toPort:points.at(-1), distances, length:distances.at(-1)};
}

/** Clamp horizontally before searching vertical slots using measured boxes. */
export function placeDOMLabels(items,bounds,gap=7,reserved=[]){
  const placed=reserved.map(p=>({...p})),result=new Map(),margin=6;
  for(const item of items){
    const width=item.width,height=item.height,minX=bounds.left+margin+width/2,maxX=bounds.right-margin-width/2;
    const minY=bounds.top+margin+height/2,maxY=bounds.bottom-margin-height/2;
    if(maxX<minX||maxY<minY)continue;
    const x=clamp(item.x,minX,maxX),preferred=clamp(item.y,minY,maxY);
    let choice=null;
    for(const candidateX of [...new Set([x,clamp(x-width-gap,minX,maxX),clamp(x+width+gap,minX,maxX),minX,maxX])]){
      const blockers=placed.filter(p=>Math.abs(p.x-candidateX)<(p.width+width)/2+gap);
      const ys=[preferred,minY,maxY,...blockers.flatMap(p=>[p.y-(p.height+height)/2-gap-1,p.y+(p.height+height)/2+gap+1])]
        .filter(y=>y>=minY&&y<=maxY).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
      const y=ys.find(value=>blockers.every(p=>Math.abs(value-p.y)>=(p.height+height)/2+gap));
      if(y!==undefined){choice={x:candidateX,y,width,height};break;}
    }
    if(choice){placed.push(choice);result.set(item.id,choice);}
  }
  return result;
}

/** The detail scene can also serve an optional overview viewport. */
export function createFramework({heroHost,detailHost,onStageChange=()=>{},onNodeSelect=()=>{},onFlowChange=()=>{},renderer:rendererMode='auto',loadSculptures=loadSculptureLibrary}={}){
 if(!detailHost)throw new Error('The detail framework host is required');
 const state={lang:'zh',theme:'dark',reduced:false,free:false,route:'tailored',stage:0,progress:0,scrollLinked:false,selected:null,hover:null,run:null,runEvent:null,zoom:1,localProgress:null,started:performance.now(),flowElapsed:0,flowPlaying:true,flowFrame:sampleTeachingCycle(0),liveMode:false,liveElapsed:0,visible:true,runId:null,visited:new Set(),lastDataAt:'csv'};
 let disposed=false,fallback=rendererMode==='svg',raf=0,last=0,quality=1.5,slowFrames=0,flowSignature='';
 const cleanup=[],meshes=new Map(),links=new Map(),hitTargets=[],nameplates=new Map();let nameplateRevision=0;
 const system=document.createElement('div');system.className='fw-system';system.setAttribute('aria-hidden','true');
 const canvas=document.createElement('canvas');canvas.className='fw-canvas';system.append(canvas);document.body.append(system);
 const labelLayer=document.createElement('div');labelLayer.className='fw-label-layer';document.body.append(labelLayer);
 const views=[...(heroHost?[{host:heroHost,hero:true}]:[]),{host:detailHost,hero:false}].map(v=>({...v,labels:new Map(),packets:new Map(),edgeLabels:new Map(),target:new THREE.Vector3(),pan:new THREE.Vector2(),camera:new THREE.PerspectiveCamera(42,1,.1,240),span:24,initialized:false,flight:null,flightPose:null}));
 for(const v of views){v.host.classList.add('fw-host');v.host.removeAttribute('aria-hidden');v.labelRoot=document.createElement('div');v.labelRoot.className=`fw-view-labels${v.hero?' fw-view-labels--hero':''}`;labelLayer.append(v.labelRoot);}
 let renderer,scene;
 const graph=new THREE.Group(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 if(!fallback)try{
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'default'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  scene=new THREE.Scene();scene.add(graph,new THREE.AmbientLight(0xf0ede8,1.25));
  const key=new THREE.DirectionalLight(0xfff3df,2.3);key.position.set(-6,10,16);scene.add(key);
  const rim=new THREE.DirectionalLight(0xa8c9ee,1.25);rim.position.set(9,-5,6);scene.add(rim);
 }catch{fallback=true;}
 const baseNodes=()=>TOPOLOGY.nodes.filter(n=>n.level===0&&BASE_IDS.has(n.id));
 const iconOf=n=>n.icon||({query:'query',classification:'classification',workflow:'workflow',model:'model',codegen:'code',solver:'solver',solution:'result',references:'references',csv:'csv',csvqa:'data-access'}[n.id]||'model');
 const nodeColor=n=>n.id==='query'?'query':['csv','csvqa'].includes(n.id)?'data':n.id==='references'?'reference':n.id==='solution'?'output':n.id==='codegen'?'code':n.id==='solver'?'solver':'agent';
 const edgeColor=e=>['reference'].includes(e.kind)||e.from==='references'||e.to==='references'?'reference':['data','runtime'].includes(e.kind)||['csv','csvqa'].includes(e.from)||['csv','csvqa'].includes(e.to)?'data':e.kind==='artifact'?'output':'query';
 const oldPositions={query:[-12,0,0],classification:[-8,0,0],workflow:[-4,0,0],model:[.6,0,0],codegen:[5,0,0],solver:[9.2,0,0],solution:[13.4,0,0],references:[-5.8,4.1,0],csv:[5,-4.1,0],csvqa:[.6,-3,0]};
 function positionOf(node,mobile){
  // New topology owns the XY layout. Old XZ layouts remain usable while modules reload.
  const modern=Boolean(node.icon),raw=modern?(mobile?node.mobile:node.position):oldPositions[node.id];
  if(raw)return new THREE.Vector3(Number(raw[0])||0,Number(raw[1])||0,Math.min(.3,Math.max(-.3,Number(raw[2])||0)));
  return new THREE.Vector3();
 }
 const textureCache=new Map(),moving=new Map(),signals=new Map();
 function texture(kind){
  if(textureCache.has(kind))return textureCache.get(kind);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;let ctx;try{ctx=canvas.getContext?.('2d');}catch{}if(!ctx)return null;
  const generic=kind.endsWith('-generic'),baseKind=kind.replace(/-generic$/,''),paper=kind.startsWith('paper'),bg=paper?'#fffaf0':'#10273b',ink=paper?'#36546a':'#d7efff',accent=kind.includes('data')?'#5cd4b2':kind.includes('ref')?'#c2a2f0':'#8bcbff';ctx.fillStyle=bg;ctx.fillRect(0,0,512,320);
  if(paper){ctx.fillStyle='#edf0e8';ctx.fillRect(0,0,512,40);ctx.fillStyle=ink;ctx.font='600 31px ui-monospace, monospace';ctx.fillText(kind.includes('result')?'MODEL · CODE · RESULT':kind.includes('classified')?(generic?'TYPE':'TYPE · TP'):kind.includes('workflow')?'WORKFLOW':kind.includes('model')?(generic?'MODEL / PLAN':'min Σ cᵢⱼ xᵢⱼ'):kind.includes('code')?'model.py':kind.includes('data')?'CSV · DATA':'QUERY',34,90);for(let i=0;i<5;i++){ctx.fillStyle=i===0?'#79a8c5':'#c0cbd0';ctx.fillRect(34,123+i*33,[390,335,366,254,300][i],8);}if(kind.includes('data')){ctx.strokeStyle='#4a9c88';ctx.lineWidth=3;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(36+i*88,115);ctx.lineTo(36+i*88,292);ctx.stroke();}for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(36,115+i*44);ctx.lineTo(390,115+i*44);ctx.stroke();}}}

  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;textureCache.set(kind,map);return map;
 }
 function bodyShape(points,material,depth=.18,z=0){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.035});const m=new THREE.Mesh(g,material);m.position.z=z;return m;}
 function bar(group,a,b,material,width=.045,z=.28){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);const m=new THREE.Mesh(new THREE.CylinderGeometry(width,width,len,8),material);m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,z);m.rotation.z=-Math.atan2(dx,dy);group.add(m);return m;}
 function polyline(group,points,material,width=.045,z=.28){for(let i=1;i<points.length;i++)bar(group,points[i-1],points[i],material,width,z);}
 function box(group,x,y,w,h,material,z=.12,depth=.18){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,depth),material);m.position.set(x,y,z);group.add(m);return m;}
 function slab(group,x,y,w,h,depth,material,z=.12,r=.1){
  r=Math.min(r,w/3,h/3);const shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.035}),material);mesh.position.set(x,y,z-depth/2);group.add(mesh);return mesh;
 }
 function sheet(group,x,y,w,h,kind,paper,z=.5,angle=-.06){
  const geometry=new THREE.PlaneGeometry(w,h,10,14),points=geometry.attributes.position;
  for(let i=0;i<points.count;i++){const px=points.getX(i)/w+.5,py=points.getY(i)/h+.5;points.setZ(i,.1*Math.pow(px,7)+.07*Math.pow(py,5));}geometry.computeVertexNormals();
  const map=texture(kind),material=new THREE.MeshStandardMaterial({map,color:map?0xffffff:0xfff8e8,roughness:.82,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.rotation.z=angle;mesh.userData.textureKind=kind;group.add(mesh);return mesh;
 }
 function createIcon(node){
  const item=buildFrameworkObject(node,{THREE,palette:PALETTES.dark,helpers:{slab,box,bar,polyline,sheet,bodyShape}});
  item.group.scale.multiplyScalar(OBJECT_SCALE);item.footprint=scaledFootprint(item.footprint);
  const hit=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.8,2.2),new THREE.MeshBasicMaterial({visible:false}));hit.userData.nodeId=node.id;item.group.add(hit);hitTargets.push(hit);
  item.frame=new THREE.Group();item.frame.userData.nodeId=node.id;item.frame.userData.nodeFrame=true;item.frame.add(item.group);graph.add(item.frame);meshes.set(node.id,item);
 }
 function updateNameplates(view){
  if(!scene||fallback)return;
  const palette=PALETTES[state.theme],pixels=256;
  for(const node of baseNodes()){
   const name=tr(node.title,state.lang),tools=inlineText(node),textSignature=[state.lang,state.theme,name,tools,nameplateRevision].join('|');
   const position=view.positions.get(node.id),footprint=meshes.get(node.id).footprint;
   const layoutSignature=[position.x,position.y,position.z,...['width','height','depth','minX','maxX','minY','maxY','minZ','maxZ'].map(key=>footprint[key])].join('|');
   let entry=nameplates.get(node.id);const textChanged=!entry||entry.textSignature!==textSignature;
   if(textChanged||entry.layoutSignature!==layoutSignature){
    const metrics=measureNameplateText(name,tools),geometry=computeNameplateGeometry(position,footprint,metrics.nameWidth,metrics.toolWidth,Boolean(tools));
    let map=entry?.map;
    if(textChanged){
     const image=document.createElement('canvas');image.width=Math.max(1,Math.ceil(geometry.width*pixels));image.height=Math.max(1,Math.ceil(geometry.height*pixels));
     let context;try{context=image.getContext?.('2d');}catch{}if(!context){fallback=true;requestFrame();return;}
     context.clearRect(0,0,image.width,image.height);context.textAlign='left';context.textBaseline='alphabetic';
     context.fillStyle='#'+palette.ink.toString(16).padStart(6,'0');context.font=`500 ${geometry.nameSize*pixels}px ${PLATE_FONT}`;context.fillText(name,0,geometry.nameBaseline*pixels);
     if(tools){context.fillStyle='#'+palette.reference.toString(16).padStart(6,'0');context.font=`400 ${geometry.toolSize*pixels}px ${PLATE_FONT}`;context.fillText(tools,0,geometry.toolBaseline*pixels);}
     map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
    }
    const underlineChanged=!entry||entry.nameWidth!==metrics.nameWidth||entry.geometry.nameBaseline!==geometry.nameBaseline;
    if(!entry){
     const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({map,transparent:true,depthTest:true,depthWrite:false,alphaTest:.04,side:THREE.DoubleSide,toneMapped:false});
     const mesh=new THREE.Mesh(new THREE.PlaneGeometry(geometry.width,geometry.height),material);mesh.userData.nodeId=node.id;mesh.userData.nameplate=true;group.add(mesh);hitTargets.push(mesh);
     const underline=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:palette[nodeColor(node)],transparent:true,depthTest:true,depthWrite:false}));underline.visible=false;group.add(underline);group.userData.nodeId=node.id;group.userData.nameplate=true;meshes.get(node.id).frame.add(group);
     entry={node,group,mesh,underline,map};nameplates.set(node.id,entry);
    }else{
     if(textChanged){entry.map.dispose();entry.map=map;entry.mesh.material.map=map;entry.mesh.material.needsUpdate=true;}
     if(entry.geometry.width!==geometry.width||entry.geometry.height!==geometry.height){entry.mesh.geometry.dispose();entry.mesh.geometry=new THREE.PlaneGeometry(geometry.width,geometry.height);}
    }
    entry.group.position.fromArray(geometry.localAnchor);entry.mesh.position.set(geometry.width/2,-geometry.height/2,0);
    if(underlineChanged){entry.underline.geometry.dispose();entry.underline.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-geometry.nameBaseline-.025,.003),new THREE.Vector3(metrics.nameWidth*geometry.nameSize/12,-geometry.nameBaseline-.025,.003)]);}
    entry.geometry=geometry;entry.nameWidth=metrics.nameWidth;entry.toolWidth=metrics.toolWidth;entry.textSignature=textSignature;entry.layoutSignature=layoutSignature;
   }
   entry.geometry=computeNameplateGeometry(position,footprint,entry.nameWidth,entry.toolWidth,Boolean(tools),view.camera.quaternion);entry.group.userData.nameplateGeometry=entry.geometry;
   entry.group.visible=true;entry.underline.material.color.setHex(palette[nodeColor(node)]);
   entry.underline.visible=node.id===state.selected||node.id===state.hover||views.some(current=>current.labels.get(node.id)===document.activeElement);
  }
 }
 function nameplateIntersects(view,geometry,matrix,visible){
  let polygon=geometry.corners.map(([x,y,z])=>new THREE.Vector4(x,y,z,1).applyMatrix4(matrix));
  const left=visible.left/view.rect.width*2-1,right=visible.right/view.rect.width*2-1,top=1-visible.top/view.rect.height*2,bottom=1-visible.bottom/view.rect.height*2;
  for(const distance of [point=>point.x-left*point.w,point=>right*point.w-point.x,point=>point.y-bottom*point.w,point=>top*point.w-point.y,point=>point.z+point.w,point=>point.w-point.z]){
   const clipped=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);if(da>=0)clipped.push(a);if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));}polygon=clipped;if(polygon.length<3)return false;
  }
  const projected=polygon.map(point=>[point.x/point.w,point.y/point.w]);
  const area=Math.abs(projected.reduce((sum,point,index)=>{const next=projected[(index+1)%projected.length];return sum+point[0]*next[1]-next[0]*point[1];},0))*view.rect.width*view.rect.height/8;
  return area>.01;
 }
 function createMoving(kind,streamId='primary'){
  const group=new THREE.Group(),color=PALETTES.dark[kind==='reference'?'reference':kind==='data'?'data':'query'],accent=new THREE.MeshStandardMaterial({color,roughness:.23,metalness:.45,emissive:color,emissiveIntensity:.3,transparent:true,opacity:streamId==='secondary'?.8:1});
  const geometry=kind==='data'?new THREE.BoxGeometry(.26,.26,.26):kind==='reference'?new THREE.OctahedronGeometry(.19):new THREE.IcosahedronGeometry(.19,1);
  group.add(new THREE.Mesh(geometry,accent));const ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.022,6,28),accent);ring.rotation.x=streamId==='secondary'?.7:.15;group.add(ring);graph.add(group);moving.set(`${streamId}:${kind}`,{group,accent,kind,streamId});
 }
 if(scene){
  for(const streamId of['primary','secondary'])for(const kind of['data','reference']){const material=new THREE.MeshBasicMaterial({color:PALETTES.dark[kind],transparent:true,opacity:.95}),group=new THREE.Group();group.add(bodyShape([[-.27,-.08],[.05,-.08],[.05,-.18],[.3,0],[.05,.18],[.05,.08],[-.27,.08]],material,.045,0));group.scale.setScalar(.7);graph.add(group);signals.set(`${streamId}:${kind}`,{group,material,kind,streamId});}
  for(const n of baseNodes())createIcon(n);for(const streamId of['primary','secondary'])for(const kind of['query','data','reference'])createMoving(kind,streamId);
  for(const edge of TOPOLOGY.edges){const material=new THREE.MeshBasicMaterial({color:PALETTES.dark.edge,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});const line=new THREE.Mesh(new THREE.BufferGeometry(),material);line.renderOrder=1;
   const arrows=Array.from({length:2},()=>{const arrow=new THREE.Mesh(new THREE.ConeGeometry(.065,.18,6),new THREE.MeshBasicMaterial({color:PALETTES.dark.edge,transparent:true,depthWrite:false}));arrow.renderOrder=2;graph.add(arrow);return arrow;});graph.add(line);links.set(edge.id,{edge,line,arrows,material,layouts:new Map()});}
 }
 function positionsFor(view){return new Map(baseNodes().map(n=>[n.id,positionOf(n,false)]));}
 const worldPoint=p=>new THREE.Vector3(...toDepthPoint(p));
 const worldDirection=p=>new THREE.Vector3(...toDepthDirection(p)).normalize();
 const routeCache=new Map();
 function curveFor(edge, positions, view) {
  const mobile = Math.abs(positions.get('query').y - positions.get('solution').y) > 1;
  const key = `${mobile ? 'm' : 'd'}|${edge.id}`;
  if (!routeCache.has(key)) {
    routeCache.set(key, new FlowCurve(computeFlowRoute(edge, positions, routingFootprintsFor(), {mobile, z:.32})));
  }
  const base = routeCache.get(key);
  if (!view) return base;
  const orientation = view.camera.quaternion;
  if (!view.routeOrientation?.equals(orientation)) {
    view.routeOrientation = orientation.clone();
    view.facingRoutes = new Map();
  }
  if (!view.facingRoutes.has(key)) {
    const route = attachFacingPorts(base.route, positions.get(edge.from), positions.get(edge.to), orientation);
    view.facingRoutes.set(key, new FlowCurve(route));
  }
  return view.facingRoutes.get(key);
 }
 const worldRouteCache = new WeakMap();
 function worldCurveFor(edge, positions, view) {
  const source = curveFor(edge, positions, view);
  if (!worldRouteCache.has(source)) {
    // The vertical coordinate transform is rigid, so lengths and fractions
    // match the canonical curve sampled by arrows and packets.
    worldRouteCache.set(source,new FlowCurve({...source.route,points:source.route.points.map(toDepthPoint)}));
  }
  return worldRouteCache.get(source);
 }
 function ribbonGeometry(curve,pixelWidth,dashWorld,viewDirection,camera,viewportHeight){
  const points=curve.route.points,vertices=[],indices=[];
  for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],depth=new THREE.Vector3(...points[i]).sub(camera.position).dot(viewDirection),width=flowWorldWidth(pixelWidth,depth,viewportHeight,camera.fov),normal=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).cross(viewDirection).normalize().multiplyScalar(width/2),p=new THREE.Vector3(...points[i]);vertices.push(...p.clone().add(normal).toArray(),...p.clone().sub(normal).toArray());if(i<points.length-1&&(!dashWorld||Math.floor((curve.route.distances[i]+curve.route.distances[i+1])/2/dashWorld)%2===0)){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
 }
 function arrowFractions(view,curve){
  const {points,distances,length}=curve.route,candidates=[];
  for(let i=1;i<points.length;i++){
   const size=distances[i]-distances[i-1];if(size<=1e-8)continue;
   const t=(distances[i-1]+size*.5)/length;if(!visiblePoint(view,curve.getPoint(t),.08))continue;
   const direction=points[i].map((value,axis)=>(value-points[i-1][axis])/size);
   const aligned=neighbor=>{if(neighbor<1||neighbor>=points.length)return false;const extent=distances[neighbor]-distances[neighbor-1];return extent>1e-8&&direction.reduce((sum,value,axis)=>sum+value*(points[neighbor][axis]-points[neighbor-1][axis])/extent,0)>.999;};
   candidates.push({t,straight:size>.055&&(aligned(i-1)||aligned(i+1))});
  }
  const preferred=candidates.filter(candidate=>candidate.straight),ts=(preferred.length?preferred:candidates).map(candidate=>candidate.t);if(!ts.length)return[];
  const first=ts[0],last=ts.at(-1),pixels=(last-first)*curve.route.length*view.rect.height/view.span;
  return pixels>100?[ts[Math.round((ts.length-1)*.3)],ts[Math.round((ts.length-1)*.78)]]:[ts[Math.floor((ts.length-1)*.72)]];
 }
 function labelNodes(view){return baseNodes().filter(n=>view.visibleNodeIds.has(n.id)&&visiblePoint(view,view.positions.get(n.id)));}
 function renderedRoutes(view){const focus=stageFocus(view),active=activeLinkIds(view);return routes().filter(e=>view.framing.mode==='overview'||e.kind==='flow'&&(view.visibleNodeIds.has(e.from)||view.visibleNodeIds.has(e.to))||focus.has(e.from)||focus.has(e.to)||active.has(e.id));}
 // A line description belongs beside the local connection. The overview reads
 // from the permanent node names and the moving query/data markers alone.
 function captionRoutes(view){
  if(view.framing.mode==='overview')return [];
  const focus=new Set(view.framing.focusIds);
  return routes().filter(edge=>focus.has(edge.from)&&focus.has(edge.to));
 }
 function nearLineCaption(box,item){
  return box && Math.abs(box.x-item.x)<=Math.max(25,item.width*.35) && Math.abs(box.y-item.y)<=25;
 }
 function edgeCaption(edge){const labels={query:['问题','Query'],classification:['问题类型','Type'],workflow:['建模工作流','Workflow'],model:['数学模型','Model'],codegen:['Python 程序','Python'],solver:['求解输出','Result']};return edge.kind==='flow'?labels[edge.from]?.[state.lang==='zh'?0:1]||'':tr(edge.label,state.lang);}
 function routes(){return activeEdges(state.route).filter(e=>BASE_IDS.has(e.from)&&BASE_IDS.has(e.to));}
 function stageFocus(view){return new Set(view.framing.focusIds);}
 function activeLinkIds(view){
  const ids=new Set(),include=path=>{for(let i=1;i<path.length;i++)for(const edge of routes())if(edge.from===path[i-1]&&edge.to===path[i])ids.add(edge.id);};
  for(const packet of packetsFor(view))if(state.liveMode||packet.active)for(const path of packet.paths)include(path);
  for(const request of explicitRequests(view))include(request.path);
  if(!state.liveMode)for(const frame of flowFrames())for(const id of frame.activeEdges||[])if(routes().some(e=>e.id===id&&e.kind==='artifact'))ids.add(id);
  return ids;
 }
 function cleanPaths(paths){
  const edges=routes();return paths.map(path=>path.filter(id=>BASE_IDS.has(id)&&NODE_BY_ID.has(id))).filter(path=>path.length&&path.every((id,i)=>!i||edges.some(e=>e.from===path[i-1]&&e.to===id)));
 }
 function livePacketsFor(){
  const run=state.run,node=run.nodeId,event=state.runEvent||{},payload=event.payload||{},stopped=['failed','cancelled','cancelling','queued'].includes(run.status),settled=stopped||run.status==='completed';
  const queryPaths={query:['query'],classification:['query','classification'],workflow:['classification','workflow'],csvqa:['workflow'],model:['workflow','model'],codegen:['model','codegen'],solver:['codegen','solver'],solution:['solver','solution'],references:['workflow']};
  const dataPaths={query:['csv'],classification:['csv'],workflow:['csv'],csvqa:['csvqa','csv','csvqa'],model:['csvqa','model'],codegen:['model'],solver:['csv','solver'],solution:['solver'],references:['csv']};
  if(node==='solution'&&!state.visited.has('solver')){queryPaths.solution=['solution'];dataPaths.solution=[state.lastDataAt||'csv'];}
  const entry=(kind,path)=>({kind,id:`live-${kind}`,label:labelForKind(kind,state.lang),paths:[settled?[path.at(-1)]:path],stationary:settled});
  const entries=[entry('query',queryPaths[node]||['query']),entry('data',dataPaths[node]||['csv'])];
  const tool=String(payload.name||'').toLowerCase(),phase=String(event.stage||'').toLowerCase();
  if(['fileqa','retriever'].includes(tool)||payload.examples?.length||node==='references'){
   const owner=String(payload.owner||payload.agent||event.owner||'').toLowerCase(),target=tool==='fileqa'||run.stage===2?'classification':phase.includes('code')||owner.includes('code')||run.stage===5?'codegen':'workflow',canRequest=routes().some(e=>e.from===target&&e.to==='references');
   if(node==='references'){entries[0]=entry('query',[target]);entries[1]=entry('data',[target==='codegen'?'model':'csv']);}
   entries.push(entry('reference',run.status==='running'&&canRequest?[target,'references',target]:['references',target]));
  }
  return entries.map(p=>({...p,paths:cleanPaths(p.paths)})).filter(p=>p.paths.length);
 }
 let teachingTime=null,teachingFrames=[];
 function flowFrames(){if(teachingTime!==state.flowElapsed){teachingTime=state.flowElapsed;teachingFrames=sampleTeachingFlows(teachingTime);}return teachingFrames;}
 function packetsFor(view){
  if(state.liveMode)return state.run?livePacketsFor():[];
  return flowFrames().flatMap(frame=>[['query',frame.query],['data',frame.data],['reference',frame.reference]].filter(([,track])=>track).map(([kind,track])=>({...track,kind,streamId:frame.streamId,taskIndex:frame.taskIndex,paths:cleanPaths([track.path||[track.at]]),trackProgress:track.localProgress,stationary:track.path?.length===1}))).filter(packet=>packet.paths.length);
 }
 function animationFraction(view,now){return state.liveMode?clamp(state.liveElapsed/2000):state.flowFrame.localProgress;}
 function explicitRequests(view){return state.liveMode?[]:flowFrames().flatMap(frame=>(frame.requests||[]).map(request=>({...request,streamId:frame.streamId,taskIndex:frame.taskIndex})));}
 function flowSnapshot(){
  const frame=state.flowFrame,packets=packetsFor(views[0]).map(p=>({kind:p.kind,id:p.id,streamId:p.streamId||'live',taskIndex:p.taskIndex||1,path:p.paths[0],paths:p.paths,at:p.at||(p.stationary?p.paths.at(-1)?.at(-1):null),role:p.role||null,localProgress:p.trackProgress??animationFraction(views[0]),requesting:state.liveMode?false:explicitRequests(views[0]).some(r=>r.kind===p.kind&&r.streamId===p.streamId)}));
  const streams=state.liveMode?[]:flowFrames().map(f=>({streamId:f.streamId,taskIndex:f.taskIndex,stepId:f.stepId,index:f.index,label:f.label,description:f.description,progress:f.localProgress}));
  const snapshot={streams,stepId:frame.stepId,index:frame.index,total:TEACHING_CYCLE.steps.length,label:frame.label,description:frame.description,payload:{query:frame.query,data:frame.data,reference:frame.reference},progress:frame.localProgress,cycleProgress:frame.progress,elapsedMs:state.flowElapsed,durationMs:TEACHING_CYCLE.durationMs,paused:!state.flowPlaying||state.reduced||state.liveMode||document.hidden||!state.visible,live:state.liveMode,waiting:state.liveMode&&!state.run,packets,requests:explicitRequests(views[0])};if(state.liveMode){snapshot.stepId=state.run?`live-${state.run.nodeId}`:'live-waiting';snapshot.label=state.run?NODE_BY_ID.get(state.run.nodeId)?.title:{zh:'等待 Demo 任务',en:'Waiting for a demo run'};snapshot.description=state.run?{zh:'显示当前任务的实际阶段事件。',en:'Showing actual stage events from the current task.'}:{zh:'在 Demo 中发送问题以开始运行。',en:'Send a question in the demo to begin.'};snapshot.payload={query:{id:'live-query',label:labelForKind('query',state.lang)},data:{id:'live-data',label:labelForKind('data',state.lang)}};}return snapshot;
 }
 function notifyFlow(force=false){const snapshot=flowSnapshot(),signature=[snapshot.stepId,snapshot.paused,snapshot.live,snapshot.waiting,state.run?.nodeId,state.run?.status,state.lang,snapshot.streams?.map(s=>s.stepId).join(',')].join('|');if(force||signature!==flowSignature){flowSignature=signature;onFlowChange(snapshot);}}
 function portAt(id,kind,positions,signal=false,view){
  const p=positions.get(id).clone(),bounds=portAt.bounds||(portAt.bounds=routingFootprintsFor()),box=bounds.get(id);
  const offset={x:signal?0:kind==='data'?-.1:kind==='reference'?.08:.1,y:!signal&&kind==='reference'?.08:0};
  for(const [axis,min,max]of [['x','minX','maxX'],['y','minY','maxY']]){
   const low=box?.[min]??-(box?.[axis==='x'?'width':'height']||1)/2,high=box?.[max]??(box?.[axis==='x'?'width':'height']||1)/2;
   const padding=Math.min(.02,(high-low)*.15);p[axis]+=clamp(offset[axis],low+padding,high-padding);
  }
  p.z=.32;return view ? p.fromArray(facingRoutePoint(positions.get(id), p, view.camera.quaternion)) : p;
 }
 function travelOf(packet,view,now){
  const phase=packet.stationary?1:packet.trackProgress??animationFraction(view,now),segments=[];
  for(const path of packet.paths){if(path.length===1)segments.push({path,from:path[0],to:path[0]});else for(let i=1;i<path.length;i++)segments.push({path,from:path[i-1],to:path[i]});}
  const t=phase*segments.length,index=Math.min(segments.length-1,Math.floor(t)),segment=segments[index],u=phase===1?1:t-index;if(!segment)return null;
  const edge=routes().find(e=>e.from===segment.from&&e.to===segment.to),from=portAt(segment.from,packet.kind,view.positions,packet.signal,view),to=portAt(segment.to,packet.kind,view.positions,packet.signal,view),base=edge?curveFor(edge,view.positions,view):null;
  const points=base?[from.toArray(),...base.route.points,to.toArray()]:[to.toArray(),to.toArray()],sample=sampleFlowRoute({points},u),moving=new THREE.Vector3(...sample.point),direction=new THREE.Vector3(...sample.tangent);
  const request=Boolean(state.liveMode&&!packet.signal&&edge?.kind==='request'&&['data','reference'].includes(packet.kind)),point=request?portAt(packet.kind==='data'?'csv':'references',packet.kind,view.positions,false,view):moving;
  return{point,semanticPoint:point.clone(),direction,request:request?moving:null,path:segment.path,phase};
 }
 function requestTravels(view,now){
  const entries=[];
  for(const request of explicitRequests(view)){const paths=cleanPaths([request.path]);if(!paths.length)continue;const travel=travelOf({...request,paths,signal:true,trackProgress:request.localProgress},view,now);if(travel)entries.push({...request,point:travel.point,direction:travel.direction});}
  if(state.liveMode)for(const packet of packetsFor(view)){const travel=travelOf(packet,view,now);if(travel?.request)entries.push({kind:packet.kind,path:travel.path,point:travel.request,direction:travel.direction,label:packet.kind==='data'?{zh:'读取请求',en:'Data request'}:{zh:'检索请求',en:'Retrieval request'}});}
  return entries;
 }
 function footprintsFor(){return new Map(baseNodes().map(node=>{const profile=OBJECT_PROFILES[node.id]||OBJECT_PROFILES[iconOf(node)]||{width:2.9,height:2.8};return[node.id,meshes.get(node.id)?.footprint||scaledFootprint({...profile,depth:profile.depth??1.4,minZ:profile.minZ??-.18,maxZ:profile.maxZ??1.22})];}));}
 function routingFootprintsFor(){return new Map([...footprintsFor()].map(([id,fp])=>[id,depthRoutingFootprint(fp)]));}
 function framingFor(view,overrides={}){return computeFraming({positions:view.positions||positionsFor(view),footprints:routingFootprintsFor(),stage:state.stage,selected:state.selected,hero:view.hero,runNode:state.liveMode?state.run?.nodeId:null,aspect:view.rect.width/view.rect.height,zoom:state.zoom,pan:view.pan,routePoints:routes().flatMap(e=>curveFor(e,view.positions).route.points),...overrides});}
 function nameplateFitPoints(view,ids,footprints){
  return ids.flatMap(id=>{
   const node=NODE_BY_ID.get(id),position=view.positions.get(id),footprint=footprints.get(id);if(!node||!position||!footprint)return [];
   const metrics=['zh','en'].map(lang=>measureNameplateText(tr(node.title,lang),inlineText(node,lang)));
   const geometry=computeNameplateGeometry(position,footprint,Math.max(...metrics.map(value=>value.nameWidth)),Math.max(...metrics.map(value=>value.toolWidth)),metrics.some(value=>value.toolWidth>0)),[x,y,z]=geometry.localAnchor;
   return [[x,y,z],[x+geometry.width,y,z],[x+geometry.width,y-geometry.height,z],[x,y-geometry.height,z]].map(point=>({position,point}));
  });
 }
 function cameraDestination(view,desired){
  const footprints=footprintsFor(),options=frame=>{const context=new Set(frame.contextIds);return{positions:view.positions,footprints,routePoints:routes().filter(edge=>frame.mode==='overview'||!['artifact','runtime'].includes(edge.kind)&&context.has(edge.from)&&context.has(edge.to)).flatMap(edge=>curveFor(edge,view.positions).route.points),nodeFitPoints:nameplateFitPoints(view,frame.contextIds,footprints),zoom:state.zoom,selected:state.selected,hero:view.hero,stage:state.stage};};
  if(!view.hero&&state.scrollLinked&&!state.selected&&!state.free&&!state.liveMode&&!state.reduced){
   const key=`${view.rect.width}|${view.rect.height}|${state.zoom}|${state.route}|${nameplateRevision}`;
   if(view.scrollPoseKey!==key){view.scrollPoseKey=key;view.scrollPoses=STAGES.map((_,stage)=>{const framing=framingFor(view,{stage,selected:null,runNode:null,pan:{x:0,y:0}});return computeCameraPose({...framing,...options(framing),stage,selected:null,hero:false});});}
   return sampleScrollCamera(view.scrollPoses,state.progress);
  }
  return computeCameraPose({...desired,...options(desired)});
 }
 function cameraFrame(view,desired){
  const span=view.span,center={...desired.center},aspect=desired.aspect;
  const worldBounds={left:center.x-span/2,right:center.x+span/2,top:center.y+span*aspect/2,bottom:center.y-span*aspect/2};
  const fps=footprintsFor();
  const projectedNodeBounds=Object.fromEntries([...fps].map(([id,fp])=>{
   const position=view.positions.get(id),corners=[];
   for(const x of[fp.minX??-fp.width/2,fp.maxX??fp.width/2])for(const y of[fp.minY??-fp.height/2,fp.maxY??fp.height/2])for(const z of[fp.minZ??0,fp.maxZ??fp.depth??.8]){
    corners.push(new THREE.Vector3(...transformNodePoint(position,[x,y,z],view.camera.quaternion)).applyMatrix4(view.camera.matrixWorldInverse));
   }
   // Clip the twelve box edges in camera space before projecting. Geometry
   // behind the eye must never appear as a mirrored icon in a local shot.
   const near=-view.camera.near,far=-view.camera.far;
   const points=corners.filter(point=>point.z<=near&&point.z>=far);
   for(let index=0;index<8;index++)for(const axis of[1,2,4]){
    if(index&axis)continue;
    const a=corners[index],b=corners[index|axis];
    for(const plane of[near,far])if((a.z-plane)*(b.z-plane)<0)points.push(a.clone().lerp(b,(plane-a.z)/(b.z-a.z)));
   }
   if(!points.length)return [id,{worldWidth:fp.width,worldHeight:fp.height,left:-1,right:-1,top:-1,bottom:-1,x:-1,y:-1,width:0,height:0}];
   for(const point of points)point.applyMatrix4(view.camera.projectionMatrix);
   const left=Math.min(...points.map(p=>(p.x+1)*view.rect.width/2)),right=Math.max(...points.map(p=>(p.x+1)*view.rect.width/2)),top=Math.min(...points.map(p=>(1-p.y)*view.rect.height/2)),bottom=Math.max(...points.map(p=>(1-p.y)*view.rect.height/2));
   return[id,{worldWidth:fp.width,worldHeight:fp.height,left,right,top,bottom,x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top}];
  }));
  const visible=baseNodes().filter(n=>{const b=projectedNodeBounds[n.id];return b.right>0&&b.left<view.rect.width&&b.bottom>0&&b.top<view.rect.height;}).map(n=>n.id);
  return{...desired,center,span,worldBounds,visibleNodeIds:visible,objectScale:OBJECT_SCALE,nodeFootprints:Object.fromEntries(fps),projectedNodeBounds,camera:{position:view.camera.position.toArray(),target:view.target.toArray(),fov:view.camera.fov,mode:!view.hero&&state.scrollLinked&&!state.selected&&!state.free&&!state.liveMode&&!state.reduced?'scroll':'manual',scrollProgress:state.progress,flightProgress:view.flight?clamp(view.flight.elapsed/view.flight.duration):1}};
 }
 function fit(view,dt){
  view.positions=positionsFor(view);const desired=framingFor(view),destination=cameraDestination(view,desired);
  const signature=JSON.stringify([destination.position,destination.target,destination.span,desired.aspect]);
  if(!view.initialized||state.reduced||destination.mode==='scroll'){view.flightPose=destination;view.flight=null;view.flightSignature=signature;}
  else if(state.free){const previous=view.flightPose||destination,ease=1-Math.exp(-24*dt);view.flight=null;view.flightSignature=signature;view.flightPose={...destination,position:previous.position.map((v,i)=>lerp(v,destination.position[i],ease)),target:previous.target.map((v,i)=>lerp(v,destination.target[i],ease)),span:lerp(previous.span,destination.span,ease)};}
  else if(signature!==view.flightSignature){view.flight={from:view.flightPose||destination,to:destination,elapsed:0,duration:.36};view.flightSignature=signature;}
  if(view.flight){view.flight.elapsed+=dt;const progress=clamp(view.flight.elapsed/view.flight.duration);view.flightPose=sampleCameraFlight(view.flight.from,view.flight.to,progress);if(progress===1)view.flight=null;}
  const rig=view.flightPose;view.target.fromArray(rig.target);view.span=rig.span;
  const camera=view.camera;camera.aspect=desired.aspect;camera.fov=rig.fov;camera.position.fromArray(rig.position);camera.lookAt(...rig.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  view.framing=cameraFrame(view,desired);view.focusIds=new Set(desired.focusIds);view.visibleNodeIds=new Set(view.framing.visibleNodeIds);view.initialized=true;
 }
 function visiblePoint(view,point,margin=0){
  if(view.initialized){const q=worldPoint(point).project(view.camera),m=margin/Math.max(1,view.span)*2;return q.z>=-1&&q.z<=1&&q.x>=-1+m&&q.x<=1-m&&q.y>=-1+m&&q.y<=1-m;}
  const b=view.framing?.worldBounds;return !b||point.x>=b.left+margin&&point.x<=b.right-margin&&point.y>=b.bottom+margin&&point.y<=b.top-margin;
 }
 function guideProgress(node,view,now){
  if(state.liveMode)return state.run?.nodeId===node.id&&state.run.status==='running'?Math.max(.12,animationFraction(view,now)):null;
  for(const frame of flowFrames())if(frame.transformations?.some(item=>item.node===node.id))return frame.localProgress;return null;
 }
 function updateTextureMode(group,generic){
  group.traverse(object=>{const kind=object.userData.textureKind;if(!kind)return;const key=kind+(generic?'-generic':'');if(object.userData.textureMode===key)return;const map=texture(key);if(map){object.material.map=map;object.material.needsUpdate=true;}object.userData.textureMode=key;});
 }
 function pose(view,dt,now){
  fit(view,dt);const focus=stageFocus(view),active=activeLinkIds(view),palette=PALETTES[state.theme],mobile=view.rect.width<760;
  for(const item of meshes.values()){
   const {node,frame,group,material,faceInk,ink,selection,progress,ledMaterial,shell,parts}=item;frame.visible=true;frame.position.copy(worldPoint(view.positions.get(node.id)));frame.quaternion.copy(view.camera.quaternion);group.visible=view.visibleNodeIds.has(node.id);group.position.set(0,0,0);const contextOpacity=view.framing.mode==='overview'||focus.has(node.id)?1:.52;group.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(!m||m.visible===false)continue;if(!m.transparent){m.transparent=true;m.needsUpdate=true;}m.userData.baseOpacity??=m.opacity;m.opacity=m.userData.baseOpacity*contextOpacity;}});const keyboardFocused=views.some(current=>current.labels.get(node.id)===document.activeElement),selected=node.id===state.selected,run=node.id===state.run?.nodeId,guide=guideProgress(node,view,now),processing=guide!==null;
   const color=run&&state.run.status==='failed'?0xd56c7d:palette[nodeColor(node)];material.color.setHex(color);material.emissive.setHex(color);material.emissiveIntensity=processing?.18:.025;material.opacity=contextOpacity;shell.color.setHex(state.theme==='dark'?0x7da2bf:0xe9f2fa);faceInk.color.setHex(0x25455e);ink.color.setHex(palette.ink);
   selection.material.color.setHex(palette[nodeColor(node)]);selection.material.opacity=selected||keyboardFocused?1:!view.hero&&focus.has(node.id)?.7:0;
   progress.material.color.setHex(palette[nodeColor(node)]);progress.material.opacity=processing?.95:0;progress.scale.x=Math.max(.04,guide??0);progress.position.x=-(1-progress.scale.x)*.59;
   ledMaterial.color.setHex(run&&state.run.status==='failed'?0xe38c99:processing?0x78e2c3:palette[nodeColor(node)]);ledMaterial.opacity=processing?.95:.4;
   if(parts.drawer)parts.drawer.position.z=.08+(processing?Math.sin((guide??0)*Math.PI)*.12:0);updateTextureMode(group,state.liveMode);
  }
  updateNameplates(view);
  const drawn=new Set(renderedRoutes(view).map(e=>e.id));
  for(const entry of links.values()){
   const edge=entry.edge,show=drawn.has(edge.id);entry.line.visible=show;entry.arrows.forEach(a=>a.visible=false);if(!show)continue;
   const curve=worldCurveFor(edge,view.positions,view),isActive=active.has(edge.id),color=palette[edgeColor(edge)],width=flowStrokeWidth(isActive),direction=view.camera.getWorldDirection(new THREE.Vector3()),key=`${mobile?'m':'d'}|${width}|${view.rect.height}|${view.camera.fov}|${view.camera.position.toArray().map(v=>v.toFixed(5)).join(',')}|${direction.toArray().map(v=>v.toFixed(5)).join(',')}`;
   const slot=`${view.hero?'hero':'detail'}|${mobile?'m':'d'}`;let layout=entry.layouts.get(slot);if(!layout||layout.key!==key){layout?.geometry.dispose();layout={key,geometry:ribbonGeometry(curve,width,edge.kind==='request'?view.span/view.rect.height*9:0,direction,view.camera,view.rect.height)};entry.layouts.set(slot,layout);}if(!entry.line.geometry.attributes.position)entry.line.geometry.dispose();entry.line.geometry=layout.geometry;
   entry.material.color.setHex(color);entry.material.opacity=isActive?1:edge.kind==='flow'?.92:.78;
   arrowFractions(view,curveFor(edge,view.positions,view)).forEach((t,i)=>{const arrow=entry.arrows[i];arrow.visible=true;arrow.position.copy(worldPoint(curveFor(edge,view.positions,view).getPoint(t)));arrow.material.color.setHex(color);arrow.material.opacity=isActive?1:.9;arrow.scale.setScalar(view.span/view.rect.height*3.5/.065);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),worldDirection(curveFor(edge,view.positions,view).getTangent(t)));});
  }
  const packets=packetsFor(view);for(const item of moving.values()){
   const packet=packets.find(p=>p.kind===item.kind&&(state.liveMode?item.streamId==='primary':p.streamId===item.streamId));item.group.visible=Boolean(packet);if(!packet)continue;
   const travel=travelOf(packet,view,now);if(!travel)continue;item.group.visible=visiblePoint(view,travel.point);item.group.position.copy(worldPoint(travel.point));item.group.scale.setScalar(view.hero?.82:1);item.group.rotation.set(.15,.2,(state.liveMode?state.liveElapsed:state.flowElapsed)/6000);item.accent.color.setHex(palette[item.kind==='reference'?'reference':item.kind==='data'?'data':'query']);
  }
  for(const item of signals.values()){const request=requestTravels(view,now).find(r=>r.kind===item.kind&&(state.liveMode?item.streamId==='primary':r.streamId===item.streamId));item.group.visible=Boolean(request)&&visiblePoint(view,request.point);if(request){item.group.position.copy(worldPoint(request.point));item.group.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),worldDirection(request.direction));item.material.color.setHex(palette[item.kind]);}}
  graph.updateMatrixWorld(true);layoutLabels(view,focus);layoutPackets(view,now);
 }
 function labelFor(view,node){
  let label=view.labels.get(node.id);if(label)return label;label=document.createElement('button');label.type='button';label.className=`fw-label fw-label--${node.kind}`;label.dataset.node=node.id;label.tabIndex=view.hero?-1:0;
  label.style.cssText='position:absolute;left:0;top:0;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;pointer-events:none;border:0;';
  label.dataset.nameplateControl='true';label.addEventListener('focus',requestFrame);label.addEventListener('blur',requestFrame);label.addEventListener('click',()=>selectNode(node.id));view.labelRoot.append(label);view.labels.set(node.id,label);return label;
 }
 function project(view,p){const q=worldPoint(p).project(view.camera);return{x:view.rect.left+(q.x+1)*view.rect.width/2,y:view.rect.top+(1-q.y)*view.rect.height/2,z:q.z};}
 function inlineText(node,lang=state.lang){const tools=node.inlineTools||[];return tools.map(v=>typeof v==='string'?v:tr(v.title||v.label||v,lang)).filter(Boolean).join(' · ');}
 function layoutLabels(view,focus){
  const live=new Set(),rect=view.rect;
  const visible={left:Math.max(0,-rect.left),right:Math.min(rect.width,innerWidth-rect.left),top:Math.max(0,-rect.top),bottom:Math.min(rect.height,innerHeight-rect.top)};
  const projection=new THREE.Matrix4().multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse);
  view.labelRoot.style.clipPath=`inset(${Math.max(0,rect.top)}px ${Math.max(0,innerWidth-rect.right)}px ${Math.max(0,innerHeight-rect.bottom)}px ${Math.max(0,rect.left)}px)`;
  view.iconBoxes=labelNodes(view).map(n=>{const b=view.framing.projectedNodeBounds[n.id];return{x:rect.left+b.x,y:rect.top+b.y,width:b.width,height:b.height};}).filter(b=>Object.values(b).every(Number.isFinite));
  for(const node of baseNodes()){
   const label=labelFor(view,node),name=tr(node.title,state.lang),tools=inlineText(node);
   const content=[name,tools].filter(Boolean).join(' — '),description=tr(node.description,state.lang),aria=[name,tools,description].filter(Boolean).join(' — '),pressed=String(node.id===state.selected);
   if(label.textContent!==content)label.textContent=content;if(label.title!==description)label.title=description;if(label.getAttribute('aria-label')!==aria)label.setAttribute('aria-label',aria);if(label.getAttribute('aria-pressed')!==pressed)label.setAttribute('aria-pressed',pressed);
   const bounds=view.framing.projectedNodeBounds[node.id],modelVisible=bounds.width>0&&bounds.height>0&&bounds.right>visible.left&&bounds.left<visible.right&&bounds.bottom>visible.top&&bounds.top<visible.bottom;
   const geometry=nameplates.get(node.id)?.geometry,shown=modelVisible||Boolean(geometry&&nameplateIntersects(view,geometry,projection,visible));
   if(label.hidden===shown)label.hidden=!shown;live.add(node.id);
  }
  for(const[id,label]of view.labels)if(!live.has(id))label.hidden=true;
  view.captionBoxes=[];
  const edgeItems=[];for(const edge of captionRoutes(view)){const curve=curveFor(edge,view.positions,view),ts=arrowFractions(view,curve);if(!ts.length)continue;const p=curve.getPoint(ts.reduce((a,b)=>a+b,0)/ts.length);if(!visiblePoint(view,p,.15))continue;let label=view.edgeLabels.get(edge.id);if(!label){label=document.createElement('div');label.className='fw-edge-label';view.labelRoot.append(label);view.edgeLabels.set(edge.id,label);}label.textContent=edgeCaption(edge);label.dataset.kind=edgeColor(edge);const screen=project(view,p);edgeItems.push({id:edge.id,label,x:screen.x,y:screen.y-16,width:Math.min(150,[...label.textContent].reduce((a,c)=>a+(/[\u3400-\u9fff]/.test(c)?10:5.5),12)),height:24});}
  const edgeBoxes=placeDOMLabels(edgeItems,rect,4,[...view.iconBoxes,...view.captionBoxes]);
  const visibleEdges=new Set();for(const item of edgeItems){const b=edgeBoxes.get(item.id);item.label.hidden=!nearLineCaption(b,item);if(!item.label.hidden){visibleEdges.add(item.id);view.captionBoxes.push(b);item.label.style.transform=`translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) translate(-50%,-50%)`;}}for(const[id,label]of view.edgeLabels)if(!visibleEdges.has(id))label.hidden=true;
 }
 function chipText(packet){return state.liveMode?labelForKind(packet.kind,state.lang):({query:'Q',data:'D',reference:'R',artifact:'↗'}[packet.kind]||'')+(packet.taskIndex||1);}
 function layoutPackets(view,now){
  const live=new Set(),candidates=[];for(const packet of packetsFor(view)){
   const travel=travelOf(packet,view,now);if(!travel||!visiblePoint(view,travel.point,.05))continue;const key=packet.id;let element=view.packets.get(key);
   if(!element){element=document.createElement('div');element.className=`fw-packet fw-packet--${packet.kind}`;element.setAttribute('aria-hidden','true');view.labelRoot.append(element);view.packets.set(key,element);}
   const point=project(view,travel.point),content=`<i>${packet.kind==='data'?'▦':packet.kind==='reference'?'▥':'▤'}</i><b>${escapeHTML(chipText(packet))}</b>`;if(element.innerHTML!==content)element.innerHTML=content;
   element.dataset.stream=packet.streamId||'live';element.dataset.streamId=packet.streamId||'live';element.dataset.taskIndex=String(packet.taskIndex||1);element.dataset.packet=packet.kind;element.dataset.journeyId=packet.id;element.dataset.path=travel.path.join(',');element.dataset.paths=JSON.stringify(packet.paths);element.dataset.sourceX=point.x.toFixed(3);element.dataset.sourceY=point.y.toFixed(3);element.dataset.requesting=String(Boolean(travel.request)||!state.liveMode&&explicitRequests(view).some(r=>r.kind===packet.kind&&r.streamId===packet.streamId));element.title=tr(packet.label,state.lang);element.hidden=false;
   candidates.push({id:key,element,x:point.x+22,y:point.y-29,width:state.run?92:52,height:28});live.add(key);

  }
  for(const [i,requestTrack]of requestTravels(view,now).entries()){if(!visiblePoint(view,requestTrack.point,.05))continue;const key=`request-${requestTrack.kind}-${i}`;let element=view.packets.get(key);if(!element){element=document.createElement('div');element.className=`fw-request fw-request--${requestTrack.kind}`;element.setAttribute('aria-hidden','true');view.labelRoot.append(element);view.packets.set(key,element);}const p=project(view,requestTrack.point);element.dataset.stream=requestTrack.streamId||'live';element.dataset.streamId=requestTrack.streamId||'live';element.dataset.taskIndex=String(requestTrack.taskIndex||1);element.dataset.sourceX=p.x.toFixed(3);element.dataset.sourceY=p.y.toFixed(3);element.textContent=state.lang==='zh'?(requestTrack.role==='runtime-read'?'完整 CSV':requestTrack.kind==='data'?'读取数据':'检索示例'):(requestTrack.role==='runtime-read'?'Complete CSVs':requestTrack.kind==='data'?'Read data':'Retrieve');element.hidden=false;candidates.push({id:key,element,x:p.x,y:p.y-16,width:state.lang==='en'?96:70,height:24});live.add(key);}
  const placed=placeDOMLabels(candidates,view.rect,5,[...(view.captionBoxes||[]),...(view.iconBoxes||[])]);
  for(const p of candidates){const box=placed.get(p.id);p.element.hidden=!box;if(box)p.element.style.transform=`translate(${box.x.toFixed(1)}px,${box.y.toFixed(1)}px) translate(-50%,-50%)`;}
  for(const[key,element]of view.packets)if(!live.has(key))element.hidden=true;
 }
 function rectFor(host){const r=host.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:Math.max(1,r.width),height:Math.max(1,r.height)};}
 function requestFrame(){if(!disposed&&!raf&&!document.hidden)raf=requestAnimationFrame(draw);}
 function isAnimating(){return !state.reduced&&(state.liveMode?state.run?.status==='running':state.flowPlaying);}
 function draw(now){
  raf=0;if(disposed||document.hidden)return;
  for(const view of views){view.rect=rectFor(view.host);view.visible=view.rect.bottom>0&&view.rect.top<innerHeight&&view.rect.right>0&&view.rect.left<innerWidth&&view.rect.height>20;}
  const visible=views.some(v=>v.visible),dt=last&&state.visible&&visible?Math.min(.1,Math.max(0,(now-last)/1000)):0;last=now;state.visible=visible;
  if(visible&&!state.reduced){if(state.liveMode){if(state.run?.status==='running')state.liveElapsed+=dt*1000;}else if(state.flowPlaying)state.flowElapsed+=dt*1000;}
  state.flowFrame=flowFrames()[0];notifyFlow();labelLayer.dataset.theme=state.theme;system.dataset.theme=state.theme;
  if(fallback){system.hidden=true;for(const view of views)renderFallback(view,now);if(visible&&isAnimating())requestFrame();return;}
  if(renderer.domElement.width!==Math.round(innerWidth*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(innerHeight*renderer.getPixelRatio()))renderer.setSize(innerWidth,innerHeight,false);
  renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);let settling=false;
  for(const view of views){view.labelRoot.hidden=!view.visible;if(!view.visible)continue;const previous=view.span,target=view.target.clone();pose(view,dt||.016,now);settling||=Boolean(view.flight)||Math.abs(previous-view.span)>.0005||target.distanceTo(view.target)>.0005;const r=view.rect,top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(left,innerHeight-bottom,right-left,bottom-top);renderer.render(scene,view.camera);}
  renderer.setScissorTest(false);if(dt>.034&&visible)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);if(slowFrames>80&&quality>1){quality=1;renderer.setPixelRatio(1);slowFrames=0;}if(visible&&(isAnimating()||settling))requestFrame();
 }
 function pick(view,event){if(fallback||!view.rect||event.target.closest?.('.fw-label'))return null;pose(view,0,performance.now());const r=view.rect;pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,view.camera);return raycaster.intersectObjects(hitTargets.filter(hit=>hit.userData.nameplate?hit.visible&&hit.parent?.visible!==false:view.visibleNodeIds.has(hit.userData.nodeId)),false)[0]?.object.userData.nodeId||null;}
 for(const view of views){let drag=null;
  const down=e=>{if(view.hero||!state.free)return;drag={x:e.clientX,y:e.clientY,moved:0};view.host.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);view.pan.y=clamp(view.pan.y+dx/view.rect.height*view.span,-5,5);view.pan.x=clamp(view.pan.x-dy/view.rect.height*view.span,-5,5);drag.x=e.clientX;drag.y=e.clientY;requestFrame();return;}const hit=pick(view,e);if(hit!==state.hover){state.hover=hit;view.host.classList.toggle('fw-host--hover',Boolean(hit));requestFrame();}};
  const up=e=>{const moved=drag?.moved||0;drag=null;if(moved>5)return;const id=pick(view,e);if(id)selectNode(id);};const leave=()=>{drag=null;state.hover=null;view.host.classList.remove('fw-host--hover');requestFrame();};
  for(const[name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointerleave',leave],['pointercancel',leave]]){view.host.addEventListener(name,fn);cleanup.push(()=>view.host.removeEventListener(name,fn));}
 }
 function svgIcon(icon){return svgFrameworkObject(icon,{liveMode:state.liveMode});}
 function renderFallback(view,now=performance.now()){
  view.labelRoot.hidden=true;view.rect=rectFor(view.host);view.visible=view.rect.bottom>0&&view.rect.top<innerHeight&&view.rect.right>0&&view.rect.left<innerWidth;
  let holder=view.fallback;if(!holder){holder=document.createElement('div');holder.className='fw-fallback';view.host.append(holder);view.fallback=holder;holder.addEventListener('click',e=>{const id=e.target.closest('[data-node]')?.dataset.node;if(id)selectNode(id);});holder.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const id=e.target.closest('[data-node]')?.dataset.node;if(id){e.preventDefault();selectNode(id);}}});}
  const phase=animationFraction(view,now),signature=JSON.stringify([view.host.clientWidth,view.host.clientHeight,state.lang,state.theme,state.route,view.hero?0:state.stage,state.flowFrame.stepId,state.liveMode,state.selected,state.run?.nodeId,state.run?.status,view.hero?1:state.zoom,state.flowPlaying,view.pan.x,view.pan.y,state.scrollLinked?state.progress:null,Math.round(phase*90),...flowFrames().map(f=>[f.stepId,Math.round(f.localProgress*90)])]);
  if(view.fallbackSignature===signature)return;view.fallbackSignature=signature;view.positions=positionsFor(view);
  const mobile=view.host.clientWidth<760,width=Math.max(260,view.rect.width),height=Math.max(320,view.rect.height),positions=view.positions;
  const desired=framingFor(view),rig=cameraDestination(view,desired);
  view.target.fromArray(rig.target);view.span=rig.span;view.camera.aspect=desired.aspect;view.camera.fov=rig.fov;view.camera.position.fromArray(rig.position);view.camera.lookAt(...rig.target);view.camera.updateProjectionMatrix();view.camera.updateMatrixWorld();view.initialized=true;
  view.framing=cameraFrame(view,desired);view.focusIds=new Set(desired.focusIds);view.visibleNodeIds=new Set(view.framing.visibleNodeIds);
  const map=p=>{const q=worldPoint(p).project(view.camera);return{x:(q.x+1)*width/2,y:(1-q.y)*height/2,z:q.z};};const point=id=>map(positions.get(id));
  const viewWidth=width,viewHeight=height,panX=0,panY=0;
  const focus=stageFocus(view),active=activeLinkIds(view),suffix=view.hero?'h':'d';
  const svgBounds={left:0,top:0,right:width,bottom:height};
  const visibleNodes=baseNodes().filter(n=>view.visibleNodeIds.has(n.id));
  const edgeMarkup=renderedRoutes(view).map(edge=>{const curve=curveFor(edge,positions,view),kind=edgeColor(edge),selected=active.has(edge.id),points=curve.route.points.map(p=>map(new THREE.Vector3(...p))).filter(p=>p.z>=-1&&p.z<=1&&Number.isFinite(p.x)&&Number.isFinite(p.y)),path=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
   const arrows=arrowFractions(view,curve).map(t=>{const position=curve.getPoint(t),p=map(position),d=curve.getTangent(t),next=map(position.clone().addScaledVector(d,.001)),angle=Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI;return `<path class="fw-route-arrow" data-arrow-edge="${escapeHTML(edge.id)}" data-arrow-t="${t.toFixed(4)}" data-kind="${kind}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${angle.toFixed(2)})" d="M-4-3L4 0L-4 3Z"/>`;}).join('');
   return `<path class="fw-fallback-edge${selected?' fw-fallback-edge--active':''}" data-edge="${escapeHTML(edge.id)}" data-kind="${kind}" data-lane="${escapeHTML(curve.route.lane)}" data-route-points="${escapeHTML(JSON.stringify(points.map(p=>[Number(p.x.toFixed(3)),Number(p.y.toFixed(3))])))}"${edge.kind==='request'?' stroke-dasharray="7 5"':''} stroke-width="${flowStrokeWidth(selected)}" vector-effect="non-scaling-stroke" d="${path}"/>${arrows}`;
  }).join('');
  const labels=new Map(),platePixels=100,footprints=footprintsFor(),billboardQuaternion=view.camera.quaternion.toArray();
  const projectWorld=point=>{const q=new THREE.Vector3(...point).project(view.camera);return{x:(q.x+1)*width/2,y:(1-q.y)*height/2,z:q.z};};
  const clipPolygon=(polygon,distance)=>{
   const clipped=[];for(let index=0;index<polygon.length;index++){const a=polygon[index],b=polygon[(index+1)%polygon.length],da=distance(a),db=distance(b);if(da>=0)clipped.push(a);if((da>=0)!==(db>=0))clipped.push(a.map((value,axis)=>value+(b[axis]-value)*da/(da-db)));}return clipped;
  };
  for(const node of baseNodes()){
   const name=tr(node.title,state.lang),tools=inlineText(node),metrics=measureNameplateText(name,tools),geometry=computeNameplateGeometry(positions.get(node.id),footprints.get(node.id),metrics.nameWidth,metrics.toolWidth,Boolean(tools),billboardQuaternion),anchor=geometry.anchor;
   const worldCorners=geometry.corners;
   let clipped=worldCorners.map(p=>new THREE.Vector3(...p).applyMatrix4(view.camera.matrixWorldInverse).toArray());
   clipped=clipPolygon(clipped,p=>-view.camera.near-p[2]);clipped=clipPolygon(clipped,p=>p[2]+view.camera.far);if(clipped.length<3)continue;
   const projected=clipped.map(p=>{const q=new THREE.Vector3(...p).applyMatrix4(view.camera.projectionMatrix);return[(q.x+1)*width/2,(1-q.y)*height/2];});
   let visible=projected;for(const distance of[p=>p[0],p=>width-p[0],p=>p[1],p=>height-p[1]])visible=clipPolygon(visible,distance);
   const visibleArea=Math.abs(visible.reduce((area,p,index)=>{const next=visible[(index+1)%visible.length];return area+p[0]*next[1]-next[0]*p[1];},0))/2;if(visible.length<3||visibleArea<.01)continue;
   const rightDirection=transformNodeDirection([1,0,0],billboardQuaternion),downDirection=transformNodeDirection([0,-1,0],billboardQuaternion);
   const origin=projectWorld(anchor),right=projectWorld(anchor.map((value,axis)=>value+rightDirection[axis])),down=projectWorld(anchor.map((value,axis)=>value+downDirection[axis])),matrix=[(right.x-origin.x)/platePixels,(right.y-origin.y)/platePixels,(down.x-origin.x)/platePixels,(down.y-origin.y)/platePixels,origin.x,origin.y];
   if(!matrix.every(Number.isFinite))continue;
   const corners=[[0,0],[geometry.width,0],[geometry.width,geometry.height],[0,geometry.height]].map(([x,y])=>[origin.x+x*(right.x-origin.x)+y*(down.x-origin.x),origin.y+x*(right.y-origin.y)+y*(down.y-origin.y)]);
   const x=Math.min(...corners.map(p=>p[0])),y=Math.min(...corners.map(p=>p[1])),plateWidth=Math.max(...corners.map(p=>p[0]))-x,plateHeight=Math.max(...corners.map(p=>p[1]))-y;
   const depthClipped=clipped.length!==4||worldCorners.some(p=>{const q=new THREE.Vector3(...p).applyMatrix4(view.camera.matrixWorldInverse);return q.z>-view.camera.near||q.z<-view.camera.far;});
   labels.set(node.id,{name,tools,metrics,geometry,matrix,origin,worldCorners,projected,x,y,width:plateWidth,height:plateHeight,depthClipped});
  }
  // One interactive node owns both its icon and fixed world-space nameplate.
  // Painter order approximates the same far-to-near depth occlusion as WebGL.
  const nodeEntries=baseNodes().filter(node=>view.visibleNodeIds.has(node.id)||labels.has(node.id)).map(node=>({node,depth:worldPoint(positions.get(node.id)).applyMatrix4(view.camera.matrixWorldInverse).z})).sort((a,b)=>a.depth-b.depth);
  const nodes=nodeEntries.map(({node,depth})=>{
   const portAttrs=['query','data','reference'].map(kind=>{const port=map(portAt(node.id,kind,positions,false,view));return `data-${kind}-port-x="${port.x.toFixed(3)}" data-${kind}-port-y="${port.y.toFixed(3)}"`;}).join(' ');
   const p=point(node.id),canonical=positions.get(node.id),world=worldPoint(canonical),bounds=view.framing.projectedNodeBounds[node.id],label=labels.get(node.id),selected=node.id===state.selected,working=node.id===state.run?.nodeId,kind=nodeColor(node),iconScale=Math.min(bounds.width/82,bounds.height/88);
   const guideValue=guideProgress(node,view,now),guide=guideValue!==null;
   const clipId=`fw-nameplate-clip-${suffix}-${node.id}`,caption=label?`${label.depthClipped?`<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><polygon points="${label.projected.map(p=>p.map(v=>v.toFixed(4)).join(',')).join(' ')}"/></clipPath></defs>`:''}<g class="fw-fallback-caption fw-nameplate" data-label-node="${node.id}" data-label-x="${label.x.toFixed(3)}" data-label-y="${label.y.toFixed(3)}" data-label-width="${label.width.toFixed(3)}" data-label-height="${label.height.toFixed(3)}" data-label-anchor-x="${label.origin.x.toFixed(3)}" data-label-anchor-y="${label.origin.y.toFixed(3)}" data-nameplate-anchor="${escapeHTML(JSON.stringify(label.geometry.anchor))}" data-nameplate-world-corners="${escapeHTML(JSON.stringify(label.worldCorners))}" data-nameplate-matrix="${escapeHTML(JSON.stringify(label.matrix))}" data-nameplate-node="${node.id}" data-nameplate-local-anchor="${escapeHTML(JSON.stringify(label.geometry.localAnchor))}" data-nameplate-quaternion="${escapeHTML(JSON.stringify(label.geometry.quaternion))}" data-nameplate-corners="${escapeHTML(JSON.stringify(label.worldCorners))}" data-nameplate-projected-corners="${escapeHTML(JSON.stringify(label.projected))}" data-nameplate-width="${label.geometry.width}" data-nameplate-height="${label.geometry.height}" data-nameplate-name-size="${label.geometry.nameSize}" data-nameplate-tool-size="${label.geometry.toolSize}" data-nameplate-line-step="${label.geometry.lineStep}" data-nameplate-name-baseline="${label.geometry.nameBaseline}" data-nameplate-tool-baseline="${label.geometry.toolBaseline}" data-nameplate-pixels="${platePixels}"${label.depthClipped?` clip-path="url(#${clipId})"`:''}><g transform="matrix(${label.matrix.map(v=>v.toFixed(8)).join(' ')})"><rect class="fw-nameplate-hit" width="${label.geometry.width*platePixels}" height="${label.geometry.height*platePixels}"/><text class="fw-fallback-name" x="0" y="${label.geometry.nameBaseline*platePixels}" text-anchor="start" textLength="${label.metrics.nameWidth*label.geometry.nameSize/12*platePixels}" lengthAdjust="spacingAndGlyphs" style="font-size:${label.geometry.nameSize*platePixels}px;font-family:${escapeHTML(PLATE_FONT)};font-weight:500">${escapeHTML(label.name)}</text>${label.tools?`<text class="fw-fallback-tool" x="0" y="${label.geometry.toolBaseline*platePixels}" text-anchor="start" textLength="${label.metrics.toolWidth*label.geometry.toolSize/10*platePixels}" lengthAdjust="spacingAndGlyphs" style="font-size:${label.geometry.toolSize*platePixels}px;font-family:${escapeHTML(PLATE_FONT)};font-weight:400">${escapeHTML(label.tools)}</text>`:''}</g></g>`:'';
   const icon=view.visibleNodeIds.has(node.id)?`<g transform="translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) scale(${iconScale})">${svgIcon(iconOf(node))}<path class="fw-fallback-selection" d="M-22 36H${guide?-22+44*Math.max(.08,guideValue):22}"/></g>`:'';
   return `<g class="fw-fallback-node${selected?' fw-fallback-node--selected':''}${working?' fw-fallback-node--run':''}${guide?' fw-fallback-node--guide':''}" data-node="${node.id}" data-node-quaternion="${escapeHTML(JSON.stringify(billboardQuaternion))}" ${portAttrs} data-x="${p.x.toFixed(3)}" data-y="${p.y.toFixed(3)}" data-canonical-x="${canonical.x}" data-canonical-y="${canonical.y}" data-canonical-z="${canonical.z}" data-world-x="${world.x}" data-world-y="${world.y}" data-world-z="${world.z}" data-icon="${iconOf(node)}" data-icon-visible="${Boolean(icon)}" data-nameplate-visible="${Boolean(label)}" data-camera-depth="${depth}" data-object-width="${bounds.width.toFixed(3)}" data-object-height="${bounds.height.toFixed(3)}" data-station-owner="${STATIONS.find(station=>station.nodes.includes(node.id))?.id||node.id}" data-kind="${kind}" data-focused="${view.hero||focus.has(node.id)}" data-context="${desired.mode!=='overview'&&!focus.has(node.id)}" data-run-status="${working?state.run.status:''}" role="button" tabindex="${view.hero?-1:0}" aria-pressed="${selected}" aria-label="${escapeHTML(tr(node.title,state.lang))}"><title>${escapeHTML(tr(node.description,state.lang))}</title>${icon}${caption}</g>`;
  }).join('');
  const edgeTextItems=captionRoutes(view).map(edge=>{const curve=curveFor(edge,positions,view),ts=arrowFractions(view,curve),t=ts.length?ts.reduce((a,b)=>a+b,0)/ts.length:.5,p=curve.getPoint(t);if(!visiblePoint(view,p,.15))return null;const pos=map(p),label=edgeCaption(edge);return{id:edge.id,edge,label,x:pos.x,y:pos.y-16,width:Math.min(150,[...label].reduce((a,c)=>a+(/[\u3400-\u9fff]/.test(c)?10:5.5),12)),height:24};}).filter(Boolean);
  const edgeTextBoxes=placeDOMLabels(edgeTextItems,svgBounds,4,[...labels.values()].map(p=>({x:p.x+p.width/2,y:p.y+p.height/2,width:p.width,height:p.height})).concat(visibleNodes.map(n=>({...point(n.id),width:view.framing.projectedNodeBounds[n.id].width,height:view.framing.projectedNodeBounds[n.id].height}))));
  const edgeTextMarkup=edgeTextItems.map(item=>{const b=edgeTextBoxes.get(item.id);if(!nearLineCaption(b,item)){edgeTextBoxes.delete(item.id);return '';}return `<g class="fw-route-caption" data-route-caption="${escapeHTML(item.id)}" data-kind="${edgeColor(item.edge)}" transform="translate(${(b.x-b.width/2).toFixed(2)} ${(b.y-b.height/2).toFixed(2)})"><text x="${b.width/2}" y="16" text-anchor="middle">${escapeHTML(item.label)}</text></g>`;}).join('');
  const packetItems=[],packetReserved=[...labels.values()].map(p=>({x:p.x+p.width/2,y:p.y+p.height/2,width:p.width,height:p.height})).concat([...edgeTextBoxes.values()]);
  for(const n of visibleNodes){const p=point(n.id);const b=view.framing.projectedNodeBounds[n.id];packetReserved.push({...p,width:b.width,height:b.height});}
  for(const packet of packetsFor(view)){const travel=travelOf(packet,view,now);if(!travel||!visiblePoint(view,travel.point,.05))continue;const p=map(travel.point);packetItems.push({id:packet.id,packet,travel,source:p,x:p.x+22,y:p.y-29,width:state.run?92:52,height:28});}
  for(const [i,request]of requestTravels(view,now).entries()){if(!visiblePoint(view,request.point,.05))continue;const p=map(request.point);packetItems.push({id:`request-${request.kind}-${i}`,packet:request,request:true,source:p,x:p.x,y:p.y-17,width:state.lang==='en'?112:76,height:25});}
  const packetBoxes=placeDOMLabels(packetItems,svgBounds,5,packetReserved);
  const packetMarkup=packetItems.map(item=>{
   const color=PALETTES[state.theme][item.packet.kind]||PALETTES[state.theme].output;
   const dot='<circle cx="'+item.source.x.toFixed(2)+'" cy="'+item.source.y.toFixed(2)+'" r="2.6" fill="#'+color.toString(16).padStart(6,'0')+'"/>';
   const box=packetBoxes.get(item.id);if(!box)return dot;const packet=item.packet,x=box.x-box.width/2,y=box.y-box.height/2;
   if(item.request){const label=state.lang==='zh'?(packet.kind==='data'?'读取请求':'检索请求'):(packet.kind==='data'?'Data request':'Retrieval request');return dot+`<g class="fw-fallback-request" data-request="${packet.kind}" data-stream="${packet.streamId||'live'}" data-stream-id="${packet.streamId||'live'}" data-task-index="${packet.taskIndex||1}" data-source-x="${item.source.x.toFixed(3)}" data-source-y="${item.source.y.toFixed(3)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><rect width="${box.width}" height="${box.height}" rx="12"/><text text-anchor="middle" x="${box.width/2}" y="16">${escapeHTML(label)}</text></g>`;}
   return dot+`<g class="fw-fallback-packet" data-packet="${packet.kind}" data-stream="${packet.streamId||'live'}" data-stream-id="${packet.streamId||'live'}" data-task-index="${packet.taskIndex||1}" data-journey-id="${escapeHTML(packet.id)}" data-source-x="${item.source.x.toFixed(3)}" data-source-y="${item.source.y.toFixed(3)}" data-requesting="${Boolean(item.travel.request)||!state.liveMode&&explicitRequests(view).some(r=>r.kind===packet.kind&&r.streamId===packet.streamId)}" data-path="${escapeHTML(item.travel.path.join(','))}" data-paths="${escapeHTML(JSON.stringify(packet.paths))}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><title>${escapeHTML(tr(packet.label,state.lang))}</title><rect width="${box.width}" height="${box.height}" rx="5"/><path class="fw-packet-glyph" d="${packet.kind==='data'?'M8 9L14 5L20 9V18L14 22L8 18ZM8 9L14 13L20 9M14 13V22':'M14 5L22 13L14 22L6 13ZM9 13H19'}"/><text x="27" y="19" class="fw-packet-text">${escapeHTML(chipText(packet))}</text></g>`;
  }).join('');
  const markers=['query','data','reference','output'].map(kind=>`<marker id="fw-arrow-${kind}-${suffix}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1L6 4L1 7" fill="none" stroke="var(--fw-${kind})" stroke-width="1.4"/></marker>`).join('');
  const focusedNode=holder.contains?.(document.activeElement)?document.activeElement?.closest?.('[data-node]')?.dataset.node:null;
  holder.dataset.theme=state.theme;holder.dataset.flowStep=state.liveMode?(state.run?`live-${state.run.nodeId}`:'live-waiting'):state.flowFrame.stepId;holder.dataset.live=String(state.liveMode);holder.innerHTML=`<svg viewBox="${(width-viewWidth)/2+panX} ${(height-viewHeight)/2+panY} ${viewWidth} ${viewHeight}" role="group" aria-label="${state.lang==='zh'?'LEAN 优化建模流程与数据流':'LEAN optimization workflow and data flow'}"><defs>${markers}</defs>${edgeMarkup}${nodes}${edgeTextMarkup}${packetMarkup}</svg>`;
  if(focusedNode)holder.querySelector?.(`[data-node="${focusedNode}"]`)?.focus({preventScroll:true});
 }
 const lost=event=>{event.preventDefault();if(disposed)return;fallback=true;system.hidden=true;views.forEach(v=>{v.fallbackSignature=null;renderFallback(v);});requestFrame();};canvas.addEventListener('webglcontextlost',lost);cleanup.push(()=>canvas.removeEventListener('webglcontextlost',lost));
 const resizeObserver=new ResizeObserver(requestFrame);views.forEach(v=>resizeObserver.observe(v.host));const intersection=new IntersectionObserver(requestFrame,{rootMargin:'100px'});views.forEach(v=>intersection.observe(v.host));
 const fontsChanged=()=>{if(disposed)return;nameplateRevision++;plateMetrics.clear();views.forEach(view=>{view.fallbackSignature=null;});requestFrame();};if(document.fonts){document.fonts.ready?.then(fontsChanged);document.fonts.addEventListener?.('loadingdone',fontsChanged);cleanup.push(()=>document.fonts.removeEventListener?.('loadingdone',fontsChanged));}
 const scroll=()=>requestFrame(),visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else requestFrame();};addEventListener('scroll',scroll,{passive:true});addEventListener('resize',requestFrame);document.addEventListener('visibilitychange',visibility);cleanup.push(()=>removeEventListener('scroll',scroll),()=>removeEventListener('resize',requestFrame),()=>document.removeEventListener('visibilitychange',visibility));
 function changeStage(index,notify=false){index=Math.round(clamp(Number(index)||0,0,STAGES.length-1));const changed=index!==state.stage;state.scrollLinked=false;state.stage=index;state.progress=index/Math.max(1,STAGES.length-1);state.selected=null;if(changed){views.forEach(v=>v.pan.set(0,0));}if(changed&&notify)onStageChange(index);requestFrame();}
 function selectNode(id){const node=NODE_BY_ID.get(id);if(!node||!BASE_IDS.has(id)||node.level!==0)return;changeStage(chapterForNode(id,state.stage));state.selected=id;state.zoom=1;onStageChange(state.stage);onNodeSelect(id,node);requestFrame();}
 const api={
  setProgress(progress){if(state.selected||state.free||state.liveMode||state.reduced)return;const value=clamp(Number(progress)||0),index=Math.round(value*(STAGES.length-1));state.scrollLinked=true;state.progress=value;if(index!==state.stage){state.stage=index;onStageChange(index);}requestFrame();},
  setStage(index){changeStage(index);},selectNode,
  back(){if(state.selected){state.selected=null;onNodeSelect(null,null);requestFrame();}else changeStage(0,true);},
  setRoute(route){if(!['tailored','agnostic'].includes(route))return;state.route=route;requestFrame();},
  setRunState(event){if(!event){state.run=null;state.runEvent=null;state.liveElapsed=0;state.visited.clear();state.runId=null;state.lastDataAt='csv';notifyFlow();requestFrame();return;}const runId=event.run_id||event.runId,newRunId=Boolean(runId&&runId!==state.runId);if(newRunId||event.stage==='run'&&['started','queued'].includes(event.type)){state.visited.clear();state.lastDataAt='csv';if(runId)state.runId=runId;}const mapped=resolveRunEvent(event,state.run||{route:state.route});if(!mapped)return;const changed=newRunId||mapped.stage!==state.stage||mapped.nodeId!==state.run?.nodeId||mapped.route&&mapped.route!==state.route;if(mapped.route)state.route=mapped.route;if(mapped.nodeId!==state.run?.nodeId||mapped.status==='running'&&state.run?.status!=='running')state.liveElapsed=0;state.run=mapped;state.runEvent=event;state.liveMode=true;state.visited.add(mapped.nodeId);if(['csvqa','model','codegen','solver'].includes(mapped.nodeId))state.lastDataAt=mapped.nodeId==='codegen'?'model':mapped.nodeId;if(event.payload?.result?.execution)state.visited.add('solver');if(changed){state.stage=clamp(mapped.stage,0,STAGES.length-1);state.progress=state.stage/Math.max(1,STAGES.length-1);state.selected=null;onStageChange(state.stage,{route:state.route,runState:mapped});}notifyFlow();requestFrame();},
  setFlowPlaying(value){value=Boolean(value);if(value===state.flowPlaying)return;state.flowPlaying=value;last=0;notifyFlow(true);requestFrame();},
  getFlowState(){return flowSnapshot();},
  getCameraState(name='detail'){const view=views.find(view=>view.hero===(name==='hero'));if(!view)return null;view.rect=rectFor(view.host);view.positions=positionsFor(view);const frame=view.framing||framingFor(view);return JSON.parse(JSON.stringify(frame));},
  restartFlow(){state.flowElapsed=0;state.flowFrame=sampleTeachingCycle(0);state.flowPlaying=true;last=0;notifyFlow(true);requestFrame();},
  seekFlow(progress){state.flowElapsed=clamp(Number(progress)||0)*Math.max(0,TEACHING_CYCLE.durationMs-.001);state.flowFrame=sampleTeachingCycle(state.flowElapsed);last=0;notifyFlow(true);requestFrame();},
  setLiveMode(value){value=Boolean(value);if(value===state.liveMode)return;state.liveMode=value;if(state.liveMode)state.scrollLinked=false;if(!state.liveMode){state.run=null;state.runEvent=null;state.liveElapsed=0;state.visited.clear();state.runId=null;state.lastDataAt='csv';}last=0;notifyFlow(true);requestFrame();},
  setLanguage(lang){state.lang=lang==='en'?'en':'zh';notifyFlow(true);requestFrame();},setTheme(theme){state.theme=theme==='light'?'light':'dark';requestFrame();},
  setReduced(value){value=Boolean(value);if(value===state.reduced)return;state.reduced=value;last=0;views.forEach(v=>v.initialized=false);notifyFlow(true);requestFrame();},
  setFree(value){state.free=Boolean(value);if(state.free)state.scrollLinked=false;detailHost.classList.toggle('fw-host--free',state.free);requestFrame();},
  zoomBy(factor){factor=Number(factor);if(Number.isFinite(factor)&&factor>0){state.zoom=clamp(state.zoom*factor,.7,1.6);requestFrame();}return state.zoom;},
  resetCamera(){state.zoom=1;state.scrollLinked=false;state.free=false;state.selected=null;state.stage=0;state.progress=0;onNodeSelect(null,null);onStageChange(0);for(const v of views){v.pan.set(0,0);v.initialized=false;}detailHost.classList.remove('fw-host--free');requestFrame();},
  dispose(){disposed=true;cancelAnimationFrame(raf);resizeObserver.disconnect();intersection.disconnect();cleanup.forEach(fn=>fn());for(const entry of links.values())for(const layout of entry.layouts.values())layout.geometry.dispose();scene?.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});for(const map of textureCache.values())map.dispose();for(const entry of nameplates.values())entry.map.dispose();nameplates.clear();renderer?.dispose();system.remove();labelLayer.remove();views.forEach(v=>{v.fallback?.remove();v.host.classList.remove('fw-host','fw-host--hover','fw-host--free');});}
 };
 api.ready=(async()=>{
  if(fallback||!loadSculptures)return;
  let library;const prepared=[];
  try{
   library=await loadSculptures();if(disposed)return;
   for(const item of meshes.values())prepared.push({item,model:makeFlowSculpture(item.node.id,library,item.footprint)});
   for(const {item,model} of prepared){
    const keep=new Set([item.selection,item.progress,item.parts.led]);
    for(const child of item.group.children)if(!keep.has(child)&&!child.userData.nodeId)child.visible=false;
    item.group.updateMatrix();
    const mount=new THREE.Group();mount.matrix.copy(item.group.matrix).invert();mount.matrixAutoUpdate=false;mount.add(model);item.group.add(mount);
    item.sculpture=model;
   }
   requestFrame();
  }catch(error){for(const {model} of prepared)disposeSculptures(model);if(!disposed)console.warn('Architecture sculptures could not load.',error);}
  finally{disposeSculptures(library);}
 })();
 requestFrame();return api;
}

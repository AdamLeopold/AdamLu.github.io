import * as THREE from './vendor/three/three.module.js';
import {PAPER_SIZE, buildPaperFigure, addPaperLighting, loadArtwork, releaseObjects} from './paper-model.js';
import {createPaperFlow} from './paper-flow-motion.js';
import {NODE_BY_ID, STAGES, TEACHING_CYCLE, sampleTeachingFlows, resolveRunEvent} from './framework-topology.js';

const clamp = THREE.MathUtils.clamp;
const frontURL = new URL('./paper-figure/front.webp', import.meta.url);
const NS = 'http://www.w3.org/2000/svg';
// Source-image coordinates also define the camera regions and accessible hit areas.
export const PAPER_REGIONS = {
  overview:[-25,-35,1610,1660], query:[0,0,1045,505], csv:[540,85,1010,520],
  classification:[0,480,590,940], references:[0,605,550,910],
  workflow:[375,585,1545,1635], model:[1125,510,1565,940],
  tailored:[370,925,1035,1630], agnostic:[1000,925,1535,1630],
  codegen:[1110,140,1585,590], solver:[1160,135,1555,490], solution:[1090,120,1585,590],
};
const STAGE_KEYS = ['overview','query','classification','workflow','modeling','codegen','overview'];
const HIT_REGIONS = [
  ['csv',[558,90,985,475]],['query',[20,75,540,475]],
  ['references',[250,690,372,890]],['classification',[20,614,540,895]],
  ['workflow',[590,615,1095,895]],['model',[1168,553,1517,893]],
  ['solver',[1249,168,1495,237]],['codegen',[1249,237,1495,369]],['solution',[1187,369,1547,465]],
  ['csvqa',[384,934,1513,1610]],
];
function region(key, route) {return PAPER_REGIONS[key==='modeling'||key==='csvqa'?route:key]||PAPER_REGIONS.overview;}
const world = (x,y,z=60) => new THREE.Vector3(x-PAPER_SIZE.width/2,PAPER_SIZE.height/2-y,z);

/** Fit the actual raised diagram from the lower-left; all movement is a camera move. */
export function journeyPose(box, aspect, yaw=.23, pitch=-.17) {
  const target = world((box[0]+box[2])/2,(box[1]+box[3])/2);
  const direction = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction,right);
  const tanV = Math.tan(THREE.MathUtils.degToRad(32/2)), tanH=tanV*aspect;
  let distance=0;
  for(const x of [box[0],box[2]])for(const y of [box[1],box[3]])for(const z of [-45,185]){
    const p=world(x,y,z).sub(target), depth=p.dot(direction);
    distance=Math.max(distance,Math.abs(p.dot(right))/tanH+depth,Math.abs(p.dot(up))/tanV+depth);
  }
  return {target,direction,distance:distance*1.07,yaw,pitch,box:[...box]};
}

export function createFramework({detailHost:host,renderer:mode='auto',rendererFactory,loadAssets=loadArtwork,
  onStageChange=()=>{},onNodeSelect=()=>{},onFlowChange=()=>{}}={}) {
  const state={stage:0,progress:0,selected:null,route:'tailored',free:false,zoom:1,pan:[0,0],yaw:0,pitch:0,
    lang:'zh',theme:'dark',reduced:false,live:false,run:null,playing:true,elapsed:0,visible:true,fallback:mode==='svg'};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,1,12000);
  const canvas=document.createElement('canvas');canvas.className='paper-journey-canvas';canvas.tabIndex=0;
  const svg=document.createElementNS(NS,'svg');svg.classList.add('paper-journey-fallback');svg.setAttribute('role','group');
  const picture=document.createElementNS(NS,'image');picture.setAttribute('href',frontURL.href);
  for(const [key,value]of Object.entries({x:0,y:0,width:1582,height:1632}))picture.setAttribute(key,String(value));
  svg.append(picture);
  const fallbackPackets=document.createElementNS(NS,'g');fallbackPackets.setAttribute('aria-hidden','true');svg.append(fallbackPackets);
  const links=[];
  for(const [id,box]of [...HIT_REGIONS].reverse()){
    const link=document.createElementNS(NS,'rect');link.setAttribute('role','button');link.setAttribute('tabindex','0');
    link.setAttribute('x',791+(box[0]-791)*.95);link.setAttribute('y',816+(box[1]-816)*.95);
    link.setAttribute('width',(box[2]-box[0])*.95);link.setAttribute('height',(box[3]-box[1])*.95);
    link.setAttribute('fill','transparent');link.setAttribute('data-paper-node',id);svg.append(link);links.push([link,id]);
  }
  host.classList.add('paper-journey');
  // SVGElement.hidden is not a reflected HTML property. Keep just one surface
  // mounted so a fallback can never show behind the transparent WebGL canvas.
  function mountSurface(kind){
    const active=kind==='webgl'?canvas:svg,inactive=kind==='webgl'?svg:canvas;
    inactive.setAttribute('hidden','');inactive.setAttribute('aria-hidden','true');inactive.remove();
    active.removeAttribute('hidden');active.removeAttribute('aria-hidden');
    if(active.parentElement!==host)host.append(active);
    host.dataset.renderer=kind;
  }
  mountSurface('svg');
  let renderer,assets,art,motion,disposed=false,raf=0,lastTime=null,lastNotice=-Infinity,drag,pose,flow;
  const cleanup=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);cleanup.push(()=>target.removeEventListener(type,fn,options));}
  function frameSnapshot(){
    const streams=sampleTeachingFlows(state.elapsed),primary=streams[0];
    const packets=motion?.getState()?.packets||[];
    return {...primary,streams:state.live?[]:streams,progress:primary.localProgress,cycleProgress:primary.progress,
      total:TEACHING_CYCLE.steps.length,durationMs:TEACHING_CYCLE.durationMs,elapsedMs:state.elapsed,
      paused:!state.playing||state.reduced||state.live||document.hidden||!state.visible,
      live:state.live,waiting:state.live&&!state.run,packets:state.live?[]:packets,
      ...(state.live?{stepId:state.run?'live-'+state.run.nodeId:'live-waiting',
        label:state.run?NODE_BY_ID.get(state.run.nodeId).title:{zh:'等待 Demo 任务',en:'Waiting for a demo run'},
        description:state.run?{zh:'显示当前任务的实际阶段事件。',en:'Showing stage events from the current task.'}:
          {zh:'在 Demo 中发送问题以开始运行。',en:'Send a question in the demo to begin.'}}:{}),requests:[]};
  }
  function notify(){flow=frameSnapshot();onFlowChange(flow);}
  function requestFrame(){if(!disposed&&!raf&&state.visible&&!document.hidden)raf=requestAnimationFrame(draw);}
  function sync(){motion?.update(state.elapsed,{route:state.route,live:state.live,reduced:state.reduced,frame:state.run});notify();requestFrame();}
  function names(){
    const label=state.lang==='zh'?'论文三维框图。滚动聚焦步骤；点击组件查看局部。':'3D paper diagram. Scroll to focus on stages; select a component to inspect it.';
    canvas.setAttribute('aria-label',label);svg.setAttribute('aria-label',label);
    for(const [link,id]of links)link.setAttribute('aria-label',NODE_BY_ID.get(id).title[state.lang]);
  }
  function enableFallback(){state.fallback=true;mountSurface('svg');requestFrame();}
  function regionPose(key,index){
    // A restrained orbit supplies depth without turning the diagram upside down.
    const yaw=[.23,.19,.25,.20,.17,.23,.23][index]||.23,pitch=[-.17,-.14,-.15,-.12,-.11,-.15,-.17][index]||-.17;
    return journeyPose(region(key,state.route),camera.aspect,yaw+state.yaw,pitch+state.pitch);
  }
  function applyCamera(width,height){
    camera.aspect=width/height;
    if(state.selected)pose=regionPose(state.selected,state.stage);
    else {
      const p=clamp(state.progress,0,1)*6,a=Math.floor(p),b=Math.min(6,a+1),t=p-a;
      const from=regionPose(STAGE_KEYS[a],a),to=regionPose(STAGE_KEYS[b],b);
      pose={target:from.target.lerp(to.target,t),direction:from.direction.lerp(to.direction,t).normalize(),
        distance:THREE.MathUtils.lerp(from.distance,to.distance,t),box:from.box.map((v,i)=>THREE.MathUtils.lerp(v,to.box[i],t))};
    }
    pose.target.x+=state.pan[0];pose.target.y+=state.pan[1];
    camera.position.copy(pose.target).addScaledVector(pose.direction,pose.distance/state.zoom);
    camera.lookAt(pose.target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    // A frontal render of the identical model is kept usable when WebGL is absent.
    const box=pose.box,cx=791+((box[0]+box[2])/2-791)*.95+state.pan[0]*.95,cy=816+((box[1]+box[3])/2-816)*.95-state.pan[1]*.95;
    const h=Math.max((box[3]-box[1])*.95,(box[2]-box[0])*.95/camera.aspect)/state.zoom*1.08,w=h*camera.aspect;
    svg.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);
  }
  function draw(now){
    raf=0;if(disposed||!state.visible||document.hidden){lastTime=null;return;}
    const advance=state.playing&&!state.reduced&&!state.live;
    if(advance&&lastTime!==null)state.elapsed+=clamp(now-lastTime,0,100);
    lastTime=now;
    const width=host.clientWidth||800,height=host.clientHeight||680;applyCamera(width,height);
    const sampled=motion?.update(state.elapsed,{route:state.route,live:state.live,reduced:state.reduced,frame:state.run});
    if(state.fallback){
      fallbackPackets.replaceChildren();
      for(const packet of sampled?.packets||[]){
        if(!packet.point)continue;
        const circle=document.createElementNS(NS,'circle');circle.setAttribute('cx',791+packet.point[0]*.95);circle.setAttribute('cy',816-packet.point[1]*.95);
        circle.setAttribute('r','7');circle.setAttribute('fill',packet.kind==='data'?'#10bf88':packet.kind==='output'?'#f3a936':'#32a6ff');
        circle.setAttribute('stroke','#fff');circle.setAttribute('stroke-width','2');fallbackPackets.append(circle);
        if(packet.mark){const text=document.createElementNS(NS,'text');text.setAttribute('x',791+packet.point[0]*.95+12);text.setAttribute('y',816-packet.point[1]*.95-8);text.setAttribute('font-size','18');text.setAttribute('fill',packet.kind==='data'?'#158561':'#147bd2');text.setAttribute('stroke','#fff');text.setAttribute('stroke-width','2');text.setAttribute('paint-order','stroke');text.textContent=packet.mark;fallbackPackets.append(text);}
      }
    } else if(art&&renderer){
      const ratio=renderer.getPixelRatio();if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio))renderer.setSize(width,height,false);
      renderer.render(scene,camera);
    }
    if(now-lastNotice>=240){lastNotice=now;notify();}
    if(advance)requestFrame();else lastTime=null;
  }
  function selected(id){
    if(!NODE_BY_ID.has(id))return;
    state.selected=id;state.free=false;state.live=false;state.run=null;state.zoom=1;state.pan=[0,0];state.yaw=state.pitch=0;
    state.stage=NODE_BY_ID.get(id).stage;state.progress=state.stage/6;
    onStageChange(state.stage,{route:state.route});onNodeSelect(id,NODE_BY_ID.get(id));sync();
  }
  for(const [link,id]of links){listen(link,'click',()=>selected(id));listen(link,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selected(id);}});}
  listen(canvas,'pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,travel:0};if(state.free)canvas.setPointerCapture?.(event.pointerId);
  });
  listen(canvas,'pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.travel+=Math.hypot(dx,dy);drag.x=event.clientX;drag.y=event.clientY;
    if(!state.free)return;
    if(event.shiftKey){state.yaw=clamp(state.yaw+dx*.002,-.2,.35);state.pitch=clamp(state.pitch+dy*.002,-.15,.25);}
    else if(pose){const scale=2*pose.distance/state.zoom*Math.tan(32*Math.PI/360)/(host.clientHeight||680);state.pan[0]-=dx*scale;state.pan[1]+=dy*scale;}
    requestFrame();
  });
  listen(canvas,'pointerup',event=>{
    if(!drag||drag.id!==event.pointerId)return;const clicked=drag.travel<5;drag=null;
    if(!clicked||!art)return;
    const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    const hit=ray.intersectObject(art,true).find(h=>h.object.isMesh&&h.object.userData.part!=='typesetting'&&h.object.userData.part!=='flow-packet');
    if(!hit)return;const p=art.worldToLocal(hit.point.clone()),x=p.x+791,y=816-p.y;
    const region=HIT_REGIONS.find(([,b])=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]);if(region)selected(region[0]);
  });
  for(const event of ['pointercancel','lostpointercapture'])listen(canvas,event,()=>{drag=null;});
  listen(canvas,'keydown',event=>{
    if(event.key==='Escape'||event.key==='Home')api.resetCamera();
    else if(event.key==='+'||event.key==='=')api.zoomBy(1.15);
    else if(event.key==='-')api.zoomBy(1/1.15);
    else if(['ArrowRight','ArrowLeft'].includes(event.key)){const step=clamp(state.stage+(event.key==='ArrowRight'?1:-1),0,6);api.setStage(step);onStageChange(step,{route:state.route,manual:true});}
    else if(event.key==='Enter')selected([null,'query','classification','workflow','csvqa','codegen','solution'][state.stage]||'workflow');
    else return;event.preventDefault();
  });
  listen(canvas,'webglcontextlost',event=>{event.preventDefault();enableFallback();});
  listen(canvas,'webglcontextrestored',()=>{if(!art||disposed)return;state.fallback=false;mountSurface('webgl');renderer.shadowMap.needsUpdate=true;requestFrame();});
  listen(document,'visibilitychange',()=>{lastTime=null;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else requestFrame();});
  const resize=new ResizeObserver(requestFrame);resize.observe(host);
  const observer=new IntersectionObserver(([entry])=>{state.visible=entry.isIntersecting;lastTime=null;if(state.visible)requestFrame();else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'});observer.observe(host);
  async function initialize(){
    if(!state.fallback){try{
      renderer=rendererFactory?rendererFactory(canvas):new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,host.clientWidth<600?1.5:2));renderer.setClearColor(0,0);
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    }catch{enableFallback();}}
    try{
      assets=await loadAssets();if(disposed){releaseObjects(assets.library);assets.print.dispose();return;}
      assets.print.anisotropy=Math.min(8,renderer?.capabilities.getMaxAnisotropy()||1);
      art=buildPaperFigure(assets.print,assets.library);scene.add(art);addPaperLighting(scene);
      motion=createPaperFlow(art);
      if(renderer)renderer.shadowMap.needsUpdate=true;
    }catch(error){if(disposed)return;console.warn('The diagram is using its rendered view.',error);enableFallback();}
    mountSurface(state.fallback?'svg':'webgl');names();sync();
  }
  const api={
    setProgress(value){if(state.free||state.live||state.selected||state.reduced)return;const progress=clamp(Number(value)||0,0,1);if(Math.abs(progress-state.progress)<.000001)return;
      state.progress=progress;state.zoom=1;state.pan=[0,0];state.yaw=state.pitch=0;const stage=Math.round(progress*6);
      if(stage!==state.stage){state.stage=stage;onStageChange(stage,{route:state.route});}requestFrame();},
    setStage(index){state.stage=clamp(Math.round(index),0,6);state.progress=state.stage/6;state.selected=null;state.zoom=1;state.pan=[0,0];state.yaw=state.pitch=0;requestFrame();},
    selectNode:selected,back(){state.selected=null;state.zoom=1;state.pan=[0,0];onNodeSelect(null,null);requestFrame();},
    setRoute(route){state.route=route==='agnostic'?'agnostic':'tailored';sync();},
    setFree(value){state.free=Boolean(value);host.dataset.free=String(state.free);requestFrame();},
    zoomBy(factor){state.zoom=clamp(state.zoom*factor,.7,3.5);requestFrame();},
    zoomInto(id){if(id)selected(id);else api.zoomBy(1.3);},
    resetCamera(){Object.assign(state,{stage:0,progress:0,selected:null,free:false,zoom:1,pan:[0,0],yaw:0,pitch:0});host.dataset.free='false';onNodeSelect(null,null);onStageChange(0,{route:state.route,manual:true});requestFrame();},
    setLanguage(lang){state.lang=lang==='en'?'en':'zh';names();notify();requestFrame();},
    setTheme(theme){state.theme=theme==='light'?'light':'dark';requestFrame();},
    setReduced(value){state.reduced=Boolean(value);lastTime=null;sync();},
    setLiveMode(value){if(state.live&&!value)state.selected=null;state.live=Boolean(value);if(!state.live)state.run=null;lastTime=null;sync();},
    setRunState(event){if(!event){state.run=null;sync();return;}const mapped=resolveRunEvent(event,state.run||{route:state.route});if(!mapped)return;
      state.run=mapped;state.live=true;if(mapped.route)state.route=mapped.route;state.stage=clamp(mapped.stage,0,6);state.progress=state.stage/6;
      state.selected=mapped.nodeId;state.zoom=1;state.pan=[0,0];onStageChange(state.stage,{route:state.route,runState:mapped});sync();},
    setFlowPlaying(value){state.playing=Boolean(value);lastTime=null;sync();},
    restartFlow(){state.elapsed=0;state.playing=true;lastTime=null;sync();},
    seekFlow(value){state.elapsed=clamp(Number(value)||0,0,1)*TEACHING_CYCLE.durationMs;lastTime=null;sync();},
    getFlowState(){return frameSnapshot();},
    getCameraState(){return {stage:state.stage,progress:state.progress,selected:state.selected,route:state.route,free:state.free,zoom:state.zoom,
      position:camera.position.toArray(),target:pose?.target.toArray(),direction:pose?.direction.toArray(),fallback:state.fallback};},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);resize.disconnect();observer.disconnect();cleanup.forEach(fn=>fn());motion?.dispose();
      releaseObjects(art,assets?.library);assets?.print.dispose();scene.traverse(object=>object.shadow?.dispose());renderer?.dispose();canvas.remove();svg.remove();host.classList.remove('paper-journey');},
  };
  names();api.ready=initialize();return api;
}

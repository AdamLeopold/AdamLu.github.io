import * as THREE from './vendor/three/three.module.js';
import * as topology from './framework-topology.js?v=workbench-20261103-1';
export {TOPOLOGY,STAGES,TEACHING_CYCLE,sampleTeachingCycle} from './framework-topology.js?v=workbench-20261103-1';
const {TOPOLOGY,STAGES,NODE_BY_ID,activeEdges,resolveRunEvent,TEACHING_CYCLE,sampleTeachingCycle}=topology;
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

export function measureDOMLabel(label,cache,key,fallback={width:150,height:36}){
  if(cache.has(key))return cache.get(key);
  const width=Math.ceil(label.offsetWidth),height=Math.ceil(label.offsetHeight);
  if(width>0&&height>0){const metrics={width:width+2,height:height+2};cache.set(key,metrics);return metrics;}
  return fallback;
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

/** Deterministic SVG-space label placement; it never moves the graph nodes. */
export function layoutFallbackLabels(items,width,height,fontSize=13,bounds={left:0,top:0,right:width,bottom:height}){
  const measure=text=>[...text].reduce((sum,c)=>sum+fontSize*(/[\u3400-\u9fff]/.test(c)?1:/[MW@]/.test(c)?.88:/[ilI.,:;'|!]/.test(c)?.31:/\s/.test(c)?.35:.61),0);
  const wrap=(text,maxWidth)=>{
    const cjk=/[\u3400-\u9fff]/.test(text),words=cjk?[...text]:text.split(/\s+/),lines=[];let line='';
    const max=Math.min(maxWidth||(width<600?180:225),width-32,bounds.right-bounds.left-32);
    for(const word of words){const next=line+(line&&!cjk?' ':'')+word;if(line&&measure(next)>max){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);return lines;
  };
  const overlap=(a,b,gap=5)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
  const placed=[],result=new Map(),nodeBoxes=items.map(item=>({x:item.x-(item.nodeWidth||32)/2,y:item.y-(item.nodeHeight||32)/2,width:item.nodeWidth||32,height:item.nodeHeight||32}));
  const ordered=[...items].sort((a,b)=>(b.level||0)-(a.level||0)||((a.kind==='agent'?-1:0)-(b.kind==='agent'?-1:0)));
  for(const item of ordered){
    const lines=wrap(item.text,item.maxWidth),w=Math.min(bounds.right-bounds.left-20,Math.max(...lines.map(measure))+16),h=lines.length*(fontSize+3)+8;
    const preferred={x:item.preferredX??item.x-w/2,y:item.preferredY??item.y-23-h};let chosen=null,best=null;
    search:for(let row=0;row<10&&!chosen;row++){
      const dys=row===0?[0]:[-row*(h+7),row*(h+7)];
      for(const dy of dys)for(const dx of [0,-w*.55,w*.55,-w,w]){
        const box={x:clamp(preferred.x+dx,bounds.left+8,bounds.right-w-8),y:clamp(preferred.y+dy,bounds.top+8,bounds.bottom-h-12),width:w,height:h};
        const collisions=placed.filter(p=>overlap(box,p)).length+nodeBoxes.filter(p=>overlap(box,p,2)).length;
        const cost=collisions*100000+Math.abs(box.x-preferred.x)+Math.abs(box.y-preferred.y)*1.1;
        if(!best||cost<best.cost)best={box,cost};
        if(!collisions){chosen=box;break search;}
      }
    }
    chosen??=best.box;placed.push(chosen);
    result.set(item.id,{...chosen,lines,fontSize,moved:Math.abs(chosen.x-preferred.x)>1||Math.abs(chosen.y-preferred.y)>1});
  }
  return result;
}

/** A shared orthographic scene. The graph stays on one plane; only the camera moves. */
export function createFramework({heroHost,detailHost,onStageChange=()=>{},onNodeSelect=()=>{},onFlowChange=()=>{},renderer:rendererMode='auto'}={}){
 if(!heroHost||!detailHost)throw new Error('Framework view hosts are required');
 const state={lang:'zh',theme:'dark',reduced:false,free:false,route:'tailored',stage:0,progress:0,selected:null,hover:null,run:null,runEvent:null,zoom:1,localProgress:null,started:performance.now(),flowElapsed:0,flowPlaying:true,flowFrame:sampleTeachingCycle(0),liveMode:false,liveElapsed:0,visible:true,runId:null,visited:new Set(),lastDataAt:'csv'};
 let disposed=false,fallback=rendererMode==='svg',raf=0,last=0,holdUntil=0,quality=1.5,slowFrames=0,flowSignature='';
 const cleanup=[],meshes=new Map(),links=new Map(),hitTargets=[];
 const system=document.createElement('div');system.className='fw-system';system.setAttribute('aria-hidden','true');
 const canvas=document.createElement('canvas');canvas.className='fw-canvas';system.append(canvas);document.body.append(system);
 const labelLayer=document.createElement('div');labelLayer.className='fw-label-layer';document.body.append(labelLayer);
 const views=[{host:heroHost,hero:true},{host:detailHost,hero:false}].map(v=>({...v,labels:new Map(),packets:new Map(),labelMetrics:new Map(),target:new THREE.Vector3(),pan:new THREE.Vector2(),camera:new THREE.OrthographicCamera(-20,20,12,-12,.1,100),span:24,initialized:false}));
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
 const textureCache=new Map(),benches=new Map(),moving=new Map(),signals=new Map();
 function texture(kind){
  if(textureCache.has(kind))return textureCache.get(kind);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;let ctx;try{ctx=canvas.getContext?.('2d');}catch{}if(!ctx)return null;
  const generic=kind.endsWith('-generic'),baseKind=kind.replace(/-generic$/,''),paper=kind.startsWith('paper'),bg=paper?'#fffaf0':'#10273b',ink=paper?'#36546a':'#d7efff',accent=kind.includes('data')?'#5cd4b2':kind.includes('ref')?'#c2a2f0':'#8bcbff';ctx.fillStyle=bg;ctx.fillRect(0,0,512,320);
  if(paper){ctx.fillStyle='#edf0e8';ctx.fillRect(0,0,512,40);ctx.fillStyle=ink;ctx.font='600 31px ui-monospace, monospace';ctx.fillText(kind.includes('result')?'MODEL · CODE · RESULT':kind.includes('classified')?(generic?'TYPE':'TYPE · TP'):kind.includes('workflow')?'WORKFLOW':kind.includes('model')?(generic?'MODEL / PLAN':'min Σ cᵢⱼ xᵢⱼ'):kind.includes('code')?'model.py':kind.includes('data')?'CSV · DATA':'QUERY',34,90);for(let i=0;i<5;i++){ctx.fillStyle=i===0?'#79a8c5':'#c0cbd0';ctx.fillRect(34,123+i*33,[390,335,366,254,300][i],8);}if(kind.includes('data')){ctx.strokeStyle='#4a9c88';ctx.lineWidth=3;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(36+i*88,115);ctx.lineTo(36+i*88,292);ctx.stroke();}for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(36,115+i*44);ctx.lineTo(390,115+i*44);ctx.stroke();}}}
  else{
   ctx.fillStyle='#213c51';ctx.fillRect(0,0,512,34);for(let i=0;i<3;i++){ctx.fillStyle=['#e68c89','#dfbd77','#76c8a6'][i];ctx.beginPath();ctx.arc(20+i*20,17,5,0,Math.PI*2);ctx.fill();}
   ctx.font='500 25px ui-monospace, monospace';ctx.fillStyle=accent;
   if(baseKind==='classification'){ctx.fillText('QUERY → TYPE',32,85);ctx.fillStyle='#edfafc';ctx.font='600 82px ui-monospace, monospace';ctx.fillText(generic?'TYPE':'TP',36,195);ctx.font='22px ui-monospace, monospace';ctx.fillStyle='#7cabc8';ctx.fillText(generic?'problem structure':'supply · demand · cost',34,260);}
   else if(baseKind==='model'){ctx.fillText(generic?'MODEL / PLAN':'min  Σ cᵢⱼ xᵢⱼ',30,90);ctx.fillStyle=ink;ctx.fillText(generic?'variables · domains':'Σᵢ xᵢⱼ ≥ dⱼ',30,155);ctx.fillText(generic?'objective · constraints':'Σⱼ xᵢⱼ ≤ sᵢ',30,205);ctx.fillStyle='#74d5b4';ctx.fillText(generic?'data · parameters':'xᵢⱼ ≥ 0',30,265);}
   else if(baseKind==='code'){const lines=['import gurobipy as gp','model = gp.Model()','x = model.addVars(...)','model.setObjective(...)','model.addConstrs(...)','model.optimize()'];ctx.font='20px ui-monospace, monospace';lines.forEach((line,i)=>{ctx.fillStyle=i===0?'#c5a7ef':i===5?'#72d7b1':'#a1cce2';ctx.fillText(line,28,78+i*39);});}
   else if(baseKind==='solver'&&generic){ctx.fillText('PYTHON / GUROBI',25,75);ctx.fillStyle='#7c9caf';ctx.font='23px ui-monospace, monospace';ctx.fillText('STATUS       —',30,145);ctx.fillText('OBJECTIVE    —',30,207);ctx.fillText('VARIABLES    —',30,267);}
   else if(baseKind==='solver'){ctx.fillText('PYTHON / GUROBI',25,75);ctx.strokeStyle='#26485c';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(32,110+i*38);ctx.lineTo(470,110+i*38);ctx.stroke();}ctx.strokeStyle='#68d5ad';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(38,255);ctx.lineTo(120,235);ctx.lineTo(200,190);ctx.lineTo(270,173);ctx.lineTo(350,145);ctx.lineTo(460,141);ctx.stroke();ctx.fillStyle='#77d9b5';ctx.fillRect(34,283,426,9);}
   else if(baseKind==='workflow'){ctx.fillText('DATA → MODEL → CODE',28,76);for(let i=0;i<3;i++){ctx.fillStyle=['#68cfb2','#83baf0','#c0a5ec'][i];ctx.fillRect(35+i*155,125,120,62);ctx.fillStyle=bg;ctx.font='600 30px ui-monospace, monospace';ctx.fillText(String(i+1),82+i*155,167);}ctx.fillStyle='#8caec3';for(let i=0;i<3;i++)ctx.fillRect(38,225+i*21,390-i*55,7);}
   else{ctx.fillText('CSV · RECORDS',28,78);ctx.strokeStyle='#5dc2a6';ctx.lineWidth=3;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(30+i*75,105);ctx.lineTo(30+i*75,288);ctx.stroke();}for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(30,105+i*45);ctx.lineTo(405,105+i*45);ctx.stroke();}}
  }
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
 function display(group,x,y,w,h,type,dark,z=.6){slab(group,x,y,w+.14,h+.14,.16,dark,z,.09);const map=texture(type);if(map){const screen=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,toneMapped:false}));screen.position.set(x,y,z+.095);screen.userData.textureKind=type;group.add(screen);}return z+.1;}
 function keyboard(group,x,y,s,shell,dark,z=.6){slab(group,x,y,1.55*s,.42*s,.12,shell,z,.06);for(let row=0;row<3;row++)for(let col=0;col<7;col++)box(group,x+(col-3)*.18*s,y+(row-1)*.105*s,.135*s,.065*s,dark,z+.09,.025);}
 function createIcon(node){
  const group=new THREE.Group(),color=PALETTES.dark[nodeColor(node)];group.userData.nodeId=node.id;
  const material=new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.16,emissive:color,emissiveIntensity:.03,transparent:true});
  const shell=new THREE.MeshStandardMaterial({color:0xe7e9e8,roughness:.38,metalness:.12,transparent:true});
  const metal=new THREE.MeshStandardMaterial({color:0x708394,roughness:.28,metalness:.65,transparent:true});
  const dark=new THREE.MeshStandardMaterial({color:0x183044,roughness:.43,metalness:.22,transparent:true});
  const wood=new THREE.MeshStandardMaterial({color:0x6f5a4a,roughness:.58,metalness:.04,transparent:true});
  const paper=new THREE.MeshStandardMaterial({color:0xfff8e8,roughness:.85,transparent:true});
  const brass=new THREE.MeshStandardMaterial({color:0xc3a36d,roughness:.3,metalness:.72,transparent:true});
  const faceInk=new THREE.MeshBasicMaterial({color:0x25455e,transparent:true}),ink=new THREE.MeshBasicMaterial({color:PALETTES.dark.ink,transparent:true});
  const icon=iconOf(node),parts={};
  if(icon==='query'){
   slab(group,0,-.55,1.72,.48,.48,material,.05,.12);slab(group,0,-.3,1.55,.35,.18,dark,.32,.07);sheet(group,-.04,.19,1.13,1.6,'paper-query',paper,.52,-.12);slab(group,.55,-.48,.2,.36,.12,brass,.5,.03);bar(group,[-.7,-.75],[.7,-.75],metal,.025,.32);
  }else if(icon==='classification'){
   slab(group,0,-.48,2.18,.65,.65,shell,.12,.17);slab(group,0,.3,1.9,1.2,.54,shell,.2,.15);slab(group,0,.24,1.56,.8,.08,dark,.53,.06);display(group,0,.24,1.36,.62,'classification',dark,.59);slab(group,0,-.32,1.45,.12,.08,dark,.57,.03);for(let i=0;i<3;i++)slab(group,-.65+i*.66,-.69,.52,.25,.1,i===1?material:metal,.47,.03);sheet(group,-.45,-.46,.5,.62,'paper-query',paper,.72,.12);
  }else if(icon==='workflow'){
   slab(group,0,-.66,2.15,.46,.62,shell,.05,.13);box(group,0,-.3,.21,.65,metal,.2,.3);slab(group,0,.37,2.05,1.45,.3,material,.31,.15);display(group,0,.38,1.81,1.18,'workflow',dark,.51);keyboard(group,0,-.69,.93,shell,dark,.48);slab(group,.86,-.37,.24,.36,.12,metal,.46,.06);
  }else if(icon==='model'){
   slab(group,0,-.61,2.3,.54,.6,shell,.02,.13);slab(group,0,.32,2.1,1.5,.3,metal,.22,.09);display(group,0,.35,1.86,1.25,'model',dark,.43);sheet(group,.38,-.62,.98,.58,'paper-model',paper,.64,.1);bar(group,[-.88,-.57],[-.23,-.65],brass,.045,.72);parts.pen=box(group,-.79,-.7,.12,.16,material,.7,.13);
  }else if(icon==='code'){
   slab(group,0,-.65,2,.5,.66,shell,.02,.13);box(group,0,-.28,.22,.68,metal,.2,.25);slab(group,0,.36,2,1.4,.54,shell,.22,.16);display(group,0,.37,1.72,1.11,'code',dark,.54);keyboard(group,0,-.69,.9,shell,dark,.45);slab(group,-.73,.95,.48,.08,.05,material,.49,.02);
  }else if(icon==='solver'){
   slab(group,0,0,1.65,2.05,.75,shell,.2,.16);slab(group,0,.46,1.37,.83,.1,dark,.65,.06);display(group,0,.47,1.18,.64,'solver',dark,.72);for(let i=0;i<6;i++)slab(group,-.25,-.25-i*.095,.84,.033,.035,dark,.66,.01);slab(group,.53,-.41,.12,.66,.07,metal,.68,.03);for(const x of[-.48,.48])slab(group,x,-1.02,.31,.18,.32,dark,.1,.05);const button=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.07,16),material);button.rotation.x=Math.PI/2;button.position.set(.53,-.69,.72);group.add(button);parts.button=button;
  }else if(icon==='result'){
   slab(group,0,-.52,1.8,.45,.53,metal,.1,.11);slab(group,0,.12,1.47,1.9,.12,material,.26,.1);sheet(group,0,.07,1.29,1.64,'paper-result',paper,.42,.015);slab(group,0,.99,.51,.19,.19,brass,.48,.06);for(const[x,h]of[[-.43,.25],[-.08,.49],[.29,.69]])box(group,x,-.49+h/2,.2,h,material,.61,.1);polyline(group,[[-.59,.52],[-.59,-.54],[.59,-.54]],faceInk,.021,.65);
  }else if(icon==='references'){
   slab(group,0,.04,2.05,2.12,.72,wood,.1,.13);slab(group,0,.08,1.81,1.86,.1,dark,.5,.05);for(const y of[-.78,-.02,.73])slab(group,0,y,1.88,.09,.23,wood,.62,.02);for(let row=0;row<2;row++)for(let i=0;i<6;i++){const book=slab(group,-.73+i*.28,-.4+row*.76,.2,.61,.21,i%3===0?material:i%3===1?paper:metal,.65,.025);book.rotation.z=(i===0?-.06:i===5?.05:0);bar(group,[-.78+i*.28,-.53+row*.76],[-.67+i*.28,-.53+row*.76],brass,.018,.8);}parts.drawer=slab(group,0,-1.05,1.88,.3,.54,wood,.35,.045);slab(parts.drawer,0,0,.42,.055,.08,brass,.38,.018);
  }else if(icon==='csv'){
   for(let i=0;i<3;i++){slab(group,0,-.52+i*.18,1.9,.35,.55,i===2?material:metal,.1+i*.08,.08);sheet(group,-.16+i*.15,.08+i*.17,1.27,1.1,'paper-data',paper,.45+i*.08,-.12+i*.08);}slab(group,.62,.78,.45,.18,.09,material,.7,.03);
  }else{
   slab(group,0,-.55,1.7,.45,.6,shell,.1,.1);display(group,0,-.2,1.44,.82,'data',dark,.4);box(group,-.68,.27,.12,.79,metal,.25,.14);bar(group,[-.68,.61],[.21,.61],metal,.055,.27);slab(group,.27,.58,.48,.25,.4,material,.36,.08);const lens=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.15,16),dark);lens.rotation.x=Math.PI/2;lens.position.set(.27,.45,.63);group.add(lens);
  }
  const hierarchy=node.kind==='agent'?1.06:node.id==='csvqa'?.68:node.id==='solution'?.76:node.id==='csv'?.84:.92;group.scale.setScalar(hierarchy);group.rotation.set(.15,-.18,0);
  const ledMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7});const led=slab(group,.73,-.86,.12,.06,.05,ledMaterial,.66,.02);parts.led=led;
  const progress=new THREE.Mesh(new THREE.PlaneGeometry(1.18,.045),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));progress.position.set(0,-.94,.73);group.add(progress);
  const hit=new THREE.Mesh(new THREE.BoxGeometry(2.35,2.35,1.5),new THREE.MeshBasicMaterial({visible:false}));hit.userData.nodeId=node.id;group.add(hit);hitTargets.push(hit);
  const selection=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.038),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));selection.position.set(0,-1.21,.06);group.add(selection);
  graph.add(group);meshes.set(node.id,{node,group,material,faceInk,ink,selection,progress,parts,ledMaterial,shell,metal,dark,wood,paper,brass,hierarchy});
 }
 function buildBench(mobile){
  const group=new THREE.Group(),desk=new THREE.MeshStandardMaterial({color:0x253849,roughness:.5,metalness:.16}),edge=new THREE.MeshStandardMaterial({color:0x87725b,roughness:.43,metalness:.18});
  const core=baseNodes().filter(n=>['query','classification','workflow','model','codegen','solver','solution'].includes(n.id)).map(n=>positionOf(n,mobile));const xs=core.map(p=>p.x),ys=core.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  slab(group,cx,cy,Math.max(...xs)-Math.min(...xs)+2.75,Math.max(...ys)-Math.min(...ys)+2.5,.26,desk,-.42,.28);
  for(const station of STATIONS){const ns=station.nodes.map(id=>NODE_BY_ID.get(id)).filter(Boolean),ps=ns.map(n=>positionOf(n,mobile));if(!ps.length)continue;const x=ps.map(p=>p.x),y=ps.map(p=>p.y),a=(Math.min(...x)+Math.max(...x))/2,b=(Math.min(...y)+Math.max(...y))/2;slab(group,a,b,Math.max(...x)-Math.min(...x)+(station.id==='execution'?2.65:2.45),Math.max(...y)-Math.min(...y)+2.2,.16,desk,-.2,.18);if(station.id==='execution')bar(group,[a-(Math.max(...x)-Math.min(...x))/2-1.1,b-1.12],[a+(Math.max(...x)-Math.min(...x))/2+1.1,b-1.12],edge,.035,-.07);}
  group.userData.materials={desk,edge};graph.add(group);benches.set(mobile?'mobile':'desktop',group);
 }
 function createMoving(kind){
  const group=new THREE.Group(),color=PALETTES.dark[kind==='reference'?'reference':kind==='data'?'data':'query'],accent=new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.16}),paper=new THREE.MeshStandardMaterial({color:0xfff9ee,roughness:.78});
  if(kind==='data'){slab(group,0,0,.67,.74,.11,accent,0,.08);sheet(group,0,.03,.54,.59,'paper-data',paper,.08,.04);slab(group,.22,.36,.19,.1,.06,accent,.12,.02);}
  else if(kind==='reference'){slab(group,0,0,.64,.72,.15,accent,0,.06);for(let i=0;i<3;i++)box(group,.02,-.03+i*.025,.53,.6,paper,.08+i*.015,.015);bar(group,[-.21,-.25],[-.21,.26],accent,.024,.16);}
  else{slab(group,0,-.02,.64,.77,.08,accent,0,.06);sheet(group,.015,.025,.53,.68,'paper-query',paper,.09,-.04);}
  group.rotation.set(.08,-.1,-.08);graph.add(group);moving.set(kind,{group,accent});
 }
 if(scene){for(const kind of['data','reference']){const material=new THREE.MeshBasicMaterial({color:PALETTES.dark[kind],transparent:true,opacity:.95}),group=new THREE.Group();group.add(bodyShape([[-.27,-.08],[.05,-.08],[.05,-.18],[.3,0],[.05,.18],[.05,.08],[-.27,.08]],material,.045,0));graph.add(group);signals.set(kind,{group,material});}buildBench(false);buildBench(true);for(const n of baseNodes())createIcon(n);for(const kind of['query','data','reference'])createMoving(kind);for(const e of TOPOLOGY.edges){if(!BASE_IDS.has(e.from)||!BASE_IDS.has(e.to))continue;const material=new THREE.LineBasicMaterial({color:PALETTES.dark.edge,transparent:true,opacity:.35,depthWrite:false});const line=new THREE.Line(new THREE.BufferGeometry(),material);const arrow=new THREE.Mesh(new THREE.ConeGeometry(.065,.18,6),new THREE.MeshBasicMaterial({color:PALETTES.dark.edge,transparent:true}));graph.add(line,arrow);links.set(e.id,{edge:e,line,arrow,material,layouts:new Map()});}}
 function positionsFor(view){const mobile=view.host.clientWidth<760;return new Map(baseNodes().map(n=>[n.id,positionOf(n,mobile)]));}
 function curveFor(edge,positions){
  const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)return null;
  const delta=to.clone().sub(from),distance=delta.length(),direction=delta.clone().normalize(),normal=new THREE.Vector3(-direction.y,direction.x,0);
  const a=from.clone().addScaledVector(direction,Math.min(.98,distance*.23)),b=to.clone().addScaledVector(direction,-Math.min(.98,distance*.23));a.z=b.z=.025;
  const bend=edge.kind==='flow'?0:edge.kind==='request'?.42:edge.kind==='runtime'?.32:edge.kind==='context'?.16:.2;
  const c=a.clone().lerp(b,.33).addScaledVector(normal,bend),d=a.clone().lerp(b,.67).addScaledVector(normal,bend),vertical=Math.abs(delta.y)>Math.abs(delta.x);
  // Long bypasses must not appear to pass through unrelated processing modules.
  if(edge.kind==='runtime'){if(vertical){c.x+=4.5;d.x+=4.5;}else{c.y-=1.7;d.y-=1.7;}}
  if(edge.kind==='artifact'){if(vertical){const offset=edge.from==='model'?-2.8:-1.9;c.x+=offset;d.x+=offset;}else{const offset=edge.from==='model'?2.4:-2;c.y+=offset;d.y+=offset;}}
  return new THREE.CubicBezierCurve3(a,c,d,b);
 }
 function routes(){return activeEdges(state.route).filter(e=>BASE_IDS.has(e.from)&&BASE_IDS.has(e.to));}
 function stageFocus(view){return new Set(view.hero?baseNodes().map(n=>n.id):state.selected?[state.selected]:state.run?[state.run.nodeId]:STAGES[state.stage]?.journey?.focus||STAGES[state.stage]?.focus||[]);}
 function activeLinkIds(view){
  const ids=new Set(),include=path=>{for(let i=1;i<path.length;i++)for(const edge of routes())if(edge.from===path[i-1]&&edge.to===path[i])ids.add(edge.id);};
  for(const packet of packetsFor(view))if(state.liveMode||packet.active)for(const path of packet.paths)include(path);
  for(const request of explicitRequests(view))include(request.path);
  if(!state.liveMode)for(const id of state.flowFrame.activeEdges||[])if(routes().some(e=>e.id===id&&e.kind==='artifact'))ids.add(id);
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
 function packetsFor(view){
  if(state.liveMode)return state.run?livePacketsFor():[];
  const frame=state.flowFrame;
  return [['query',frame.query],['data',frame.data],['reference',frame.reference]].filter(([,track])=>track).map(([kind,track])=>({...track,kind,paths:cleanPaths([track.path||[track.at]]),trackProgress:track.localProgress,stationary:track.path?.length===1})).filter(packet=>packet.paths.length);
 }
 function animationFraction(view,now){return state.liveMode?clamp(state.liveElapsed/2000):state.flowFrame.localProgress;}
 function explicitRequests(view){return state.liveMode?[]:state.flowFrame.requests||[];}
 function flowSnapshot(){
  const frame=state.flowFrame,packets=packetsFor(views[0]).map(p=>({kind:p.kind,id:p.id,path:p.paths[0],paths:p.paths,at:p.at||(p.stationary?p.paths.at(-1)?.at(-1):null),role:p.role||null,localProgress:p.trackProgress??animationFraction(views[0]),requesting:state.liveMode?false:(frame.requests||[]).some(r=>r.kind===p.kind)}));
  const snapshot={stepId:frame.stepId,index:frame.index,total:TEACHING_CYCLE.steps.length,label:frame.label,description:frame.description,payload:{query:frame.query,data:frame.data,reference:frame.reference},progress:frame.localProgress,cycleProgress:frame.progress,elapsedMs:state.flowElapsed,durationMs:TEACHING_CYCLE.durationMs,paused:!state.flowPlaying||state.reduced||state.liveMode||document.hidden||!state.visible,live:state.liveMode,waiting:state.liveMode&&!state.run,packets,requests:state.liveMode?[]:frame.requests};if(state.liveMode){snapshot.stepId=state.run?`live-${state.run.nodeId}`:'live-waiting';snapshot.label=state.run?NODE_BY_ID.get(state.run.nodeId)?.title:{zh:'等待 Demo 任务',en:'Waiting for a demo run'};snapshot.description=state.run?{zh:'显示当前任务的实际阶段事件。',en:'Showing actual stage events from the current task.'}:{zh:'在 Demo 中发送问题以开始运行。',en:'Send a question in the demo to begin.'};snapshot.payload={query:{id:'live-query',label:labelForKind('query',state.lang)},data:{id:'live-data',label:labelForKind('data',state.lang)}};}return snapshot;
 }
 function notifyFlow(force=false){const snapshot=flowSnapshot(),signature=[snapshot.stepId,snapshot.paused,snapshot.live,snapshot.waiting,state.run?.nodeId,state.run?.status,state.lang].join('|');if(force||signature!==flowSignature){flowSignature=signature;onFlowChange(snapshot);}}
 function portAt(id,kind,positions,signal=false){
  const point=positions.get(id)?.clone()||new THREE.Vector3();if(signal){point.y+=.38;}else{point.x+=kind==='data'?-.49:kind==='reference'?.67:.42;point.y+=kind==='reference'?.33:-.46;}point.z=1.14;return point;
 }
 function travelOf(packet,view,now){
  const phase=packet.stationary?1:packet.trackProgress??animationFraction(view,now),segments=[];
  for(const path of packet.paths){if(path.length===1)segments.push({path,from:path[0],to:path[0]});else for(let i=1;i<path.length;i++)segments.push({path,from:path[i-1],to:path[i]});}
  const t=phase*segments.length,index=Math.min(segments.length-1,Math.floor(t)),segment=segments[index],u=phase===1?1:t-index;if(!segment)return null;
  const edge=routes().find(e=>e.from===segment.from&&e.to===segment.to),from=portAt(segment.from,packet.kind,view.positions,packet.signal),to=portAt(segment.to,packet.kind,view.positions,packet.signal),base=edge?curveFor(edge,view.positions):null;
  const curve=base?new THREE.CubicBezierCurve3(from,base.v1.clone().setZ(1.14),base.v2.clone().setZ(1.14),to):null;
  let moving=curve?curve.getPoint(u):to,direction=curve?curve.getTangent(u).normalize():new THREE.Vector3(1,0,0);
  if(curve&&!packet.signal){const lane=(packet.kind==='query'?.15:packet.kind==='data'?-.15:.05)*Math.sin(Math.PI*u);moving.x-=direction.y*lane;moving.y+=direction.x*lane;}
  const request=Boolean(state.liveMode&&!packet.signal&&edge?.kind==='request'&&['data','reference'].includes(packet.kind)),point=request?portAt(packet.kind==='data'?'csv':'references',packet.kind,view.positions):moving;
  return{point,semanticPoint:point.clone(),direction,request:request?moving:null,path:segment.path,phase};
 }
 function requestTravels(view,now){
  const entries=[];
  for(const request of explicitRequests(view)){const paths=cleanPaths([request.path]);if(!paths.length)continue;const travel=travelOf({...request,paths,signal:true,trackProgress:request.localProgress},view,now);if(travel)entries.push({...request,point:travel.point,direction:travel.direction});}
  if(state.liveMode)for(const packet of packetsFor(view)){const travel=travelOf(packet,view,now);if(travel?.request)entries.push({kind:packet.kind,path:travel.path,point:travel.request,direction:travel.direction,label:packet.kind==='data'?{zh:'读取请求',en:'Data request'}:{zh:'检索请求',en:'Retrieval request'}});}
  return entries;
 }
 function viewZoom(view){const stageZoom=[1,1.03,1.12,1.10,1.18,1.12,1][state.stage]||1;return view.hero?1:state.zoom*stageZoom*(state.selected?1.04:1);}
 function fit(view,dt){
  view.positions=positionsFor(view);const box=new THREE.Box3();for(const p of view.positions.values())box.expandByPoint(p);
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),aspect=Math.max(.2,view.rect.width/view.rect.height),mobile=view.rect.width<760;
  // Full context is retained in every guided step. Selection adds only a small pan.
  let span=Math.max((size.y+(mobile?6.3:5.8)),(size.x+(mobile?6:6.2))/aspect)*1.05;
  if(!view.hero){const focus=[...stageFocus(view)].map(id=>view.positions.get(id)).filter(Boolean);if(focus.length){const target=new THREE.Vector3();focus.forEach(p=>target.add(p));target.divideScalar(focus.length);center.lerp(target,.055);}center.x+=view.pan.x;center.y+=view.pan.y;span/=viewZoom(view);}
  const ease=state.reduced||!view.initialized?1:1-Math.pow(.002,dt);view.target.lerp(center,ease);view.span=lerp(view.span,span,ease);
  const camera=view.camera;camera.left=-view.span*aspect/2;camera.right=view.span*aspect/2;camera.top=view.span/2;camera.bottom=-view.span/2;camera.position.set(view.target.x,view.target.y,32);camera.lookAt(view.target.x,view.target.y,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();view.initialized=true;
 }
 function guideProgress(node,view,now){
  if(state.liveMode)return state.run?.nodeId===node.id&&state.run.status==='running'?Math.max(.12,animationFraction(view,now)):null;
  const frame=state.flowFrame,transform=frame.transformations?.find(item=>item.node===node.id);
  return transform?frame.localProgress:null;
 }
 function updateTextureMode(group,generic){
  group.traverse(object=>{const kind=object.userData.textureKind;if(!kind)return;const key=kind+(generic?'-generic':'');if(object.userData.textureMode===key)return;const map=texture(key);if(map){object.material.map=map;object.material.needsUpdate=true;}object.userData.textureMode=key;});
 }
 function pose(view,dt,now){
  fit(view,dt);const focus=stageFocus(view),active=activeLinkIds(view),palette=PALETTES[state.theme],mobile=view.rect.width<760;
  for(const[key,bench]of benches){bench.visible=key===(mobile?'mobile':'desktop');bench.userData.materials.desk.color.setHex(state.theme==='dark'?0x253849:0xd9d5c9);bench.userData.materials.edge.color.setHex(state.theme==='dark'?0xa48860:0x9b7f51);}
  for(const item of meshes.values()){
   const {node,group,material,faceInk,ink,selection,progress,ledMaterial,shell,parts}=item;group.position.copy(view.positions.get(node.id));const selected=node.id===state.selected,run=node.id===state.run?.nodeId,guide=guideProgress(node,view,now),processing=guide!==null;
   const color=run&&state.run.status==='failed'?0xd56c7d:palette[nodeColor(node)];material.color.setHex(color);material.emissive.setHex(color);material.emissiveIntensity=processing?.18:.025;material.opacity=1;shell.color.setHex(state.theme==='dark'?0xe7e9e8:0xf1eee6);faceInk.color.setHex(0x25455e);ink.color.setHex(palette.ink);
   selection.material.color.setHex(palette[nodeColor(node)]);selection.material.opacity=selected?1:!view.hero&&focus.has(node.id)?.7:0;
   progress.material.color.setHex(palette[nodeColor(node)]);progress.material.opacity=processing?.95:0;progress.scale.x=Math.max(.04,guide??0);progress.position.x=-(1-progress.scale.x)*.59;
   ledMaterial.color.setHex(run&&state.run.status==='failed'?0xe38c99:processing?0x78e2c3:palette[nodeColor(node)]);ledMaterial.opacity=processing?.95:.4;
   if(parts.drawer)parts.drawer.position.z=.08+(processing?Math.sin((guide??0)*Math.PI)*.12:0);updateTextureMode(group,state.liveMode);
  }
  for(const entry of links.values()){
   const edge=entry.edge,visible=routes().some(e=>e.id===edge.id);entry.line.visible=entry.arrow.visible=visible;if(!visible)continue;
   const key=mobile?'mobile':'desktop';let layout=entry.layouts.get(key);if(!layout){const curve=curveFor(edge,view.positions);if(!curve)continue;layout={curve,geometry:new THREE.BufferGeometry().setFromPoints(curve.getPoints(32))};entry.layouts.set(key,layout);if(!entry.line.geometry.attributes.position)entry.line.geometry.dispose();}const{curve}=layout;entry.line.geometry=layout.geometry;
   const isActive=active.has(edge.id),color=isActive?palette[edgeColor(edge)]:palette.edge;entry.material.color.setHex(color);entry.material.opacity=isActive?.9:.28;entry.arrow.material.color.setHex(color);entry.arrow.material.opacity=entry.material.opacity;entry.arrow.position.copy(curve.getPoint(.96));entry.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangent(.96).normalize());
  }
  const packets=packetsFor(view);for(const[kind,item]of moving){const packet=packets.find(p=>p.kind===kind);item.group.visible=Boolean(packet);if(!packet)continue;const travel=travelOf(packet,view,now);if(!travel)continue;item.group.position.copy(travel.point);item.group.position.z=1.14;item.group.scale.setScalar(view.hero?.9:1);item.accent.color.setHex(palette[kind==='reference'?'reference':kind==='data'?'data':'query']);const paperKind=kind==='query'?(packet.role==='result'?'paper-result':packet.role?.includes('formulation')?'paper-model':packet.role?.includes('program')?'paper-code':packet.role?.includes('workflow')?'paper-workflow':packet.role?.includes('classified')?'paper-classified':'paper-query'):'paper-data';if(kind==='query')item.group.traverse(o=>{if(o.userData.textureKind)o.userData.textureKind=paperKind;});updateTextureMode(item.group,state.liveMode);}
  for(const[kind,item]of signals){const request=requestTravels(view,now).find(r=>r.kind===kind);item.group.visible=Boolean(request);if(request){item.group.position.copy(request.point);item.group.position.z=1.1;item.group.rotation.z=Math.atan2(request.direction.y,request.direction.x);item.material.color.setHex(palette[kind]);}}graph.updateMatrixWorld(true);layoutLabels(view,focus);layoutPackets(view,now);
 }
 function labelFor(view,node){
  let label=view.labels.get(node.id);if(label)return label;label=document.createElement('button');label.type='button';label.className=`fw-label fw-label--${node.kind}`;label.dataset.node=node.id;label.tabIndex=view.hero?-1:0;
  label.addEventListener('pointerenter',()=>{state.hover=node.id;requestFrame();});label.addEventListener('pointerleave',()=>{state.hover=null;requestFrame();});label.addEventListener('click',()=>selectNode(node.id));view.labelRoot.append(label);view.labels.set(node.id,label);return label;
 }
 function project(view,p){const q=p.clone().project(view.camera);return{x:view.rect.left+(q.x+1)*view.rect.width/2,y:view.rect.top+(1-q.y)*view.rect.height/2,z:q.z};}
 function inlineText(node){const tools=node.inlineTools||[];return tools.map(v=>typeof v==='string'?v:tr(v.title||v.label||v,state.lang)).filter(Boolean).join(' · ');}
 function layoutLabels(view,focus){
  const candidates=[],live=new Set(),rect=view.rect;
  for(const node of baseNodes()){
   const label=labelFor(view,node),mobile=rect.width<760,main=['query','classification','workflow','model','codegen','solver','solution'].includes(node.id),p=view.positions.get(node.id).clone();if(!mobile||!main)p.y-=1.8;const point=project(view,p);if(mobile&&main)point.x-=100;const name=tr(node.title,state.lang),tools=inlineText(node);
   const content=`<span>${escapeHTML(name)}</span>${tools?`<small>${escapeHTML(tools)}</small>`:''}`;if(label.innerHTML!==content)label.innerHTML=content;
   label.title=tr(node.description,state.lang);label.setAttribute('aria-label',`${name} — ${tr(node.description,state.lang)}`);label.setAttribute('aria-pressed',String(node.id===state.selected));label.classList.toggle('fw-label--selected',node.id===state.selected);label.classList.toggle('fw-label--dim',!view.hero&&!focus.has(node.id));label.classList.toggle('fw-label--run',node.id===state.run?.nodeId);label.dataset.runStatus=node.id===state.run?.nodeId?state.run.status:'';
   label.hidden=false;const maxWidth=Math.max(70,Math.min(rect.width<760?(main?135:156):190,rect.width-20));label.style.maxWidth=`${maxWidth}px`;
   const key=`${state.lang}|${view.hero?'hero':'detail'}|${rect.width<760?'narrow':'wide'}|${maxWidth}|${node.id}|${tools}`;
   candidates.push({id:node.id,label,key,x:point.x,y:point.y});live.add(node.id);
  }
  for(const[id,label]of view.labels)if(!live.has(id))label.hidden=true;
  const measured=candidates.map(p=>({...p,...measureDOMLabel(p.label,view.labelMetrics,p.key)}));
  const iconSize=Math.max(24,rect.height/view.span*2.5);view.iconBoxes=baseNodes().map(n=>({...project(view,view.positions.get(n.id)),width:iconSize,height:iconSize}));const placed=placeDOMLabels(measured,{left:Math.max(0,rect.left),right:Math.min(innerWidth,rect.right),top:Math.max(0,rect.top),bottom:Math.min(innerHeight,rect.bottom)},7,view.iconBoxes);view.captionBoxes=[...placed.values()];
  for(const p of candidates){const box=placed.get(p.id);p.label.hidden=!box;if(box)p.label.style.transform=`translate(${box.x.toFixed(1)}px,${box.y.toFixed(1)}px) translate(-50%,-50%)`;}
 }
 function chipText(packet){return state.run?labelForKind(packet.kind,state.lang):({query:'Q1',data:'D1',reference:'R',artifact:'↗'}[packet.kind]||'');}
 function layoutPackets(view,now){
  const live=new Set(),candidates=[];for(const packet of packetsFor(view)){
   const travel=travelOf(packet,view,now);if(!travel)continue;const key=packet.id;let element=view.packets.get(key);
   if(!element){element=document.createElement('div');element.className=`fw-packet fw-packet--${packet.kind}`;element.setAttribute('aria-hidden','true');view.labelRoot.append(element);view.packets.set(key,element);}
   const point=project(view,travel.point),content=`<i>${packet.kind==='data'?'▦':packet.kind==='reference'?'▥':'▤'}</i><b>${escapeHTML(chipText(packet))}</b>`;if(element.innerHTML!==content)element.innerHTML=content;
   element.dataset.packet=packet.kind;element.dataset.journeyId=packet.id;element.dataset.path=travel.path.join(',');element.dataset.paths=JSON.stringify(packet.paths);element.dataset.sourceX=point.x.toFixed(3);element.dataset.sourceY=point.y.toFixed(3);element.dataset.requesting=String(Boolean(travel.request)||!state.liveMode&&state.flowFrame.requests.some(r=>r.kind===packet.kind));element.title=tr(packet.label,state.lang);element.hidden=false;
   candidates.push({id:key,element,x:point.x+22,y:point.y-29,width:state.run?92:52,height:28});live.add(key);

  }
  for(const [i,requestTrack]of requestTravels(view,now).entries()){const key=`request-${requestTrack.kind}-${i}`;let element=view.packets.get(key);if(!element){element=document.createElement('div');element.className=`fw-request fw-request--${requestTrack.kind}`;element.setAttribute('aria-hidden','true');view.labelRoot.append(element);view.packets.set(key,element);}const p=project(view,requestTrack.point);element.textContent=state.lang==='zh'?(requestTrack.role==='runtime-read'?'完整 CSV':requestTrack.kind==='data'?'读取数据':'检索示例'):(requestTrack.role==='runtime-read'?'Complete CSVs':requestTrack.kind==='data'?'Read data':'Retrieve');element.hidden=false;candidates.push({id:key,element,x:p.x,y:p.y-16,width:state.lang==='en'?96:70,height:24});live.add(key);}
  const r=view.rect,placed=placeDOMLabels(candidates,{left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)},5,[...(view.captionBoxes||[]),...(view.iconBoxes||[])]);
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
  state.flowFrame=sampleTeachingCycle(state.flowElapsed);notifyFlow();labelLayer.dataset.theme=state.theme;system.dataset.theme=state.theme;
  if(fallback){system.hidden=true;for(const view of views)renderFallback(view,now);if(visible&&isAnimating())requestFrame();return;}
  if(renderer.domElement.width!==Math.round(innerWidth*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(innerHeight*renderer.getPixelRatio()))renderer.setSize(innerWidth,innerHeight,false);
  renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);let settling=false;
  for(const view of views){view.labelRoot.hidden=!view.visible;if(!view.visible)continue;const previous=view.span,target=view.target.clone();pose(view,dt||.016,now);settling||=Math.abs(previous-view.span)>.0005||target.distanceTo(view.target)>.0005;const r=view.rect,top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(left,innerHeight-bottom,right-left,bottom-top);renderer.render(scene,view.camera);}
  renderer.setScissorTest(false);if(dt>.034&&visible)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);if(slowFrames>80&&quality>1){quality=1;renderer.setPixelRatio(1);slowFrames=0;}if(visible&&(isAnimating()||settling))requestFrame();
 }
 function pick(view,event){if(fallback||!view.rect||event.target.closest?.('.fw-label'))return null;pose(view,.016,performance.now());const r=view.rect;pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,view.camera);return raycaster.intersectObjects(hitTargets,false)[0]?.object.userData.nodeId||null;}
 for(const view of views){let drag=null;
  const down=e=>{if(view.hero||!state.free)return;drag={x:e.clientX,y:e.clientY,moved:0};view.host.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);view.pan.x=clamp(view.pan.x-dx/view.rect.height*view.span,-4,4);view.pan.y=clamp(view.pan.y+dy/view.rect.height*view.span,-4,4);drag.x=e.clientX;drag.y=e.clientY;requestFrame();return;}const hit=pick(view,e);if(hit!==state.hover){state.hover=hit;view.host.classList.toggle('fw-host--hover',Boolean(hit));requestFrame();}};
  const up=e=>{const moved=drag?.moved||0;drag=null;if(moved>5)return;const id=pick(view,e);if(id)selectNode(id);};const leave=()=>{drag=null;state.hover=null;view.host.classList.remove('fw-host--hover');requestFrame();};
  for(const[name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointerleave',leave],['pointercancel',leave]]){view.host.addEventListener(name,fn);cleanup.push(()=>view.host.removeEventListener(name,fn));}
 }
 function svgIcon(icon){
  const shell='fill="var(--fw-shell)" stroke="var(--fw-metal)" stroke-width="1.3"',metal='fill="var(--fw-metal)"',paper='fill="var(--fw-paper)" stroke="#bdc4c5" stroke-width=".8"',screen='fill="var(--fw-screen)"',accent='fill="currentColor"',line='fill="none" stroke="var(--fw-screen-ink)" stroke-width="1.7" stroke-linecap="round"',base='<path fill="var(--fw-desk-edge)" d="M-40 26H36L41 32H-35Z"/><path fill="var(--fw-desk)" stroke="var(--fw-metal)" stroke-width=".7" d="M-40 20H36V27H-40Z"/>';
  if(icon==='query')return `${base}<path ${accent} d="M-31 11L25 6L34 14V27H-31Z"/><path fill="var(--fw-screen)" d="M-26 9H25V15H-26Z"/><path ${paper} d="M-22-33L13-38L27-26L30 12L-16 17Z"/><path fill="#e3e5dc" d="M13-38L14-25L27-26Z"/><path stroke="#718da1" stroke-width="2" d="M-14-18L14-21M-13-10L17-13M-12-2L12-5"/><rect ${accent} x="-14" y="3" width="18" height="5" rx="2"/>`;
  if(icon==='classification')return `${base}<path fill="var(--fw-metal)" d="M-36-24L-27-31H31L38-23V22H-36Z"/><rect ${shell} x="-36" y="-27" width="68" height="53" rx="8"/><rect ${screen} x="-29" y="-19" width="54" height="31" rx="4"/><path ${line} d="M-23-12H18"/><text fill="#a8d9f4" x="-21" y="5" font-family="monospace" font-size="15" font-weight="600">${state.liveMode?'TYPE':'TP'}</text><rect ${screen} x="-27" y="16" width="51" height="4" rx="2"/><path ${paper} d="M-22 17L-5 15L-2 30L-19 31Z"/><rect ${accent} x="18" y="-24" width="7" height="3" rx="1"/>`;
  if(icon==='workflow')return `${base}<path ${metal} d="M-3 11H5V26H-3Z"/><path fill="var(--fw-metal)" d="M-37-29L-29-34H37V15H-37Z"/><rect ${shell} x="-37" y="-31" width="70" height="48" rx="6"/><rect ${screen} x="-31" y="-25" width="58" height="35" rx="3"/><path ${line} d="M-18-7H-6M3-7H14"/>${[-24,-5,14].map((x,i)=>`<rect fill="${['#74cdb4','#8cc7ed','#c2a6e6'][i]}" x="${x}" y="-16" width="14" height="17" rx="2"/>`).join('')}<path fill="var(--fw-shell)" stroke="var(--fw-metal)" d="M-30 22H28L34 32H-25Z"/><path stroke="var(--fw-metal)" stroke-width="2" d="M-20 26H23M-16 30H27"/>`;
  if(icon==='model')return `${base}<path ${metal} d="M-36-30L-28-36H37V18H-36Z"/><rect ${shell} x="-36" y="-32" width="69" height="50" rx="5"/><rect ${screen} x="-31" y="-26" width="59" height="37" rx="2"/><text fill="#a8d9f4" x="-25" y="-11" font-family="monospace" font-size="9">${state.liveMode?'MODEL / PLAN':'min Σ cᵢⱼ xᵢⱼ'}</text><path ${line} d="M-24-4H19M-24 3H10"/><path ${paper} d="M-2 16L28 13L33 30L0 32Z"/><path stroke="#9caeb6" d="M5 20L25 18M6 25L27 23"/><path stroke="#c5a26b" stroke-width="3" d="M-29 27L-7 23"/>`;
  if(icon==='code')return `${base}<path ${metal} d="M-36-27L-28-34H37V17H-36Z"/><rect ${shell} x="-36" y="-29" width="68" height="48" rx="7"/><rect ${screen} x="-30" y="-23" width="56" height="35" rx="3"/><path stroke="#b6a0df" stroke-width="2" d="M-23-15H8"/><path stroke="#81c1de" stroke-width="2" d="M-23-8H18M-23-1H12"/><path stroke="#73cfb0" stroke-width="2" d="M-23 6H16"/><path ${metal} d="M-4 19H5V27H-4Z"/><path fill="var(--fw-shell)" stroke="var(--fw-metal)" d="M-29 24H29L34 33H-25Z"/><path stroke="var(--fw-metal)" stroke-width="2" d="M-20 28H23"/>`;
  if(icon==='solver')return `${base}<path fill="var(--fw-metal)" d="M-27-35L-19-41H30L34-34V33H-27Z"/><rect ${shell} x="-27" y="-36" width="55" height="69" rx="6"/><rect ${screen} x="-21" y="-28" width="43" height="27" rx="3"/><path stroke="#6ed2ae" stroke-width="2" fill="none" d="M-17-8L-9-12L-1-13L7-21L17-21"/>${[7,12,17,22].map(y=>`<rect ${metal} x="-18" y="${y}" width="28" height="2" rx="1"/>`).join('')}<rect ${accent} x="16" y="8" width="4" height="17" rx="2"/><circle fill="#88d7ae" cx="18" cy="29" r="2.5"/><path ${metal} d="M-22 34H-12V39H-22ZM12 34H22V39H12Z"/>`;
  if(icon==='result')return `${base}<path ${accent} d="M-25-33H25V28H-25Z"/><path ${paper} d="M-21-29H21V23H-21Z"/><rect fill="#c4a875" x="-9" y="-37" width="18" height="8" rx="2"/><path stroke="#8ca1ae" stroke-width="1.5" d="M-14-18H13M-14-11H7"/><path fill="currentColor" d="M-13 15V4H-7V15ZM-3 15V-3H3V15ZM7 15V-8H13V15Z"/><path stroke="#456174" d="M-16-4V18H16"/>`;
  if(icon==='references')return `${base}<path fill="#705b4c" stroke="#a08b6c" d="M-34-39L-25-44H36V35H-34Z"/><rect fill="#8b7056" stroke="#b09876" x="-34" y="-40" width="65" height="76" rx="4"/><rect fill="#2b3540" x="-28" y="-34" width="53" height="59"/>${[0,1].map(row=>Array.from({length:6},(_,i)=>`<rect fill="${['#c2a5e7','#e4d9bd','#718d9c'][i%3]}" x="${-24+i*8}" y="${-30+row*29}" width="6" height="23" rx="1"/><path stroke="#c4a875" d="M${-23+i*8} ${-21+row*29}H${-20+i*8}"/>`).join('')).join('')}<path stroke="#a98a61" stroke-width="3" d="M-29-3H27M-29 25H27"/><rect fill="#8b7056" stroke="#b09876" x="-30" y="27" width="59" height="12" rx="2"/><rect fill="#c4a875" x="-7" y="31" width="15" height="3" rx="1"/>`;
  if(icon==='csv')return `${base}${[0,1,2].map(i=>`<path fill="${i===2?'currentColor':'var(--fw-metal)'}" d="M-33 ${15-i*6}H30V${25-i*6}H-33Z"/><path ${paper} d="M${-25+i*6} ${-28-i*3}L${14+i*5} ${-34-i*2}L${26+i*3} ${7-i*3}L${-18+i*5} ${15-i*3}Z"/>`).join('')}<path fill="none" stroke="#63aa95" stroke-width="1.2" d="M-3-22L22-25M-1-14L24-17M1-6L26-9M5-25L10 3M14-27L19 1"/><rect ${accent} x="11" y="-37" width="14" height="6" rx="1"/>`;
  return `${base}<rect ${shell} x="-31" y="-6" width="60" height="32" rx="5"/><rect ${screen} x="-25" y="0" width="48" height="20" rx="2"/><path stroke="#68bda3" d="M-19 6H17M-19 12H17M-9 3V17M3 3V17"/><path ${metal} d="M-26-4H-21V-35H12V-30H-21V-4Z"/><rect ${accent} x="6" y="-35" width="18" height="9" rx="3"/><ellipse ${screen} cx="15" cy="-24" rx="5" ry="3"/>`;
 }
 function renderFallback(view,now=performance.now()){
  view.labelRoot.hidden=true;view.rect=rectFor(view.host);view.visible=view.rect.bottom>0&&view.rect.top<innerHeight&&view.rect.right>0&&view.rect.left<innerWidth;
  let holder=view.fallback;if(!holder){holder=document.createElement('div');holder.className='fw-fallback';view.host.append(holder);view.fallback=holder;holder.addEventListener('click',e=>{const id=e.target.closest('[data-node]')?.dataset.node;if(id)selectNode(id);});holder.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const id=e.target.closest('[data-node]')?.dataset.node;if(id){e.preventDefault();selectNode(id);}}});}
  const phase=animationFraction(view,now),signature=JSON.stringify([view.host.clientWidth,view.host.clientHeight,state.lang,state.theme,state.route,view.hero?0:state.stage,state.flowFrame.stepId,state.liveMode,state.selected,state.run?.nodeId,state.run?.status,view.hero?1:state.zoom,state.flowPlaying,view.pan.x,view.pan.y,Math.round(phase*90)]);
  if(view.fallbackSignature===signature)return;view.fallbackSignature=signature;view.positions=positionsFor(view);
  const mobile=view.host.clientWidth<760,width=Math.max(260,view.rect.width),height=Math.max(320,view.rect.height),positions=view.positions;
  const xs=[...positions.values()].map(p=>p.x),ys=[...positions.values()].map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((width-(mobile?150:220))/(maxX-minX||1),(height-170)/(maxY-minY||1)),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const map=p=>({x:width/2+(p.x-cx)*scale,y:height/2-(p.y-cy)*scale});const point=id=>map(positions.get(id));
  const zoom=viewZoom(view),viewWidth=width/zoom,viewHeight=height/zoom;let panX=view.pan.x*scale,panY=-view.pan.y*scale;
  const focus=stageFocus(view),active=activeLinkIds(view),suffix=view.hero?'h':'d';
  if(!view.hero){const targets=[...focus].filter(id=>positions.has(id)).map(point);if(targets.length){panX+=(targets.reduce((n,p)=>n+p.x,0)/targets.length-width/2)*.055;panY+=(targets.reduce((n,p)=>n+p.y,0)/targets.length-height/2)*.055;}}
  const svgBounds={left:(width-viewWidth)/2+panX,top:(height-viewHeight)/2+panY,right:(width+viewWidth)/2+panX,bottom:(height+viewHeight)/2+panY};
  const stationMarkup=STATIONS.map(station=>{const points=station.nodes.filter(id=>positions.has(id)).map(point);if(!points.length)return'';const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-47,y=Math.min(...ys)-40,w=Math.max(...xs)-Math.min(...xs)+94,h=Math.max(...ys)-Math.min(...ys)+88;return `<g class="fw-fallback-station" data-station="${station.id}" data-nodes="${station.nodes.join(',')}"><rect class="fw-station-side" x="${x+3}" y="${y+5}" width="${w}" height="${h}" rx="12"/><rect class="fw-station-top" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/></g>`;}).join('');
  const edgeMarkup=routes().map(edge=>{const curve=curveFor(edge,positions),a=map(curve.v0),b=map(curve.v1),c=map(curve.v2),d=map(curve.v3),kind=edgeColor(edge),selected=active.has(edge.id);return `<path class="fw-fallback-edge${selected?' fw-fallback-edge--active':''}" data-edge="${escapeHTML(edge.id)}" data-kind="${kind}" d="M${a.x.toFixed(2)} ${a.y.toFixed(2)}C${b.x.toFixed(2)} ${b.y.toFixed(2)},${c.x.toFixed(2)} ${c.y.toFixed(2)},${d.x.toFixed(2)} ${d.y.toFixed(2)}" marker-end="url(#fw-arrow-${kind}-${suffix})"/>`;}).join('');
  const iconFactor=clamp(scale/38,.5,1.4),fontSize=mobile?14:13,labels=layoutFallbackLabels(baseNodes().map(node=>{const p=point(node.id),main=['query','classification','workflow','model','codegen','solver','solution'].includes(node.id);return{id:node.id,text:tr(node.title,state.lang),kind:node.kind,level:0,x:p.x,y:p.y,nodeWidth:82*iconFactor,nodeHeight:88*iconFactor,maxWidth:mobile&&main?125:180,preferredX:mobile&&main?p.x-166:undefined,preferredY:mobile&&main?p.y-23:p.y+44*iconFactor+8};}),width,height,fontSize,svgBounds);
  const nodes=baseNodes().map(node=>{
   const portAttrs=['query','data','reference'].map(kind=>{const port=map(portAt(node.id,kind,positions));return `data-${kind}-port-x="${port.x.toFixed(3)}" data-${kind}-port-y="${port.y.toFixed(3)}"`;}).join(' ');
   const p=point(node.id),label=labels.get(node.id),selected=node.id===state.selected,working=node.id===state.run?.nodeId,tools=inlineText(node),kind=nodeColor(node),iconScale=iconFactor*(node.kind==='agent'?1.06:node.id==='csvqa'?.68:node.id==='solution'?.76:node.id==='csv'?.84:.92);
   const guideValue=guideProgress(node,view,now),guide=guideValue!==null;
   const caption=`<rect class="fw-fallback-caption" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="4"/><text class="fw-fallback-name" text-anchor="middle" style="font-size:${fontSize}px">${label.lines.map((line,i)=>`<tspan x="${label.x+label.width/2}" y="${label.y+fontSize+4+i*(fontSize+3)}">${escapeHTML(line)}</tspan>`).join('')}</text>${tools?`<text class="fw-fallback-tool" x="${p.x}" y="${label.y+label.height+12}" text-anchor="middle">${escapeHTML(tools)}</text>`:''}`;
   return `<g class="fw-fallback-node${selected?' fw-fallback-node--selected':''}${working?' fw-fallback-node--run':''}${guide?' fw-fallback-node--guide':''}" data-node="${node.id}" ${portAttrs} data-x="${p.x.toFixed(3)}" data-y="${p.y.toFixed(3)}" data-icon="${iconOf(node)}" data-station-owner="${STATIONS.find(station=>station.nodes.includes(node.id))?.id||node.id}" data-kind="${kind}" data-focused="${view.hero||focus.has(node.id)}" data-run-status="${working?state.run.status:''}" role="button" tabindex="${view.hero?-1:0}" aria-pressed="${selected}" aria-label="${escapeHTML(tr(node.title,state.lang))}"><title>${escapeHTML(tr(node.description,state.lang))}</title><g transform="translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) scale(${iconScale})"><g class="fw-fallback-depth" transform="translate(3 4)">${svgIcon(iconOf(node))}</g>${svgIcon(iconOf(node))}<path class="fw-fallback-selection" d="M-22 36H${guide?-22+44*Math.max(.08,guideValue):22}"/></g>${caption}</g>`;
  }).join('');
  const packetItems=[],packetReserved=[...labels.values()].map(p=>({x:p.x+p.width/2,y:p.y+p.height/2,width:p.width,height:p.height}));
  for(const n of baseNodes()){const p=point(n.id);packetReserved.push({...p,width:82*iconFactor,height:88*iconFactor});}
  for(const packet of packetsFor(view)){const travel=travelOf(packet,view,now);if(!travel)continue;const p=map(travel.point);packetItems.push({id:packet.id,packet,travel,source:p,x:p.x+22,y:p.y-29,width:state.run?92:52,height:28});}
  for(const [i,request]of requestTravels(view,now).entries()){const p=map(request.point);packetItems.push({id:`request-${request.kind}-${i}`,packet:request,request:true,source:p,x:p.x,y:p.y-17,width:state.lang==='en'?112:76,height:25});}
  const packetBoxes=placeDOMLabels(packetItems,svgBounds,5,packetReserved);
  const packetMarkup=packetItems.map(item=>{
   const box=packetBoxes.get(item.id);if(!box)return'';const packet=item.packet,x=box.x-box.width/2,y=box.y-box.height/2;
   if(item.request){const label=state.lang==='zh'?(packet.kind==='data'?'读取请求':'检索请求'):(packet.kind==='data'?'Data request':'Retrieval request');return `<g class="fw-fallback-request" data-request="${packet.kind}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><rect width="${box.width}" height="${box.height}" rx="12"/><text text-anchor="middle" x="${box.width/2}" y="16">${escapeHTML(label)}</text></g>`;}
   return `<g class="fw-fallback-packet" data-packet="${packet.kind}" data-journey-id="${escapeHTML(packet.id)}" data-source-x="${item.source.x.toFixed(3)}" data-source-y="${item.source.y.toFixed(3)}" data-requesting="${Boolean(item.travel.request)||!state.liveMode&&state.flowFrame.requests.some(r=>r.kind===packet.kind)}" data-path="${escapeHTML(item.travel.path.join(','))}" data-paths="${escapeHTML(JSON.stringify(packet.paths))}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><title>${escapeHTML(tr(packet.label,state.lang))}</title><rect width="${box.width}" height="${box.height}" rx="5"/><path class="fw-packet-glyph" d="${packet.kind==='data'?'M7 6H20V22H7ZM7 11H20M7 16H20M13 6V22':'M8 5H16L21 10V23H8ZM16 5V10H21M11 14H18M11 18H18'}"/><text x="27" y="19" class="fw-packet-text">${escapeHTML(chipText(packet))}</text></g>`;
  }).join('');
  const markers=['query','data','reference','output'].map(kind=>`<marker id="fw-arrow-${kind}-${suffix}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1L6 4L1 7" fill="none" stroke="var(--fw-${kind})" stroke-width="1.4"/></marker>`).join('');
  holder.dataset.theme=state.theme;holder.dataset.flowStep=state.liveMode?(state.run?`live-${state.run.nodeId}`:'live-waiting'):state.flowFrame.stepId;holder.dataset.live=String(state.liveMode);holder.innerHTML=`<svg viewBox="${(width-viewWidth)/2+panX} ${(height-viewHeight)/2+panY} ${viewWidth} ${viewHeight}" role="group" aria-label="${state.lang==='zh'?'LEAN 优化建模流程与数据流':'LEAN optimization workflow and data flow'}"><defs>${markers}</defs>${stationMarkup}${edgeMarkup}${nodes}${packetMarkup}</svg>`;
 }
 const lost=event=>{event.preventDefault();if(disposed)return;fallback=true;system.hidden=true;views.forEach(v=>{v.fallbackSignature=null;renderFallback(v);});requestFrame();};canvas.addEventListener('webglcontextlost',lost);cleanup.push(()=>canvas.removeEventListener('webglcontextlost',lost));
 const resizeObserver=new ResizeObserver(requestFrame);views.forEach(v=>resizeObserver.observe(v.host));const intersection=new IntersectionObserver(requestFrame,{rootMargin:'100px'});views.forEach(v=>intersection.observe(v.host));
 const fontsChanged=()=>{if(disposed)return;views.forEach(v=>v.labelMetrics.clear());requestFrame();};if(document.fonts){document.fonts.ready?.then(fontsChanged);document.fonts.addEventListener?.('loadingdone',fontsChanged);cleanup.push(()=>document.fonts.removeEventListener?.('loadingdone',fontsChanged));}
 const scroll=()=>requestFrame(),visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else requestFrame();};addEventListener('scroll',scroll,{passive:true});addEventListener('resize',requestFrame);document.addEventListener('visibilitychange',visibility);cleanup.push(()=>removeEventListener('scroll',scroll),()=>removeEventListener('resize',requestFrame),()=>document.removeEventListener('visibilitychange',visibility));
 function changeStage(index,notify=false){index=Math.round(clamp(Number(index)||0,0,STAGES.length-1));const changed=index!==state.stage;state.stage=index;state.progress=index/Math.max(1,STAGES.length-1);state.selected=null;if(changed){views.forEach(v=>v.pan.set(0,0));}if(changed&&notify)onStageChange(index);requestFrame();}
 function selectNode(id){const node=NODE_BY_ID.get(id);if(!node||!BASE_IDS.has(id)||node.level!==0)return;changeStage(node.stage);state.selected=id;holdUntil=performance.now()+1200;onStageChange(state.stage);onNodeSelect(id,node);requestFrame();}
 const api={
  setProgress(progress){const value=clamp(Number(progress)||0);state.progress=value;if(performance.now()>holdUntil){const index=Math.round(value*(STAGES.length-1));if(index!==state.stage)changeStage(index,true);}requestFrame();},
  setStage(index){changeStage(index);},selectNode,
  back(){if(state.selected){state.selected=null;onNodeSelect(null,null);requestFrame();}else changeStage(0,true);},
  setRoute(route){if(!['tailored','agnostic'].includes(route))return;state.route=route;requestFrame();},
  setRunState(event){if(!event){state.run=null;state.runEvent=null;state.liveElapsed=0;state.visited.clear();state.runId=null;state.lastDataAt='csv';notifyFlow();requestFrame();return;}const runId=event.run_id||event.runId,newRunId=Boolean(runId&&runId!==state.runId);if(newRunId||event.stage==='run'&&['started','queued'].includes(event.type)){state.visited.clear();state.lastDataAt='csv';if(runId)state.runId=runId;}const mapped=resolveRunEvent(event,state.run||{route:state.route});if(!mapped)return;const changed=newRunId||mapped.stage!==state.stage||mapped.nodeId!==state.run?.nodeId||mapped.route&&mapped.route!==state.route;if(mapped.route)state.route=mapped.route;if(mapped.nodeId!==state.run?.nodeId||mapped.status==='running'&&state.run?.status!=='running')state.liveElapsed=0;state.run=mapped;state.runEvent=event;state.liveMode=true;state.visited.add(mapped.nodeId);if(['csvqa','model','codegen','solver'].includes(mapped.nodeId))state.lastDataAt=mapped.nodeId==='codegen'?'model':mapped.nodeId;if(event.payload?.result?.execution)state.visited.add('solver');if(changed){state.stage=clamp(mapped.stage,0,STAGES.length-1);state.progress=state.stage/Math.max(1,STAGES.length-1);state.selected=null;onStageChange(state.stage,{route:state.route,runState:mapped});}notifyFlow();requestFrame();},
  setFlowPlaying(value){value=Boolean(value);if(value===state.flowPlaying)return;state.flowPlaying=value;last=0;notifyFlow(true);requestFrame();},
  getFlowState(){return flowSnapshot();},
  restartFlow(){state.flowElapsed=0;state.flowFrame=sampleTeachingCycle(0);state.flowPlaying=true;last=0;notifyFlow(true);requestFrame();},
  seekFlow(progress){state.flowElapsed=clamp(Number(progress)||0)*Math.max(0,TEACHING_CYCLE.durationMs-.001);state.flowFrame=sampleTeachingCycle(state.flowElapsed);last=0;notifyFlow(true);requestFrame();},
  setLiveMode(value){value=Boolean(value);if(value===state.liveMode)return;state.liveMode=value;if(!state.liveMode){state.run=null;state.runEvent=null;state.liveElapsed=0;state.visited.clear();state.runId=null;state.lastDataAt='csv';}last=0;notifyFlow(true);requestFrame();},
  setLanguage(lang){state.lang=lang==='en'?'en':'zh';notifyFlow(true);requestFrame();},setTheme(theme){state.theme=theme==='light'?'light':'dark';requestFrame();},
  setReduced(value){value=Boolean(value);if(value===state.reduced)return;state.reduced=value;last=0;views.forEach(v=>v.initialized=false);notifyFlow(true);requestFrame();},
  setFree(value){state.free=Boolean(value);detailHost.classList.toggle('fw-host--free',state.free);requestFrame();},
  zoomBy(factor){factor=Number(factor);if(Number.isFinite(factor)&&factor>0){state.zoom=clamp(state.zoom*factor,.7,1.6);requestFrame();}return state.zoom;},
  resetCamera(){state.zoom=1;state.free=false;for(const v of views){v.pan.set(0,0);v.initialized=false;}detailHost.classList.remove('fw-host--free');requestFrame();},
  dispose(){disposed=true;cancelAnimationFrame(raf);resizeObserver.disconnect();intersection.disconnect();cleanup.forEach(fn=>fn());for(const entry of links.values())for(const layout of entry.layouts.values())layout.geometry.dispose();scene?.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});for(const map of textureCache.values())map.dispose();renderer?.dispose();system.remove();labelLayer.remove();views.forEach(v=>{v.fallback?.remove();v.host.classList.remove('fw-host','fw-host--hover','fw-host--free');});}
 };
 requestFrame();return api;
}

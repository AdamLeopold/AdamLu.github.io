/** Abstract role components; scene, labels, camera, and flow belong to the renderer. */
const PROFILE_DEFINITIONS={
  query:{name:'abstract-message-capsule',width:1.578919,height:1.753539,depth:.977127,minZ:-.201041,maxZ:.776086},
  classification:{name:'abstract-classification-prism-fork',width:2.225872,height:2.217729,depth:.924818,minZ:.006468,maxZ:.931286},
  workflow:{name:'abstract-workflow-orbit-graph',width:1.823339,height:1.705673,depth:1.218606,minZ:-.115400,maxZ:1.103206},
  model:{name:'abstract-constraint-lattice',width:2.007175,height:1.803326,depth:1.674586,minZ:-.181911,maxZ:1.492675},
  code:{name:'abstract-code-bracket-strands',width:1.771733,height:1.497540,depth:1.252062,minZ:-.187382,maxZ:1.064680},
  solver:{name:'abstract-solver-concentric-core',width:1.703148,height:1.649045,depth:1.227570,minZ:-.204379,maxZ:1.023191},
  result:{name:'abstract-output-convergence',width:1.747198,height:1.321519,depth:.955460,minZ:-.028126,maxZ:.927334},
  references:{name:'abstract-reference-knowledge-rings',width:1.687884,height:1.505251,depth:1.410507,minZ:-.298535,maxZ:1.111972},
  csv:{name:'abstract-csv-matrix-voxels',width:1.240486,height:1.228740,depth:1.037534,minZ:-.229878,maxZ:.807656},
  'data-access':{name:'abstract-data-access-slice',width:1.241482,height:1.115504,depth:.913719,minZ:-.077561,maxZ:.836158},
};
const aliases={codegen:'code',solution:'result',csvqa:'data-access'};
export const OBJECT_PROFILES=Object.freeze(Object.fromEntries([
  ...Object.entries(PROFILE_DEFINITIONS).map(([id,profile])=>[id,Object.freeze(profile)]),
  ...Object.entries(aliases).map(([id,key])=>[id,Object.freeze(PROFILE_DEFINITIONS[key])]),
]));
const iconFor=node=>node.icon||aliases[node.id]||node.id;
const colorRole=node=>node.id==='query'?'query':['csv','csvqa'].includes(node.id)?'data':node.id==='references'?'reference':node.id==='solution'?'output':node.id==='codegen'?'code':node.id==='solver'?'solver':'agent';

/** Detached geometry and the existing material/activity contract consumed by pose(). */
export function buildFrameworkObject(node,{THREE,palette,helpers}={}){
  if(!THREE)throw new TypeError('Three is required');
  const colors=palette?.dark||palette||{},color=colors[colorRole(node)]??0x84bff0;
  const group=new THREE.Group(),icon=iconFor(node),parts={};group.userData.nodeId=node.id;group.userData.objectProfile=OBJECT_PROFILES[icon]?.name||icon;
  const material=new THREE.MeshPhysicalMaterial({color,roughness:.22,metalness:.35,clearcoat:.65,emissive:color,emissiveIntensity:.025,transparent:true});
  const shell=new THREE.MeshPhysicalMaterial({color:0xcddde8,roughness:.2,metalness:.3,clearcoat:.8,transparent:true});
  const metal=new THREE.MeshStandardMaterial({color:0x8ba6ba,roughness:.24,metalness:.8,transparent:true});
  const dark=new THREE.MeshStandardMaterial({color:0x163349,roughness:.4,metalness:.3,transparent:true});
  const warm=new THREE.MeshStandardMaterial({color:0xd4b77c,roughness:.28,metalness:.62,transparent:true});
  const mint=new THREE.MeshPhysicalMaterial({color:0x72cbb2,roughness:.22,metalness:.2,clearcoat:.7});
  const violet=new THREE.MeshPhysicalMaterial({color:0xad94d8,roughness:.2,metalness:.22,clearcoat:.7});
  const glass=new THREE.MeshPhysicalMaterial({color,roughness:.12,metalness:.08,clearcoat:1,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false});
  const faceInk=new THREE.MeshBasicMaterial({color:0x25455e,transparent:true});
  const ink=new THREE.MeshBasicMaterial({color:colors.ink??0xdbeafa,transparent:true});

  function rod(a,b,mat=material,r=.035,parent=group){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),mat);mesh.position.copy(av.add(bv).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh);return mesh;}
  function path(points,mat=material,r=.045,closed=false){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal'),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,points.length*9),r,8,closed),mat);group.add(mesh);return mesh;}
  function cube(x,y,z,size,mat=material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(size,size,size),mat);mesh.position.set(x,y,z);mesh.rotation.set(.08,-.09,.05);group.add(mesh);return mesh;}
  function arc(cx,cy,z,rx,ry,start,end,mat=material,r=.035,tilt=.0){const points=[];for(let i=0;i<=44;i++){const a=start+(end-start)*i/44;points.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,z+Math.sin(a)*tilt]);}return path(points,mat,r);}
  function prism(points,depth,mat,z=.25){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,bevelThickness:.035,bevelSize:.035,steps:1}),mat);mesh.position.z=z;group.add(mesh);return mesh;}
  function tip(x,y,z,dx,dy,mat=material,size=.14){const mesh=new THREE.Mesh(new THREE.ConeGeometry(size*.55,size,4),mat);mesh.position.set(x,y,z);mesh.rotation.z=-Math.atan2(dx,dy);group.add(mesh);return mesh;}
  function ring(r,z,mat=material,tube=.036){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,tube,10,52),mat);mesh.position.z=z;group.add(mesh);return mesh;}
  function plane(w,h,z,angle,mat=glass){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.025),mat);mesh.position.z=z;mesh.rotation.z=angle;group.add(mesh);return mesh;}

  if(icon==='query'){
    // A single translucent message volume carries three abstract language strokes.
    const s=new THREE.Shape();s.moveTo(-.75,-.38);s.lineTo(-.75,.48);s.quadraticCurveTo(-.75,.76,-.47,.76);s.lineTo(.47,.76);s.quadraticCurveTo(.75,.76,.75,.48);s.lineTo(.75,-.38);s.quadraticCurveTo(.75,-.62,.5,-.62);s.lineTo(-.15,-.62);s.lineTo(-.51,-.87);s.lineTo(-.47,-.62);s.quadraticCurveTo(-.75,-.62,-.75,-.38);
    const geometry=new THREE.ExtrudeGeometry(s,{depth:.34,bevelEnabled:true,bevelSegments:3,bevelSize:.045,bevelThickness:.045,steps:1}),body=new THREE.Mesh(geometry,glass);body.position.z=.15;group.add(body);
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,24),new THREE.LineBasicMaterial({color,transparent:true,opacity:.85}));outline.position.z=.15;group.add(outline);
    for(const[y,w]of[[.32,.82],[.03,.94],[-.26,.57]])rod([-.47,y,.56],[-.47+w,y,.56],material,.033);
    parts.messageVolume=body;
  }else if(icon==='classification'){
    // A prism separates an incoming channel into two typed geometric outputs.
    path([[0,1.0,.25],[0,.61,.28],[0,.25,.42]],material,.065);
    const splitter=prism([[-.39,.3],[0,-.34],[.39,.3]],.45,glass,.2);parts.splitter=splitter;
    path([[0,.15,.48],[-.34,-.16,.51],[-.78,-.58,.54]],mint,.067);
    path([[0,.15,.48],[.34,-.16,.51],[.78,-.58,.54]],violet,.067);
    cube(-.83,-.63,.52,.31,mint);const typed=new THREE.Mesh(new THREE.OctahedronGeometry(.23,0),violet);typed.position.set(.83,-.63,.52);group.add(typed);
    const input=new THREE.Mesh(new THREE.SphereGeometry(.105,14,10),shell);input.position.set(0,1.02,.25);group.add(input);
    rod([-.39,.3,.69],[0,-.34,.69],metal,.022);rod([0,-.34,.69],[.39,.3,.69],metal,.022);rod([-.39,.3,.69],[.39,.3,.69],metal,.022);
  }else if(icon==='workflow'){
    // An elliptical graph orbit and a cross-branch describe an ordered workflow.
    const points=[[-.79,.26,.36],[-.12,.72,.58],[.72,.32,.72],[.51,-.51,.5],[-.5,-.56,.25]];
    path(points,material,.04,true);path([points[0],[.06,.02,.76],points[3]],warm,.035);
    points.forEach(([x,y,z],i)=>{const n=cube(x,y,z,.22,i===0?mint:i===3?violet:shell);n.rotation.z=i*.3;});
    const junction=new THREE.Mesh(new THREE.OctahedronGeometry(.13,0),warm);junction.position.set(.06,.02,.76);group.add(junction);
    tip(.36,.63,.68,1,-.3,material,.16);tip(.68,-.18,.6,-.2,-1,material,.16);
    parts.workflowOrbit=group.children[0];
  }else if(icon==='model'){
    // A variable lattice is intersected by two constraint planes; no backing panel.
    const nodes=[];for(const z of[.16,.88])for(const y of[-.57,.57])for(const x of[-.65,.65])nodes.push([x,y,z]);
    for(let layer=0;layer<2;layer++){const o=layer*4;for(const[a,b]of[[0,1],[0,2],[1,3],[2,3]])rod(nodes[o+a],nodes[o+b],metal,.022);}for(let i=0;i<4;i++)rod(nodes[i],nodes[i+4],metal,.022);
    nodes.forEach(([x,y,z],i)=>cube(x,y,z,.14,i%3===0?warm:i%3===1?material:mint));
    rod(nodes[0],nodes[7],material,.021);rod(nodes[2],nodes[5],material,.021);
    const c1=plane(1.62,1.22,.4,.27,glass),g2=new THREE.MeshPhysicalMaterial({color:0xb899d2,roughness:.14,metalness:.08,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,clearcoat:.8}),c2=plane(1.48,1.33,.7,-.34,g2);c1.rotation.y=.22;c2.rotation.x=.18;
    path([[.12,.66,1.01],[.5,.85,1.01],[.87,.85,1.01]],warm,.033);tip(.92,.85,1.01,1,0,warm,.15);
    parts.constraintPlanes=[c1,c2];
  }else if(icon==='code'){
    // Parallel metallic bracket strands express code construction directly.
    for(let i=0;i<3;i++){const z=.17+i*.28,shift=(i-1)*.055,mat=i===1?material:i===0?metal:violet;
      path([[-.25,.72+shift,z],[-.81,.02+shift,z+.04],[-.25,-.68+shift,z]],mat,.06);
      path([[.25,.72+shift,z],[.81,.02+shift,z+.04],[.25,-.68+shift,z]],mat,.06);
    }
    rod([-.12,-.59,.94],[.16,.63,.94],warm,.038);parts.codeStrands=group.children.slice(0,6);
  }else if(icon==='solver'){
    // A compact concentric compute core, with radial segments and a glass center.
    const outer=ring(.82,.3,metal,.045),middle=ring(.56,.53,material,.045),inner=ring(.29,.72,warm,.032);outer.rotation.x=.18;middle.rotation.y=-.2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([Math.cos(a)*.64,Math.sin(a)*.64,.4],[Math.cos(a)*.79,Math.sin(a)*.79,.4],i%2?material:shell,.036);}
    const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.235,1),glass);core.position.z=.78;group.add(core);
    arc(0,0,.91,.38,.38,-.15,Math.PI*.72,material,.032);parts.computeCore=core;parts.computeRings=[outer,middle,inner];
  }else if(icon==='result'){
    // Three incoming vector channels converge into one output capsule.
    const branches=[[-.87,.63,.2],[-.99,.02,.47],[-.87,-.61,.74]];
    for(const[i,p]of branches.entries()){path([p,[-.41,p[1]*.58,.56],[.13,0,.58]],i===1?material:i===0?metal:warm,.045);cube(...p,.16,i===1?material:metal);}
    const output=prism([[.13,-.25],[.57,-.25],[.85,0],[.57,.25],[.13,.25]],.27,glass,.47);
    rod([.16,0,.78],[.82,0,.78],material,.035);tip(.9,0,.78,1,0,material,.16);parts.outputCapsule=output;
  }else if(icon==='references'){
    // Layered knowledge rings use open arcs and indexed geometric endpoints.
    const layers=[];for(let i=0;i<3;i++){const x=(i-1)*.13,y=(i-1)*.21,z=.13+i*.31,mat=i===1?material:metal;
      layers.push(arc(x,y,z,.76,.55,.18,Math.PI*1.86,mat,.042,.08));const a=.18;cube(x+Math.cos(a)*.76,y+Math.sin(a)*.55,z+Math.sin(a)*.08,.145,i===1?violet:warm);
    }
    rod([-.61,-.48,.16],[-.34,-.05,.83],violet,.024);rod([.62,-.37,.14],[.9,.07,.79],material,.024);parts.knowledgeLayers=layers;
  }else if(icon==='csv'){
    // A regular 3D matrix signals tabular structure without implying dataset size.
    for(let layer=0;layer<2;layer++)for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const x=(col-1)*.47,y=(1-row)*.47,z=.14+layer*.4,mat=layer===0?glass:(row+col)%3===0?mint:material;cube(x,y,z,.31,mat);
    }
    parts.matrixVoxels=group.children.slice();
  }else{
    // A selected matrix slice passes through a translucent access plane.
    for(let row=0;row<2;row++)for(let col=0;col<4;col++)cube((col-1.5)*.39,(.5-row)*.43,.24,.24,(row+col)%2?material:metal);
    const slice=plane(1.61,.98,.54,.08,glass);slice.rotation.y=-.25;
    rod([.29,-.68,.76],[.29,.68,.76],mint,.044);rod([.49,-.54,.76],[.49,.54,.76],warm,.026);tip(.49,.64,.76,0,1,warm,.15);parts.accessSlice=slice;
  }

  const hierarchy=node.kind==='agent'?1.06:node.id==='csvqa'?.8:node.id==='solution'?.88:node.id==='csv'?.88:.96;
  group.scale.setScalar(hierarchy);group.rotation.set(.16,-.21,0);group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3()),footprint={width:size.x,height:size.y,depth:size.z,minZ:bounds.min.z,maxZ:bounds.max.z,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y};
  const ledMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55});const led=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),ledMaterial);led.position.set(.67,-1.01,.61);group.add(led);parts.led=led;
  const progress=new THREE.Mesh(new THREE.PlaneGeometry(1.18,.045),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));progress.position.set(0,-1.14,.73);group.add(progress);
  const selection=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.038),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));selection.position.set(0,-1.3,.06);group.add(selection);
  // Legacy material slots remain aliases solely for the renderer's theme contract.
  return{node,group,material,faceInk,ink,selection,progress,parts,ledMaterial,shell,metal,dark,wood:metal,paper:shell,brass:warm,hierarchy,footprint};
}

/** SVG uses the same abstract vocabulary, independent of teaching or live content. */
export function svgFrameworkObject(requestedIcon,{liveMode=false}={}){
  const candidate=aliases[requestedIcon]||requestedIcon,icon=PROFILE_DEFINITIONS[candidate]?candidate:'data-access';
  const line='fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"',metal='fill="none" stroke="var(--fw-metal)" stroke-linecap="round" stroke-linejoin="round"';
  const cube=(x,y,size=7,color='currentColor')=>`<g><path fill="${color}" fill-opacity=".75" d="M${x} ${y}h${size}v${size}h${-size}Z"/><path fill="${color}" fill-opacity=".38" d="M${x} ${y}l3-3h${size}l-3 3Z"/><path fill="${color}" fill-opacity=".55" d="M${x+size} ${y}l3-3v${size}l-3 3Z"/></g>`;
  let markup='';
  if(icon==='query'){
    markup=`<path fill="currentColor" fill-opacity=".13" stroke="currentColor" stroke-width="2" d="M-29-23Q-29-32-20-32H20Q29-32 29-23V15Q29 23 21 23H-8L-22 33L-20 23Q-29 23-29 15Z"/><path ${line} stroke-width="3" d="M-18-14H13M-18-3H19M-18 8H4"/><path ${metal} stroke-width="1" opacity=".5" d="M-25-31L-20-36H25Q34-36 34-27V11L29 16"/>`;
  }else if(icon==='classification'){
    markup=`<path ${line} stroke-width="4" d="M0-37V-14"/><path fill="currentColor" fill-opacity=".17" stroke="currentColor" stroke-width="1.2" d="M-16-14H16L0 13Z"/><path ${metal} stroke-width="1" d="M-16-14L-10-22H22L16-14M16-14L22-22L6 5L0 13"/><path fill="none" stroke="#72cbb2" stroke-width="4.5" stroke-linecap="round" d="M0 0L-29 25"/><path fill="none" stroke="#ad94d8" stroke-width="4.5" stroke-linecap="round" d="M0 0L29 25"/>${cube(-36,23,10,'#72cbb2')}<path fill="#ad94d8" stroke="#8c73bb" d="M30 18L39 27L30 36L21 27Z"/><circle fill="var(--fw-ink)" cx="0" cy="-38" r="3"/>`;
  }else if(icon==='workflow'){
    markup=`<path ${line} stroke-width="2.4" d="M-31-9C-19-33 13-35 29-12S14 31-11 25S-39 11-31-9Z"/><path fill="none" stroke="#d4b77c" stroke-width="1.8" d="M-31-9L1 0L20 21"/>${[[-35,-13,'#72cbb2'],[-8,-32,'currentColor'],[24,-15,'var(--fw-ink)'],[16,17,'#ad94d8'],[-24,20,'var(--fw-metal)']].map(([x,y,c])=>cube(x,y,8,c)).join('')}<path fill="#d4b77c" d="M1-5L6 0L1 5L-4 0Z"/><path fill="currentColor" d="M14-29L20-25L13-22ZM29 3L26 10L23 4Z"/>`;
  }else if(icon==='model'){
    markup=`<path fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width=".8" d="M-35-8L10-29L35 7L-11 32Z"/><path fill="#ad94d8" fill-opacity=".15" stroke="#ad94d8" stroke-width=".8" d="M-21-30L35-12L20 31L-37 13Z"/><path ${metal} stroke-width="1.6" d="M-27-17H15V23H-27ZM-11-33H31V7H-11ZM-27-17L-11-33M15-17L31-33M15 23L31 7M-27 23L-11 7"/><path ${line} stroke-width="1.4" d="M-27 23L31-33M-11-33L15 23"/>${[[-29,-19],[13,-19],[13,21],[-29,21],[-13,-35],[29,5]].map(([x,y],i)=>cube(x,y,5,i%3===0?'#d4b77c':i%3===1?'currentColor':'#72cbb2')).join('')}<path fill="none" stroke="#d4b77c" stroke-width="2" d="M9-28L23-36H36"/><path fill="#d4b77c" d="M35-40L42-36L35-32Z"/>`;
  }else if(icon==='code'){
    markup=`${[[-4,'var(--fw-metal)'],[0,'currentColor'],[4,'#ad94d8']].map(([offset,color])=>`<path fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M${-10+offset} -29L${-32+offset} 0L${-10+offset} 29M${10+offset} -29L${32+offset} 0L${10+offset} 29"/>`).join('')}<path fill="none" stroke="#d4b77c" stroke-width="2.8" stroke-linecap="round" d="M-5 26L6-26"/>`;
  }else if(icon==='solver'){
    markup=`<ellipse ${metal} stroke-width="2.4" cx="0" cy="0" rx="33" ry="31"/><ellipse ${line} stroke-width="2.5" cx="0" cy="0" rx="21" ry="23"/><circle fill="none" stroke="#d4b77c" stroke-width="1.8" cx="0" cy="0" r="12"/>${Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<path ${line} stroke-width="2.4" d="M${(Math.cos(a)*26).toFixed(2)} ${(Math.sin(a)*25).toFixed(2)}L${(Math.cos(a)*32).toFixed(2)} ${(Math.sin(a)*31).toFixed(2)}"/>`;}).join('')}<path fill="currentColor" fill-opacity=".23" stroke="currentColor" stroke-width="1.2" d="M0-8L8 0L0 8L-8 0Z"/><path ${line} stroke-width="1.8" d="M15 4A16 16 0 0 0-10-12"/>`;
  }else if(icon==='result'){
    markup=`<path ${metal} stroke-width="2.5" d="M-36-24C-21-23-12-1 4 0"/><path ${line} stroke-width="2.8" d="M-39 0H4"/><path fill="none" stroke="#d4b77c" stroke-width="2.5" d="M-36 24C-21 23-12 1 4 0"/>${cube(-40,-27,6,'var(--fw-metal)')}${cube(-43,-3,6,'currentColor')}${cube(-40,21,6,'#d4b77c')}<path fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.4" d="M4-10H23L34 0L23 10H4Z"/><path ${line} stroke-width="2" d="M6 0H32"/><path fill="currentColor" d="M32-4L40 0L32 4Z"/>`;
  }else if(icon==='references'){
    markup=`${[-1,0,1].map((i)=>`<path fill="none" stroke="${i===0?'currentColor':'var(--fw-metal)'}" stroke-width="2.3" d="M${31+i*5} ${-2+i*9}C${27+i*5} ${-24+i*9} ${-33+i*5} ${-24+i*9} ${-31+i*5} ${i*9}S${20+i*5} ${22+i*9} ${27+i*5} ${8+i*9}"/>${cube(26+i*5,-6+i*9,6,i===0?'currentColor':'#d4b77c')}`).join('')}<path fill="none" stroke="#ad94d8" stroke-width="1.4" d="M-29 9L-18-10M24 14L35-5"/>`;
  }else if(icon==='csv'){
    markup=`${[-1,0].map(layer=>Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return cube(-24+col*17+layer*4,-18+row*17-layer*4,11,layer===-1?'var(--fw-metal)':(row+col)%3===0?'#72cbb2':'currentColor');}).join('')).join('')}`;
  }else{
    markup=`${Array.from({length:8},(_,i)=>cube(-28+(i%4)*16,-12+Math.floor(i/4)*19,9,i%2?'currentColor':'var(--fw-metal)')).join('')}<path fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width=".8" d="M-30-20L28-15L32 23L-27 18Z"/><path fill="none" stroke="#72cbb2" stroke-width="2.6" d="M13-29V29"/><path fill="none" stroke="#d4b77c" stroke-width="1.8" d="M21 22V-21"/><path fill="#d4b77c" d="M17-20L21-27L25-20Z"/>`;
  }
  return `<g class="fw-abstract-object" data-object-style="abstract" data-object-profile="${OBJECT_PROFILES[icon].name}" data-object-kind="${icon}">${markup}</g>`;
}

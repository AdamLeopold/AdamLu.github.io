/** Sculpted semantic objects. Scene, camera, labels, and flow are owned by the renderer. */
const PROFILE_DEFINITIONS = {
  query: {name:'folded-query-dock',width:2.65,height:2.75},
  classification: {name:'y-sorter-typed-bins',width:3.15,height:3.0},
  workflow: {name:'spiral-route-planning-board',width:3.05,height:3.1},
  model: {name:'variable-lattice-constraint-planes',width:3.1,height:3.05},
  code: {name:'compile-press-punched-tape',width:3.2,height:3.05},
  solver: {name:'geared-compute-engine',width:3.05,height:3.15},
  result: {name:'model-code-result-folio',width:3.15,height:3.0},
  references: {name:'archive-book-cabinet',width:2.9,height:3.2},
  csv: {name:'tabbed-csv-card-stack',width:2.8,height:2.65},
  'data-access': {name:'table-record-lens',width:2.6,height:2.7},
};
const aliases={codegen:'code',solution:'result',csvqa:'data-access'};
export const OBJECT_PROFILES=Object.freeze(Object.fromEntries([
  ...Object.entries(PROFILE_DEFINITIONS).map(([id,profile])=>[id,Object.freeze(profile)]),
  ...Object.entries(aliases).map(([id,key])=>[id,Object.freeze(PROFILE_DEFINITIONS[key])]),
]));
const iconFor=node=>node.icon||aliases[node.id]||node.id;
const colorRole=node=>node.id==='query'?'query':['csv','csvqa'].includes(node.id)?'data':node.id==='references'?'reference':node.id==='solution'?'output':node.id==='codegen'?'code':node.id==='solver'?'solver':'agent';

/** Returns a detached group plus the material/activity contract consumed by pose(). */
export function buildFrameworkObject(node,{THREE,palette,helpers}={}){
  if(!THREE||!helpers)throw new TypeError('Three and geometry helpers are required');
  const {slab,box,bar,polyline,sheet,bodyShape}=helpers;
  for(const [name,fn]of Object.entries({slab,box,bar,polyline,sheet,bodyShape}))if(typeof fn!=='function')throw new TypeError(`Missing geometry helper: ${name}`);
  const colors=palette?.dark||palette||{},color=colors[colorRole(node)]??0x84bff0;
  const group=new THREE.Group(),icon=iconFor(node),parts={};group.userData.nodeId=node.id;group.userData.objectProfile=OBJECT_PROFILES[icon]?.name||icon;
  const material=new THREE.MeshStandardMaterial({color,roughness:.28,metalness:.18,emissive:color,emissiveIntensity:.025,transparent:true});
  const shell=new THREE.MeshPhysicalMaterial({color:0xeeeae1,roughness:.28,metalness:.07,clearcoat:.65,clearcoatRoughness:.19,transparent:true});
  const metal=new THREE.MeshStandardMaterial({color:0x8297a6,roughness:.25,metalness:.78,transparent:true});
  const dark=new THREE.MeshStandardMaterial({color:0x1b2d3b,roughness:.48,metalness:.24,transparent:true});
  const wood=new THREE.MeshStandardMaterial({color:0x8b6b4e,roughness:.6,metalness:.03,transparent:true});
  const paper=new THREE.MeshStandardMaterial({color:0xfff8e8,roughness:.82,transparent:true});
  const brass=new THREE.MeshStandardMaterial({color:0xc7a768,roughness:.27,metalness:.78,transparent:true});
  const mint=new THREE.MeshPhysicalMaterial({color:0x83c6b1,roughness:.28,metalness:.08,clearcoat:.5});
  const rose=new THREE.MeshPhysicalMaterial({color:0xc99a91,roughness:.3,metalness:.06,clearcoat:.4});
  const faceInk=new THREE.MeshBasicMaterial({color:0x25455e,transparent:true});
  const ink=new THREE.MeshBasicMaterial({color:colors.ink??0xdbeafa,transparent:true});

  function rod(a,b,mat=metal,r=.035){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),mat);mesh.position.copy(av.add(bv).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);return mesh;}
  function disc(parent,x,y,r,depth,mat,z=.5){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,28),mat);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function ring(parent,x,y,r,tube,mat,z=.5){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,tube,8,36),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function brace(parent,points,mat,z=.6,depth=.18){const mesh=bodyShape(points,mat,depth,z);parent.add(mesh);return mesh;}
  function arrow(a,b,mat=material,z=.5){bar(group,a,b,mat,.035,z);const dx=b[0]-a[0],dy=b[1]-a[1],head=new THREE.Mesh(new THREE.ConeGeometry(.075,.19,3),mat);head.position.set(b[0],b[1],z);head.rotation.z=-Math.atan2(dx,dy);group.add(head);}
  function tray(parent,x,y,w,h,mat,z=.3){slab(parent,x,y,w,h,.13,mat,z,.07);slab(parent,x-w/2+.055,y,.1,h,.34,mat,z+.15,.025);slab(parent,x+w/2-.055,y,.1,h,.34,mat,z+.15,.025);slab(parent,x,y-h/2+.05,w,.1,.34,mat,z+.15,.025);}
  function gear(x,y,r,teeth,mat,z=.55,phase=0){
    const shape=new THREE.Shape();for(let i=0;i<teeth*4;i++){const angle=i/(teeth*4)*Math.PI*2+phase,radius=i%4===1||i%4===2?r:r*.8,px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;i?shape.lineTo(px,py):shape.moveTo(px,py);}shape.closePath();
    const hole=new THREE.Path();hole.absarc(0,0,r*.23,0,Math.PI*2,true);shape.holes.push(hole);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSegments:2,bevelThickness:.015,bevelSize:.015,steps:1}),mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);group.add(mesh);disc(group,x,y,r*.13,.21,brass,z+.1);return mesh;
  }

  if(icon==='query'){
    // A creased sheet and folded sleeve form a document silhouette, rather than a display.
    tray(group,0,-.59,1.7,.58,material,.08);slab(group,0,-.43,1.44,.12,.17,dark,.37,.035);
    const page=sheet(group,-.13,.22,1.25,1.76,'paper-query',paper,.51,-.13);page.rotation.x=.09;
    brace(group,[[.26,1.1],[.65,.77],[.3,.78]],paper,.52,.055);
    bar(group,[-.62,-.26],[.34,-.39],metal,.02,.58);slab(group,.55,-.56,.19,.4,.16,brass,.54,.04);
    const pin=ring(group,-.58,.88,.105,.025,brass,.62);pin.scale.y=1.5;
  }else if(icon==='classification'){
    // One tangible Y channel feeds two open trays with different type glyphs.
    brace(group,[[-.27,1.08],[.27,1.08],[.27,.31],[1.02,-.39],[.72,-.7],[0,-.12],[-.72,-.7],[-1.02,-.39],[-.27,.31]],shell,.12,.34);
    polyline(group,[[0,.99],[0,.15],[-.77,-.5]],dark,.075,.5);polyline(group,[[0,.15],[.77,-.5]],dark,.075,.5);
    polyline(group,[[0,.99],[0,.2],[-.77,-.45]],material,.026,.59);polyline(group,[[0,.2],[.77,-.45]],material,.026,.59);
    tray(group,-.82,-.82,.85,.64,mint,.36);tray(group,.82,-.82,.85,.64,rose,.36);
    brace(group,[[-.98,-.8],[-.67,-.8],[-.82,-.55]],brass,.68,.08);
    for(const x of[.68,.83,.98])bar(group,[x,-.82],[x,-.58],metal,.032,.73);
    sheet(group,0,.86,.4,.58,'paper-query',paper,.69,.015);
    const pivot=disc(group,0,.13,.13,.14,brass,.67);parts.sortingGate=pivot;
    for(const x of[-.16,.16])disc(group,x,1.03,.055,.08,metal,.58);
  }else if(icon==='workflow'){
    // A bound planning board carries a raised route and a visibly branching decision.
    const board=slab(group,0,0,2.04,2.13,.22,wood,.17,.1);board.rotation.z=.09;
    slab(group,.035,.02,1.8,1.94,.07,paper,.33,.05);
    for(let i=-4;i<=4;i++){const coil=ring(group,-.96,i*.214,.105,.025,metal,.39);coil.rotation.y=Math.PI/2;}
    const path=[[-.48,.66],[.36,.66],[.36,.1],[-.25,.1],[-.25,-.56],[.49,-.56]];polyline(group,path,material,.047,.49);
    arrow([.36,.1],[.73,-.22],brass,.5);
    for(const [index,[x,y]]of path.entries()){if(index===2)brace(group,[[x,y+.17],[x+.17,y],[x,y-.17],[x-.17,y]],brass,.51,.13);else slab(group,x,y,.31,.27,.16,index===0?mint:index===path.length-1?rose:shell,.52,.04);}
    arrow([-.07,.66],[.11,.66],material,.57);arrow([-.25,-.17],[-.25,-.36],material,.57);
    slab(group,.66,.91,.36,.12,.08,brass,.46,.03);parts.planningBoard=board;
  }else if(icon==='model'){
    // An open variable lattice and translucent constraint planes occupy real depth.
    const corners=[];for(const z of[.18,1.02])for(const y of[-.64,.62])for(const x of[-.74,.74])corners.push([x,y,z]);
    for(let layer=0;layer<2;layer++){const o=layer*4;for(const[a,b]of[[0,1],[0,2],[1,3],[2,3]])rod(corners[o+a],corners[o+b],metal,.027);}for(let i=0;i<4;i++)rod(corners[i],corners[i+4],metal,.027);
    for(const [i,p]of corners.entries()){const bead=box(group,p[0],p[1],.16,.16,i%3===0?brass:i%3===1?material:mint,p[2],.16);bead.rotation.z=.15;}
    rod([-.74,-.64,.18],[.74,.62,1.02],material,.025);rod([-.74,.62,1.02],[.74,-.64,.18],material,.025);
    const glassA=new THREE.MeshPhysicalMaterial({color:0x7cbda9,roughness:.2,metalness:.05,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,clearcoat:.6});
    const glassB=new THREE.MeshPhysicalMaterial({color:0xc1a270,roughness:.23,metalness:.05,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide,clearcoat:.55});
    const planeA=box(group,0,0,1.78,1.32,glassA,.48,.035);planeA.rotation.z=.28;planeA.rotation.y=.18;
    const planeB=box(group,.09,-.04,1.53,1.42,glassB,.8,.035);planeB.rotation.z=-.36;planeB.rotation.x=.17;
    ring(group,.75,.73,.36,.034,brass,1.12);ring(group,.75,.73,.18,.024,material,1.14);disc(group,.75,.73,.05,.07,brass,1.16);
    rod([.5,.53,1.02],[.75,.73,1.1],brass,.025);slab(group,0,-.86,1.91,.29,.22,dark,.06,.07);
    parts.constraintPlanes=[planeA,planeB];
  }else if(icon==='code'){
    // A compiler press receives a sheet and feeds a punched strip through brackets.
    slab(group,0,-.77,2.13,.4,.54,metal,.18,.1);
    for(const x of[-.83,.83]){slab(group,x,.05,.22,1.84,.42,shell,.24,.07);disc(group,x,.89,.055,.1,brass,.52);}
    slab(group,0,.89,2.1,.32,.46,shell,.27,.09);parts.press=slab(group,0,.27,1.45,.33,.5,material,.53,.06);
    sheet(group,.03,-.12,.65,1.78,'paper-code',paper,.57,-.055);
    brace(group,[[-.2,.59],[-.55,.18],[-.2,-.2],[-.1,-.1],[-.35,.18],[-.1,.48]],brass,.9,.11);
    brace(group,[[.2,.59],[.55,.18],[.2,-.2],[.1,-.1],[.35,.18],[.1,.48]],brass,.9,.11);
    for(let i=0;i<5;i++){disc(group,-.16,-.43-i*.085,.023,.012,dark,.74);disc(group,.13,-.43-i*.085,.023,.012,dark,.74);}
    const reel=disc(group,1.03,-.5,.3,.35,paper,.41);ring(group,1.03,-.5,.23,.025,brass,.63);disc(group,1.03,-.5,.07,.15,metal,.64);parts.tapeReel=reel;
    bar(group,[.35,-.73],[.89,-.62],paper,.075,.51);
  }else if(icon==='solver'){
    // A single compute engine: exposed gears, an analog dial, cooling fins, and a flywheel.
    slab(group,.26,.05,1.43,2.03,.63,shell,.2,.15);slab(group,.27,-.99,1.82,.3,.61,dark,.14,.08);
    const g1=gear(-.38,.24,.48,13,metal,.63,.02),g2=gear(.21,-.24,.31,9,brass,.64,.16);parts.gears=[g1,g2];
    disc(group,.54,.69,.26,.12,metal,.67);disc(group,.54,.69,.216,.045,paper,.77);
    for(let i=0;i<6;i++){const a=(-.75+i*.3)*Math.PI;bar(group,[.54+Math.cos(a)*.16,.69+Math.sin(a)*.16],[.54+Math.cos(a)*.19,.69+Math.sin(a)*.19],faceInk,.014,.815);}
    bar(group,[.54,.69],[.43,.81],material,.022,.84);
    for(let i=0;i<7;i++)slab(group,.97,-.55+i*.16,.23,.05,.71,metal,.18,.018);
    for(const y of[-.66,-.8])slab(group,.28,y,.8,.055,.08,dark,.64,.02);
    const wheel=ring(group,-.56,-.54,.32,.055,dark,.66);disc(group,-.56,-.54,.08,.13,brass,.7);for(let i=0;i<4;i++){const a=i*Math.PI/2;bar(group,[-.56,-.54],[-.56+Math.cos(a)*.28,-.54+Math.sin(a)*.28],metal,.027,.7);}parts.flywheel=wheel;
  }else if(icon==='result'){
    // One outgoing folio gathers a mathematical scroll, a code file, and a raised result chart.
    tray(group,0,-.63,2.13,.54,brass,.11);
    const scroll=sheet(group,-.55,.17,.79,1.54,'paper-model',paper,.35,-.16);scroll.rotation.y=-.08;
    for(const y of[-.62,.91]){const roller=disc(group,-.55,y,.13,.84,paper,.45);roller.rotation.x=0;roller.rotation.z=Math.PI/2;}
    sheet(group,.19,.2,.86,1.55,'paper-code',paper,.53,.09);brace(group,[[.28,1.04],[.65,.77],[.31,.77]],paper,.55,.055);
    slab(group,.64,-.13,.84,1.15,.1,shell,.73,.07);
    polyline(group,[[.31,.2],[.31,-.56],[1.02,-.56]],faceInk,.022,.87);
    for(const[x,h]of[[.45,.26],[.68,.46],[.91,.67]])box(group,x,-.53+h/2,.14,h,material,.88,.13);
    slab(group,.11,1.07,.43,.18,.13,brass,.69,.045);parts.modelScroll=scroll;
  }else if(icon==='references'){
    slab(group,0,.03,2.03,2.22,.76,wood,.12,.12);slab(group,0,.06,1.79,1.98,.08,dark,.54,.05);
    for(const y of[-.82,-.03,.76])slab(group,0,y,1.88,.095,.26,wood,.68,.02);
    for(let row=0;row<2;row++)for(let i=0;i<6;i++){const spine=slab(group,-.72+i*.28,-.43+row*.79,.2,.65,.26,i%3===0?material:i%3===1?paper:metal,.72,.025);spine.rotation.z=i===0?-.07:i===5?.05:0;bar(group,[-.78+i*.28,-.54+row*.79],[-.66+i*.28,-.54+row*.79],brass,.018,.9);}
    const drawer=slab(group,0,-1.08,1.88,.32,.5,wood,.39,.045);slab(group,0,-1.08,.42,.055,.08,brass,.72,.018);parts.archiveDrawer=drawer;
    for(const x of[-.8,.8])slab(group,x,-1.26,.19,.2,.45,dark,.08,.025);
  }else if(icon==='csv'){
    tray(group,0,-.68,1.92,.45,material,.12);
    for(let i=0;i<3;i++){const card=sheet(group,-.18+i*.16,.05+i*.13,1.22,1.3,'paper-data',paper,.37+i*.09,-.12+i*.09);card.rotation.y=(i-1)*.04;slab(group,.48+i*.055,.77+i*.08,.37,.15,.06,i===0?mint:i===1?material:brass,.45+i*.09,.025);}
    slab(group,0,-.77,1.41,.09,.1,metal,.42,.02);
  }else{
    // CSVQA is a table-and-lens reader, visually subordinate to model construction.
    slab(group,-.07,-.35,1.72,.7,.24,shell,.12,.11);sheet(group,-.23,-.2,1.26,1.14,'paper-data',paper,.33,-.08);
    const lens=ring(group,.43,.39,.35,.065,metal,.76);const glass=new THREE.MeshPhysicalMaterial({color:0xa3d9d1,roughness:.14,metalness:.05,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false});disc(group,.43,.39,.28,.025,glass,.77);
    bar(group,[.67,.13],[.99,-.23],wood,.095,.75);bar(group,[.67,.13],[.78,.01],brass,.104,.75);parts.lens=lens;
    for(const y of[-.37,-.15,.07])bar(group,[-.65,y],[.1,y],material,.018,.46);
  }
  const hierarchy=node.kind==='agent'?1.06:node.id==='csvqa'?.8:node.id==='solution'?.88:node.id==='csv'?.88:.96;
  group.scale.setScalar(hierarchy);group.rotation.set(.18,-.22,0);group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  const footprint={width:size.x,height:size.y,depth:size.z,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y};
  const ledMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55});parts.led=slab(group,.7,-1.02,.12,.055,.05,ledMaterial,.63,.018);
  const progress=new THREE.Mesh(new THREE.PlaneGeometry(1.18,.045),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));progress.position.set(0,-1.14,.73);group.add(progress);
  const selection=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.038),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));selection.position.set(0,-1.3,.06);group.add(selection);
  return{node,group,material,faceInk,ink,selection,progress,parts,ledMaterial,shell,metal,dark,wood,paper,brass,hierarchy,footprint};
}

/** Readable SVG counterparts use the same silhouettes and contain no run-specific claims. */
export function svgFrameworkObject(requestedIcon,{liveMode=false}={}){
  const candidate=aliases[requestedIcon]||requestedIcon,icon=PROFILE_DEFINITIONS[candidate]?candidate:'data-access';
  const shell='fill="var(--fw-shell)" stroke="var(--fw-metal)" stroke-width="1.2"',metal='fill="var(--fw-metal)"',paper='fill="var(--fw-paper)" stroke="#b8c2c6" stroke-width=".8"',brass='fill="#c7a768" stroke="#957646" stroke-width=".6"',dark='fill="var(--fw-screen)"',accent='fill="currentColor"';
  const stroke='fill="none" stroke="var(--fw-metal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const gearPath=(x,y,r,teeth)=>{const points=[];for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2,rad=i%4===1||i%4===2?r:r*.8;points.push(`${(x+Math.cos(a)*rad).toFixed(2)} ${(y+Math.sin(a)*rad).toFixed(2)}`);}return `M${points.join('L')}Z M${x-r*.23} ${y}a${r*.23} ${r*.23} 0 1 0 ${r*.46} 0a${r*.23} ${r*.23} 0 1 0 ${-r*.46} 0Z`;};
  let markup='';
  if(icon==='query'){
    markup=`<path fill="var(--fw-metal)" d="M-33 16H28L33 23V34H-33Z"/><path ${accent} d="M-33 11H29V25H-33Z"/><path ${dark} d="M-28 10H24V17H-28Z"/><path ${paper} d="M-25-35L9-40L27-23L30 13L-18 20Z"/><path fill="#e5e2d6" d="M9-40L11-23L27-23Z"/><path stroke="#647e91" stroke-width="2" d="M-16-15L16-19M-15-5L18-9M-13 5L9 2"/><path ${brass} d="M20 13H26V29H20Z"/><path fill="none" stroke="#c7a768" stroke-width="2" d="M-24-24v-9a4 4 0 0 1 8 0v13a3 3 0 0 1-6 0v-12"/>`;
  }else if(icon==='classification'){
    markup=`<path fill="var(--fw-metal)" d="M-8-35H11V-7L34 15L23 28L2 7L-22 28L-34 15L-8-7Z"/><path ${shell} d="M-11-38H8V-10L31 12L21 23L-1 2L-24 23L-35 12L-11-10Z"/><path fill="none" stroke="var(--fw-screen)" stroke-width="5" stroke-linejoin="round" d="M-1-33V-5L-26 16M-1-5L24 16"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M-1-33V-5L-26 16M-1-5L24 16"/><path fill="#80c3ae" stroke="#567f77" d="M-43 15H-12V36H-43Z"/><path fill="#ca9a91" stroke="#97736b" d="M12 15H43V36H12Z"/><path fill="#4c6f67" d="M-39 18H-16V29H-39Z"/><path fill="#8f625c" d="M16 18H39V29H16Z"/><path ${brass} d="M-34 30L-27 20L-20 30Z"/><path stroke="#bfcbd0" stroke-width="2" d="M21 22V30M27 22V30M33 22V30"/><path ${paper} d="M-8-38H4V-20H-8Z"/><circle ${brass} cx="-1" cy="-5" r="4"/>`;
  }else if(icon==='workflow'){
    markup=`<g transform="rotate(-6)"><rect fill="#8b6b4e" stroke="#b09270" x="-35" y="-38" width="70" height="78" rx="5"/><rect ${paper} x="-30" y="-34" width="61" height="69" rx="2"/>${Array.from({length:8},(_,i)=>`<path fill="none" stroke="var(--fw-metal)" stroke-width="2" d="M-31 ${-28+i*8}a5 3 0 1 0-8 0"/>`).join('')}<path fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" d="M-17-22H15V-2H-9V22H20"/><path fill="none" stroke="#b2945f" stroke-width="2.5" d="M15-2L26 9"/><rect ${shell} x="-23" y="-28" width="12" height="12" rx="2"/><rect fill="#80c3ae" x="9" y="-28" width="12" height="12" rx="2"/><path ${brass} d="M15-9L22-2L15 5L8-2Z"/><rect ${shell} x="-15" y="16" width="12" height="12" rx="2"/><rect fill="#ca9a91" x="14" y="16" width="12" height="12" rx="2"/><path ${accent} d="M-1-25L4-22L-1-19ZM-12 7L-9 12L-6 7Z"/><path ${brass} d="M16-34H29V-30H16Z"/></g>`;
  }else if(icon==='model'){
    markup=`<path fill="#80c3ae" fill-opacity=".23" stroke="#6d9f91" stroke-width="1" d="M-36-9L13-33L36 9L-13 33Z"/><path fill="#c7a768" fill-opacity=".2" stroke="#b2935e" stroke-width="1" d="M-24-31L36-12L20 33L-39 14Z"/><path ${stroke} d="M-28-18H15V24H-28ZM-11-34H32V8H-11ZM-28-18L-11-34M15-18L32-34M15 24L32 8M-28 24L-11 8"/><path stroke="currentColor" fill="none" stroke-width="1.6" d="M-28 24L32-34M-11-34L15 24"/>${[[-28,-18],[15,-18],[15,24],[-28,24],[-11,-34],[32,8]].map(([x,y],i)=>`<rect fill="${i%3===0?'#c7a768':i%3===1?'currentColor':'#80c3ae'}" stroke="var(--fw-metal)" x="${x-3}" y="${y-3}" width="6" height="6" rx="1"/>`).join('')}<circle fill="none" stroke="#c7a768" stroke-width="2.4" cx="31" cy="-32" r="12"/><circle fill="none" stroke="currentColor" stroke-width="1.7" cx="31" cy="-32" r="6"/><circle ${brass} cx="31" cy="-32" r="2"/><path ${dark} d="M-32 30H31V39H-32Z"/>`;
  }else if(icon==='code'){
    markup=`<path ${metal} d="M-39 27H38V39H-39Z"/><path ${shell} d="M-34-38H-26V28H-34ZM26-38H34V28H26Z"/><rect ${shell} x="-38" y="-40" width="76" height="12" rx="3"/><path ${paper} d="M-12-35H12L17 32H-8Z"/><rect ${accent} x="-27" y="-14" width="54" height="13" rx="3"/><path ${brass} d="M-6-24L-20-9L-6 6L-2 2L-12-9L-2-20ZM6-24L20-9L6 6L2 2L12-9L2-20Z"/>${Array.from({length:5},(_,i)=>`<circle ${dark} cx="-5" cy="${9+i*4}" r="1.1"/><circle ${dark} cx="6" cy="${9+i*4}" r="1.1"/>`).join('')}<path fill="none" stroke="var(--fw-paper)" stroke-width="5" d="M10 30L32 22"/><circle ${paper} cx="35" cy="21" r="10"/><circle fill="none" stroke="#c7a768" stroke-width="1.8" cx="35" cy="21" r="7"/><circle ${metal} cx="35" cy="21" r="2.5"/><circle ${brass} cx="-30" cy="-34" r="2"/><circle ${brass} cx="30" cy="-34" r="2"/>`;
  }else if(icon==='solver'){
    markup=`<path fill="var(--fw-metal)" d="M-16-39L-9-44H34V35H-16Z"/><rect ${shell} x="-19" y="-41" width="48" height="76" rx="8"/><path ${dark} d="M-29 30H35V40H-29Z"/>${Array.from({length:7},(_,i)=>`<path stroke="var(--fw-metal)" stroke-width="2" d="M29 ${-23+i*6}H39"/>`).join('')}<path fill="var(--fw-metal)" stroke="#4e6473" stroke-width=".9" fill-rule="evenodd" d="${gearPath(-13,-9,18,13)}"/><path fill="#c7a768" stroke="#957646" stroke-width=".8" fill-rule="evenodd" d="${gearPath(9,10,12,9)}"/><circle ${brass} cx="-13" cy="-9" r="3"/><circle ${metal} cx="9" cy="10" r="2"/><circle ${metal} cx="18" cy="-28" r="9"/><circle ${paper} cx="18" cy="-28" r="7"/><path stroke="currentColor" stroke-width="1.5" d="M18-28L14-32"/><circle fill="none" stroke="var(--fw-screen)" stroke-width="4" cx="-21" cy="23" r="11"/><path ${stroke} d="M-32 23H-10M-21 12V34"/><circle ${brass} cx="-21" cy="23" r="2.8"/><path stroke="var(--fw-screen)" stroke-width="2" d="M1 26H22M1 31H22"/>`;
  }else if(icon==='result'){
    markup=`<path ${brass} d="M-40 26H39V39H-40Z"/><g transform="rotate(-8)"><path ${paper} d="M-31-33H-4V28H-31Z"/><ellipse ${paper} cx="-17" cy="-33" rx="15" ry="5"/><ellipse ${paper} cx="-17" cy="28" rx="15" ry="5"/><path stroke="#77909c" stroke-width="1.5" d="M-25-17H-9M-25-8H-12M-25 1H-10"/></g><path ${paper} d="M-7-37H17L29-25V26H-7Z"/><path fill="#e2ded1" d="M17-37V-25H29Z"/><path stroke="#7896a9" stroke-width="1.7" d="M0-20H15M0-12H20M0-4H13"/><rect ${shell} x="9" y="0" width="32" height="36" rx="3"/><path fill="none" stroke="#456174" stroke-width="1.3" d="M14 7V31H37"/><path ${accent} d="M17 29V20H21V29ZM24 29V14H28V29ZM31 29V7H35V29Z"/><rect ${brass} x="1" y="-40" width="14" height="6" rx="2"/>`;
  }else if(icon==='references'){
    markup=`<path fill="#6e5441" stroke="#b19470" d="M-35-41L-27-46H36V39H-35Z"/><rect fill="#8b6b4e" stroke="#b19470" x="-35" y="-42" width="66" height="79" rx="4"/><rect ${dark} x="-29" y="-36" width="54" height="61"/>${[0,1].map(row=>Array.from({length:6},(_,i)=>`<rect fill="${['currentColor','#e7ddc4','var(--fw-metal)'][i%3]}" x="${-25+i*8}" y="${-32+row*30}" width="6" height="24" rx="1"/><path stroke="#c7a768" d="M${-24+i*8} ${-22+row*30}H${-21+i*8}"/>`).join('')).join('')}<path stroke="#b49668" stroke-width="3" d="M-31-4H27M-31 25H27"/><rect fill="#8b6b4e" stroke="#b19470" x="-31" y="27" width="60" height="13" rx="2"/><rect ${brass} x="-8" y="32" width="16" height="3" rx="1"/><path ${dark} d="M-29 40H-22V47H-29ZM20 40H27V47H20Z"/>`;
  }else if(icon==='csv'){
    markup=`<path ${accent} d="M-35 22H34V36H-35Z"/>${Array.from({length:3},(_,i)=>`<g transform="translate(${i*5} ${-i*5}) rotate(${i*5-6})"><path ${paper} d="M-29-29H17V27H-29Z"/><path fill="none" stroke="#68ab98" stroke-width="1" d="M-22-13H10M-22-3H10M-22 7H10M-13-21V17M-3-21V17"/><rect fill="${['#80c3ae','currentColor','#c7a768'][i]}" x="3" y="-34" width="15" height="7" rx="2"/></g>`).join('')}<path stroke="var(--fw-metal)" stroke-width="3" d="M-27 31H27"/>`;
  }else{
    markup=`<rect ${shell} x="-35" y="0" width="63" height="31" rx="6"/><g transform="rotate(-6)"><path ${paper} d="M-30-21H12V23H-30Z"/><path fill="none" stroke="#68ab98" stroke-width="1" d="M-24-12H7M-24-2H7M-24 8H7M-14-17V16M-3-17V16"/></g><circle fill="#a3d9d1" fill-opacity=".25" stroke="var(--fw-metal)" stroke-width="4" cx="16" cy="-15" r="13"/><path stroke="#8b6b4e" stroke-width="7" stroke-linecap="round" d="M25-5L39 10"/><path stroke="#c7a768" stroke-width="8" d="M25-5L30 0"/>`;
  }
  return `<g class="fw-sculpted-object" data-object-profile="${OBJECT_PROFILES[icon].name}" data-object-kind="${icon}">${markup}</g>`;
}

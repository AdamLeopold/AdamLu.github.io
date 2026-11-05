// Figure 3 uses the paper's 1582 × 1632 coordinate grid. Positive Z faces the reader.
import * as THREE from './vendor/three/three.module.js';

const W = 1582, H = 1632;
const style = {
  input: ['#D8E7F1', '#8FAEC6', '#385F7D'], white: ['#F2F7F9', '#B7CFDB', '#638397'],
  classification: ['#DCDCF3', '#ACA5D4', '#62568D'], workflow: ['#CCE5EF', '#81BBD1', '#396D8B'],
  model: ['#D5EAE0', '#94C2AC', '#477860'], output: ['#FAE1B9', '#D7AF70', '#8D6846'],
  deck: ['#CBD8E2', '#95ADBD', '#506474'], tailored: ['#DDE3F4', '#A9B9DB', '#596E9A'],
  agnostic: ['#D2E8EA', '#A0C9CE', '#4B7C87'], document: ['#F4F8FA', '#C7D8E2', '#859AA7'],
  violet: ['#ECE9FA', '#C4BFDC', '#83789D'], mint: ['#E8F6F0', '#B9D9CA', '#709486'],
  cream: ['#FEF3DA', '#E7CFA9', '#9C8159'], dark: ['#466779', '#3E5968', '#273D4D'],
  wire: ['#548DA2', '#40809B', '#2E5972'], wireGreen: ['#568A7B', '#458371', '#366355'],
  detailWire: ['#A9C7DB', '#718BA5', '#465F7A'],
};

// x, y, width, height, radius, base, top, material. Bases of nested blocks meet their supports.
export const plates = [
  ['input-card', 20, 76, 965, 399, 54, -34, 62, 'input'],
  ['problem-description', 40, 144, 497, 312, 26, 62, 89, 'document'],
  ['classification-card', 20, 614, 354, 276, 38, -34, 70, 'classification'],
  ['workflow-card', 593, 615, 367, 276, 38, -34, 70, 'workflow'],
  ['model-card', 1168, 553, 349, 340, 40, -34, 70, 'model'],
  ['output-card', 1187, 369, 360, 96, 19, -30, 76, 'output'],
  ['output-workbench', 1249, 168, 246, 201, 27, -26, 46, 'cream'],
  ['type-junction', 399, 678, 132, 117, 57, -21, 58, 'violet'],
  ['type-caption', 399, 799, 140, 33, 10, -12, 49, 'violet'],
  ['handoff-document', 976, 666, 108, 112, 15, -19, 42, 'white'],
  ['handoff-caption', 968, 781, 126, 34, 10, -12, 42, 'white'],
  ['inspection-arm', 1054, 805, 18, 44, 6, -9, 7, 'white'],
  ['inspection-pin', 1057, 837, 12, 13, 3, 7, 12, 'dark'],
  ['upload-dock', 439, 7, 284, 77, 23, -13, 77, 'white'],
  ['upload-query-pedestal', 474, 118, 60, 48, 10, 62, 90, 'white'],
  ['upload-archive-pedestal', 907, 120, 48, 42, 9, 62, 87, 'white'],
  ['embedding-caption', 883, 557, 189, 39, 13, -12, 39, 'white'],
  ['detail-deck', 384, 934, 1129, 676, 66, -45, 12, 'deck'],
  ['type-tailored-panel', 391, 940, 623, 663, 54, 12, 42, 'tailored'],
  ['type-agnostic-panel', 1019, 940, 487, 663, 51, 12, 42, 'agnostic'],
  ['tailored-problem', 419, 965, 321, 202, 24, 42, 77, 'document'],
  ['tailored-final-model', 756, 997, 239, 188, 20, 42, 81, 'violet'],
  ['tailored-category', 429, 1223, 304, 63, 14, 42, 75, 'violet'],
  ['tailored-relevant-data', 755, 1265, 242, 268, 23, 42, 80, 'document'],
  ['agnostic-table-schema', 1298, 996, 194, 137, 17, 42, 76, 'document'],
  ['agnostic-model-plan', 1028, 1225, 215, 369, 20, 42, 80, 'document'],
  ['agnostic-llm-chip', 1367, 1199, 108, 104, 16, 42, 73, 'mint'],
  ['agnostic-problem', 1253, 1351, 214, 242, 20, 42, 77, 'document'],
  ['tailored-example-pedestal', 691, 955, 29, 28, 8, 42, 78, 'document'],
  ['model-screen-pedestal', 967, 1000, 18, 22, 4, 42, 82, 'violet'],
  ['category-index-pedestal', 703, 1226, 23, 20, 5, 42, 76, 'violet'],
  ['retrieved-data-pedestal', 968, 1261, 19, 16, 4, 42, 81, 'document'],
  ['product-archive-pedestal', 678, 1303, 34, 32, 7, 42, 70, 'violet'],
  ['economic-archive-pedestal', 1187, 1002, 30, 37, 7, 42, 70, 'mint'],
  ['model-plan-pedestal', 1190, 1199, 40, 30, 6, 42, 81, 'document'],
  ['classifier-llm-chip', 39, 713, 111, 112, 14, 70, 84, 'violet'],
  ['model-llm-chip', 1200, 612, 95, 93, 14, 70, 84, 'mint'],
];

// The same cell boundaries govern both the physical grid and the data printed on it.
export const tables = [
  {id:'parameters',x:586,y:165,widths:[58,44,38,38,39,39,39,38],row:26.5,rows:11,base:62,top:86},
  {id:'tailored-products',x:432,y:1321,widths:[144,39,35,64],row:13.35,rows:17,base:42,top:69},
  {id:'agnostic-demo-data',x:1034,y:1038,widths:[59,35,40,37],row:21.6,rows:4,base:42,top:69},
  {id:'schema-grid',x:1308,y:1051,widths:[51,39,47,34],row:16,rows:4,base:76,top:83},
];

function mount(id,kind,x,y,z,width,height) { return {id,kind,x,y,z,width,height}; }
export const iconPlacements = [
  mount('uploaders','users',489,45,77,76,60), mount('query-answer','qa',504,139,90,87,82),
  mount('user-data-archive','archive',931,141,87,68,66),
  mount('classifier-language-model','llm',95,757,84,77,74),
  mount('classifier-openai','llmMark',62,806,84,16,16), mount('classifier-rag','rag',206,779,70,77,86), mount('classifier-library','repository',309,773,70,101,119),
  mount('problem-type-symbol','taxonomy',465,709,58,52,35),
  mount('workflow-query','qa',659,788,70,68,66), mount('workflow-rag','rag',755,768,70,75,85),
  mount('workflow-library','repository',862,753,70,90,98),
  ...[776,813,851,910].map((x,i)=>mount('example-repository-'+i,'repository',x,847,70,30,36)),
  mount('handoff-workflow','workflow',1028,722,42,85,94),
  mount('detail-magnifier','lens',1063,843,12,49,49),
  mount('model-language-model','llm',1249,649,84,68,65), mount('combine-workflow-and-model','plus',1248,752,70,31,31),
  mount('model-workflow-document','workflow',1248,815,70,76,73), mount('model-openai','llmMark',1219,691,84,14,14), mount('model-rag','rag',1362,741,70,74,85),
  mount('model-data-archive','archive',1452,730,70,78,80),
  mount('python-runtime','python',1288,201,46,41,42), mount('gurobi-solver','gurobi',1343,204,46,44,42),
  mount('code-workstation','workstation',1371,291,46,198,103),
  mount('tailored-example-qa','qa',706,971,78,60,55), mount('tailored-model-screen','laptop',975,1009,82,58,43),
  mount('category-index','category',714,1235,76,40,39), mount('tailored-model-engine','llmMark',897,1243,42,27,25),
  mount('retrieved-detail-symbol','dataSearch',978,1267,81,37,37),
  mount('sales-data-archive','archive',695,1317,70,55,46), mount('retrieval-tools','tools',746,1559,42,40,40),
  mount('economic-data-archive','archive',1202,1018,70,48,43), mount('schema-python','python',1253,1054,42,33,31),
  mount('plan-symbol','plan',1211,1208,81,65,43), mount('prompt-workflow','workflow',1310,1218,42,41,46),
  mount('abstract-openai-symbol','llmMark',1385,1286,73,15,15), mount('abstract-model-engine','llm',1420,1237,73,74,68), mount('agnostic-example-qa','qa',1434,1372,77,50,49),
];

const INK_LIFT = .35;
// Each text island samples only its own part of the transparent, newly typeset atlas.
export const printAreas = [
 ['upload',532,14,178,56,77],['input-head',56,88,396,48,62],['datasets-head',582,93,243,45,62],
 ['dataset-name',705,138,97,22,62],['input-paragraph',53,180,465,263,89],
 ['class-head',44,634,305,43,70],['class-llm',75,795,65,23,84],['class-llm-name',42,838,107,34,70],
 ['class-rag-title',152,687,109,49,70],['class-rag-name',163,825,86,38,70],['class-lib-name',244,837,121,35,70],
 ['type-names',402,730,124,58,58],['type-label',400,799,138,33,49],
 ['workflow-heading',605,635,344,43,70],['workflow-descr',597,687,121,64,70],['workflow-rag-top',709,682,97,44,70],
 ['workflow-rag-name',714,810,76,31,70],['workflow-ref',815,681,113,32,70],['workflow-types',755,869,182,21,70],
 ['workflow-ellipsis',860,832,32,32,70],['workflow-label',970,781,122,34,42],['embedding',884,558,187,36,39],
 ['model-heading',1180,562,324,43,70],['model-mark',1230,681,58,19,84],['model-llm-name',1208,706,79,29,70],
 ['model-rag-top',1310,657,102,33,70],['model-rag-name',1321,792,80,32,70],
 ['model-datasets',1402,776,106,35,70],['model-workflow',1191,857,119,31,70],
 ['gurobi',1371,179,116,49,46],['outcome',1193,374,346,86,76],
 ['tailored-heading',752,940,250,55,42],['agnostic-heading',1031,940,247,56,42],
 ['tailored-para-head',431,971,232,30,77],['tailored-para',431,1008,295,151,77],['final-head',765,1002,178,33,81],
 ['final-model-print',766,1039,215,133,81],['identification',592,1180,150,32,42],
 ['categories-head',441,1228,240,25,75],['categories-value',442,1255,268,24,75],
 ['tailored-dataset-head',428,1291,230,30,42],['final-llm',885,1199,76,34,42],['final-engine',915,1232,59,23,42],
 ['detail-head',763,1272,207,38,80],['detail-data',766,1311,223,209,80],['detail-rag',661,1549,65,34,42],
 ['agnostic-dataset-head',1030,998,145,36,42],['agnostic-python',1210,1088,86,35,42],
 ['schema-head',1301,961,190,33,42],['schema-print',1305,998,178,49,76],
 ['prompt',1261,1261,101,41,42],['abstract-openai',1397,1277,65,20,73],['abstract-llm',1370,1309,104,34,42],
 ['abstract-head',1038,1238,197,31,80],['abstract-plan',1038,1272,198,305,80],
 ['economic-head',1263,1357,142,53,77],['economic-text',1264,1414,191,167,77],
 ...tables.map(t=>[t.id,t.x,t.y,t.widths.reduce((a,b)=>a+b,0),t.row*t.rows,t.top]),
];

// Convert the paper layout to the right-handed scene coordinate system.
const world = (x,y,z) => [x-W/2,H/2-y,z];
function reify(parent,id,pos,col,indices,material,part) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  if(col) geometry.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=id;mesh.userData.part=part;parent.add(mesh);
  return mesh;
}
function rounded(x,y,w,h,r){
  const pts=[];
  r=Math.min(r,w/2,h/2);
  // Counterclockwise when viewed from +Z (paper coordinates have a downward Y axis).
  for(const [cx,cy,from] of [[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]]) {
    for(let n=0;n<=7;n++){const a=(from+90*n/7)*Math.PI/180;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
  }
  return pts.reverse();
}
const rgb = hex => new THREE.Color(hex).toArray();
function buffer(){return {pos:[],col:[],indices:[]};}
function appendRing(data,points,z,color){
  const index=data.pos.length/3;
  for(const [x,y] of points) {data.pos.push(...world(x,y,z));data.col.push(...color);}
  return index;
}
function ringJoin(data,r1,r2,n){
  for(let i=0;i<n;i++){const j=(i+1)%n; data.indices.push(r1+i,r1+j,r2+i,r1+j,r2+j,r2+i);}
}
function flatCap(data,points,z,color,top) {
  const ring=appendRing(data,points,z,color);
  // The rounded plates and grid cells are convex.
  for(let i=1;i<points.length-1;i++) data.indices.push(ring,ring+(top?i:i+1),ring+(top?i+1:i));
}
function appendSlab(data,x,y,w,h,r,base,top,palette,bevel) {
  const [face,edge,body]=palette.map(rgb);
  const at=inset=>rounded(x+inset,y+inset,w-2*inset,h-2*inset,Math.max(.1,r-inset));
  const outer=at(0), inner=at(bevel);
  flatCap(data,outer,base,body,false);
  const rings=[[outer,base,body],[outer,base+(top-base)*.28,body]];
  if(top-base>16) {
    rings.push([outer,top-bevel-1.7,body],[outer,top-bevel,edge]);
  } else {rings.push([outer,top-bevel,edge]);}
  rings.push([inner,top,face]);
  let previous=appendRing(data,...rings[0]);
  for(const [loop,z,color] of rings.slice(1)){
    const current=appendRing(data,loop,z,color);ringJoin(data,previous,current,outer.length);previous=current;
  }
  flatCap(data,inner,top,face,true);
}
function slab(parent,definition,material) {
  const [id,x,y,w,h,r,base,top,color]=definition;
  const data=buffer();
  appendSlab(data,x,y,w,h,r,base,top,style[color],Math.min(5,(top-base)*.12,r*.4));
  const mesh=reify(parent,id,data.pos,data.col,data.indices,material,'slab');
  mesh.userData.base=base;mesh.userData.top=top;
}
function table(parent,t,material) {
  const data=buffer(), w=t.widths.reduce((a,b)=>a+b,0), h=t.row*t.rows;
  const rail=2, cellBase=t.top-4;
  appendSlab(data,t.x-rail,t.y-rail,w+rail*2,h+rail*2,5,t.base,cellBase,style.dark,2);
  // Insets individually define the numerical cells, with narrow metal rails between them.
  const header=['#AECBD8','#96B8CA','#6A91A4'];
  const even=['#EDF4F5','#CDDFE3','#90ADB5'], odd=['#DBE9ED','#C7DBE1','#92AAB7'];
  for(let row=0;row<t.rows;row++){
    let x=t.x;
    for(const width of t.widths){
      const fill=row===0?header:row%2?even:odd;
      appendCell(data,x,t.y+t.row*row,width,t.row,cellBase,t.top,fill);
      x+=width;
    }
  }
  const mesh=reify(parent,t.id,data.pos,data.col,data.indices,material,'grid');
  Object.assign(mesh.userData,{rows:t.rows,cols:t.widths.length,base:t.base,top:t.top});
}
// Six solid faces per cell. Sub-pixel chamfers on small cell boundaries would waste fill rate.
function appendCell(data,x,y,w,h,base,top,palette){
  const inset=.47, pts=[[x+inset,y+inset],[x+inset,y+h-inset],[x+w-inset,y+h-inset],[x+w-inset,y+inset]];
  const bottom=appendRing(data,pts,base,rgb(palette[2])), upper=appendRing(data,pts,top,rgb(palette[1]));
  ringJoin(data,bottom,upper,4);flatCap(data,pts,top,rgb(palette[0]),true);flatCap(data,pts,base,rgb(palette[2]),false);
}
function vector(x,y,z) { return new THREE.Vector3(...world(x,y,z)); }
export function samplePath(points,radius) {
  const p=points.map(([x,y,z])=>vector(x,y,z)), path=new THREE.CurvePath();
  let start=p[0];
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],c=p[i+1],ab=a.clone().sub(b),cb=c.clone().sub(b);
    const r=Math.min(radius,ab.length()*.38,cb.length()*.38);
    const before=b.clone().add(ab.normalize().multiplyScalar(r)), after=b.clone().add(cb.normalize().multiplyScalar(r));
    path.add(new THREE.LineCurve3(start,before));path.add(new THREE.QuadraticBezierCurve3(before,b,after));start=after;
  }
  path.add(new THREE.LineCurve3(start,p[p.length-1]));return path;
}
export const paths = [
  ['description-to-classifier',[[215,472,15],[215,616,15]],8.5,'wire'],
  ['classifier-to-type',[[374,744,21],[401,744,21]],5,'wire'],
  ['type-to-workflow',[[524,744,21],[595,744,21]],7,'wire'],
  ['workflow-to-document',[[957,741,19],[978,741,19]],5,'wire'],
  ['document-to-model',[[1081,741,19],[1171,741,19]],7,'wire'],
  ['data-embedding-to-model',[[760,472,14],[760,601,14],[1170,601,14]],6.5,'wireGreen'],
  ['model-to-code',[[1344,554,15],[1344,464,15]],6.5,'wireGreen'],
  ['workflow-callout',[[1024,811,13],[1024,936,11]],3,'detailWire'],
  ['category-to-dataset',[[582,1284,56],[582,1323,56]],3.9,'wire'],
  ['identify-categories',[[584,1166,59],[584,1225,59]],4.5,'wire'],
  ['retrieve-data',[[582,1547,57],[582,1585,57],[879,1585,57],[879,1530,57]],4.5,'wire'],
  ['data-to-final',[[866,1265,58],[866,1183,58]],5.5,'wire'],
  ['dataset-to-schema',[[1206,1076,57],[1298,1076,57]],4.5,'wireGreen'],
  ['schema-to-llm',[[1419,1131,58],[1419,1201,58]],4,'wireGreen'],
  ['query-to-llm',[[1465,1466,59],[1493,1466,59],[1493,1246,59],[1473,1246,59]],4,'wireGreen'],
  ['llm-to-plan',[[1369,1252,60],[1241,1252,60]],5,'wireGreen'],
];
// Rounded solid conduits have a conical head terminating inside the receiver's sidewall.
function connector(parent,[id,coords,radius,tint],material) {
  const poly=coords.map(p=>[...p]), goal=vector(...poly.at(-1)), prev=vector(...poly.at(-2));
  const along=goal.clone().sub(prev).normalize(), tipLength=Math.min(radius*3.3,goal.distanceTo(prev)*.44);
  const startHead=goal.clone().addScaledVector(along,-tipLength);
  poly[poly.length-1]=[startHead.x+W/2,H/2-startHead.y,startHead.z];
  const curve=samplePath(poly,32), n=Math.max(3,Math.ceil(curve.getLength()/10));
  const shaft=new THREE.TubeGeometry(curve,n,radius,9,false);
  const arrow=new THREE.ConeGeometry(radius*2.1,tipLength,9);
  const axis=new THREE.Vector3(0,1,0);
  arrow.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis,along));
  arrow.translate(...goal.clone().addScaledVector(along,-tipLength/2).toArray());
  const data=buffer(), color=rgb(style[tint][0]);
  for(const geometry of [shaft,arrow]){
    const position=geometry.getAttribute('position'), idx=geometry.index.array, offset=data.pos.length/3;
    data.pos.push(...position.array);for(let i=0;i<position.count;i++) data.col.push(...color);
    for(const entry of idx) data.indices.push(offset+entry);
    geometry.dispose();
  }
  const mesh=reify(parent,id,data.pos,data.col,data.indices,material,'conduit');
  mesh.userData.endpoints=coords;
  // Motion reuses the actual rounded shaft and its straight arrow axis. Keeping
  // this curve on the conduit prevents a second approximation from drifting.
  const flowCurve=new THREE.CurvePath();
  for(const segment of curve.curves) flowCurve.add(segment);
  flowCurve.add(new THREE.LineCurve3(startHead,goal));
  Object.assign(mesh.userData,{flowCurve,flowRadius:radius,flowHeadLength:tipLength});
}
// The small repositories share a physical tree with the larger reference library.
// The paper draws these as unheaded links to distinguish examples from workflow transitions.
function librarySupports(parent,material) {
  const lines=[
    [[862,786,73],[862,805,73],[776,830,73]],
    [[862,805,73],[813,830,73]],
    [[862,805,73],[851,830,73]],
    [[862,805,73],[910,830,73]]
  ];
  const data=buffer(), color=rgb('#6C91A8');
  for(const coords of lines){
    const curve=samplePath(coords,6);
    const tube=new THREE.TubeGeometry(curve,Math.ceil(curve.getLength()/8),1.5,7,false);
    const verts=tube.getAttribute('position'), offset=data.pos.length/3;
    data.pos.push(...verts.array);
    for(let i=0;i<verts.count;i++)data.col.push(...color);
    for(const idx of tube.index.array)data.indices.push(offset+idx);
    tube.dispose();
  }
  reify(parent,'workflow-example-tree',data.pos,data.col,data.indices,material,'library-rack');
}
function printIslands(parent,texture) {
  const pos=[],uv=[],idx=[];
  for(const [,x,y,w,h,z] of printAreas) {
    const index=pos.length/3;
    for(const [u,v] of [[x,y],[x,y+h],[x+w,y+h],[x+w,y]]){
      pos.push(...world(u,v,z+INK_LIFT));uv.push(u/W,1-v/H);
    }
    idx.push(index,index+1,index+2,index,index+2,index+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(idx);
  texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  const ink=new THREE.Mesh(geometry,material);ink.name='diagram-typesetting';ink.userData.part='typesetting';ink.renderOrder=1;
  parent.add(ink);
}
export function buildDiagramPlates(printTexture) {
  const group=new THREE.Group();group.name='Figure 3 · apparatus';
  const surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.64,metalness:.09});
  const conduitMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.47,metalness:.22});
  for(const plate of plates) slab(group,plate,surface);
  for(const t of tables) table(group,t,surface);
  for(const path of paths) connector(group,path,conduitMaterial);
  librarySupports(group,conduitMaterial);
  if(printTexture) printIslands(group,printTexture);
  return group;
}

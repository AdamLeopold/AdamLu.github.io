import {createFramework} from './framework-3d.js?v=paper-figure-20261105-1';
import {STAGES,NODE_BY_ID,JOURNEY_EXAMPLE,routeFromRunValue} from './framework-topology.js?v=vertical-side-20261104-1';
const root = document.documentElement;
const isStaticDeployment = root.dataset.deployment === 'static';
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const state = {
  lang: root.dataset.lang === 'en' ? 'en' : 'zh',
  theme: root.dataset.theme || 'dark',
  reduced: root.dataset.motion === 'reduced',
  stage: 0, node: null, manualStage: false, free: false, follow: false, flowPlaying: true, route: 'tailored', replay: 0, study: 'large', view: 'overall', dataTable: 'demand', playing: root.dataset.motion !== 'reduced', studyPlaying: root.dataset.motion !== 'reduced',
};
const t = (zh, en) => state.lang === 'zh' ? zh : en;
const local = (value) => typeof value === 'object' ? value[state.lang] : value;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = (value) => Number(value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const number = (value, decimals = 0) => Number(value).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const modelName = (model) => model === 'gpt41' ? 'GPT-4.1' : 'gpt-oss-20B';
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const storage = (key, value) => { try { localStorage.setItem(`lean-${key}`, value); } catch (_) {} };
let research, caseData, replayTimer = null, studyTimer = null, replayVisible = false, studyVisible = false, toastTimer, frameId = 0, modelView, flowFrame, lastRunEvent, liveTrace={files:[],objective:null,status:null,runId:null,route:null};
const AUTOPLAY_DELAY = 10000;
// Follow the available space until the visitor chooses a card state.
const statusCard = $('#flow-live-status');
const fullStatus = matchMedia('(min-width: 761px) and (min-height: 680px)');
statusCard.open = fullStatus.matches;
const fitStatusCard = event => { statusCard.open = event.matches; };
fullStatus.addEventListener('change', fitStatusCard);
statusCard.querySelector('summary').addEventListener('click', () => {
  fullStatus.removeEventListener('change', fitStatusCard);
}, {once:true});

const stages = STAGES;
const shortStages = [['总览','Overview'],['输入','Inputs'],['分类检索','Classify'],['工作流','Workflow'],['读数建模','Formulate'],['代码求解','Solve'],['结果','Results']];
const replaySteps = [['输入','Input'],['分类','Classify'],['数据','Data'],['数学模型','Model'],['生成代码','Code'],['优化解','Solution']];
const studyLabels = {large:['大规模基准','Large-scale'],small:['小规模基准','Small-scale'],components:['组件设置','Components'],perturbation:['参数扰动','Perturbations'],repair:['结构修复','Audit & repair']};

function translateStatic() {
  $$('[data-zh][data-en]').forEach(el => { el.innerHTML = el.dataset[state.lang]; });
  $$('[data-zh-title]').forEach(el => {
    const label = el.dataset[state.lang === 'zh' ? 'zhTitle' : 'enTitle'];
    el.title = label; el.setAttribute('aria-label', label);
  });
  $$('[data-zh-aria]').forEach(el => el.setAttribute('aria-label', el.dataset[state.lang === 'zh' ? 'zhAria' : 'enAria']));
  root.lang = state.lang === 'zh' ? 'zh-CN' : 'en'; root.dataset.lang = state.lang;
  document.title = t('LEAN-LLM-OPT — 从语言到优化模型', 'LEAN-LLM-OPT — From language to optimization');
  $('meta[name="description"]').content = t('LEAN-LLM-OPT 的多智能体优化建模框架、运输规划案例、基准结果与交互式 Demo。','The LEAN-LLM-OPT multi-agent optimization framework, transportation case study, benchmark results, and interactive demo.');
  $('#lang-toggle').innerHTML = state.lang === 'zh' ? 'EN <span>↗</span>' : '中文 <span>↗</span>';
  $('#lang-toggle').setAttribute('aria-label', t('Switch to English', '切换到中文'));
  $('#motion-toggle').setAttribute('aria-pressed', String(state.reduced));
  $('#theme-toggle').setAttribute('aria-label', t(state.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题', state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'));
  $('#theme-toggle').setAttribute('aria-pressed', String(state.theme === 'light'));
  syncDemoLauncher();
  syncPlayButton();syncStudyPlayButton();
}
function updateURL() {
  const url = new URL(location.href);
  url.searchParams.set('lang', state.lang); url.searchParams.set('theme', state.theme);
  history.replaceState(null, '', url);
}
function anchorSnapshot() {
  const sections = $$('main section[id]');
  const current = sections.findLast(el => el.getBoundingClientRect().top < innerHeight * .42) || sections[0];
  return {element:current, top:current.getBoundingClientRect().top};
}
function restoreAnchor(snapshot) {
  const delta = snapshot.element.getBoundingClientRect().top - snapshot.top;
  if (Math.abs(delta) > 1) window.scrollTo({top: scrollY + delta, behavior:'instant'});
}
function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2600);
}

function renderArchitecture() {
  $('#arch-controls').innerHTML = shortStages.map((item,i)=>`<button type="button" data-stage="${i}" aria-pressed="${i===state.stage}"><span>0${i}</span>${item[state.lang==='zh'?0:1]}</button>`).join('');
  renderStageDetail();
}
function liveStageTitle(){
  if(!lastRunEvent)return t('等待 Demo 任务','Waiting for a demo run');
  if(state.stage===6&&['explain','clarify'].includes(liveTrace.intent))return liveTrace.intent==='explain'?t('解释当前模型','Explain the current model'):t('补充任务信息','Clarify the task');
  return local(NODE_BY_ID.get(liveTrace.nodeId)?.title||stages[state.stage].title);
}
function renderFlowStatus(frame=flowFrame){
  if(frame)flowFrame=frame;
  const paused=state.reduced||!state.flowPlaying;
  const live=state.follow;
  const label=live?liveStageTitle():local(flowFrame?.label)||t('一条运输查询的完整建模流程','One transportation query, from input to solution');
  const description=live?t('与独立 Demo 页的阶段事件同步。','Synchronized with stage events from the standalone demo.'):local(flowFrame?.description)||t('查询识别、参考检索、数据访问与程序求解依次展开。','Query classification, reference retrieval, data access, and solving run in sequence.');
  $('#flow-live-label').textContent=label;
  $('#flow-live-description').textContent=description;
  $('#flow-mode-label').textContent=live?t('Demo 实时进度','LIVE DEMO PROGRESS'):state.reduced?t('流程演示 · 静态','WORKFLOW DEMO · STATIC'):paused?t('流程演示 · 暂停','WORKFLOW DEMO · PAUSED'):t('流程演示','WORKFLOW DEMO');
  const streams=flowFrame?.streams||[];$('#flow-streams').hidden=live;$('#flow-streams').innerHTML=streams.map(f=>`<span data-stream="${esc(f.streamId)}"><b>Q${f.taskIndex} / D${f.taskIndex}</b><span>${esc(local(f.label))}</span></span>`).join('');
  $('#flow-count').textContent=!live&&flowFrame?.total?`${String(flowFrame.index+1).padStart(2,'0')} / ${String(flowFrame.total).padStart(2,'0')}`:'';
  $('#flow-live-status').dataset.paused=String(paused&&!live);
  $('#graph-play').textContent=state.reduced?t('静态视图','Static view'):state.flowPlaying?t('暂停演示','Pause animation'):t('播放演示','Play animation');
  $('#graph-play').setAttribute('aria-pressed',String(state.flowPlaying&&!state.reduced));
  $('#graph-play').disabled=state.reduced||live;
  $('#graph-replay').disabled=state.reduced||live;
}
function exampleEvidence(node){
  if(node){
    const details=[...new Map([...(node.exampleDetails||[]),...(node.details||[])].map(item=>[local(item),item])).values()].slice(0,4);
    return `<div class="stage-evidence"><p class="evidence-heading">${t('模块职责与本例内容','ROLE AND EXAMPLE')}</p><ul>${details.map(item=>`<li>${esc(local(item))}</li>`).join('')}</ul></div>`;
  }
  const wrap=content=>`<div class="stage-evidence">${content}</div>`;
  if(state.stage===0)return wrap(`<p class="evidence-heading">${t('三类智能体协作','THREE AGENT ROLES')}</p><ol class="agent-role-list"><li><b>${t('分类','Classify')}</b><span>${t('识别问题结构与类型','Identify problem structure and type')}</span></li><li><b>${t('工作流','Plan')}</b><span>${t('组织建模步骤与工具访问','Organize modeling and tool use')}</span></li><li><b>${t('模型','Formulate')}</b><span>${t('定义变量、目标与约束','Define variables, objective, constraints')}</span></li></ol>`);
  if(state.stage===1)return wrap(`<p class="evidence-heading">${t('本例数据结构','EXAMPLE DATA SCHEMA')}</p><dl class="schema-list">${JOURNEY_EXAMPLE.data.tables.map(table=>`<div><dt>${esc(table.file)}</dt><dd>${esc(table.columns?`${table.rows} × ${table.columns} · ${local(table.role)}`:table.fields.join(' · '))}</dd></div>`).join('')}</dl>`);
  if(state.stage===2)return wrap(`<p class="evidence-heading">${t('分类依据','CLASSIFICATION FEATURES')}</p><ul><li>${t('供应点、客户和运输决策','Suppliers, customers, and shipment decisions')}</li><li>${t('单位运输成本、供给上界、需求下界','Unit costs, supply limits, and demand bounds')}</li></ul><p class="type-result">TP <span>${t('运输问题 · FileQA 参考检索','Transportation · FileQA reference retrieval')}</span></p>`);
  if(state.stage===3)return wrap(`<p class="evidence-heading">${t('按类型组织工作流','TYPE-BASED WORKFLOW SELECTION')}</p><div class="workflow-options"><div class="chosen"><b>${t('类型定制 · 本例 TP','TYPE-TAILORED · THIS TP EXAMPLE')}</b><p>${t('读取运输数据 → 定义运量 → 最小化成本 → 供需约束','Read data → define shipments → minimize cost → supply and demand constraints')}</p></div><div><b>${t('通用工作流','TYPE-AGNOSTIC')}</b><p>${t('其他或混合问题先组织抽象建模计划。','Other or mixed structures first produce an abstract modeling plan.')}</p></div></div>`);
  if(state.stage===4)return wrap(`<p class="evidence-heading">${t('本例数学表述','EXAMPLE FORMULATION')}</p><div class="mini-formulation"><p><span>${t('变量','Variables')}</span><b><var>x</var><sub>ij</sub> ≥ 0 · ${JOURNEY_EXAMPLE.dimensions.suppliers} × ${JOURNEY_EXAMPLE.dimensions.customers}</b></p><p><span>${t('目标','Objective')}</span><b>min ∑<sub>ij</sub> <var>c</var><sub>ij</sub><var>x</var><sub>ij</sub></b></p><p><span>${t('需求','Demand')}</span><b>∑<sub>i</sub> <var>x</var><sub>ij</sub> ≥ <var>d</var><sub>j</sub></b></p><p><span>${t('供给','Supply')}</span><b>∑<sub>j</sub> <var>x</var><sub>ij</sub> ≤ <var>s</var><sub>i</sub></b></p></div>`);
  if(state.stage===5)return wrap(`<p class="evidence-heading">${t('从模型到可执行程序','FROM FORMULATION TO PROGRAM')}</p><ol class="agent-role-list"><li><b>CSV</b><span>${t('按供应点和客户标识读取完整系数','Load full coefficients using supplier and customer IDs')}</span></li><li><b>Python</b><span>${t('创建变量、目标函数与供需约束','Create variables, objective, supply and demand constraints')}</span></li><li><b>Gurobi</b><span>${t('求解并返回状态、目标值和变量值','Return solver status, objective, and variable values')}</span></li></ol>`);
  return wrap(`<p class="evidence-heading">${t('已记录的示例结果','RECORDED EXAMPLE RESULT')}</p><p class="example-objective"><span>${t('最优目标值','Optimal objective')}</span><b>${number(JOURNEY_EXAMPLE.result.objective,2)}</b></p><div class="result-artifacts"><span>${t('数学模型','Formulation')}</span><span>Python</span><span>${t('求解状态与运量','Solver status + shipments')}</span></div><p class="evidence-note">${esc(local(JOURNEY_EXAMPLE.result.sourceNote))}</p>`);
}
function selectedNodeIO(node){
  if(!node)return null;
  const definitions={
    query:[['业务目标、决策与约束的文字描述。','A description of the business objective, decisions, and constraints.'],['整理本次任务的优化目标与业务规则。','Organize the optimization objective and business rules.'],['贯穿后续建模步骤的问题上下文 Q1。','Query context Q1 for the subsequent modeling steps.']],
    classification:[['Q1 与 FileQA 返回的带标签参考问题。','Q1 and labeled reference problems returned by FileQA.'],['比较问题结构并识别相应的问题类型。','Compare problem structures and identify the problem type.'],['本运输示例的类型标签：TP。','Type label for this transportation example: TP.']],
    workflow:[['Q1、TP 类型及相关建模示例。','Q1, the TP type, and related formulation examples.'],['组织字段读取、变量定义、目标与约束的先后步骤。','Organize data access, variable definitions, the objective, and constraints.'],['供模型生成使用的类型定制工作流。','A type-tailored workflow for the model-generation agent.']],
    model:[['Q1、建模工作流与 CSVQA 返回的记录。','Q1, the workflow, and records returned by CSVQA.'],['将实体和系数映射到变量、目标与供需约束。','Map entities and coefficients to variables, the objective, and supply and demand constraints.'],['12 个连续运量变量及相应目标和约束。','12 continuous shipment variables with the objective and constraints.']],
    codegen:[['数学模型、数据字段映射和代码参考。','The formulation, field mapping, and code examples.'],['将模型表述转换为读取完整 CSV 的程序。','Translate the formulation into a program that reads complete CSVs.'],['生成的 Python / Gurobi 程序。','The generated Python / Gurobi program.']],
    solver:[['生成程序与本次任务的完整 CSV。','The generated program and complete task CSVs.'],['运行 Python 程序并调用 Gurobi 求解。','Execute the Python program and call Gurobi.'],['求解状态、目标值与可用的变量取值。','Solver status, objective, and available variable values.']],
    solution:[['模型、程序和求解器返回的产物。','The formulation, program, and solver output.'],['汇集同一任务的建模与运行产物。','Collect the modeling and execution artifacts for the same task.'],['数学模型、Python 程序与运输方案。','The formulation, Python program, and shipping plan.']],
    references:[['分类、建模或代码示例的检索请求。','A request for classification, formulation, or code examples.'],['匹配参考问题结构、建模方法和程序模式。','Match reference structures, modeling methods, and programming patterns.'],['带标签的问题、数学表述与代码示例。','Labeled problems, formulations, and code examples.']],
    csv:[['需求、供应能力与运输成本三份 CSV。','Three CSVs containing demand, supply capacity, and transportation costs.'],['保留本次实例的实体标识与完整数值。','Retain entity identifiers and complete coefficients for the instance.'],['供 CSVQA 与运行程序读取的数据包 D1。','Data package D1 for CSVQA and program execution.']],
    csvqa:[['模型的数据读取请求与源 CSV。','The model’s data request and source CSVs.'],['按字段读取记录并保留供应点与客户标识。','Read records by field and preserve supplier and customer identifiers.'],['返回的实例记录与字段映射。','Returned instance records and field mapping.']],
  };
  const values=definitions[node.id];return values?{input:t(...values[0]),action:t(...values[1]),output:t(...values[2])}:null;
}
function renderStageDetail() {
  const stage=stages[state.stage],node=state.node?NODE_BY_ID.get(state.node):null,context=stage.context||{};
  const replying=['explain','clarify'].includes(liveTrace.intent);
  const liveTitle=liveStageTitle();
  const liveDescription=!lastRunEvent?t('在独立 Demo 页发送任务后，这里同步显示处理阶段。','Send a task on the demo page to follow its processing stages here.'):(()=>{
    const phase=liveTrace.phase;
    if(phase==='output'||state.stage===6)return replying?(liveTrace.intent==='explain'?t('回答关于现有模型、代码或结果的问题。','Answer a question about the existing model, code, or result.'):t('整理当前任务需要补充的信息。','Identify information needed to complete the task.')):t('整理本次运行产生的模型、程序与返回结果。','Collect the formulation, program, and returned results from this run.');
    if(phase==='data')return t('读取本次任务需要的数据表与字段。','Read the tables and fields required by this task.');
    if(phase==='model')return t('生成本次任务的模型或建模计划。','Generate a formulation or modeling plan for this task.');
    if(phase==='code')return t('生成或修正本次任务的求解程序。','Generate or repair the solver program for this task.');
    if(phase==='execution')return t('显示 Python / Gurobi 执行阶段的状态与返回值。','Show the status and output of the Python / Gurobi execution stage.');
    if(phase==='workflow')return t('检索相关示例并组织本次建模步骤。','Retrieve related examples and organize the modeling steps for this task.');
    return t('读取当前请求并确定问题类型与后续操作。','Read the request and determine its problem type and next action.');
  })();
  const statusLabels={queued:t('排队中','Queued'),running:t('运行中','Running'),started:t('运行中','Running'),completed:t('已完成','Completed'),failed:t('运行失败','Failed'),error:t('运行失败','Failed'),cancelled:t('已取消','Cancelled'),cancelling:t('正在取消','Cancelling'),optimal:t('已证最优','Optimal'),infeasible:t('不可行','Infeasible'),unbounded:t('无界','Unbounded'),time_limit:t('达到求解时限','Time limit'),execution_unavailable:t('求解器不可用','Solver unavailable')};
  const query=state.follow?t('Demo 中提交的问题描述。','The query submitted in the demo.'):local(context.query||{zh:'在供给与需求约束下，最小化运输成本。',en:'Minimize transportation cost subject to supply and demand constraints.'});
  const data=state.follow?(liveTrace.files.length?liveTrace.files.join(' · '):t('本次任务的数据表。','The data tables supplied for this run.')):local(context.data||{zh:'同一组需求、供应能力与运输成本表。',en:'The same demand, supply-capacity, and transportation-cost tables.'});
  const focusedIO=selectedNodeIO(node);
  const action=state.follow?`${liveTitle} · ${statusLabels[liveTrace.status]||t('等待阶段事件','Waiting for a stage event')}`:focusedIO?.action||local(stage.action||context.action||stage.description);
  const artifact=state.follow?(replying?t('在 Demo 页查看本次回复。','View the response on the demo page.'):liveTrace.objective!=null?`${t('求解器报告目标值','Reported objective')}: ${number(liveTrace.objective,2)}`:t('模型、程序与结果在 Demo 页查看。','View the formulation, program, and result on the demo page.')):focusedIO?.output||local(stage.output||context.artifact);
  $('#arch-detail').innerHTML=`<p class="stage-kicker">${state.follow?t('实时任务','LIVE RUN'):t('步骤说明','STEP DETAILS')} / 0${state.stage}</p><h3>${esc(state.follow?liveTitle:local(node?.title||stage.title))}</h3><p class="role-summary">${esc(state.follow?liveDescription:local(node?.description||stage.description))}</p><dl class="flow-context"><div class="flow-context-item flow-query"><dt>${t('输入','INPUT')}</dt><dd>${esc(state.follow?query:focusedIO?.input||local(stage.input)||query)}</dd></div><div class="flow-context-item flow-processing"><dt>${t('处理','PROCESS')}</dt><dd>${esc(action)}</dd></div><div class="flow-context-item flow-artifact"><dt>${t('输出','OUTPUT')}</dt><dd>${esc(artifact)}</dd></div></dl>${state.follow?'':exampleEvidence(node)}<details class="task-input-details"><summary>${state.follow?t('本次任务输入','Task input'):t('本例查询与数据','Example query and data')}<span aria-hidden="true">＋</span></summary><div><p class="task-context-label">${state.follow?'QUERY':'QUERY · Q1'}</p><p>${esc(query)}</p><p class="task-context-label">${state.follow?'DATA':'DATA · D1'}</p><p>${esc(data)}</p>${!state.follow?`<ul class="task-file-list">${JOURNEY_EXAMPLE.data.files.map(file=>`<li>${esc(file)}</li>`).join('')}</ul>`:''}</div></details><p class="graph-help">${state.follow?t('阶段信息与 Demo 同步。','Stages sync with the demo.'):(canGuideScroll()?t('滚动切换视角；点击查看模块，继续滚动返回导览。','Scroll to change the view. Select a module for details, then scroll to resume the tour.'):t('选择步骤或模块查看输入、处理与输出。','Select a step or module to view its input, action, and output.'))}</p>`;
  $$('#arch-controls button').forEach((el,i)=>el.setAttribute('aria-pressed',String(i===state.stage)));
  $('#graph-free').setAttribute('aria-pressed',String(state.free));
  $('#graph-route').textContent=state.follow?(state.route==='agnostic'?t('通用工作流','Type-agnostic workflow'):t('类型定制工作流','Type-tailored workflow')):t('TP · 类型定制工作流','TP · Type-tailored workflow');
  $('#graph-mode').textContent=state.follow?t('实时任务','LIVE RUN'):state.free?t('自由查看 · 拖动平移','EXPLORE · DRAG TO PAN'):state.node?(canGuideScroll()?t('模块特写 · 滚动继续导览','MODULE VIEW · SCROLL TO RESUME'):t('模块特写','MODULE VIEW')):state.manualStage?(canGuideScroll()?t('步骤视图 · 滚动继续导览','STEP VIEW · SCROLL TO RESUME'):t('步骤视图','STEP VIEW')):canGuideScroll()?t('滚动导览','SCROLL GUIDE'):state.stage===0?t('完整框架','FULL FRAMEWORK'):t('步骤导览','STEP GUIDE');
  renderFlowStatus();
}

function canGuideScroll(){return !state.reduced;}
function canPin(){return innerWidth>1000&&innerHeight>=680&&!state.reduced;}
function architectureScrollProgress(track,box,visualBox=box){
  if(canPin())return clamp(-box.top/Math.max(1,track.offsetHeight-innerHeight));
  return clamp((innerHeight-visualBox.top)/Math.max(1,innerHeight+visualBox.height));
}
function leaveLiveFollow(){state.follow=false;state.route='tailored';$('#follow-run').setAttribute('aria-pressed','false');modelView?.setLiveMode(false);modelView?.setRunState(null);modelView?.setRoute('tailored');}
function selectStage(index,scroll=false){
  const scrollDriven=scroll&&canPin(),selectedNode=state.node;
  pageScrollIntentUntil=0;
  state.manualStage=!canPin();
  state.stage=index;state.node=null;state.free=false;leaveLiveFollow();
  if(scrollDriven&&selectedNode)modelView?.back();
  modelView?.setFree(false);
  modelView?.setStage(index);
  renderStageDetail();
  $('#follow-run').setAttribute('aria-pressed','false');
  if(scrollDriven){const track=$('#arch-track'),top=track.getBoundingClientRect().top+scrollY;const progress=index/(STAGES.length-1);window.scrollTo({top:top+(track.offsetHeight-innerHeight)*progress,behavior:'instant'});modelView?.setProgress(progress);}
  requestFrame();
}
$('#arch-controls').addEventListener('click',event=>{const button=event.target.closest('[data-stage]');if(button)selectStage(Number(button.dataset.stage),true);});
$('#arch-controls').addEventListener('keydown',event=>{const current=Number(event.target.closest('[data-stage]')?.dataset.stage);if(!Number.isInteger(current))return;let next;if(event.key==='ArrowRight')next=(current+1)%7;else if(event.key==='ArrowLeft')next=(current+6)%7;else if(event.key==='Home')next=0;else if(event.key==='End')next=6;else return;event.preventDefault();selectStage(next,true);$(`#arch-controls [data-stage="${next}"]`).focus();});
$('#graph-zoom-out').addEventListener('click',()=>modelView?.zoomBy(1/1.15));
$('#graph-zoom-in').addEventListener('click',()=>{
  if(state.stage===0&&!state.node&&!state.free&&!state.follow)selectStage(1,true);
  else modelView?.zoomBy(1.15);
});
$('#graph-play').addEventListener('click',()=>{state.flowPlaying=!state.flowPlaying;modelView?.setFlowPlaying(state.flowPlaying);renderFlowStatus();});
$('#graph-replay').addEventListener('click',()=>{state.flowPlaying=true;modelView?.restartFlow();modelView?.setFlowPlaying(true);renderFlowStatus();});
$('#graph-reset').addEventListener('click',()=>{modelView?.resetCamera();selectStage(0,true);});
$('#graph-free').addEventListener('click',()=>{pageScrollIntentUntil=0;state.free=state.follow?true:!state.free;leaveLiveFollow();modelView?.setFree(state.free);renderStageDetail();});
function syncDemoLinks(){
  const url=new URL('demo/',location.href);url.searchParams.set('lang',state.lang);url.searchParams.set('theme',state.theme);
  $$('[data-demo-link]').forEach(link=>{link.href=url.href;});
}
function syncDemoLauncher(){
  const launcher=$('#demo-launcher'),collapsed=launcher.classList.contains('is-collapsed');
  $('#demo-launcher-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('#demo-launcher-toggle').setAttribute('aria-label',collapsed?t('展开 Demo 说明','Expand demo description'):t('收起 Demo 说明','Collapse demo description'));
  $('#demo-launcher-description').hidden=collapsed;
  $('#demo-launcher-link-label').textContent=collapsed?t('试用 Demo','Try demo'):t('打开工作台','Open workspace');
  $('.demo-launcher-toggle-icon').textContent=collapsed?'+':'−';
}
function setDemoLauncherCollapsed(collapsed){
  $('#demo-launcher').classList.toggle('is-collapsed',collapsed);$('#demo-launcher').dataset.collapsed=String(collapsed);
  syncDemoLauncher();
}
const demoLauncherMedia=matchMedia('(max-width:760px)');
setDemoLauncherCollapsed(demoLauncherMedia.matches);
demoLauncherMedia.addEventListener('change',event=>setDemoLauncherCollapsed(event.matches));
$('#demo-launcher-toggle').addEventListener('click',()=>setDemoLauncherCollapsed(!$('#demo-launcher').classList.contains('is-collapsed')));
let demoChannel;
function connectDemoChannel(){
  if(isStaticDeployment){$('#follow-run').hidden=true;return;}
  try{demoChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('lean-demo-events'):null;}catch{demoChannel=null;}
  $('#follow-run').hidden=!demoChannel;
  demoChannel?.addEventListener('message',event=>{
    if(event.data?.type!=='lean:run'||!event.data.event)return;
    lastRunEvent=event.data.event;
    const record=lastRunEvent,payload=record.payload||{};
    if(record.run_id&&record.run_id!==liveTrace.runId)liveTrace={files:[],objective:null,status:null,runId:record.run_id};
    if(payload.intent)liveTrace.intent=payload.intent;
    if(record.stage&&record.stage!=='run')liveTrace.phase=record.stage;
    if(Array.isArray(payload.tables))liveTrace.files=payload.tables.map(file=>file.name).filter(Boolean);
    if(typeof payload.objective==='number')liveTrace.objective=payload.objective;
    liveTrace.route=routeFromRunValue(payload.mode)||routeFromRunValue(payload.route)||routeFromRunValue(payload.result?.workflow?.mode)||routeFromRunValue(payload.result?.classification?.route)||liveTrace.route;
    liveTrace.status=payload.status||(['token','artifact','tool'].includes(record.type)?'running':record.type);
    if(state.follow){modelView?.setRunState(lastRunEvent);if(record.type!=='token')renderStageDetail();}
  });
}
connectDemoChannel();
window.addEventListener('pagehide',()=>{demoChannel?.close();demoChannel=null;clearReplayTimer();clearStudyTimer();});
window.addEventListener('pageshow',event=>{if(event.persisted){connectDemoChannel();syncReplayPlayback();syncStudyPlayback();}});
$('#follow-run').addEventListener('click',()=>{
  if(isStaticDeployment)return;
  pageScrollIntentUntil=0;
  state.follow=!state.follow;state.free=false;state.node=null;if(state.follow&&!lastRunEvent)state.stage=0;modelView?.setFree(false);
  modelView?.setLiveMode(state.follow);
  $('#follow-run').setAttribute('aria-pressed',String(state.follow));
  if(state.follow&&lastRunEvent){state.route=liveTrace.route||'tailored';modelView?.setRoute(state.route);modelView?.setRunState(lastRunEvent);}
  else if(!state.follow)leaveLiveFollow();
  renderStageDetail();
});

function renderReplayTabs() {
  const tabs=$('#replay-tabs');
  if(tabs.dataset.lang!==state.lang || tabs.children.length!==replaySteps.length){
    tabs.innerHTML = replaySteps.map((s,i) => `<button id="replay-tab-${i}" type="button" role="tab" aria-controls="replay-content" aria-selected="${i === state.replay}" tabindex="${i === state.replay ? '0' : '-1'}" data-replay="${i}"><span>0${i+1}</span>${s[state.lang === 'zh' ? 0 : 1]}</button>`).join('');
    tabs.dataset.lang=state.lang;
  }else{
    $$('[role="tab"]',tabs).forEach((button,i)=>{button.setAttribute('aria-selected',String(i===state.replay));button.tabIndex=i===state.replay?0:-1;});
  }
}
function fileCards() {
  const files = [['customer_demand.csv',t('18 个客户群体的每日需求','Daily demand for 18 customer groups')],['supply_capacity.csv',t('18 个配送中心的供应能力','Capacity of 18 distribution centers')],['transportation_costs.csv',t('18 × 18 单位运输成本矩阵','18 × 18 unit transportation costs')]];
  return `<div class="file-list">${files.map(([f,label]) => `<a class="file-card" href="data/transport/${f}" download><span class="file-icon">CSV</span><div><b>${f}</b><p>${label}</p></div><span>↓</span></a>`).join('')}</div>`;
}
function renderReplay() {
  renderReplayTabs();
  const panel = $('#replay-content'); panel.setAttribute('aria-labelledby',`replay-tab-${state.replay}`);
  $('#replay-count').textContent = `0${state.replay+1} / 06`;
  $('#replay-stage-title').textContent = replaySteps[state.replay][state.lang === 'zh' ? 0 : 1];
  $('#replay-prev').disabled = state.replay === 0; $('#replay-next').disabled = state.replay === 5;
  let html = '';
  if (state.replay === 0) html = `<div class="case-grid"><div><p class="case-eyebrow">${t('问题描述','THE QUERY')}</p><h3 class="case-title">${t('满足客户需求，<br>最小化运输成本。','Meet every demand.<br>Minimize shipping cost.')}</h3><p class="case-description">${esc(local(caseData.query))}</p><div class="case-stats"><div><b>18</b><small>${t('配送中心','distribution centers')}</small></div><div><b>18</b><small>${t('客户群体','customer groups')}</small></div><div><b>3</b><small>${t('数据文件','data files')}</small></div></div></div>${fileCards()}</div>`;
  if (state.replay === 1) html = `<div class="case-grid"><div><p class="case-eyebrow">RECOGNIZING THE STRUCTURE</p><h3 class="case-title">${t('问题分类：运输问题。','Classification: transportation problem.')}</h3><p class="case-description">${t('分类结果为 TP（运输问题）：配送中心受供应能力限制，客户有需求下界，每条运输线路有单位成本。','The task is classified as TP, a transportation problem: distribution centers have supply limits, customers have minimum demand, and each route has a unit cost.')}</p><p class="case-mechanism">${t('框架中，TP 分类用于选择运输问题的建模工作流。','Within the framework, the TP classification selects the transportation modeling workflow.')}</p></div><div class="classification-graphic"><span class="class-result">TP<small>TRANSPORTATION PROBLEM</small></span><div class="class-types">${['NRM','RA','TP','FLP','AP','Mixture','Others'].map(v=>`<span${v==='TP'?' class="selected"':''}>${v}</span>`).join('')}</div></div></div>`;
  if (state.replay === 2) html = `<div class="case-grid"><div><p class="case-eyebrow">DATA TABLES</p><h3 class="case-title">${t('数据：需求、容量与成本。','Data: demand, capacity, and cost.')}</h3><p class="case-description">${esc(local(caseData.csvObservation))}</p><div class="case-stats"><div><b>18 × 18</b><small>${t('运输成本矩阵','shipping cost matrix')}</small></div><div><b>54</b><small>${t('源表数据行','source table rows')}</small></div></div></div><div><div class="data-toolbar"><span class="case-eyebrow">SOURCE TABLES</span><select id="case-data-select" class="data-select" aria-label="${t('选择数据表','Choose a data table')}"><option value="demand">customer_demand.csv</option><option value="supply">supply_capacity.csv</option><option value="costs">transportation_costs.csv</option></select></div><div id="case-table"></div></div></div>`;
  if (state.replay === 3) html = `<div class="case-grid"><div><p class="case-eyebrow">THE MATHEMATICAL FORMULATION</p><h3 class="case-title">${t('变量、目标与约束。','Variables, objective, and constraints.')}</h3><p class="case-description">${esc(local(caseData.model.variables))}</p><ul class="constraint-list">${caseData.model.constraints.map(v=>`<li>${esc(local(v))}</li>`).join('')}</ul></div><div class="math-block"><div class="math-line">min ∑<sub>i,j</sub> c<sub>ij</sub> x<sub>ij</sub></div><div class="math-constraint">∑<sub>i</sub> x<sub>ij</sub> ≥ d<sub>j</sub> &nbsp; ∀j<br>∑<sub>j</sub> x<sub>ij</sub> ≤ s<sub>i</sub> &nbsp; ∀i<br>x<sub>ij</sub> ≥ 0 &nbsp; ∀i,j</div><p class="math-label">${t('c：单位运输成本　d：客户需求<br>s：配送中心供应能力','c: unit shipping cost · d: customer demand<br>s: distribution-center capacity')}</p></div></div>`;
  if (state.replay === 4) {
    const start = caseData.code.indexOf('import gurobipy');
    const snippet = start >= 0 ? caseData.code.slice(start) : caseData.code;
    html = `<div><div class="code-toolbar"><span>PYTHON / GUROBI · ${t('生成程序','GENERATED PROGRAM')}</span><a class="text-link" href="data/transport-code.py" download>${t('下载完整代码 ↓','Download full code ↓')}</a></div><pre class="code-block"><code>${highlightPython(snippet)}</code></pre><p class="case-mechanism">${t('运行程序时，将 transport 数据目录放在脚本同级目录。','Place the transport data directory beside the script to run the program.')}</p></div>`;
  }
  if (state.replay === 5) html = `<div class="case-grid"><div><p class="case-eyebrow">THE RECORDED SOLUTION</p><h3 class="case-title">${t('最优方案：<br>28 条运输流。','Optimal plan:<br>28 active shipping routes.')}</h3><p class="solution-label">${t('最优目标值 / TOTAL TRANSPORT COST','OPTIMAL OBJECTIVE / TOTAL TRANSPORT COST')}</p><p class="solution-value">${number(caseData.objective,4)}</p><p class="case-description">${t('参考目标值','Reference objective')}: ${number(caseData.reference_objective,4)}</p><div class="solution-checks"><span>${t('全部客户需求得到满足','Every customer demand is satisfied')}</span><span>${t('全部配送中心容量约束得到满足','All distribution-center capacities are respected')}</span><span>${t('最优目标值与参考值匹配','Optimal objective matches the reference')}</span></div><a class="text-link" href="data/case.json" download style="display:inline-block;margin-top:20px">${t('下载案例数据 ↓','Download the case data ↓')}</a></div><div>${transportSVG()}<p class="flow-note" id="flow-inspector" role="status">${t('线宽表示运量；选择连线查看数值','Line width encodes shipment volume; select a link for values')}</p></div></div>`;
  panel.innerHTML = `<div class="case-step-enter">${html}</div>`;
  if (state.replay === 2) {$('#case-data-select').value = state.dataTable; renderCaseTable();}
  syncPlayButton();syncReplayPlayback();
}
function highlightPython(code) {
  return code.split('\n').map((line,i) => {
    // Tokenize before escaping, so string literals and comparison operators stay intact.
    const parts = line.split(/((?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|#.*$|\b(?:import|from|as|for|in|if|else|print|return)\b)/g);
    return `<span class="code-line-number">${i+1}</span>` + parts.map(part => /^['"]/.test(part) ? `<span class="code-string">${esc(part)}</span>` : /^#/.test(part) ? `<span class="code-comment">${esc(part)}</span>` : /^(import|from|as|for|in|if|else|print|return)$/.test(part) ? `<span class="code-keyword">${part}</span>` : esc(part)).join('');
  }).join('\n');
}
function tableHTML(headers, rows) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${t('可滚动数据表','Scrollable data table')}"><table class="data-table"><thead><tr>${headers.map(v=>`<th scope="col">${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderCaseTable() {
  let headers, rows;
  if (state.dataTable === 'demand') {headers=[t('客户','Customer'),t('每日需求','Daily demand')]; rows=caseData.customers.map(v=>[v.id,number(v.demand)]);}
  else if(state.dataTable === 'supply') {headers=[t('配送中心','Source'),t('供应能力','Capacity')];rows=caseData.suppliers.map(v=>[v.id,number(v.capacity)]);}
  else {headers=['S / C',...caseData.customers.map(v=>v.id)];rows=caseData.costs.map((v,i)=>[caseData.suppliers[i].id,...v.map(c=>number(c,2))]);}
  $('#case-table').innerHTML = tableHTML(headers,rows);
}
function transportSVG() {
  const left=65,right=405,top=35,step=17;
  const max = Math.max(...caseData.flows.map(v=>v.value));
  const edges=caseData.flows.map(v=>{
    const sy=top+(Number(v.source.slice(1))-1)*step,ty=top+(Number(v.target.slice(1))-1)*step;
    const label=`${v.source} → ${v.target}: ${number(v.value,2)}`;
    return `<path class="edge" d="M${left} ${sy}C200 ${sy},270 ${ty},${right} ${ty}" stroke-width="${(1+v.value/max*5).toFixed(2)}" tabindex="0" aria-label="${label}"><title>${label}</title></path>`;
  }).join('');
  const nodes=[...caseData.suppliers.map((v,i)=>`<circle class="network-node" cx="${left}" cy="${top+i*step}" r="3"/><text x="${left-12}" y="${top+i*step+3}" text-anchor="end">${v.id}</text>`),...caseData.customers.map((v,i)=>`<circle class="network-node" cx="${right}" cy="${top+i*step}" r="3"/><text x="${right+12}" y="${top+i*step+3}">${v.id}</text>`)].join('');
  return `<svg class="transport-network" viewBox="0 0 470 355" role="group" aria-label="${t('18个配送中心到18个客户的28条运输流','28 shipment flows from 18 distribution centers to 18 customer groups')}"><text class="network-label" x="${left}" y="13" text-anchor="middle">${t('配送中心','SUPPLY')}</text><text class="network-label" x="${right}" y="13" text-anchor="middle">${t('客户','DEMAND')}</text>${edges}${nodes}</svg>`;
}
function selectReplay(index, manual = true) {
  if (manual) stopReplay();
  state.replay=clamp(index,0,replaySteps.length-1);if(state.replay===replaySteps.length-1)stopReplay();renderReplay();
}
function clearReplayTimer(){if(replayTimer!==null){clearTimeout(replayTimer);replayTimer=null;}}
function stopReplay() {clearReplayTimer();state.playing=false;syncPlayButton();}
function syncReplayPlayback(){
  if(!caseData||!state.playing||state.reduced||document.hidden||!replayVisible){clearReplayTimer();return;}
  if(state.replay>=replaySteps.length-1){stopReplay();return;}
  if(replayTimer!==null)return;
  replayTimer=setTimeout(()=>{replayTimer=null;if(!state.playing||state.reduced||document.hidden||!replayVisible){syncReplayPlayback();return;}selectReplay(state.replay+1,false);},AUTOPLAY_DELAY);
}
function startReplay(){
  if(state.reduced||!caseData)return;
  if(state.replay===replaySteps.length-1)state.replay=0;
  state.playing=true;renderReplay();
}
function syncPlayButton() {
  const label=state.reduced?t('手动浏览','Manual view'):state.playing?t('暂停','Pause'):state.replay===replaySteps.length-1?t('重新播放','Replay'):t('播放','Play');
  $('#replay-play').innerHTML = `<span>${state.playing&&!state.reduced ? 'Ⅱ' : '▶'}</span><span>${label}</span>`;
  $('#replay-play').setAttribute('aria-label',state.playing?t('暂停案例播放','Pause case playback'):t('播放案例','Play case'));
  $('#replay-play').setAttribute('aria-pressed',String(state.playing&&!state.reduced));$('#replay-play').disabled=state.reduced||!caseData;
}
$('#replay-prev').addEventListener('click',()=>selectReplay(state.replay-1));
$('#replay-next').addEventListener('click',()=>selectReplay(state.replay+1));
$('#replay-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-replay]');if(button)selectReplay(Number(button.dataset.replay));});
$('#replay-content').addEventListener('change',event=>{if(event.target.id==='case-data-select'){stopReplay();state.dataTable=event.target.value;renderCaseTable();}});
$('#replay-content').addEventListener('focusin',stopReplay);
for (const type of ['pointerover','focusin','click']) $('#replay-content').addEventListener(type,event=>{
  const edge=event.target.closest('.transport-network .edge');
  if(edge) $('#flow-inspector').textContent=edge.getAttribute('aria-label');
});
$('#replay-play').addEventListener('click',()=>{
  if (state.playing) return stopReplay();
  startReplay();
});

function groupLabel(group) {
  const labels={Overall:['总体','Overall'],'Seed 17':['种子 17','Seed 17'],'Seed 42':['种子 42','Seed 42'],'Seed 73':['种子 73','Seed 73'],'Structural variants':['结构变体','Structural variants'],'RAG Only':['仅 RAG','RAG Only'],'Few-shot Only':['仅 Few-shot','Few-shot Only'],TP:['TP · 运输','TP · Transportation'],NRM:['NRM · 收益管理','NRM · Revenue management'],RA:['RA · 资源分配','RA · Resource allocation'],'UFLP/FLP':['FLP · 设施选址','FLP · Facility location'],AP:['AP · 指派','AP · Assignment'],Mixture:['混合问题','Mixed structures'],Others:['其他问题','Other structures']};
  return labels[group]?.[state.lang==='zh'?0:1] || group;
}
function renderExperiments() {
  $('#experiment-tabs').innerHTML=Object.entries(studyLabels).map(([key,v])=>`<button type="button" role="tab" id="study-tab-${key}" aria-controls="experiment-panel" aria-selected="${state.study===key}" tabindex="${state.study===key?'0':'-1'}" data-study="${key}">${v[state.lang==='zh'?0:1]}</button>`).join('');
  renderStudyPanel();
}
function renderStudyPanel() {
  const study=research.studies[state.study];
  const rows=state.study==='perturbation'?study.views[state.view]:study.rows;
  const panel=$('#experiment-panel');panel.setAttribute('aria-labelledby',`study-tab-${state.study}`);
  const big=(state.study==='large'||(state.study==='perturbation'&&state.view==='overall'));
  const html=`<div class="experiment-header"><div><h3>${esc(local(study.title))}</h3><p>${esc(local(study.description))}</p></div><div class="legend"><span>GPT-4.1</span><span>gpt-oss-20B</span></div></div><div class="chart-toolbar"><span class="metric-label">${esc(local(study.metric))} / %</span>${state.study==='perturbation'?`<div class="view-switch" role="group" aria-label="${t('扰动结果分组','Group perturbation results')}">${[['overall',t('总体','Overall')],['seed',t('按种子','By seed')],['type',t('按类型','By type')]].map(([key,label])=>`<button type="button" data-view="${key}" aria-pressed="${state.view===key}">${label}</button>`).join('')}</div>`:''}</div><div class="chart-area">${state.study==='repair'?repairChart(rows):big?largeChart(rows):barChart(rows)}</div><div class="study-footer"><p class="study-note">${esc(studyNote(state.study, study))}</p><div class="study-sources">${study.sources.map((v,i)=>`<a href="${esc(v.url)}" target="_blank" rel="noopener">${t('来源','SOURCE')} ${String(i+1).padStart(2,'0')} ↗</a>`).join('')}<a href="data/research.json" download>${t('下载汇总数据','Download data')} ↓</a></div><details class="results-table-details"><summary>${t('查看数值表与来源说明','View values and source details')}</summary>${tableHTML([t('分组','Group'),t('模型','Model'),t('正确 / 总数','Matched / total'),t('匹配率','Match rate')],rows.map(v=>[groupLabel(v.group),modelName(v.model),v.total?`${v.correct} / ${v.total}`:t('报告值','Reported'),`${pct(v.rate)}%`]))}<div class="study-sources">${study.sources.map(v=>`<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.label)} ↗</a>`).join('')}<a href="data/SOURCES.md" target="_blank">${t('完整来源说明','Source notes')} ↗</a></div></details></div>`;
  panel.innerHTML=`<div class="study-step-enter">${html}</div>`;
  $$('#experiment-tabs button').forEach(el=>{const selected=el.dataset.study===state.study;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});
  syncStudyPlayButton();syncStudyPlayback();
}
function studyNote(key,study) {
  return local(study.note);
}
function clearStudyTimer(){if(studyTimer!==null){clearTimeout(studyTimer);studyTimer=null;}}
function stopStudy(){clearStudyTimer();state.studyPlaying=false;syncStudyPlayButton();}
function selectStudy(key,manual=true){
  if(!Object.hasOwn(studyLabels,key))return;
  if(manual)stopStudy();state.study=key;
  if(key===Object.keys(studyLabels).at(-1))stopStudy();renderStudyPanel();
}
function syncStudyPlayback(){
  if(!research||!state.studyPlaying||state.reduced||document.hidden||!studyVisible){clearStudyTimer();return;}
  const keys=Object.keys(studyLabels),index=keys.indexOf(state.study);
  if(index>=keys.length-1){stopStudy();return;}
  if(studyTimer!==null)return;
  studyTimer=setTimeout(()=>{studyTimer=null;if(!state.studyPlaying||state.reduced||document.hidden||!studyVisible){syncStudyPlayback();return;}selectStudy(keys[index+1],false);},AUTOPLAY_DELAY);
}
function startStudy(){
  if(state.reduced||!research)return;
  if(state.study===Object.keys(studyLabels).at(-1))state.study=Object.keys(studyLabels)[0];
  state.studyPlaying=true;renderStudyPanel();
}
function syncStudyPlayButton(){
  const last=state.study===Object.keys(studyLabels).at(-1),label=state.reduced?t('手动浏览','Manual view'):state.studyPlaying?t('暂停切换','Pause rotation'):last?t('重新播放','Replay'):t('继续切换','Resume rotation');
  $('#study-play').textContent=label;$('#study-play').disabled=state.reduced||!research;
  $('#study-play').setAttribute('aria-label',state.studyPlaying?t('暂停实验切换','Pause study rotation'):t('播放实验结果','Play study results'));
  $('#study-play').setAttribute('aria-pressed',String(state.studyPlaying&&!state.reduced));
}
function largeChart(rows) {
  return `<div class="large-chart">${rows.map(v=>`<div class="${v.model}"><p class="model-name">LEAN-LLM-OPT / ${modelName(v.model)}</p><div class="large-score"><strong>${pct(v.rate)}<small>%</small></strong><span>${v.correct} / ${v.total}</span></div><div class="unit-grid" aria-hidden="true">${Array.from({length:v.total},(_,i)=>`<i style="--i:${i}"${i>=v.correct?' class="missed"':''}></i>`).join('')}</div><p class="unit-key">${t('每个方格代表 1 个测试问题','Each tile represents one evaluated instance')}</p></div>`).join('')}</div>`;
}
function barChart(rows) {
  const groups=[...new Set(rows.map(v=>v.group))];
  return `<div class="bar-chart">${groups.map(group=>`<div><p class="bar-group-name">${esc(groupLabel(group))}</p>${rows.filter(v=>v.group===group).map(v=>`<div class="bar-row ${v.model}"><span class="model-name">${modelName(v.model)}</span><div class="bar-track" role="img" aria-label="${esc(groupLabel(group))} ${modelName(v.model)} ${pct(v.rate)}%"><i class="bar-fill" style="--value:${v.rate}%"></i></div><span class="bar-value">${pct(v.rate)}%${v.total?`<small>${v.correct} / ${v.total}</small>`:''}</span></div>`).join('')}</div>`).join('')}</div>`;
}
function repairChart(rows) {
  return `<div class="large-chart">${rows.map(v=>`<div class="repair-model ${v.model}"><p class="model-name">${modelName(v.model)}</p><div class="repair-score"><span class="before">${v.before}</span><span class="arrow">→</span><span>${v.after}<small> / ${v.total}</small></span></div><div class="repair-track" aria-hidden="true"><i class="bar-fill" style="--value:${v.rate}%"></i><i class="repair-gain" style="--start:${v.before/v.total*100}%;--gain:${(v.after-v.before)/v.total*100}%"></i></div><p class="repair-summary">${t('目标值匹配率','Objective match rate')}: ${pct(v.before/v.total*100)}% → ${pct(v.rate)}%</p><div class="solution-checks"><span>${t('修复成功','Corrected')}: ${v.rescued}</span><span>${t('新增错误','New errors')}: ${v.harmed}</span></div></div>`).join('')}</div>`;
}
$('#experiment-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-study]');if(button)selectStudy(button.dataset.study);});
$('#experiment-panel').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button){stopStudy();state.view=button.dataset.view;renderStudyPanel();$(`[data-view="${state.view}"]`)?.focus({preventScroll:true});}});
$('#study-play').addEventListener('click',()=>{if(state.studyPlaying)stopStudy();else startStudy();});
$('#experiment-panel').addEventListener('focusin',stopStudy);
function renderAirline() {
  const study=research.studies.air;
  const groups=[...new Set(study.rows.map(v=>v.group))];
  $('#airline-results').innerHTML=`<p class="airline-metric-label">${esc(local(study.metric))}</p><div class="airline-metrics">${groups.map((group,i)=>`<div class="airline-metric"><span>${i===0?t('票价类型容量分配','Fare-type capacity allocation'):t('联合容量与航班选择','Joint allocation + flight selection')}</span>${study.rows.filter(v=>v.group===group).map(v=>`<strong>${pct(v.rate)}%<small>${modelName(v.model)}</small></strong>`).join('')}</div>`).join('')}</div><a class="airline-source" href="${research.paper.url}" target="_blank" rel="noopener">${t('论文中的模拟案例 ↗','Simulation case studies in the paper ↗')}</a>`;
}

function installTabKeyboard(container, selector, callback) {
  container.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=$$(selector,container);const current=buttons.indexOf(event.target);if(current<0)return;
    event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    callback(buttons[index]);
    const active=container.querySelector('[aria-selected="true"]');active?.focus({preventScroll:true});
  });
}
installTabKeyboard($('#replay-tabs'),'[role="tab"]',button=>selectReplay(Number(button.dataset.replay)));
installTabKeyboard($('#experiment-tabs'),'[role="tab"]',button=>selectStudy(button.dataset.study));

$('#lang-toggle').addEventListener('click',()=>{
  const position=anchorSnapshot();state.lang=state.lang==='zh'?'en':'zh';storage('lang',state.lang);
  translateStatic();renderArchitecture();modelView?.setLanguage(state.lang);syncDemoLinks();if(research){renderReplay();renderExperiments();renderAirline();}
  updateURL();restoreAnchor(position);requestFrame();
});
$('#theme-toggle').addEventListener('click',()=>{
  state.theme=state.theme==='dark'?'light':'dark';root.dataset.theme=state.theme;storage('theme',state.theme);
  $('meta[name="theme-color"]').content=state.theme==='dark'?'#070b12':'#f5f7fa';translateStatic();updateURL();modelView?.setTheme(state.theme);syncDemoLinks();requestFrame();
});
$('#motion-toggle').addEventListener('click',()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches && state.reduced){notify(t('已遵循系统的减少动态效果设置','Following your system’s reduced-motion setting'));return;}
  const position=anchorSnapshot(),inArchitecture=position.element.id==='architecture',stage=state.stage;
  state.reduced=!state.reduced;root.dataset.motion=state.reduced?'reduced':'full';storage('motion',state.reduced?'reduced':'full');
  if(state.reduced){stopReplay();stopStudy();}translateStatic();renderArchitecture();modelView?.setReduced(state.reduced);
  if(inArchitecture){
    const track=$('#arch-track'),top=track.getBoundingClientRect().top+scrollY;
    if(canPin())window.scrollTo({top:top+(track.offsetHeight-innerHeight)*stage/6,behavior:'instant'});
    else $('#arch-detail').scrollIntoView({block:'center',behavior:'instant'});
  }else restoreAnchor(position);
  requestFrame();
});
const menuButton=$('#menu-toggle');
menuButton?.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menuButton.setAttribute('aria-expanded',String(open));});
$$('.nav-links a').forEach(link=>link.addEventListener('click',()=>{document.body.classList.remove('menu-open');menuButton?.setAttribute('aria-expanded','false');}));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('menu-open')){document.body.classList.remove('menu-open');menuButton?.setAttribute('aria-expanded','false');menuButton?.focus();}});
$('#copy-citation').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(research.paper.citation);notify(t('引用已复制','Citation copied'));}
  catch(_){const selection=getSelection();const range=document.createRange();range.selectNodeContents($('#citation'));selection.removeAllRanges();selection.addRange(range);notify(t('已选中引用，可直接复制','Citation selected—copy the selected text'));}
});

// Scroll state remains separate from the shared 3D renderer's visibility-driven loop.
let architectureScrollY=null,pageScrollIntentUntil=0;
function notePageScrollIntent(){pageScrollIntentUntil=performance.now()+900;}
function notePageScrollKey(event){
  if(!['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key))return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
  notePageScrollIntent();
}
function noteScrollbarIntent(event){
  if(event.button!==undefined&&event.button!==0)return;
  if(document.documentElement.scrollHeight>innerHeight&&event.clientX>=Math.min(document.documentElement.clientWidth,innerWidth-16))notePageScrollIntent();
}
function resumeScrollGuide(pageMoved){
  if(!pageMoved||pageScrollIntentUntil<=performance.now()||!canGuideScroll()||state.follow)return;
  pageScrollIntentUntil=0;
  state.manualStage=false;
  if(state.node){state.node=null;modelView?.back();}
  if(state.free){state.free=false;modelView?.setFree(false);renderStageDetail();}
}
function requestFrame(){if(!frameId&&!document.hidden)frameId=requestAnimationFrame(frame);}
function frame(){
  frameId=0;const max=document.documentElement.scrollHeight-innerHeight;
  $('#reading-progress').style.transform=`scaleX(${max>0?clamp(scrollY/max):0})`;
  const track=$('#arch-track'),box=track.getBoundingClientRect();
  const launcher=$('#demo-launcher'),overArchitecture=box.top<innerHeight&&box.bottom>0;
  if(launcher?.classList&&overArchitecture&&!launcher.classList.contains('over-architecture'))setDemoLauncherCollapsed(true);
  launcher?.classList?.toggle('over-architecture',overArchitecture);
  const pageMoved=architectureScrollY===null||architectureScrollY!==scrollY;architectureScrollY=scrollY;
  resumeScrollGuide(pageMoved);
  if(canGuideScroll()&&!state.free&&!state.follow&&!state.node&&!state.manualStage&&(canPin()||pageMoved)){
    const visualBox=canPin()?box:$('#framework-stage').getBoundingClientRect();
    const progress=architectureScrollProgress(track,box,visualBox),stage=Math.round(progress*6);
    if(stage!==state.stage){state.stage=stage;state.node=null;renderStageDetail();}
    // Forward every fractional scroll position, including unchanged steps and
    // clamped endpoints after a fast scroll across the architecture section.
    modelView?.setProgress(progress);
  }
  let active='';for(const link of $$('.nav-links a')){if(!link.hash)continue;const section=$(link.hash);if(section?.getBoundingClientRect().top<innerHeight*.48)active=link.hash;}
  $$('.nav-links a').forEach(link=>link.classList.toggle('active',Boolean(link.hash)&&link.hash===active));
}
window.addEventListener('scroll',requestFrame,{passive:true});window.addEventListener('resize',requestFrame,{passive:true});
window.addEventListener('wheel',notePageScrollIntent,{passive:true});window.addEventListener('touchmove',notePageScrollIntent,{passive:true});
window.addEventListener('keydown',notePageScrollKey);
window.addEventListener('pointerdown',noteScrollbarIntent,{passive:true});
 document.addEventListener('visibilitychange',()=>{root.dataset.inactive=String(document.hidden);if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else requestFrame();syncReplayPlayback();syncStudyPlayback();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches){state.reduced=true;root.dataset.motion='reduced';stopReplay();stopStudy();translateStatic();renderArchitecture();modelView?.setReduced(true);requestFrame();}});
const autoplayVisibilityObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.target.id==='replay')replayVisible=entry.isIntersecting;if(entry.target.id==='experiments')studyVisible=entry.isIntersecting;}syncReplayPlayback();syncStudyPlayback();},{threshold:0});
autoplayVisibilityObserver.observe($('#replay'));autoplayVisibilityObserver.observe($('#experiments'));
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('waiting');revealObserver.unobserve(entry.target);}}),{threshold:.08});
$$('.reveal').forEach(el=>{if(el.getBoundingClientRect().top>innerHeight&&!state.reduced)el.classList.add('waiting');revealObserver.observe(el);});
translateStatic();renderArchitecture();
modelView=createFramework({detailHost:$('#framework-stage'),renderer:new URLSearchParams(location.search).get('renderer')==='svg'?'svg':'auto',onFlowChange(frame){renderFlowStatus(frame);},onStageChange(index,meta){state.stage=index;state.node=null;if(meta?.runState?.nodeId)liveTrace.nodeId=meta.runState.nodeId;if(meta?.route){state.route=meta.route;$$('[data-route]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.route===state.route)));}renderStageDetail();},onNodeSelect(id){state.node=id;if(id){pageScrollIntentUntil=0;state.free=false;leaveLiveFollow();modelView?.setFree(false);const box=$('#architecture').getBoundingClientRect();if(box.top>innerHeight*.5||box.bottom<innerHeight*.5)$('#architecture').scrollIntoView({behavior:'instant',block:'start'});}renderStageDetail();}});
modelView.setLanguage(state.lang);modelView.setTheme(state.theme);modelView.setReduced(state.reduced);syncDemoLinks();requestFrame();
try {
  [research,caseData]=await Promise.all(['data/research.json','data/case.json'].map(async path=>{const response=await fetch(new URL(`../${path}`,import.meta.url));if(!response.ok)throw new Error(`${path}: ${response.status}`);return response.json();}));
  renderReplay();renderExperiments();renderAirline();$('#citation').textContent=research.paper.citation;
  document.body.dataset.ready='true';requestFrame();
} catch(error) {
  stopReplay();stopStudy();
  console.error('Research data could not be loaded.',error);
  const message=`<p class="error-state">${t('研究数据暂时无法加载，请刷新页面或访问官方仓库。','Research data could not be loaded. Refresh the page or visit the repository.')} <a href="https://github.com/CoraLiang01/lean-llm-opt">${t('查看官方资料 ↗','View the official resources ↗')}</a></p>`;
  $('#replay-content').innerHTML=message;$('#experiment-panel').innerHTML=message;
  $('#replay-play').disabled=true;$('#replay-next').disabled=true;
}

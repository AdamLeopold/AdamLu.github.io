import {markdown, math} from './rich-text.js?v=polished-demo-20261104-1';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const params=new URLSearchParams(location.search), API='/api/demo';
const PUBLIC_HOME='https://adamleopold.github.io/AdamLu.github.io/lean-llm-opt/';
const LOCAL_WORKSPACE='http://127.0.0.1:8097/demo/';
const PUBLIC_ORIGIN='https://adamleopold.github.io',LOCAL_ORIGIN='http://127.0.0.1:8097',HANDOFF_TTL=120000;
const EXAMPLE_IDS=new Set(['tp','nrm','ra','flp','ap']);
const isLocalRuntime=['127.0.0.1','localhost','[::1]','::1'].includes(location.hostname)&&!['static','cloud'].includes(document.documentElement.dataset.deployment);
const isCloudRuntime=document.documentElement.dataset.deployment==='cloud'&&(location.protocol==='https:'||['127.0.0.1','localhost','[::1]','::1'].includes(location.hostname));
const terminal=new Set(['completed','failed','cancelled','timeout']);
const stages={classification:['问题分类','Classification'],workflow:['工作流生成','Workflow'],data:['数据读取','Data access'],model:['数学建模','Formulation'],code:['代码生成','Code generation'],execution:['求解','Solve'],output:['输出','Output']};
const statuses={queued:['排队中','Queued'],running:['运行中','Running'],started:['进行中','Working'],completed:['已完成','Completed'],failed:['失败','Failed'],error:['错误','Error'],cancelled:['已取消','Cancelled'],timeout:['超时','Timed out'],optimal:['已证最优','Optimal'],infeasible:['不可行','Infeasible'],unbounded:['无界','Unbounded'],time_limit:['达到时间上限','Time limit'],solver_stopped:['已停止，未证最优','Stopped; not proven optimal'],execution_unavailable:['执行环境不可用','Execution unavailable'],cancellation_requested:['正在停止','Stopping'],saved:['历史记录','Saved']};
const state={lang:'en',theme:document.documentElement.dataset.theme,session:null,runs:new Map(),selectedRun:null,activeRun:null,source:null,tab:'model',connected:false,health:null,lastSeq:new Map(),processNodes:new Map(),stageNodes:new Map(),downloadUrl:null,initializing:true,sending:false,capabilities:null,setupConfirmed:false,setupBusy:false,setupError:'',exampleLoading:false,catalog:[],previewFiles:[],previewMode:false,pendingExample:null,taskExample:null,resetSession:false,restoreSessionId:null,pendingSend:false,runtimeChecked:false,examplesCollapsed:false,artifactTrigger:null,history:[],historyLoading:false,historyError:'',changingSession:false,filesBusy:false,drafts:new Map()};
const welcomeTemplate=$('#welcome').cloneNode(true),t=(_zh,en)=>en,local=v=>v&&typeof v==='object'?v.en:v;
const label=k=>statuses[k]?t(...statuses[k]):k;
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e;}
function store(k,v){try{localStorage.setItem(k,v);}catch{}}
function read(k){try{return localStorage.getItem(k);}catch{return null;}}
function createRunChannel(){try{return typeof BroadcastChannel==='function'?new BroadcastChannel('lean-demo-events'):null;}catch{return null;}}
let runChannel=createRunChannel();
// Credentials are kept outside serializable session/run state and browser storage.
let openaiKey='',personalSettingsTrigger=null,pendingHandoff=null,credentialReceiver=null,cloudSessionPromise=null;
let pendingFiles=[],pendingFileSequence=0,fileQueueEpoch=0,fileReads=Promise.resolve(),pendingUpload=null;
let pendingRunIntent=null,taskRevision=0,parkedCustomTasks=[];
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)'),surfaceMotions=new Map(),dialogTriggers=new WeakMap();
let followFrame=null,followRequest=null,tokenFrame=null;
const tokenBuffers=new Map(),conversationView={session:null,lang:null,messages:new Map()},artifactViews=new Map();
let artifactRenderKey='',artifactRenderSignature='';
function focusQuietly(element){element?.focus({preventScroll:true});}
function surfaceMotion(element,show,kind='dialog',complete=()=>{}){
 const previous=surfaceMotions.get(element);let from;
 if(previous){const style=window.getComputedStyle(element);from={opacity:style.opacity,transform:style.transform};previous.animation.cancel();surfaceMotions.delete(element);}
 const outside=kind==='left'?'translateX(-18px)':kind==='right'?'translateX(18px)':kind==='fade'?'none':'translateY(8px) scale(.99)';
 if(motionPreference.matches||document.hidden||typeof element.animate!=='function'){delete element.dataset.motion;complete();return;}
 element.dataset.motion=show?'opening':'closing';const animation=element.animate([from||{opacity:show?0:1,transform:show?outside:'none'},{opacity:show?1:0,transform:show?'none':outside}],{duration:show?180:140,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});
 const entry={animation,finish(){if(surfaceMotions.get(element)!==entry)return;surfaceMotions.delete(element);animation.cancel();delete element.dataset.motion;complete();}};surfaceMotions.set(element,entry);animation.finished.then(entry.finish,()=>{});
}
function showDialog(dialog){
 const closing=dialog.dataset.motion==='closing';if(!dialog.open){dialogTriggers.set(dialog,document.activeElement);dialog.showModal();}else if(!closing)return;
 surfaceMotion(dialog,true,dialog.id==='conversation-history'?'left':'dialog');
}
function closeDialog(dialog,complete){
 if(!dialog.open){complete?.();return;}if(dialog.dataset.motion==='closing')return;
 surfaceMotion(dialog,false,dialog.id==='conversation-history'?'left':'dialog',()=>{if(complete)dialog.addEventListener('close',complete,{once:true});dialog.close();});
}
function syncOverlayInert(){
 const artifacts=document.body.classList.contains('artifacts-open'),settings=document.body.classList.contains('settings-open');
 for(const element of [$('.studio-header'),$('.mobile-view-tabs'),$('#conversation-panel')])element.inert=artifacts||settings;
 $('#settings-panel').inert=artifacts;
}
function settleMotions(){for(const entry of [...surfaceMotions.values()])entry.finish();}
function queueStageToken(element,text){
 tokenBuffers.set(element,(tokenBuffers.get(element)||'')+text);if(tokenFrame!==null||document.hidden)return;
 tokenFrame=-1;const frame=requestAnimationFrame(()=>{tokenFrame=null;for(const [target,value]of tokenBuffers){if(!target.firstChild)target.append(document.createTextNode(''));target.firstChild.appendData(value);}tokenBuffers.clear();});if(tokenFrame!==null)tokenFrame=frame;
}
function resetConversationView(){conversationView.session=null;conversationView.lang=null;conversationView.messages.clear();tokenBuffers.clear();}
function invalidateRunIntent(){taskRevision++;pendingRunIntent=null;state.pendingSend=false;}
function currentIntent(intent){return pendingRunIntent===intent&&intent.revision===taskRevision&&intent.provider===$('#provider').value&&intent.query===$('#query').value;}
function resumeRunIntent(){const intent=pendingRunIntent;if(intent&&!intent.running&&currentIntent(intent))return send(false,intent);}
function parkCustomTask(){
 if(!state.taskExample&&(pendingFiles.length||$('#query').value.trim()||state.session?.files?.length))parkedCustomTasks.push({query:$('#query').value,files:pendingFiles.slice(),sessionId:state.resetSession?null:state.session?.id||null});
 pendingFiles=[];
}
function customFilesSelected(){invalidateRunIntent();if(state.taskExample||state.pendingExample){state.resetSession=true;state.previewMode=true;state.previewFiles=[];}state.taskExample=null;state.pendingExample=null;}
async function restoreCustomTask(){
 if(state.activeRun||state.sending||state.changingSession||state.filesBusy||state.exampleLoading||!parkedCustomTasks.length)return;
 const task=parkedCustomTasks.pop();parkCustomTask();invalidateRunIntent();pendingFiles=task.files;state.taskExample=null;state.pendingExample=null;state.restoreSessionId=task.sessionId;state.resetSession=!task.sessionId;state.previewMode=true;state.previewFiles=[];$('#query').value=task.query;resizeQuery();renderFiles();
 if(task.sessionId&&state.connected&&state.setupConfirmed){state.changingSession=true;busy(null);try{await openSession(task.sessionId);state.restoreSessionId=null;state.previewMode=false;renderFiles();}catch(error){notice(error.message);}finally{state.changingSession=false;busy(null);}}
}
function redactConfiguredKey(value){return openaiKey?value.replaceAll(openaiKey,'[redacted]'):value;}
function redactSecrets(value){
 if(typeof value==='string')return redactConfiguredKey(value).replace(/(?:bearer\s+[A-Za-z0-9._-]+|\bsk-[A-Za-z0-9_-]{20,})/gi,'[redacted]');
 if(Array.isArray(value))return value.map(redactSecrets);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['api_key','authorization','password','secret','headers'].includes(key.toLowerCase())).map(([key,item])=>[key,redactSecrets(item)]));
 return value;
}
function publishRunEvent(event){runChannel?.postMessage({type:'lean:run',event:redactSecrets(event)});}
function renderPersonalSettings(){
 const working=Boolean(state.activeRun||state.sending||state.changingSession||state.exampleLoading||state.filesBusy||pendingFiles.some(f=>f.reading)||pendingHandoff),hasKey=Boolean(openaiKey),openai=$('#provider').value==='openai';
 if(hasKey&&state.noticeKind==='missing-key')notice();
 $('#key-field').hidden=!openai;$('#model').textContent=openai?'GPT-4.1':'gpt-oss:20b';
 $('#key-status').hidden=!hasKey;$('#key-status').textContent=t('已填写','Added');$('#key-configure').textContent=hasKey?t('编辑','Edit'):t('添加 Key','Add key');
 $('#personal-handoff-note').hidden=isLocalRuntime||isCloudRuntime||!$('#local-setup').open;
 $('#personal-key-note').textContent=isCloudRuntime?t('Key 保留在本页内存中，刷新、离开或关闭页面后清除。运行时会发送给此工作台的服务器，用于请求 OpenAI。','The key stays in this page’s memory until you refresh, leave, or close it. When you run, it is sent to this workspace’s server to call OpenAI.'):isLocalRuntime?t('Key 保留在本页内存中，刷新、离开或关闭页面后清除。本机运行时由本机工作台用于请求 OpenAI。','The key stays in this page’s memory until you refresh, leave, or close it. For local runs, your local workspace uses it to call OpenAI.'):t('Key 仅保留在本页内存中，刷新、离开或关闭页面后清除。在线工作台连接后，用于请求 OpenAI。','The key stays only in this page’s memory until you refresh, leave, or close it. A connected online workspace uses it to call OpenAI.');
 $('#personal-handoff-note').textContent=location.origin===PUBLIC_ORIGIN?t('点击“打开本机工作台”后，Key 可一次传入你的本机页面。连接和运行仍需在本机确认。','When you choose Open the local workspace, the key can be passed once to that local page. You still confirm the connection and run there.'):t('打开本机工作台后，请在那里重新填写 Key。','Enter the key again after opening the local workspace.');
 $('#api-key').disabled=working;$('#api-key-clear').disabled=working||!hasKey;$('#api-key-visibility').disabled=working||!hasKey;
 const shown=$('#api-key').type==='text';$('#api-key-visibility').textContent=shown?t('隐藏','Hide'):t('显示','Show');$('#api-key-visibility').setAttribute('aria-pressed',String(shown));
 $('#personal-key-status').textContent=pendingHandoff?t('正在等待本机工作台接收配置…','Waiting for the local workspace to receive your setup…'):state.changingSession||state.exampleLoading||state.filesBusy||pendingFiles.some(f=>f.reading)?t('正在准备对话或数据，请稍候。','Preparing the conversation or data. Please wait.'):working?t('当前任务正在运行，完成后可修改或清除 Key。','A run is in progress. You can change or clear the key when it finishes.'):hasKey?t('已填写；关闭设置后仍在本页会话中保留。','Key added for this page session. Closing settings keeps it available.'):t('尚未填写 Key；可以继续浏览示例。','No key added. You can still browse the examples.');
 $('#setup-key-status').textContent=isLocalRuntime?(hasKey?t('本页会话已填写 Key。','A key is available for this page session.'):t('可先连接并浏览，运行前请填写 Key。','Connect and browse now; add a key before running.')):location.origin===PUBLIC_ORIGIN?t('点击打开本机工作台后，可一次传入本页已填写的 Key。','Opening the local workspace can pass this page’s key to it once.'):t('本机工作台打开后需重新填写 Key。','Enter the key again after opening the local workspace.');
}
function openPersonalSettings(trigger=document.activeElement){
 const dialog=$('#personal-settings');if(dialog.open&&dialog.dataset.motion!=='closing')return;
 personalSettingsTrigger=trigger;closeSettings(false);$('#api-key').value=openaiKey;$('#api-key').type='password';renderPersonalSettings();
 for(const id of ['#personal-settings-open','#key-configure','#setup-personal-open'])$(id).setAttribute('aria-expanded','true');
 showDialog(dialog);focusQuietly($('#api-key').disabled?$('#personal-settings-close'):$('#api-key'));
}
function closePersonalSettings(continueIntent=false,complete){
 if(!continueIntent)invalidateRunIntent();
 $('#api-key').value='';$('#api-key').type='password';
 closeDialog($('#personal-settings'),complete);
}
function clearOpenAIKey(){openaiKey='';$('#api-key').value='';$('#api-key').type='password';renderPersonalSettings();updateSetup();}
function endHandoff(clearKey=false){
 if(!pendingHandoff)return;window.removeEventListener('message',pendingHandoff.listener);clearTimeout(pendingHandoff.timer);clearInterval(pendingHandoff.closedTimer);const hadKey=pendingHandoff.withKey;pendingHandoff=null;
 if(clearKey&&hadKey)clearOpenAIKey();else renderPersonalSettings();renderFiles();
}
function openLocalWorkspace(){
 if(pendingHandoff){pendingHandoff.target.focus();return;}
 const task=$('#query').value.trim()?{query:redactConfiguredKey($('#query').value),exampleId:state.taskExample||null,runRequested:Boolean(pendingRunIntent&&currentIntent(pendingRunIntent))}:null;
 const url=new URL(localWorkspaceURL(state.taskExample||state.pendingExample)),withKey=$('#provider').value==='openai'&&Boolean(openaiKey),canTransfer=location.origin===PUBLIC_ORIGIN&&(withKey||pendingFiles.length>0||task);
 if(!canTransfer){
  const target=window.open(url.href,'_blank');
  if(target){target.opener=null;}else notice(t('浏览器未打开新窗口。请允许本站弹出窗口后重试；也可手动打开本机工作台，在个人配置填写 Key。','The browser blocked the new window. Allow pop-ups and retry, or open the local workspace manually and add the key in Personal settings.'));
  return;
 }
 const nonce=crypto.randomUUID(),expires=Date.now()+HANDOFF_TTL;
 url.searchParams.set('handoff',nonce);url.searchParams.set('handoff_expires',String(expires));
 // This user-initiated window is the only recipient. The key is never put in its URL.
 const target=window.open(url.href,'_blank');
 if(!target){notice(t('浏览器未打开新窗口，Key 仍保留在本页。请允许弹出窗口后重试，或手动打开本机工作台并重新填写。','The browser blocked the new window. The key remains in this page. Allow pop-ups and retry, or open the local workspace manually and enter it there.'));return;}
 const handoff={target,nonce,expires,withKey,task,files:pendingFiles.slice(),sent:false,timer:null,closedTimer:null,listener:null};pendingHandoff=handoff;
 handoff.listener=event=>{
  const data=event.data;if(pendingHandoff!==handoff||Date.now()>expires||event.origin!==LOCAL_ORIGIN||event.source!==target||!data||data.nonce!==nonce)return;
  if(data.type==='lean:credential-ready'&&!handoff.sent){
   if(handoff.withKey&&!openaiKey){endHandoff();return;}handoff.sent=true;
   try{target.postMessage({type:'lean:credential',nonce,...(handoff.withKey?{key:openaiKey}:{}),files:handoff.files.map(entry=>({id:entry.id,file:entry.file})),...(handoff.task?{task:handoff.task}:{})},LOCAL_ORIGIN);}catch{endHandoff();notice(t('无法传入所选文件，请重试。文件仍保留在本页。','Could not pass the selected files. They remain in this page; retry opening the workspace.'));}
  }else if(data.type==='lean:credential-ack'&&handoff.sent){const accepted=Array.isArray(data.files)?data.files:[];pendingFiles=pendingFiles.filter(entry=>!handoff.files.includes(entry)||!accepted.includes(entry.id));endHandoff(true);toast(t('本机工作台已接收配置，请在那里确认连接。','The local workspace received your setup. Confirm the connection there.'));}
 };
 window.addEventListener('message',handoff.listener);
 handoff.closedTimer=setInterval(()=>{if(pendingHandoff===handoff&&target.closed)endHandoff(handoff.sent);},500);
 handoff.timer=setTimeout(()=>{if(pendingHandoff!==handoff)return;const sent=handoff.sent;endHandoff(sent);notice(sent?t('本机页面未确认接收。请在本机个人配置检查 Key。','The local page did not confirm receipt. Check the key in its Personal settings.'):t('等待本机工作台超时，Key 仍在本页。启动本机服务后重试，或在那里重新填写。','The local workspace did not respond in time. The key remains in this page. Start the local service and retry, or enter it there.'));},HANDOFF_TTL);
 renderPersonalSettings();renderFiles();
}
function stopCredentialReceiver(){
 if(!credentialReceiver)return;window.removeEventListener('message',credentialReceiver.listener);clearTimeout(credentialReceiver.timer);credentialReceiver=null;
}
function receiveLocalCredential(){
 const nonce=params.get('handoff'),expires=Number(params.get('handoff_expires')),opener=window.opener;
 if(!nonce&&!params.has('handoff_expires'))return;
 const cleaned=new URL(location.href);cleaned.searchParams.delete('handoff');cleaned.searchParams.delete('handoff_expires');history.replaceState(null,'',cleaned);params.delete('handoff');params.delete('handoff_expires');
 if(!isLocalRuntime||location.origin!==LOCAL_ORIGIN||!state.connected||!opener||!/^[0-9a-f-]{36}$/i.test(nonce||'')||!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+HANDOFF_TTL)return;
 const receiver={listener:null,timer:null};credentialReceiver=receiver;
 receiver.listener=event=>{
  const data=event.data;if(credentialReceiver!==receiver||Date.now()>expires||event.origin!==PUBLIC_ORIGIN||event.source!==opener||!data||data.type!=='lean:credential'||data.nonce!==nonce)return;
  const hasKey=typeof data.key==='string'&&Boolean(data.key.trim()),files=data.files===undefined?[]:data.files,task=data.task;
  if(task!==undefined&&(!task||typeof task.query!=='string'||!task.query.trim()||task.query.length>100000||task.exampleId!==null&&!EXAMPLE_IDS.has(task.exampleId)||typeof task.runRequested!=='boolean'))return;
  if(data.key!==undefined&&(typeof data.key!=='string'||data.key.length>512||!hasKey)||hasKey&&$('#provider').value!=='openai'||!Array.isArray(files)||files.length>10||files.some(item=>typeof item?.id!=='string'||item.id.length>80||!item.file||typeof item.file.slice!=='function'||!/\.csv$/i.test(item.file.name||'')||!Number.isFinite(item.file.size)||item.file.size<0)||files.reduce((sum,item)=>sum+item.file.size,0)>50*1024*1024||!hasKey&&!files.length&&!task)return;
  stopCredentialReceiver();if(hasKey)openaiKey=data.key.trim();
  if(task){invalidateRunIntent();state.taskExample=task.exampleId;state.pendingExample=task.exampleId;state.previewMode=Boolean(task.exampleId);state.previewFiles=task.exampleId?(state.catalog.find(item=>item.id===task.exampleId)?.files||[]).map((file,index)=>({...file,id:`preview-${index}`,offline:true,size:new TextEncoder().encode(file.content).length})):[];$('#query').value=redactConfiguredKey(task.query);resizeQuery();if(task.runRequested)pendingRunIntent={revision:taskRevision,provider:$('#provider').value,query:$('#query').value,running:false};}
  if(files.length)upload(files.map(item=>item.file),{defer:true,preserveTask:true});renderFiles();renderPersonalSettings();updateSetup();
  opener.postMessage({type:'lean:credential-ack',nonce,files:files.filter(item=>pendingFiles.some(entry=>entry.file===item.file)).map(item=>item.id)},PUBLIC_ORIGIN);
  window.opener=null;
 };
 window.addEventListener('message',receiver.listener);receiver.timer=setTimeout(stopCredentialReceiver,Math.max(0,expires-Date.now()));
 opener.postMessage({type:'lean:credential-ready',nonce},PUBLIC_ORIGIN);
}
function publishSession(id){runChannel?.postMessage({type:'lean:session',id});}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
function notice(text='',kind=null){state.noticeKind=kind;$('#error-notice').textContent=redactSecrets(text);$('#error-notice').hidden=!text;}
function nearBottom(){const e=$('#conversation');return e.scrollHeight-e.scrollTop-e.clientHeight<130;}
function scrollBottom(force=false,anchor=null){
 const box=$('#conversation');if(!force&&!anchor?.follow&&!nearBottom())return;
 if(followRequest){followRequest.force ||= force;return;}followRequest={force,top:anchor?.top??box.scrollTop};
 followFrame=requestAnimationFrame(()=>{const request=followRequest;followFrame=null;followRequest=null;if(!request)return;if(request.force||Math.abs(box.scrollTop-request.top)<2)box.scrollTop=box.scrollHeight;});
}
function translate(root=document){$$('[data-en]',root).forEach(e=>{e.textContent=e.getAttribute('data-en');});}
function researchHome(){const u=isLocalRuntime||isCloudRuntime?new URL(PUBLIC_HOME):new URL('../',location.href);u.searchParams.set('theme',state.theme);$('#research-home').href=u.href;$('.studio-brand').href=u.href;}
function preferences(theme,persist=false){
 state.lang='en';state.theme=theme==='light'?'light':'dark';document.documentElement.dataset.lang=state.lang;document.documentElement.dataset.theme=state.theme;document.documentElement.lang='en';
 document.title=`LEAN-LLM-OPT · ${t('建模工作台','Modeling Studio')}`;translate();$('#query').placeholder=t('描述目标、变量与约束；也可以追问或修改已有模型…','Describe the goal, decisions and constraints, or explain and revise the model…');
 if(persist)store('lean-theme',state.theme);renderHealth();renderFiles();renderVersions();renderConversation();renderArtifact();researchHome();renderPersonalSettings();updateSetup();if($('#conversation-history').open)renderHistory();
}
async function api(path,options={}){
 if(!isLocalRuntime&&!isCloudRuntime)throw new Error(t('请打开在线工作台，或使用这台电脑的本机工作台。','Open the online workspace or the local workspace on this computer.'));
 if(isCloudRuntime&&!state.connected&&path!=='/capabilities')throw new Error(t('在线服务尚未连接，请稍后重试。','The online service is not connected. Try again shortly.'));
 const response=await fetch(API+path,{credentials:'same-origin',...options,redirect:'error',cache:'no-store',headers:options.body instanceof FormData?options.headers:{'Content-Type':'application/json',...options.headers}});let data;
 try{data=redactSecrets(await response.json());}catch{throw new Error(t('无法连接建模服务，请稍后重试。','Cannot connect to the modeling service. Try again later.'));}
 if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:t('请求失败，请重试。','The request failed. Please try again.'));return data;
}
function busy(id){
 state.activeRun=id;const working=Boolean(id||state.sending||pendingRunIntent?.running||state.exampleLoading||state.changingSession||state.filesBusy||pendingFiles.some(f=>f.reading));document.body.classList.toggle('busy',working);$('#cancel-button').hidden=!id;$('#cancel-button').disabled=false;$('#send-button').hidden=Boolean(id);$('#send-button').disabled=working;
 for(const selector of ['#new-session','#provider'])$(selector).disabled=working||state.changingSession;
 renderPersonalSettings();
 $$('[data-session-id]').forEach(element=>{element.disabled=working||state.changingSession;});
 for(const selector of ['#upload-button','#file-input','#drop-zone'])$(selector).disabled=false;
 $$('.file-remove').forEach(e=>{const pending=pendingFiles.find(f=>f.id===e.dataset.pending);e.disabled=pending?Boolean(pending.uploading||pendingHandoff?.files?.includes(pending)):working||(isCloudRuntime&&$('#provider').value!=='openai');});$$('[data-example]').forEach(e=>{e.disabled=working;});$('#runtime-check').disabled=working||(!isLocalRuntime&&!isCloudRuntime)||(!isCloudRuntime&&!state.connected);
 if($('#conversation-history').open){$('#history-status').textContent=state.historyError||(state.historyLoading?t('正在读取对话…','Loading conversations…'):id?t('当前对话正在运行','The current conversation is running'):t('最近对话','Recent conversations'));const current=$$('[data-session-id]').find(element=>element.dataset.sessionId===state.session?.id),last=state.runs.get(state.session?.runs?.at(-1));if(current&&last)$('.history-meta',current).textContent=`${state.session.runs.length} ${t('次运行','runs')} · ${label(last.status)}`;}
}
function renderHealth(){
 const openai=$('#provider').value==='openai',cloud=isCloudRuntime&&openai,e=$('#connection-state');
 e.classList.toggle('online',state.connected&&state.setupConfirmed&&(openai||isLocalRuntime));e.classList.toggle('offline',(isLocalRuntime||cloud)&&!state.connected&&!state.initializing);
 $('span',e).textContent=cloud?(state.initializing?t('连接在线服务','Connecting online'):state.connected?t('在线工作台','Online workspace'):t('在线服务未连接','Service unavailable')):isLocalRuntime?(state.initializing?t('检查本机连接','Checking local connection'):state.connected?t('本机服务已连接','Local service connected'):t('本机服务未连接','Local service offline')):t('在你的电脑运行','Run on your computer');
 const ready=cloud?cloudExecutionReady():Boolean(state.health?.execution_available);
 $('#runtime-dot').style.background=cloud?(ready?'var(--success)':'var(--dim)'):state.runtimeChecked&&isLocalRuntime?(ready?'var(--success)':'var(--error)'):'var(--dim)';
 $('#runtime-title').textContent=cloud?(ready?t('Python / Gurobi · 在线就绪','Python / Gurobi · server ready'):t('在线求解环境未就绪','Server execution unavailable')):state.runtimeChecked&&isLocalRuntime?(ready?t('求解器就绪','Solver ready'):t('执行环境待配置','Execution setup needed')):t('Python / Gurobi · 本机执行','Python / Gurobi · local');
 $('#runtime-description').textContent=cloud?(ready?t('生成的 Python 程序在服务器隔离环境运行。','Generated Python runs in an isolated server environment.'):t('可浏览问题与数据。服务就绪后再提交运行。','Browse questions and data while the service becomes ready.')):state.runtimeChecked&&isLocalRuntime?(ready?t('生成程序将在本机隔离运行。','Generated programs run locally in isolation.'):t('可继续查看模型与代码。','Formulations and code remain available.')):isLocalRuntime?t('运行任务时检测执行环境，也可手动检测。','Checked when running a task; a manual check is also available.'):t('启动本机工作台后运行程序。','Start the local workspace to run programs.');
 $('#runtime-check').textContent=isCloudRuntime?t('刷新服务状态','Refresh service status'):t('检测 Python / Gurobi','Check Python / Gurobi');
 $('#query').readOnly=false;$('#query').placeholder=t('输入你自己的问题、目标与约束，也可修改示例问题…','Enter your own question, objective and constraints, or edit an example…');
 $('#local-setup-open').hidden=cloud;$('#local-setup-open').textContent=t('本机运行','Run on this computer');
 $('#model-setup-open').hidden=openai&&!isLocalRuntime;
 $('#model-location').textContent=openai?(cloud?t('固定 GPT-4.1 在线建模，Python / Gurobi 在服务器求解。','Fixed GPT-4.1 modeling with Python / Gurobi execution on the server.'):t('模型请求发送至 OpenAI，产物由本机工作台保存。','Model requests go to OpenAI; artifacts are saved by the local workspace.')):t('GPT-OSS 通过这台电脑的 Ollama 运行。','GPT-OSS uses Ollama on this computer.');
 $('.history-footer').textContent=isCloudRuntime?t('近期对话和运行产物保留在此服务器，过期后清理。','Recent conversations and run artifacts are kept on this server until they expire.'):isLocalRuntime?t('对话保存在本机工作台，服务重启后开启新的记录。','Conversations are kept by the local workspace until the service restarts.'):openai?t('连接在线服务后可查看对话记录。','Conversation history is available when the online service is connected.'):t('连接本机工作台后可查看对话记录。','Connect the local workspace to view conversation history.');
 if(openai&&!isLocalRuntime&&!isCloudRuntime){$('span',e).textContent=t('在线服务未连接','Online service not connected');$('#runtime-title').textContent=t('在线运行尚未连接','Online execution not connected');$('#runtime-description').textContent=t('可准备问题与 CSV；运行需要在线服务。','Prepare your question and CSVs here. Running requires the online service.');$('#model-location').textContent=t('GPT-4.1 · 可先准备问题和数据。','GPT-4.1 · prepare your question and data here.');}
 renderPersonalSettings();renderWelcomeDescription();
}
function cloudExecutionReady(){return Boolean(state.connected&&state.capabilities?.execution_available&&state.capabilities?.runtime?.ready);}
async function health(){
 if(!isLocalRuntime&&!isCloudRuntime){state.initializing=false;state.connected=false;renderHealth();busy(state.activeRun);return;}
 try{
  const cap=await api('/capabilities');
  const valid=isCloudRuntime?cap.service==='lean-cloud-demo'&&cap.protocol===1&&cap.mode==='cloud'&&Array.isArray(cap.providers)&&cap.providers.includes('openai')&&cap.models?.openai==='gpt-4.1':cap.service==='lean-local-companion'&&cap.protocol===1&&cap.mode!=='cloud';
  if(!valid)throw new Error('Incompatible workspace service');state.capabilities=cap;state.connected=true;
  if(isCloudRuntime){state.health={execution_available:cap.execution_available};state.runtimeChecked=Boolean(cap.runtime?.checked);}
 }catch{state.capabilities=null;state.connected=false;if(isCloudRuntime)state.setupConfirmed=false;}
 state.initializing=false;renderHealth();busy(state.activeRun);
}
async function ensureCloudSession(){
 if(!isCloudRuntime||$('#provider').value!=='openai')return false;
 if(state.connected&&state.setupConfirmed&&state.session)return true;
 if(cloudSessionPromise)return cloudSessionPromise;
 cloudSessionPromise=(async()=>{
  state.changingSession=true;busy(state.activeRun);
  try{
   if(!state.connected)await health();
   if(!state.connected){notice(t('在线服务尚未就绪，请刷新服务状态后重试。','The online service is not available. Refresh service status and try again.'));return false;}
   const reset=state.resetSession,saved=reset?null:state.restoreSessionId||state.session?.id||params.get('session')||read('lean-demo-session');
   if(saved){try{await openSession(saved);}catch{await openSession();}}else await openSession();
   if(reset){state.resetSession=false;state.previewMode=false;}state.restoreSessionId=null;state.setupConfirmed=true;renderHealth();await flushPendingFiles({allowSession:true});return true;
  }catch(error){notice(error.message);return false;}
  finally{state.changingSession=false;busy(state.activeRun);}
 })();
 try{return await cloudSessionPromise;}finally{cloudSessionPromise=null;}
}
function renderWelcomeDescription(){
 const intro=$('#welcome>p');if(!intro)return;
 intro.textContent=isCloudRuntime&&$('#provider').value==='openai'||isLocalRuntime?t('选择示例直接运行，或上传 CSV 并输入自己的问题。','Run an example, or upload CSVs and enter your own question.'):$('#provider').value==='ollama'?t('选择示例，或上传 CSV 并输入自己的问题。连接本机 Ollama 后运行。','Choose an example, or upload CSVs and enter your own question. Connect local Ollama to run.'):t('选择示例，或上传 CSV 并输入自己的问题。在线服务连接后即可运行。','Choose an example, or upload CSVs and enter your own question. Run when the online service is connected.');
}
function localWorkspaceURL(exampleId=null,provider=$('#provider').value){
 const u=new URL(LOCAL_WORKSPACE);u.searchParams.set('lang','en');u.searchParams.set('theme',state.theme);u.searchParams.set('provider',provider==='openai'?'openai':'ollama');
 if(EXAMPLE_IDS.has(exampleId)){u.searchParams.set('example',exampleId);u.searchParams.set('autorun','1');}return u.href;
}
function selectedExample(){return state.catalog.find(e=>e.id===state.pendingExample);}
function updateSetup(){
 const openai=$('#provider').value==='openai';$('#setup-title').textContent=openai?t('使用你自己的 OpenAI Key','Use your OpenAI key'):t('连接这台电脑的 GPT-OSS','Connect GPT-OSS on this computer');
 $('#setup-summary').textContent=openai?t('模型请求从你的电脑发往 OpenAI。可在个人配置提前填写 API Key；运行仍需在本机工作台确认。','Model requests go from your computer to OpenAI. Add your API key in Personal settings; confirm the run in the local workspace.'):t('GPT-OSS 通过你的电脑上的 Ollama 运行。完成首次准备后，本机工作台会自动使用本机模型。','GPT-OSS runs through Ollama on your computer. After setup, the local workspace uses that computer’s model automatically.');
 $('#setup-provider-ollama').setAttribute('aria-pressed',String(!openai));$('#setup-provider-openai').setAttribute('aria-pressed',String(openai));$('#setup-ollama').hidden=openai;$('#setup-openai').hidden=!openai;$('#setup-public').hidden=isLocalRuntime;$('#setup-key-field').hidden=!openai;$('#setup-detect').hidden=!isLocalRuntime;
 const chosen=selectedExample();$('#setup-example').hidden=!chosen;$('#setup-example').textContent=chosen?`${chosen.id.toUpperCase()} · ${local(chosen.title)} · ${local(chosen.dimensions)}`:'';
 const status=$('#setup-status');status.dataset.ready='false';status.dataset.error='false';
 if(!isLocalRuntime)status.textContent=t('完成准备后，打开本机工作台开始建模。','Finish setup, then open the local workspace to start modeling.');
 else if(state.initializing)status.textContent=t('正在读取本机服务状态…','Reading local service status…');
 else if(!state.connected){status.textContent=t('未连接到本机服务。请在运行包目录启动 scripts/run_demo.py 后重新检测。','Local service unavailable. Start scripts/run_demo.py in the runtime folder and check again.');status.dataset.error='true';}
 else if(openai){status.textContent=openaiKey?t('本机工作台已连接，当前页面已填写 API Key。','The local workspace is connected and a key is available in this page.'):t('本机工作台已连接。可先浏览，运行前请在个人配置填写 API Key。','The local workspace is connected. Browse now and add an API key in Personal settings before running.');status.dataset.ready='true';}
 else if(state.capabilities?.ollama?.ready){status.textContent=t('已检测到本机 gpt-oss:20b 和 nomic-embed-text。','Local gpt-oss:20b and nomic-embed-text are ready.');status.dataset.ready='true';}
 else{const models=state.capabilities?.ollama?.missing_models||['gpt-oss:20b','nomic-embed-text'];status.textContent=(state.capabilities?.ollama?.reachable?t('待下载模型：','Models to download: '):t('请打开本机 Ollama，并下载：','Open Ollama on this computer and download: '))+models.join(' · ');status.dataset.error='true';}
 $('#setup-confirm').textContent=!isLocalRuntime?(chosen?t('在本机打开此示例 ↗','Open this example locally ↗'):t('打开本机工作台 ↗','Open the local workspace ↗')):chosen?t('使用本机服务运行此示例','Run this example locally'):t('连接并开始建模','Connect and start modeling');
 if(state.setupError){status.textContent=state.setupError;status.dataset.ready='false';status.dataset.error='true';}
 $('#setup-confirm').disabled=state.setupBusy;$('#setup-detect').disabled=state.setupBusy;
}
function openSetup(exampleId=state.pendingExample){
 if(state.changingSession||state.filesBusy)return;
 if(EXAMPLE_IDS.has(exampleId))state.pendingExample=exampleId;
 if(isCloudRuntime&&$('#provider').value==='openai'){openPersonalSettings();return;}
 state.setupError='';if(!$('#provider').value){$('#provider').value='openai';renderPersonalSettings();}
 if(EXAMPLE_IDS.has(exampleId))state.pendingExample=exampleId;closeSettings(false);updateSetup();showDialog($('#local-setup'));
}
async function confirmSetup(){
 if(state.setupBusy)return;if(state.activeRun){$('#setup-status').textContent=t('当前任务正在运行，完成后可更改连接设置。','Wait for the current run before changing the connection.');return;}
 if(!isLocalRuntime){openLocalWorkspace();return;}
 state.setupBusy=true;state.setupError='';updateSetup();
 try{
  await health();if(!state.connected)return;
  if($('#provider').value==='ollama'&&!state.capabilities?.ollama?.ready){updateSetup();return;}
  if(!state.session||state.restoreSessionId||state.resetSession){const saved=state.resetSession?null:state.restoreSessionId||params.get('session')||read('lean-demo-session');try{await openSession(saved||undefined);}catch{await openSession();}if(state.resetSession){state.resetSession=false;state.previewMode=false;}}
  state.restoreSessionId=null;state.setupConfirmed=true;closeDialog($('#local-setup'));renderHealth();busy(state.activeRun);
  if(pendingRunIntent)await resumeRunIntent();else{if(state.pendingExample)await prepareExample();await flushPendingFiles();$('#query').focus();}
 }catch(error){state.setupError=error.message;$('#setup-status').textContent=error.message;$('#setup-status').dataset.error='true';}
 finally{state.setupBusy=false;updateSetup();}
}
async function checkRuntime(){
 if(isCloudRuntime){if(state.activeRun||state.changingSession)return;await health();if(state.connected&&$('#provider').value==='openai'){await ensureCloudSession();await resumeRunIntent();}return;}
 if(!isLocalRuntime){openSetup();return;}if(!state.connected||state.activeRun)return;$('#runtime-check').disabled=true;$('#runtime-description').textContent=t('正在检测本机 Python / Gurobi…','Checking local Python / Gurobi…');
 try{state.health=await api('/runtime/check',{method:'POST'});state.runtimeChecked=true;}catch(error){notice(error.message);}finally{renderHealth();busy(state.activeRun);}
}
async function loadCatalog(){
 const response=await fetch(new URL('examples.json',import.meta.url));if(!response.ok)throw new Error(t('无法载入示例目录，请刷新。','Could not load the example catalog. Refresh to retry.'));
 const data=await response.json();if(data.schema_version!==1||data.examples?.length!==5||new Set(data.examples.map(e=>e.id)).size!==5||data.examples.some(e=>!EXAMPLE_IDS.has(e.id)))throw new Error('Invalid example catalog');state.catalog=data.examples;renderExampleCards();
}
function renderExampleCards(){
 renderWelcomeDescription();
 const paths={tp:'M3 5h11v11H3z M14 9h4l3 4v3h-7 M5 16a2 2 0 1 0 4 0 M15 16a2 2 0 1 0 4 0',nrm:'M4 4v16h16 M8 14l4-5 4 2 4-6 M16 5h4v4',ra:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',flp:'M4 21V9l8-5 8 5v12 M8 21v-7h8v7 M8 10h0 M16 10h0',ap:'M9 6h12 M9 12h12 M9 18h12 M3 6l1 1 2-3 M3 12l1 1 2-3 M3 18l1 1 2-3'};
 for(const grid of $$('.example-grid')){if(!state.catalog.length)continue;grid.replaceChildren();for(const e of state.catalog){const card=node('button','example-card'),top=node('span','example-card-top'),badge=node('span','example-card-badge'),icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');path.setAttribute('d',paths[e.id]);icon.append(path);badge.append(icon,node('b','',e.id.toUpperCase()));card.type='button';card.dataset.example=e.id;card.setAttribute('aria-pressed',String(e.id===state.pendingExample));top.append(badge,node('span','','↗'));card.append(top,node('strong','',local(e.title)),node('small','',local(e.dimensions)),node('span','example-card-description',local(e.description)),node('span','example-card-action',t('运行此示例','Run example')));grid.append(card);}}
}

function artifactButtons(id){
 const run=state.runs.get(id),r=run?.result||{},a=r.artifacts||{},group=node('div','run-artifact-actions');group.dataset.runId=id;
 const values={model:r.model||a.formulation||a.model,code:r.code||a.code,execution:r.execution||a.execution};
 for(const [tab,title]of[['model',t('查看模型','View model')],['code',t('查看代码','View code')],['execution',t('运行结果','Solve result')]]){const button=node('button','artifact-open-button',title);button.type='button';button.dataset.openArtifact=tab;button.dataset.runId=id;button.disabled=!values[tab];button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','inspector-panel');group.append(button);}
 return group;
}
function refreshArtifactButtons(id){
 const r=state.runs.get(id)?.result||{},a=r.artifacts||{},values={model:r.model||a.formulation||a.model,code:r.code||a.code,execution:r.execution||a.execution};
 for(const group of $$('.run-artifact-actions'))if(group.dataset.runId===id)for(const button of $$('[data-open-artifact]',group))button.disabled=!values[button.dataset.openArtifact];
}
function messageNode(message){const e=node('section',`message message-${message.role}`),h=node('div','message-header'),body=node('div','message-body');h.append(node('i','',message.role==='user'?'↑':'L'),node('span','',message.role==='user'?t('你','YOU'):'LEAN-LLM-OPT'));body.append(markdown(message.content));e.append(h,body);if(message.role==='assistant'&&message.run_id)e.append(artifactButtons(message.run_id));math(body);return e;}
function renderConversation(){
 const box=$('#conversation'),bottom=nearBottom(),top=box.scrollTop,session=state.session?.id||null,messages=state.session?.messages||[];
 const rebuild=conversationView.session!==session||conversationView.lang!==state.lang;
 if(rebuild){conversationView.messages.clear();state.processNodes.clear();state.stageNodes.clear();box.replaceChildren();conversationView.session=session;conversationView.lang=state.lang;}
 const desired=[];let welcome=$('#welcome',box);
 if(!messages.length||!state.examplesCollapsed){if(!welcome){welcome=welcomeTemplate.cloneNode(true);translate(welcome);box.prepend(welcome);renderExampleCards();}desired.push(welcome);}
 const keys=new Set();messages.forEach((message,index)=>{const key=`${index}:${message.role}:${message.run_id||''}`,signature=JSON.stringify([state.lang,message.content]),saved=conversationView.messages.get(key);let entry=saved;
  if(!saved||saved.signature!==signature){entry={signature,element:messageNode(message)};conversationView.messages.set(key,entry);}keys.add(key);desired.push(entry.element);
  if(message.role==='user'&&message.run_id){let process=state.processNodes.get(message.run_id);if(!process)process=processNode(message.run_id);syncProcess(message.run_id);desired.push(process);}
 });
 for(const key of conversationView.messages.keys())if(!keys.has(key))conversationView.messages.delete(key);
 desired.forEach((element,index)=>{if(box.children[index]!==element)box.insertBefore(element,box.children[index]||null);});const keep=new Set(desired);for(const child of [...box.children])if(!keep.has(child))child.remove();
 if(messages.length&&bottom)scrollBottom(false,{top,follow:true});else if(rebuild)box.scrollTop=top;
}
function syncProcess(id){
 const run=state.runs.get(id),process=state.processNodes.get(id);if(!run||!process)return;const caption=$('.process-state',process);if(caption.textContent!==label(run.status))caption.textContent=label(run.status);
 if(terminal.has(run.status)&&run.result){const signature=JSON.stringify([run.status,run.result]);if(process.dataset.resultSignature!==signature){process.dataset.resultSignature=signature;const r=run.result;for(const [stage,payload]of[['classification',r.classification],['workflow',r.workflow],['data',r.data],['model',r.model?{formulation:r.model}:null],['code',r.code?{code:r.code}:null],['execution',r.execution]])if(payload)stageEvent(id,{stage,type:'completed',payload});}}
 if(terminal.has(run.status)){for(const card of state.stageNodes.get(id)?.values()||[])if(card.classList.contains('running')){card.classList.remove('running');$('.stage-state',card).textContent=label(run.status);const token=$('.stage-token',card);tokenBuffers.delete(token);token.textContent='';}
 if(state.session?.messages?.some(message=>message.role==='assistant'&&message.run_id===id))$('.run-artifact-actions',process)?.remove();}
 refreshArtifactButtons(id);
}
function processNode(id){const run=state.runs.get(id)||{id,status:'queued',events:[]},e=node('div','run-process'),caption=node('div','process-caption');e.dataset.runId=id;caption.append(node('span','',`${t('运行','RUN')} ${String(Math.max(0,(state.session?.runs||[]).indexOf(id))+1).padStart(2,'0')}`),node('span','process-state',label(run.status)));e.append(caption);if(!terminal.has(run.status)||!state.session?.messages?.some(message=>message.role==='assistant'&&message.run_id===id))e.append(artifactButtons(id));state.processNodes.set(id,e);state.stageNodes.set(id,new Map());if(run.events?.length){for(const event of run.events)stageEvent(id,event);}else if(run.result){const r=run.result;for(const [stage,payload]of[['classification',r.classification],['workflow',r.workflow],['data',r.data],['model',r.model?{formulation:r.model}:null],['code',r.code?{code:r.code}:null],['execution',r.execution]])if(payload)stageEvent(id,{stage,type:'completed',payload});}if(terminal.has(run.status))for(const card of state.stageNodes.get(id).values())if(card.classList.contains('running')){card.classList.remove('running');$('.stage-state',card).textContent=label(run.status);$('.stage-token',card).textContent='';}return e;}
const stageCopy={classification:['理解当前请求','Reading your request'],workflow:['匹配参考示例','Matching reference examples'],data:['准备建模数据','Preparing model data'],model:['组织变量、目标与约束','Defining variables, objective and constraints'],code:['生成求解代码','Generating solver code'],execution:['提交求解','Submitting the solve'],output:['生成回复','Preparing the response']};
function summary(stage,p,type){if(p.message){if(type==='started'&&stageCopy[stage])return t(...stageCopy[stage]);if(p.name==='code-repair')return t('根据诊断修复代码','Repairing code from the diagnostic');return p.message;}if(stage==='classification')return p.label?p.label:p.intent==='explain'?t('说明当前模型。','Explaining the current model.'):p.intent==='clarify'?t('待补充信息。','Clarification needed.'):'';if(stage==='workflow'&&p.mode)return `${p.mode==='type-tailored'?t('类型定制工作流','Type-tailored workflow'):p.mode==='type-agnostic'?t('通用工作流','Type-agnostic workflow'):p.mode} · ${p.route||''} · ${p.examples?.length||0} ${t('个参考示例','references')}`;if(stage==='data'&&p.tables)return p.tables.map(f=>`${f.name} · ${f.row_count??'?'} ${t('行','rows')}`).join('\n');if(stage==='model'&&(p.formulation||p.content))return t('模型已生成。','Model generated.');if(stage==='code'&&(p.code||p.content))return t('求解程序已生成。','Solver code generated.');if(stage==='execution'&&p.status==='execution_unavailable')return t('求解器不可用，模型与代码已保留。','Solver unavailable; the model and code are retained.');if(stage==='execution'&&p.status)return `${label(p.status)}${p.objective!=null?` · ${t('目标值','Objective')} ${number(p.objective)}`:''}${p.error?`\n${p.error}`:''}`;if(stage==='output'&&p.answer)return t('回复已生成。','Response ready.');if(p.error)return p.error;return type==='completed'?t('已完成','Completed'):'';}
function stageEvent(id,event){if(!stages[event.stage])return;const process=state.processNodes.get(id);if(!process)return;const cards=state.stageNodes.get(id);let card=cards.get(event.stage);if(!card){card=node('div','stage-card running');const h=node('div','stage-heading');h.append(node('span','stage-icon',String(cards.size+1).padStart(2,'0')),node('strong','',t(...stages[event.stage])),node('span','stage-state',t('进行中','Working')));card.append(h,node('p','stage-detail'),node('div','stage-tools'),node('div','stage-token'));process.append(card);cards.set(event.stage,card);}const p=event.payload||{};if(event.type==='started'){card.className='stage-card running';$('.stage-state',card).textContent=t('进行中','Working');}if(['completed','error'].includes(event.type)){card.className=`stage-card ${event.type==='error'?'error':'completed'}`;$('.stage-state',card).textContent=event.type==='error'?t('错误','Error'):t('已完成','Done');$('.stage-icon',card).textContent=event.type==='error'?'!':'✓';const token=$('.stage-token',card);tokenBuffers.delete(token);token.textContent='';}if(event.type==='token'){queueStageToken($('.stage-token',card),p.text||'');return;}if(event.type==='tool')$('.stage-tools',card).textContent=`${p.name==='code-repair'?t('代码修复','Code repair'):p.name||t('工具','Tool')} · ${label(p.status||'')}${p.examples?` · ${p.examples.length} ${t('个参考示例','references')}`:''}`;const text=summary(event.stage,p,event.type);if(text)$('.stage-detail',card).textContent=text;}

function renderFiles(){
 const list=$('#file-list');list.replaceChildren();const files=[...(state.previewMode?state.previewFiles:(state.session?.files||state.previewFiles)),...pendingFiles];
 for(const f of files){const row=node('div',`file-row${f.pending?' pending':''}`),open=node('button','file-open'),info=node('span','file-info');open.type='button';open.disabled=Boolean(f.reading||f.error);const detail=f.reading?t('正在读取 CSV…','Reading CSV…'):f.error?t('无法预览，请移除后重选','Cannot preview; remove and select again'):`${f.row_count} ${t('行','rows')} · ${f.columns.length} ${t('列','columns')}${f.pending?' · '+(f.uploading?t('上传中','Uploading'):t('待上传','Ready to upload')):''}`;info.append(node('strong','',f.name),node('small','',detail));open.append(node('span','csv-icon','CSV'),info);open.addEventListener('click',()=>preview(f));const remove=node('button','file-remove','×');remove.type='button';remove.hidden=Boolean(f.offline&&!f.pending);if(f.pending)remove.dataset.pending=f.id;remove.disabled=f.pending?Boolean(f.uploading||pendingHandoff?.files?.includes(f)):Boolean(state.activeRun)||(isCloudRuntime&&$('#provider').value!=='openai');remove.setAttribute('aria-label',`${t('删除','Remove')} ${f.name}`);remove.addEventListener('click',()=>removeFile(f.id));row.append(open,remove);list.append(row);}
 $('#restore-custom-task').hidden=!parkedCustomTasks.length;$('#restore-custom-task').textContent=t('恢复自定义任务','Restore custom draft');
 $('#session-caption').textContent=pendingFiles.length?t('已选文件保留在本页，连接工作台或发送时上传。','Selected files stay in this page and upload when you connect or send.'):state.previewMode?t('示例数据预览','Example data preview'):state.session?t('当前会话','Current session'):'';
}
function readCSVFile(file){if(typeof file.text==='function')return file.text();return new Promise((resolve,reject)=>{const reader=new window.FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error(t('无法读取 CSV 文件。','Could not read the CSV file.')));reader.readAsText(file);});}
function csvPreview(text){
 text=text.replace(/^\uFEFF/,'');if(text.includes('\0'))throw new Error(t('CSV 需要 UTF-8 文本。','CSV files must contain UTF-8 text.'));const rows=[];let row=[],cell='',quoted=false,touched=false,count=0,columns=null;
 const field=()=>{row.push(cell);cell='';},line=()=>{if(touched||row.length||cell)field();if(columns===null)columns=row;else{count++;if(rows.length<20)rows.push(row);}row=[];touched=false;};
 for(let i=0;i<text.length;i++){const char=text[i];if(char!=='\n'&&char!=='\r')touched=true;if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=char;}else if(char===','&&!quoted)field();else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;line();}else cell+=char;}
 if(quoted)throw new Error(t('CSV 引号未闭合，请检查文件。','The CSV contains an unclosed quoted field.'));
 if(touched||cell||row.length)line();if(!columns?.length||columns.length>1000)throw new Error(t('CSV 需要表头，且不超过 1000 列。','A CSV needs a header with no more than 1,000 columns.'));
 return {columns,row_count:count,preview:rows};
}
async function upload(files,{defer=false,preserveTask=false}={}){
 if(files.some(file=>/\.csv$/i.test(file.name||''))&&!preserveTask)customFilesSelected();
 const epoch=fileQueueEpoch,existing=state.resetSession?[]:state.session?.files||[];let problem='';
 for(const file of files){
  if(!/\.csv$/i.test(file.name||'')){problem=t('请选择 .csv 文件。','Choose .csv files.');continue;}
  if([...existing,...pendingFiles].some(item=>item.name===file.name)){problem=t('此名称的 CSV 已在文件列表中，请先移除旧文件或重命名。','A CSV with this name is already listed. Remove it or rename the new file first.');continue;}
  if(existing.length+pendingFiles.length>=10||[...existing,...pendingFiles].reduce((sum,f)=>sum+(f.size||0),0)+(file.size||0)>50*1024*1024){problem=t('每次对话最多 10 个 CSV，总计 50 MB。','A conversation supports up to 10 CSVs and 50 MB in total.');continue;}
  const entry={id:`pending-${++pendingFileSequence}`,file,name:file.name,size:file.size||0,columns:[],preview:[],row_count:0,pending:true,reading:true,uploading:false};pendingFiles.push(entry);
  fileReads=fileReads.then(async()=>{try{const data=csvPreview(await readCSVFile(file));if(epoch===fileQueueEpoch&&(pendingFiles.includes(entry)||parkedCustomTasks.some(task=>task.files.includes(entry))))Object.assign(entry,data);}catch(error){entry.error=true;problem=error.message;}finally{entry.reading=false;if(epoch===fileQueueEpoch){renderFiles();busy(state.activeRun);}}});
 }
 $('#file-input').value='';renderFiles();busy(state.activeRun);await fileReads;if(epoch!==fileQueueEpoch)return;
 if(problem)notice(problem);if(!defer&&!pendingUpload)await flushPendingFiles();
}
async function flushPendingFiles({allowExample=false,allowSession=false}={}){
 await fileReads;if(!pendingFiles.length&&!state.resetSession)return true;if(pendingUpload)return pendingUpload;
 if(state.previewMode&&state.pendingExample||!state.session||!state.connected||!state.setupConfirmed||(!isLocalRuntime&&!isCloudRuntime)||(isCloudRuntime&&$('#provider').value!=='openai')||state.activeRun||state.sending||state.changingSession&&!allowSession||state.exampleLoading&&!allowExample||state.filesBusy)return false;
 if(pendingFiles.some(f=>f.error)){notice(t('请移除无法读取的 CSV 后重试。','Remove the unreadable CSV and try again.'));return false;}
 let session=state.session;pendingUpload=(async()=>{
  state.filesBusy=true;busy(state.activeRun);
  try{if(state.resetSession){await openSession();session=state.session;state.resetSession=false;state.previewMode=false;state.previewFiles=[];}while(pendingFiles.length){await fileReads;if(state.session?.id!==session.id)return false;if(pendingFiles.some(f=>f.error))return false;const batch=pendingFiles.slice(),form=new FormData();for(const entry of batch){entry.uploading=true;form.append('files',entry.file);}renderFiles();
   const p=await api(`/sessions/${session.id}/files`,{method:'POST',body:form});if(state.session?.id!==session.id)return false;session.files=p.files;pendingFiles=pendingFiles.filter(f=>!batch.includes(f));renderFiles();}
   toast(t('CSV 已上传','CSV files uploaded'));return true;
  }catch(error){let duplicate=false;try{const latest=await api(`/sessions/${session.id}`);if(state.session?.id===session.id&&Array.isArray(latest.files)){session.files=latest.files;duplicate=pendingFiles.some(entry=>latest.files.some(file=>file.name===entry.name));}}catch{}notice(error.message+(duplicate?' '+t('服务器已保留同名文件。请预览确认后移除对应的待上传项，再发送。','The server already has files with these names. Preview them, remove the matching queued copies, then send.') :''));return false;}finally{pendingFiles.forEach(f=>{f.uploading=false;});state.filesBusy=false;renderFiles();busy(state.activeRun);}
 })();try{return await pendingUpload;}finally{pendingUpload=null;}
}
function preview(f){$('#preview-title').textContent=f.name;$('#preview-meta').textContent=`${f.row_count} ${t('行','rows')} · ${f.columns.length} ${t('列','columns')} · ${(f.size/1024).toFixed(1)} KB`;const table=node('table'),head=node('thead'),hr=node('tr'),body=node('tbody');for(const col of f.columns)hr.append(node('th','',col||t('(索引)','(index)')));head.append(hr);for(const values of f.preview||[]){const row=node('tr');for(const v of values)row.append(node('td','',v));body.append(row);}table.append(head,body);$('#preview-table').replaceChildren(table);showDialog($('#file-preview'));}
async function removeFile(id){
 invalidateRunIntent();
 const pending=pendingFiles.find(f=>f.id===id);if(pending){if(pending.uploading||pendingHandoff?.files?.includes(pending))return;pendingFiles=pendingFiles.filter(f=>f!==pending);renderFiles();return;}
 if(isCloudRuntime&&$('#provider').value!=='openai')return;
 if(!state.session||state.activeRun||state.sending||state.changingSession||state.filesBusy||state.exampleLoading)return;
 const session=state.session;state.filesBusy=true;busy(state.activeRun);
 try{const p=await api(`/sessions/${session.id}/files/${id}`,{method:'DELETE'});if(state.session?.id!==session.id)return;session.files=p.files;renderFiles();}
 catch(error){notice(error.message);}finally{state.filesBusy=false;busy(state.activeRun);}
}
function closeSettings(restoreFocus=true){
 const panel=$('#settings-panel'),wasOpen=document.body.classList.contains('settings-open');if(!wasOpen||panel.dataset.motion==='closing')return;
 $('#settings-open').setAttribute('aria-expanded','false');
 const done=()=>{document.body.classList.remove('settings-open');$('#drawer-backdrop').hidden=true;panel.removeAttribute('role');panel.removeAttribute('aria-modal');syncOverlayInert();if(restoreFocus)focusQuietly($('#settings-open'));};
 if(!matchMedia('(max-width:950px)').matches){surfaceMotions.get(panel)?.animation.cancel();surfaceMotions.delete(panel);delete panel.dataset.motion;done();return;}
 surfaceMotion($('#drawer-backdrop'),false,'fade');surfaceMotion(panel,false,'left',done);
}
function openSettings(){
 const panel=$('#settings-panel');if(document.body.classList.contains('settings-open')&&panel.dataset.motion!=='closing')return;document.body.classList.add('settings-open');$('#drawer-backdrop').hidden=false;$('#settings-open').setAttribute('aria-expanded','true');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');syncOverlayInert();surfaceMotion($('#drawer-backdrop'),true,'fade');surfaceMotion(panel,true,'left');focusQuietly($('#settings-close'));
}
function drawerKeys(event){if(!document.body.classList.contains('settings-open')||$('#file-preview').open||$('#local-setup').open||$('#personal-settings').open)return;if(event.key==='Escape'){event.preventDefault();closeSettings();return;}if(event.key!=='Tab')return;const items=$$('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]',$('#settings-panel')).filter(element=>!element.hidden&&element.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(!$('#settings-panel').contains(document.activeElement)){event.preventDefault();first.focus();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}

async function example(id,{previewOnly=false}={}){
 if(state.activeRun||state.sending||pendingRunIntent?.running||state.exampleLoading||state.changingSession||state.filesBusy)return false;const item=state.catalog.find(e=>e.id===id);if(!item){notice(t('示例目录尚未载入，请刷新后重试。','The example catalog is not ready. Refresh to retry.'));return false;}
 invalidateRunIntent();parkCustomTask();state.taskExample=id;state.pendingExample=id;state.resetSession=false;state.previewMode=true;state.previewFiles=item.files.map((f,index)=>({...f,id:`preview-${index}`,offline:true,size:new TextEncoder().encode(f.content).length}));$('#query').value=local(item.query);resizeQuery();renderFiles();notice();
 if(previewOnly){if(state.connected&&state.setupConfirmed&&state.session)await prepareExample();return true;}
 await send();return true;
}
async function prepareExample(){
 const id=state.pendingExample;if(!id)return true;
 if(!state.session||!state.connected||!state.setupConfirmed)return false;
 state.exampleLoading=true;busy(state.activeRun);
 try{if(state.session.messages?.length||state.session.files?.length)await openSession();const p=await api(`/sessions/${state.session.id}/examples/${id}`,{method:'POST'});state.session.files=p.files;if(state.taskExample!==id||state.pendingExample!==id)return false;state.previewMode=false;state.previewFiles=[];state.pendingExample=null;renderFiles();closeSettings(false);return true;}
 catch(error){notice(error.message);return false;}finally{state.exampleLoading=false;busy(state.activeRun);}
}
function renderVersions(){const select=$('#version-select'),ids=state.session?.runs||[],signature=JSON.stringify([state.lang,state.selectedRun,ids.map(id=>[id,state.runs.get(id)?.status])]);if(select.dataset.signature===signature)return;select.dataset.signature=signature;select.replaceChildren();if(!ids.length){select.append(node('option','',t('尚无运行记录','No runs yet')));return;}for(let i=ids.length-1;i>=0;i--){const id=ids[i],run=state.runs.get(id),option=node('option','',`${t('运行','Run')} ${String(i+1).padStart(2,'0')} · ${label(run?.status||'completed')}`);option.value=id;option.selected=id===state.selectedRun;select.append(option);}}
function result(){return state.runs.get(state.selectedRun)?.result||{};}
function artifact(){const r=result(),a=r.artifacts||{};return state.tab==='model'?r.model||a.formulation||a.model||'':state.tab==='code'?r.code||a.code||'':r.execution||a.execution||null;}
function number(n){return typeof n==='number'?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(n):String(n);}
function safeArtifactUrl(value){try{const u=new URL(value,location.href);return u.origin===location.origin&&u.pathname.startsWith(`${API}/runs/${state.selectedRun}/artifacts/`)?u.href:null;}catch{return null;}}
function executionView(value){
 const root=node('div');let rawRecord=null;
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{rawRecord=value;value={status:'record_only'};}}
 const status=value.status||'error',runStatus=state.runs.get(state.selectedRun)?.status||'saved';
 const overview=node('dl','result-status-grid');
 const addStatus=(title,content)=>{const row=node('div','result-status-row'),description=node('dd');description.append(typeof content==='string'?document.createTextNode(content):content);row.append(node('dt','',title),description);overview.append(row);};
 addStatus(t('流程状态','Run status'),label(runStatus));
 addStatus(t('求解状态','Solver status'),node('span',`result-status ${['optimal','completed'].includes(status)?'':'bad'}`,status==='record_only'?t('查看原始记录','See source record'):label(status)));
 addStatus(t('建模验证','Model review'),t('待人工确认','Pending review'));
 const statusHelp=node('details','status-help');statusHelp.append(node('summary','',t('状态说明','About these statuses')),node('p','validation-note',t('求解状态针对生成的数学模型；请依据业务目标和约束核对模型定义。','Solver status applies to the generated mathematical model. Review its definitions against the business objective and constraints.')));root.append(overview,statusHelp);
 if(rawRecord){root.append(node('pre','result-log',rawRecord));return root;}
 if(status==='solver_stopped'){const code=value.solver_status_code;root.append(node('p','field-hint',t('尚未证得最优解。','Optimality has not been proven.')+(code!=null?` ${t('状态码','Status code')}: ${code}`:'')));}

if(value.objective!=null)root.append(node('p','objective-label',t('求解目标值','SOLVER OBJECTIVE')),node('p','objective-value',number(value.objective)));if(status==='execution_unavailable')root.append(node('p','result-error',t('求解器不可用，尚未执行。','Solver unavailable. Not executed.')));else if(value.error)root.append(node('p','result-error',value.error));const variables=value.variables||value.solution||[];if(variables.length){const section=node('section','result-section');section.append(node('h3','',`${t('决策变量','DECISION VARIABLES')} / ${variables.length}`));const box=node('div','result-scroll'),table=node('table','result-table'),thead=node('thead'),head=node('tr'),body=node('tbody');head.append(node('th','',t('变量','Variable')),node('th','',t('取值','Value')));thead.append(head);for(const v of variables.slice(0,250)){const row=node('tr');row.append(node('td','',Array.isArray(v)?v[0]:v.name),node('td','',number(Array.isArray(v)?v[1]:v.value)));body.append(row);}table.append(thead,body);box.append(table);section.append(box);if(variables.length>250)section.append(node('p','field-hint',t('显示前 250 项；下载完整结果查看全部变量。','Showing 250 variables; download the full result for all values.')));root.append(section);}for(const[key,title]of[['stdout',t('标准输出','STANDARD OUTPUT')],['stderr',t('错误输出','ERROR OUTPUT')]])if(value[key]){const details=node('details','result-section');details.append(node('summary','',title),node('pre','result-log',value[key]));root.append(details);}return root;}
function saveArtifactView(content){
 return {top:content.scrollTop,left:content.scrollLeft,details:$$('details',content).map(element=>element.open),scrolls:$$('pre,.result-scroll,.markdown-table',content).map(element=>[element.scrollTop,element.scrollLeft]),focus:content.contains(document.activeElement)?$$('summary',content).indexOf(document.activeElement):-1};
}
function restoreArtifactView(content,key){
 const saved=artifactViews.get(key);if(saved)$$('details',content).forEach((element,index)=>{element.open=Boolean(saved.details[index]);});content.scrollTop=saved?.top||0;content.scrollLeft=saved?.left||0;if(!saved)return;
 $$('pre,.result-scroll,.markdown-table',content).forEach((element,index)=>{const position=saved.scrolls[index];if(position){element.scrollTop=position[0];element.scrollLeft=position[1];}});if(saved.focus>=0)focusQuietly($$('summary',content)[saved.focus]);
}
function renderArtifact(){
 const content=$('#artifact-content'),key=JSON.stringify([state.selectedRun,state.tab,state.lang]),signature=JSON.stringify([key,artifact(),state.runs.get(state.selectedRun)?.status,state.runs.get(state.selectedRun)?.artifacts]);if(signature===artifactRenderSignature)return;if(artifactRenderKey)artifactViews.set(artifactRenderKey,saveArtifactView(content));artifactRenderKey=key;artifactRenderSignature=signature;content.replaceChildren();$$('[role="tab"][data-tab]').forEach(e=>{const active=e.dataset.tab===state.tab;e.classList.toggle('selected',active);e.setAttribute('aria-selected',String(active));e.tabIndex=active?0:-1;});content.setAttribute('aria-labelledby',`${state.tab}-tab`);$('#artifact-kind').textContent={model:'FORMULATION / PLAN',code:'PYTHON / GUROBI',execution:'EXECUTION RECORD'}[state.tab];const r=result();$('#artifact-indicator').textContent=String([r.model||r.artifacts?.formulation,r.code||r.artifacts?.code,r.execution||r.artifacts?.execution].filter(Boolean).length);const value=artifact();$('#copy-artifact').disabled=!value;$('#download-artifact').setAttribute('aria-disabled',String(!value));$('#download-artifact').tabIndex=value?0:-1;if(state.downloadUrl){URL.revokeObjectURL(state.downloadUrl);state.downloadUrl=null;}
 if(!value){const empty=node('div','artifact-empty');empty.append(node('span','empty-symbol',state.tab==='model'?'ƒ':state.tab==='code'?'{ }':'x*'),node('p','',state.tab==='model'?t('尚无数学模型或建模计划。','No formulation or model plan yet.'):state.tab==='code'?t('尚无生成代码。','No generated code yet.'):t('尚无求解结果。','No solve result yet.')));content.append(empty);$('#download-artifact').href='#';restoreArtifactView(content,key);return;}
 if(state.tab==='model'){content.append(markdown(value));math(content);}else if(state.tab==='code'){const pre=node('pre','code-view');pre.append(node('code','',value));content.append(pre);}else content.append(executionView(value));
 const run=state.runs.get(state.selectedRun),filename={model:'formulation.md',code:'generated-model.py',execution:'execution.json'}[state.tab],saved=(run?.artifacts||[]).find(x=>x.name===filename);let url=saved?safeArtifactUrl(saved.url):null;if(!url){state.downloadUrl=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:state.tab==='execution'?'application/json':'text/plain;charset=utf-8'}));url=state.downloadUrl;}$('#download-artifact').href=url;$('#download-artifact').download=filename;
 if(state.tab==='execution'&&run?.artifacts?.length){const downloads=node('div','artifact-downloads');for(const item of run.artifacts){const href=safeArtifactUrl(item.url);if(href){const a=node('a','',item.name);a.href=href;a.download=item.name;downloads.append(a);}}content.append(downloads);}
 restoreArtifactView(content,key);
}
function artifactEvent(run,event){run.result||={};const p=event.payload||{};if(event.type==='artifact'){if(p.kind==='formulation')run.result.model=p.content;else if(p.kind==='code')run.result.code=p.content;}if(event.type==='completed'){if(event.stage==='model'&&p.formulation)run.result.model=p.formulation;if(event.stage==='code'&&p.code)run.result.code=p.code;if(event.stage==='execution')run.result.execution=p;if(['classification','workflow','data'].includes(event.stage))run.result[event.stage]=p;}}
async function selectedVersion(id){state.selectedRun=id;if(id&&!state.runs.get(id)?.result)try{const run=await api(`/runs/${id}`);state.runs.set(id,{...state.runs.get(id),...run});}catch(e){notice(e.message);}renderVersions();renderArtifact();}
async function finish(id,event){
 const run=state.runs.get(id);if(!run||run.finishing)return;run.finishing=true;const session=state.session;
 run.status=event.type;run.result=event.payload?.result||run.result;run.artifacts=event.payload?.artifacts||run.artifacts||[];if(event.payload?.error)run.error=event.payload.error;state.source?.close();state.source=null;
 try{Object.assign(run,await api(`/runs/${id}`));}catch{}finally{run.finishing=false;}
 if(state.session!==session||state.runs.get(id)!==run)return;
 if(session&&!session.messages.some(m=>m.role==='assistant'&&m.run_id===id))session.messages.push({role:'assistant',content:run.result?.answer||run.error||label(run.status),run_id:id});
 if(state.activeRun===id)busy(null);renderConversation();renderVersions();renderArtifact();if(run.error)notice(run.error);
}
function watch(id,after=0){
 state.source?.close();const source=new EventSource(`${API}/runs/${id}/events?after=${after}`,{withCredentials:true});state.source=source;
 source.onmessage=event=>{let record;try{record=redactSecrets(JSON.parse(event.data));}catch{return;}if(record.run_id!==id||record.seq<=(state.lastSeq.get(id)||0))return;state.lastSeq.set(id,record.seq);publishRunEvent(record);const run=state.runs.get(id);if(!run)return;run.events||=[];run.events.push(record);const anchor={follow:nearBottom(),top:$('#conversation').scrollTop};
  if(record.stage==='run'){if(record.type==='queued')run.status='queued';if(record.type==='started')run.status='running';const p=state.processNodes.get(id);if(p)$('.process-state',p).textContent=label(record.type==='started'?'running':record.type);renderVersions();if(terminal.has(record.type)){finish(id,record);return;}}
  else{stageEvent(id,record);artifactEvent(run,record);if(record.type==='artifact'||record.type==='completed')refreshArtifactButtons(id);if(state.selectedRun===id&&(record.type==='artifact'||(record.type==='completed'&&['model','code','execution'].includes(record.stage))))renderArtifact();}
  if(anchor.follow)scrollBottom(false,anchor);
 };
 source.onerror=async()=>{if(state.source!==source)return;try{const run=await api(`/runs/${id}`);if(terminal.has(run.status)){finish(id,{type:run.status,payload:{result:run.result,error:run.error,artifacts:run.artifacts}});return;}}catch{}const p=state.processNodes.get(id);if(p)$('.process-state',p).textContent=t('重新连接中','Reconnecting');};
}
async function send(fromExample=false,resumedIntent=null){
 if(pendingFiles.some(f=>f.reading)||state.changingSession||state.filesBusy||state.exampleLoading&&!fromExample||state.activeRun||state.sending||pendingRunIntent?.running)return;
 const submittedDraft=$('#query').value;const query=redactConfiguredKey($('#query').value.trim());if(!query)return;
 const intent=resumedIntent||{revision:taskRevision,provider:$('#provider').value,query:submittedDraft,running:false};if(resumedIntent&&!currentIntent(intent))return;pendingRunIntent=intent;state.pendingSend=true;intent.running=true;busy(state.activeRun);
 try{
  const openai=$('#provider').value==='openai';
  if(openai&&!isLocalRuntime&&!isCloudRuntime){pendingRunIntent=null;state.pendingSend=false;notice(t('在线服务未连接。问题与 CSV 已保留，连接服务后再运行。','The online service is not connected. Your question and CSVs are retained; run when the service is connected.'));return;}
  if(openai&&!openaiKey){notice(t('请在个人配置填写 OpenAI API Key。','Add your OpenAI API key in Personal settings.'),'missing-key');openPersonalSettings($('#key-configure'));return;}
  if(!isCloudRuntime||!openai){if(!isLocalRuntime||!state.setupConfirmed||!state.session||!state.connected||!openai&&!state.capabilities?.ollama?.ready){openSetup();return;}}
  if(isCloudRuntime&&openai){if(!await ensureCloudSession())return;if(!cloudExecutionReady()){notice(t('服务器求解环境尚未就绪，请刷新服务状态后重试。尚未提交模型请求。','Server execution is not ready. Refresh service status and try again. No model request has been submitted.'));return;}}
  if(!currentIntent(intent)||state.activeRun||state.sending)return;
  if(!await prepareExample()||!currentIntent(intent))return;
  if(!await flushPendingFiles({allowExample:fromExample})||!currentIntent(intent)||state.activeRun||state.sending)return;
  if(!state.session)return;
  notice();const session=state.session;pendingRunIntent=null;state.pendingSend=false;state.sending=true;busy(state.activeRun);
  try{const p=await api(`/sessions/${session.id}/messages`,{method:'POST',body:JSON.stringify({content:query,provider:openai?'openai':'ollama',model:openai?'gpt-4.1':'gpt-oss:20b',...(openai?{api_key:openaiKey}:{}),language:'en'})}),id=p.run_id;if(state.session?.id!==session.id)return;state.runs.set(id,{...p.run,id,status:p.status,events:[],result:null});session.runs.push(id);session.messages.push({role:'user',content:query,run_id:id});state.selectedRun=id;if($('#query').value===submittedDraft)$('#query').value='';resizeQuery();busy(id);examplesView(false,false);renderVersions();renderArtifact();scrollBottom(true);watch(id);}catch(e){notice(e.message);busy(null);}finally{state.sending=false;}
 }finally{intent.running=false;busy(state.activeRun);}
}
async function cancel(){if(!state.activeRun)return;$('#cancel-button').disabled=true;try{await api(`/runs/${state.activeRun}/cancel`,{method:'POST'});toast(t('正在停止运行…','Stopping the run…'));}catch(e){notice(e.message);$('#cancel-button').disabled=false;}}
async function openSession(id){state.source?.close();state.source=null;const session=id?await api(`/sessions/${encodeURIComponent(id)}`):await api('/sessions',{method:'POST'});state.session={...session,id:session.id||session.session_id};state.runs.clear();state.lastSeq.clear();resetConversationView();state.selectedRun=null;store('lean-demo-session',state.session.id);const url=new URL(location.href);url.searchParams.set('session',state.session.id);history.replaceState(null,'',url);publishSession(state.session.id);for(const runId of session.runs||[])state.runs.set(runId,{id:runId,status:'saved',result:null,events:[]});await Promise.all((session.runs||[]).slice(-8).map(async runId=>{try{state.runs.set(runId,{...await api(`/runs/${runId}`),events:[]});}catch{}}));state.selectedRun=(session.runs||[]).at(-1)||null;const active=[...state.runs.values()].find(r=>['queued','running'].includes(r.status));busy(active?.id||active?.run_id||null);renderFiles();renderVersions();renderConversation();renderArtifact();researchHome();if(active)watch(active.id||active.run_id);}
function resizeQuery(){const e=$('#query');e.style.height='auto';e.style.height=Math.min(e.scrollHeight,170)+'px';}
function renderHistory(){
 const list=$('#history-list'),status=$('#history-status');list.replaceChildren();
 status.textContent=state.historyError||(state.historyLoading?t('正在读取对话…','Loading conversations…'):state.activeRun?t('当前对话正在运行','The current conversation is running'):t('最近对话','Recent conversations'));
 if((!isLocalRuntime&&!isCloudRuntime)||!state.setupConfirmed){list.append(node('p','history-empty',isCloudRuntime||!isLocalRuntime&&$('#provider').value==='openai'?t('在线服务连接后，可在这里继续之前的对话。','Connect to the online service to continue your conversations here.'):t('连接本机工作台后，在这里继续之前的对话。','Connect the local workspace to continue your conversations here.')));return;}
 if(!state.history.length&&!state.historyLoading){list.append(node('p','history-empty',t('从新对话或一个示例开始。','Start a new conversation or choose an example.')));return;}
 for(const session of state.history){const button=node('button','history-item'),date=node('span','history-date');button.type='button';button.dataset.sessionId=session.id;button.setAttribute('aria-current',session.id===state.session?.id?'true':'false');button.disabled=Boolean(state.activeRun||state.sending||state.changingSession||state.filesBusy||state.exampleLoading);button.append(node('strong','history-title',session.title||t('新对话','New conversation')));const time=new Date(session.updated_at||session.created_at);date.textContent=Number.isNaN(time.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(time);button.append(date,node('span','history-meta',session.status==='empty'?t('尚未运行','No runs yet'):`${session.run_count} ${t('次运行','runs')} · ${label(session.status)}`));list.append(button);}
}
async function loadHistory(){
 if(state.historyLoading)return;if((!isLocalRuntime&&!isCloudRuntime)||!state.setupConfirmed){renderHistory();return;}
 state.historyLoading=true;state.historyError='';renderHistory();
 try{const response=await api('/sessions');state.history=Array.isArray(response.sessions)?response.sessions:[];}catch(error){state.historyError=error.message;}finally{state.historyLoading=false;renderHistory();}
}
function historyView(show){
 const dialog=$('#conversation-history');if(show){artifactsView(false);closeSettings(false);renderHistory();showDialog(dialog);$('#history-open').setAttribute('aria-expanded','true');focusQuietly($('#history-close'));loadHistory();}else closeDialog(dialog);
}
async function selectConversation(id){
 if(state.changingSession||state.filesBusy||state.activeRun||state.sending||state.exampleLoading)return;
 if(id===state.session?.id){historyView(false);return;}if(!state.history.some(session=>session.id===id))return;invalidateRunIntent();parkCustomTask();state.taskExample=null;state.pendingExample=null;state.resetSession=false;
 state.changingSession=true;busy(state.activeRun);state.historyError='';
 const previousQuery=$('#query').value;if(state.session)state.drafts.set(state.session.id,previousQuery);
 try{await openSession(id);state.previewMode=false;state.previewFiles=[];$('#query').value=state.drafts.get(id)||'';resizeQuery();renderFiles();examplesView(!state.session.messages?.length,false);historyView(false);notice();}
 catch(error){state.historyError=error.message;renderHistory();}
 finally{state.changingSession=false;busy(state.activeRun);}
}
function examplesView(show,restoreFocus=true){
 const welcome=$('#welcome'),before=welcome?.getBoundingClientRect().height||0;state.examplesCollapsed=!show;document.body.classList.toggle('examples-collapsed',!show);$('#examples-toggle').setAttribute('aria-expanded',String(show));renderConversation();
 const current=$('#welcome');if(current&&before&&!motionPreference.matches&&!document.hidden&&typeof current.animate==='function'){surfaceMotions.get(current)?.animation.cancel();const after=current.getBoundingClientRect().height;if(Math.abs(after-before)>1){current.style.overflow='hidden';const animation=current.animate([{height:`${before}px`},{height:`${after}px`}],{duration:180,easing:'cubic-bezier(.2,.75,.25,1)'});const entry={animation,finish(){if(surfaceMotions.get(current)!==entry)return;surfaceMotions.delete(current);animation.cancel();current.style.overflow='';}};surfaceMotions.set(current,entry);animation.finished.then(entry.finish,()=>{});}}
 if(restoreFocus)focusQuietly($(show?'#examples-hide':'#examples-toggle'));
}
function artifactsView(show,trigger=document.activeElement){
 const panel=$('#inspector-panel'),backdrop=$('#artifact-backdrop'),wasOpen=document.body.classList.contains('artifacts-open');
 $('#conversation-view').classList.toggle('selected',!show);$('#artifacts-view').classList.toggle('selected',show);$('#conversation-view').setAttribute('aria-pressed',String(!show));$('#artifacts-view').setAttribute('aria-pressed',String(show));$('#results-open').setAttribute('aria-expanded',String(show));
 if(show){if(wasOpen&&panel.dataset.motion!=='closing')return;if(!wasOpen){state.artifactTrigger=trigger;closeSettings(false);}document.body.classList.add('artifacts-open');panel.hidden=false;panel.inert=false;backdrop.hidden=false;syncOverlayInert();surfaceMotion(backdrop,true,'fade');surfaceMotion(panel,true,'right');if(!wasOpen)focusQuietly($('#inspector-close'));}
 else if(wasOpen&&panel.dataset.motion!=='closing'){surfaceMotion(backdrop,false,'fade');surfaceMotion(panel,false,'right',()=>{document.body.classList.remove('artifacts-open');panel.hidden=true;panel.inert=true;backdrop.hidden=true;syncOverlayInert();const previous=state.artifactTrigger;state.artifactTrigger=null;focusQuietly(previous?.isConnected&&previous.getClientRects().length?previous:$('#results-open'));});}
}
async function openArtifact(id,tab,trigger=document.activeElement){
 if(!state.runs.has(id)||!['model','code','execution'].includes(tab))return;
 state.tab=tab;await selectedVersion(id);artifactsView(true,trigger);
}
function artifactKeys(event){
 if(!document.body.classList.contains('artifacts-open')||$('#file-preview').open||$('#local-setup').open||$('#personal-settings').open)return;
 if(event.key==='Escape'){event.preventDefault();artifactsView(false);return;}
 if(event.key!=='Tab')return;
 const panel=$('#inspector-panel'),items=$$('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]:not([aria-disabled="true"]),[tabindex="0"]',panel).filter(element=>!element.hidden&&element.getClientRects().length);
 if(!items.length)return;const first=items[0],last=items.at(-1),active=document.activeElement;
 if(!panel.contains(active)){event.preventDefault();first.focus();}else if(event.shiftKey&&active===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
}
$('#composer').addEventListener('submit',e=>{e.preventDefault();send();});$('#query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});$('#query').addEventListener('input',()=>{invalidateRunIntent();resizeQuery();});$('#cancel-button').addEventListener('click',cancel);
$('#provider').addEventListener('change',()=>{endHandoff();stopCredentialReceiver();invalidateRunIntent();state.setupConfirmed=isCloudRuntime&&state.connected&&Boolean(state.session);renderHealth();updateSetup();busy(state.activeRun);if(isCloudRuntime&&$('#provider').value==='ollama')openSetup();else if(isCloudRuntime){if($('#local-setup').open)closeDialog($('#local-setup'));ensureCloudSession();}});
$('#restore-custom-task').addEventListener('click',restoreCustomTask);
$('#upload-button').addEventListener('click',()=>$('#file-input').click());$('#drop-zone').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',()=>upload([...$('#file-input').files]));
for(const name of ['dragenter','dragover'])$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.add('dragging');});for(const name of ['dragleave','drop'])$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.remove('dragging');if(name==='drop')upload([...e.dataTransfer.files]);});
document.addEventListener('click',e=>{const button=e.target.closest('[data-example]');if(button)example(button.dataset.example);const action=e.target.closest('[data-open-artifact]');if(action&&!action.disabled)openArtifact(action.dataset.runId,action.dataset.openArtifact,action);if(e.target.closest('#examples-hide'))examplesView(false);});
$('#new-session').addEventListener('click',async()=>{if(state.activeRun||state.sending||state.changingSession||state.filesBusy||state.exampleLoading)return;invalidateRunIntent();parkCustomTask();state.taskExample=null;state.pendingExample=null;state.previewMode=false;state.previewFiles=[];state.resetSession=false;$('#query').value='';renderFiles();if((!isLocalRuntime&&!isCloudRuntime)||!state.setupConfirmed||(isCloudRuntime&&$('#provider').value!=='openai')){historyView(false);state.resetSession=true;state.previewMode=true;renderFiles();if(!isLocalRuntime&&!isCloudRuntime&&$('#provider').value==='openai'){notice();return;}if(isCloudRuntime&&$('#provider').value==='openai')await ensureCloudSession();else openSetup();return;}state.changingSession=true;busy(state.activeRun);try{notice();if(state.session)state.drafts.set(state.session.id,$('#query').value);state.previewMode=false;await openSession();$('#query').value='';resizeQuery();examplesView(true,false);historyView(false);closeSettings();toast(t('新对话已创建','New conversation created'));}catch(e){notice(e.message);}finally{state.changingSession=false;busy(state.activeRun);}});
$('#settings-open').addEventListener('click',openSettings);$('#settings-close').addEventListener('click',()=>closeSettings());$('#drawer-backdrop').addEventListener('click',()=>closeSettings());document.addEventListener('keydown',drawerKeys);$('#conversation-view').addEventListener('click',()=>artifactsView(false));$('#artifacts-view').addEventListener('click',()=>artifactsView(true));
$('#examples-toggle').addEventListener('click',()=>examplesView(state.examplesCollapsed));$('#results-open').addEventListener('click',event=>artifactsView(true,event.currentTarget));$('#inspector-close').addEventListener('click',()=>artifactsView(false));$('#artifact-backdrop').addEventListener('click',()=>artifactsView(false));document.addEventListener('keydown',artifactKeys);
$('#history-open').addEventListener('click',()=>historyView(true));$('#history-close').addEventListener('click',()=>historyView(false));$('#history-list').addEventListener('click',event=>{const button=event.target.closest('[data-session-id]');if(button&&!button.disabled)selectConversation(button.dataset.sessionId);});
$('#conversation-history').addEventListener('close',()=>{if($('#conversation-history').open)return;$('#history-open').setAttribute('aria-expanded','false');focusQuietly($('#history-open'));});$('#conversation-history').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)historyView(false);});
$('.mobile-view-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const show=event.key==='End'?true:event.key==='Home'?false:!document.body.classList.contains('artifacts-open');artifactsView(show);if(!show)$('#conversation-view').focus();});
matchMedia('(max-width:950px)').addEventListener('change',event=>{if(!event.matches)closeSettings(false);});
$('#preview-close').addEventListener('click',()=>closeDialog($('#file-preview')));$('#file-preview').addEventListener('click',e=>{if(e.target===$('#file-preview')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog(e.target);}});
$$('[role="tab"][data-tab]').forEach(e=>e.addEventListener('click',()=>{state.tab=e.dataset.tab;renderArtifact();}));$('.artifact-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=['model','code','execution'],i=keys.indexOf(state.tab);state.tab=e.key==='Home'?keys[0]:e.key==='End'?keys.at(-1):keys[(i+(e.key==='ArrowRight'?1:2))%3];renderArtifact();$(`#${state.tab}-tab`).focus();});$('#version-select').addEventListener('change',e=>selectedVersion(e.target.value));
$('#copy-artifact').addEventListener('click',async()=>{const value=artifact();if(!value)return;try{await navigator.clipboard.writeText(typeof value==='string'?value:JSON.stringify(value,null,2));toast(t('已复制','Copied'));}catch{notice(t('复制不可用，请使用下载。','Clipboard unavailable; use the download link.'));}});
$('#theme-toggle').addEventListener('click',()=>preferences(state.theme==='dark'?'light':'dark',true));
window.addEventListener('pagehide',()=>{invalidateRunIntent();fileQueueEpoch++;pendingFiles=[];parkedCustomTasks=[];state.source?.close();runChannel?.close();runChannel=null;endHandoff();stopCredentialReceiver();openaiKey='';$('#api-key').value='';$('#api-key').type='password';state.setupConfirmed=false;renderPersonalSettings();if(state.downloadUrl)URL.revokeObjectURL(state.downloadUrl);artifactRenderSignature='';});
window.addEventListener('pageshow',event=>{if(!event.persisted)return;runChannel=createRunChannel();if(state.session)publishSession(state.session.id);if(state.activeRun)watch(state.activeRun,state.lastSeq.get(state.activeRun)||0);renderArtifact();});
$('#local-setup-open').addEventListener('click',()=>openSetup());$('#model-setup-open').addEventListener('click',()=>openSetup());
$('#setup-close').addEventListener('click',()=>$('#local-setup').close());$('#setup-confirm').addEventListener('click',confirmSetup);$('#setup-detect').addEventListener('click',async()=>{state.setupError='';await health();updateSetup();});$('#runtime-check').addEventListener('click',checkRuntime);
for(const id of ['#personal-settings-open','#key-configure','#setup-personal-open'])$(id).addEventListener('click',event=>openPersonalSettings(event.currentTarget));
$('#personal-settings-close').addEventListener('click',()=>closePersonalSettings());$('#personal-settings-done').addEventListener('click',()=>{if(pendingRunIntent&&!openaiKey){focusQuietly($('#api-key'));return;}closePersonalSettings(true,resumeRunIntent);});
$('#api-key').addEventListener('input',()=>{if(state.activeRun||state.sending||state.changingSession||state.exampleLoading||state.filesBusy||pendingFiles.some(f=>f.reading)||pendingHandoff)return;openaiKey=$('#api-key').value.trim();renderPersonalSettings();updateSetup();});
$('#api-key-visibility').addEventListener('click',()=>{$('#api-key').type=$('#api-key').type==='password'?'text':'password';renderPersonalSettings();});
$('#api-key-clear').addEventListener('click',()=>{if(state.activeRun||state.sending||state.changingSession||state.exampleLoading||state.filesBusy||pendingFiles.some(f=>f.reading)||pendingHandoff)return;openaiKey='';$('#api-key').value='';$('#api-key').type='password';renderPersonalSettings();updateSetup();$('#api-key').focus();});
$('#personal-settings').addEventListener('cancel',event=>{event.preventDefault();closePersonalSettings();});
$('#personal-settings').addEventListener('close',()=>{
 if($('#personal-settings').open)return;
 $('#api-key').value='';$('#api-key').type='password';renderPersonalSettings();
 for(const id of ['#personal-settings-open','#key-configure','#setup-personal-open'])$(id).setAttribute('aria-expanded','false');
 const target=personalSettingsTrigger;personalSettingsTrigger=null;
 if(target?.isConnected&&target.getClientRects().length&&!target.disabled)target.focus({preventScroll:true});else $('#personal-settings-open').focus({preventScroll:true});
});
$('#personal-settings').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePersonalSettings();});
for(const dialog of [$('#file-preview'),$('#local-setup'),$('#conversation-history')])dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});
for(const dialog of [$('#file-preview'),$('#local-setup')])dialog.addEventListener('close',()=>{if(dialog.open)return;const trigger=dialogTriggers.get(dialog);if(trigger?.isConnected)focusQuietly(trigger);});
motionPreference.addEventListener('change',event=>{if(event.matches)settleMotions();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){settleMotions();if(followFrame!==null)cancelAnimationFrame(followFrame);followFrame=null;followRequest=null;}else if(tokenBuffers.size)queueStageToken(tokenBuffers.keys().next().value,'');});
$$('[data-copy-command]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById(button.dataset.copyCommand).textContent);toast(t('命令已复制','Command copied'));}catch{toast(t('请选中命令复制。','Select the command text to copy it.'));}}));
$('#setup-provider-ollama').addEventListener('click',()=>{$('#provider').value='ollama';$('#provider').dispatchEvent(new Event('change'));});$('#setup-provider-openai').addEventListener('click',()=>{$('#provider').value='openai';$('#provider').dispatchEvent(new Event('change'));});
$('#provider').value=params.get('provider')==='ollama'?'ollama':'openai';
preferences(state.theme);
try{await loadCatalog();}catch(error){notice(error.message);}
await health();
if(isCloudRuntime&&state.connected&&$('#provider').value==='openai')await ensureCloudSession();
if(EXAMPLE_IDS.has(params.get('example'))){state.pendingExample=params.get('example');const cleanURL=new URL(location.href);cleanURL.searchParams.delete('example');cleanURL.searchParams.delete('autorun');history.replaceState(null,'',cleanURL);await example(state.pendingExample,{previewOnly:true});}
else if(isLocalRuntime)openSetup();
receiveLocalCredential();
// Polling reads service metadata only; it never starts a model or solver.
setInterval(()=>{if((isLocalRuntime||isCloudRuntime)&&!document.hidden&&!state.activeRun)health().then(()=>{if($('#local-setup').open)updateSetup();});},30000);

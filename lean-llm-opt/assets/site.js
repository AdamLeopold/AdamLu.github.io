import { MAP, LAND, project } from './airline-map.js?v=20261119-2';

const root = document.documentElement;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const store = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* storage unavailable */ } };
const reduced = root.dataset.motion === 'reduced';
const AUTOPLAY_DELAY = 10000;
const state = {
  lang: root.dataset.lang, theme: root.dataset.theme, research: null, scene: null,
  replay: 0, intro: !reduced, cases: null, caseId: '', caseTurn: 0, caseTable: 0, playing: !reduced, study: 'large', view: 'overall', studyPlaying: !reduced, lifted: false,
};
const t = (zh, en) => (state.lang === 'zh' ? zh : en);
const pick = value => (value && typeof value === 'object' ? value[state.lang] ?? value.en : value);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = value => Number(value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const number = (value, digits = 0) => Number(value).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const modelName = model => (model === 'gpt41' ? 'GPT-4.1' : 'gpt-oss-20B');

/* Preferences */
function applyLanguage() {
  root.dataset.lang = state.lang;
  root.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of $$('[data-zh]')) el.innerHTML = el.dataset[state.lang];
  for (const el of $$('[data-zh-label]')) el.setAttribute('aria-label', el.dataset[state.lang + 'Label']);
  const toggle = $('#lang-toggle');
  toggle.textContent = state.lang === 'zh' ? 'EN' : '中';
  toggle.setAttribute('aria-label', state.lang === 'zh' ? 'Switch to English' : '切换到中文');
  document.title = 'LEAN-LLM-OPT';
  renderAll();
  syncDemoLinks();
  moveNavInk(navCurrent, true);
}
function applyTheme() {
  root.dataset.theme = state.theme;
  $('meta[name="theme-color"]').content = state.theme === 'dark' ? '#0b1220' : '#f5f8fc';
  state.scene?.setTheme(state.theme);
  syncDemoLinks();
}
const crossfade = fn => (!reduced && document.startViewTransition ? document.startViewTransition(fn) : fn());
function syncDemoLinks() {
  for (const link of $$('[data-demo-link]')) {
    const url = new URL('demo/', location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('lang', 'en');
    url.searchParams.set('theme', state.theme);
    link.href = url.href;
  }
}
$('#lang-toggle').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  store('lean-lang', state.lang);
  crossfade(applyLanguage);
});
$('#theme-toggle').addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  store('lean-theme', state.theme);
  crossfade(applyTheme);
});
function renderAll() {
  if (!state.research || !state.cases) return;
  renderCaseList();
  sizeReplay();
  renderReplay();
  renderExperiments();
  renderAirline();
  renderFilm();
  $('#citation').textContent = state.research.paper.citation;
}

/* Tabs shared by the case replay and the experiments */
// The buttons stay in place between selections, so the selected colour fades and the ink slides under the new tab.
function tabList(container, items, selected, attribute, controls) {
  const sig = items.map(([key, label]) => key + label).join('|'), fresh = container.dataset.sig !== sig;
  if (fresh) {
    container.dataset.sig = sig;
    container.innerHTML = items.map(([key, label, index]) => `<button type="button" role="tab" id="${attribute}-tab-${key}" aria-controls="${controls}" data-${attribute}="${key}">${index ? `<span>${index}</span>` : ''}${label}</button>`).join('') + '<i class="tab-ink" aria-hidden="true"></i>';
    container.classList.add('has-ink');
  }
  for (const button of $$('[role="tab"]', container)) {
    const on = button.dataset[attribute] === selected;
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
  }
  placeInk(container, fresh);
}
function placeInk(container, instant = false) {
  const ink = $('.tab-ink', container), on = $('[aria-selected="true"]', container);
  if (!ink || !on) return;
  if (instant || reduced) ink.style.transition = 'none';
  ink.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  ink.style.width = `${on.offsetWidth}px`;
  ink.style.height = `${on.offsetHeight}px`;
  if (instant || reduced) { void ink.offsetWidth; ink.style.transition = ''; }
}
function tabKeys(container, choose) {
  container.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = $$('[role="tab"]', container), current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    choose(buttons[next]);
    $('[aria-selected="true"]', container)?.focus({ preventScroll: true });
  });
}
// Autoplay advances only while the section is on screen and the page is visible.
function autoplay(section, isPlaying, advance) {
  let timer = null, visible = false;
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const sync = () => {
    if (!isPlaying() || reduced || document.hidden || !visible) { clear(); return; }
    if (timer === null) timer = setTimeout(() => { timer = null; advance(); }, AUTOPLAY_DELAY);
  };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .35 }).observe(section);
  document.addEventListener('visibilitychange', sync);
  return { sync, restart() { clear(); sync(); }, stop: clear };
}

/* Case replay */
const STEPS = [['输入', 'Input'], ['分类', 'Classify'], ['数据', 'Data'], ['数学模型', 'Model'], ['生成代码', 'Code'], ['优化解', 'Solution']];
// Playing runs through a case's six steps, then moves on to the next case.
const replayPlay = autoplay($('#replay'), () => state.playing && !state.intro, () => {
  if (state.replay < STEPS.length - 1) { selectReplay(state.replay + 1, false); return; }
  const list = state.cases?.cases || [];
  if (list.length > 1) selectCase(list[(list.findIndex(c => c.id === state.caseId) + 1) % list.length].id, false);
  else selectReplay(0, false);
});
const deck = $('.replay-deck');
const QA = '<svg class="qa" viewBox="0 0 64 56" aria-hidden="true"><path class="qa-a" d="M26 20h28a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8h-2l2 7-9-7H26a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8Z"/><text x="40" y="42">A</text><path class="qa-q" d="M8 2h24a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H15l-9 7 2-7a8 8 0 0 1-8-8V10a8 8 0 0 1 8-8Z"/><text x="20" y="24">Q</text></svg>';
const USERS = '<svg viewBox="0 0 40 28" aria-hidden="true"><circle cx="14" cy="8" r="5"/><path d="M4 26c0-6 4.5-10 10-10s10 4 10 10"/><circle cx="27" cy="9" r="4.2"/><path d="M24 16.6c1-.4 2-.6 3-.6 5 0 9 3.6 9 9.4"/></svg>';
function highlight(code) {
  return code.split('\n').map((line, i) => {
    const parts = line.split(/((?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|#.*$|\b(?:import|from|as|for|in|if|else|print|return)\b)/g);
    return `<span class="ln">${i + 1}</span>` + parts.map(part => (/^['"]/.test(part) ? `<span class="str">${esc(part)}</span>` : /^#/.test(part) ? `<span class="com">${esc(part)}</span>` : /^(import|from|as|for|in|if|else|print|return)$/.test(part) ? `<span class="kw">${part}</span>` : esc(part))).join('');
  }).join('\n');
}
function valuesTable(headers, rows) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${t('可滚动数据表', 'Scrollable data table')}"><table class="data-table"><thead><tr>${headers.map(v => `<th scope="col">${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((v, i) => (i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/* Case replays: each case is a recorded GPT-4.1 run, shown in the same six steps */
const TYPE_NAMES = {
  NRM: ['网络收益管理', 'Network revenue management'], RA: ['资源分配', 'Resource allocation'], TP: ['运输问题', 'Transportation problem'],
  FLP: ['设施选址', 'Facility location'], AP: ['指派问题', 'Assignment problem'], Mixture: ['混合结构', 'Mixed structure'], Others: ['其他问题', 'Other problem'],
};
const typeName = (label, en = state.lang === 'en') => TYPE_NAMES[label]?.[en ? 1 : 0] || label;
const currentCase = () => state.cases.cases.find(c => c.id === state.caseId) || state.cases.cases[0];
const caseTurn = c => c.turns[Math.min(state.caseTurn, c.turns.length - 1)];
const fmt = v => Number(v).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 });
const turnSwitch = c => (c.turns.length > 1 ? `<div class="switch" role="group" aria-label="${t('对话轮次', 'Conversation turn')}">${c.turns.map((_, i) => `<button type="button" data-turn="${i}" aria-pressed="${i === state.caseTurn}">${i ? t('追问', 'Follow-up') : t('首次提问', 'First request')}</button>`).join('')}</div>` : '');
function renderCaseList() {
  $('#case-list').innerHTML = state.cases.cases.map(c => `<button type="button" class="case-item" data-case="${c.id}" aria-current="${c.id === state.caseId}"><span class="case-tag mono">${c.type}</span><b>${esc(pick(c.title))}</b></button>`).join('');
}
function caseStep(c, step) {
  const first = c.turns[0], run = caseTurn(c), tables = first.tables;
  const rows = tables.reduce((sum, x) => sum + x.rows, 0), read = tables.reduce((sum, x) => sum + x.selected, 0);
  if (step === 0) {
    const demo = c.demo ? `<a class="link case-demo" href="demo/?lang=en&amp;example=${c.demo}" target="_blank" rel="noopener">${t('在 Demo 中运行这个例子', 'Run this example in the Demo')}</a>` : '';
    return `<div class="case-grid"><div><span class="case-eyebrow mono">${t('问题描述', 'THE QUERY')}</span><h3 class="case-title">${pick(c.headline)}</h3><p class="case-description">${esc(pick(c.summary))}</p><div class="case-stats"><div><b class="num">${tables.length}</b><small>${t('数据文件', 'data files')}</small></div><div><b class="num">${number(rows)}</b><small>${t('源表数据行', 'source rows')}</small></div>${c.turns.length > 1 ? `<div><b class="num">${c.turns.length}</b><small>${t('轮对话', 'turns')}</small></div>` : ''}</div>${demo}</div>
    <div class="upload"><p class="upload-tag">${USERS}<span>${t('用户上传', 'User upload')}</span></p><div class="card case-pd">${QA}<h3 class="u">${t('问题描述', 'Problem description')}</h3><div class="case-query" tabindex="0">${c.turns.map((x, i) => `<p>${i ? `<b>${t('追问', 'Follow-up')}</b>` : ''}${esc(i ? x.query.replace(/^Follow-up:\s*/i, '') : x.query)}</p>`).join('')}</div></div>
    <ul class="files">${tables.map(x => `<li><div class="file"><span class="tag">CSV</span><span><b>${esc(x.name).replace(/_/g, '_<wbr>')}</b><small>${number(x.rows)} ${t('行', 'rows')} × ${x.width} ${t('列', 'columns')}</small></span></div></li>`).join('')}</ul></div></div>`;
  }
  if (step === 1) {
    const label = first.classification.label, kinds = [...new Set(first.workflow.examples)].join(' / '), n = first.workflow.examples.length;
    const why = first.workflow.mode === 'type-tailored'
      ? t(`分类智能体对照参考库里最相似的问题，判定为 ${label}（${typeName(label)}），随即启用这一类型的定制工作流。`, `Set against the most similar problems in the reference library, it is labelled ${label} (${typeName(label, true).toLowerCase()}), which switches on the workflow tailored to that type.`)
      : label === 'Mixture'
        ? t('它同时带有多种结构，分类为 Mixture（混合结构）。框架改用类型无关工作流：先读出表结构，再写出抽象建模计划。', 'It combines several structures and is labelled Mixture. The framework switches to the type-agnostic workflow: read the table schema, then write an abstract model plan.')
        : t('它不属于任何预设类型，分类为 Others。框架改用类型无关工作流：先读出表结构，再写出抽象建模计划。', 'It fits none of the predefined types and is labelled Others. The framework switches to the type-agnostic workflow: read the table schema, then write an abstract model plan.');
    return `<div class="case-grid"><div><span class="case-eyebrow mono">RECOGNIZING THE STRUCTURE</span><h3 class="case-title">${t(`问题分类：${typeName(label)}。`, `Classification: ${typeName(label, true).toLowerCase()}.`)}</h3><p class="case-description">${why}</p><p class="case-mechanism">${t(`工作流参照了参考库中 ${n} 个 ${kinds} 示例。`, `The workflow draws on ${n} ${kinds} example${n > 1 ? 's' : ''} from the reference library.`)}</p></div>
    <div class="type-board"><div class="type-result"><b>${label}</b><small>${typeName(label, true).toUpperCase()}</small></div><div class="tokens">${['NRM', 'RA', 'TP', 'FLP', 'AP', 'Mixture', 'Others'].map(v => `<span${v === label ? ' class="is-on"' : ''}>${v}</span>`).join('')}</div></div></div>`;
  }
  if (step === 2) {
    const one = tables[Math.min(state.caseTable, tables.length - 1)];
    const pickTable = tables.length > 1 ? `<select id="case-table-select" class="select" aria-label="${t('选择数据表', 'Choose a data table')}">${tables.map((x, i) => `<option value="${i}"${x === one ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<span class="mono case-file">${esc(one.name)}</span>`;
    return `<div class="case-grid"><div><span class="case-eyebrow mono">DATA TABLES</span><h3 class="case-title">${t('读取的数据。', 'The data it read.')}</h3><p class="case-description">${t(`CSVQA 按建模步骤从 ${tables.length} 份表格中读取了 ${number(read)} 行，源表共 ${number(rows)} 行。`, `CSVQA read ${number(read)} of ${number(rows)} source rows across ${tables.length} table${tables.length > 1 ? 's' : ''}, step by step as the model needed them.`)}</p><div class="case-stats"><div><b class="num">${number(rows)}</b><small>${t('源表数据行', 'source rows')}</small></div><div><b class="num">${number(read)}</b><small>${t('读取的行', 'rows read')}</small></div></div></div>
    <div class="case-data"><div class="data-toolbar"><span class="case-eyebrow mono" style="margin:0">${t('读取的数据', 'ROWS READ')}</span>${pickTable}</div><div id="case-table">${valuesTable(one.columns, one.records)}</div></div></div>`;
  }
  if (step === 3) return `<div class="code-step"><div class="code-toolbar"><span class="mono">${first.workflow.mode === 'type-tailored' ? t('数学模型 · 模型生成智能体', 'MATHEMATICAL MODEL · MODEL GENERATION AGENT') : t('抽象建模计划 · 模型生成智能体', 'ABSTRACT MODEL PLAN · MODEL GENERATION AGENT')}</span>${turnSwitch(c)}</div><div class="case-doc" id="case-doc" tabindex="0" role="region" aria-label="${t('数学模型', 'Mathematical model')}">${esc(run.model)}</div></div>`;
  if (step === 4) return `<div class="code-step"><div class="code-toolbar"><span class="mono">PYTHON · GUROBIPY · ${t('生成程序', 'GENERATED PROGRAM')}</span>${turnSwitch(c)}</div><pre class="code"><code>${highlight(run.code)}</code></pre></div>`;
  const multi = c.turns.length > 1;
  const names = [...new Set(c.turns.flatMap(x => x.variables.map(v => v[0])))];
  const valueOf = (x, name) => x.variables.find(v => v[0] === name)?.[1] ?? 0;
  const max = Math.max(...c.turns.flatMap(x => x.variables.map(v => Math.abs(v[1])))) || 1;
  const bars = names.map(name => `<div class="var-row"><span class="var-name" title="${esc(name)}">${esc(name)}</span><div class="var-bars">${c.turns.map((x, i) => `<div class="var-bar${i ? ' b' : ''}"><div class="track"><span class="fill" data-w="${(Math.abs(valueOf(x, name)) / max * 100).toFixed(1)}"></span></div><b>${fmt(valueOf(x, name))}</b></div>`).join('')}</div></div>`).join('');
  const results = c.turns.map((x, i) => `<div class="solution-block"><p class="solution-label">${multi ? (i ? t('追问后', 'AFTER THE FOLLOW-UP') : t('首次求解', 'FIRST SOLVE')) : t('最优目标值 / OPTIMAL OBJECTIVE', 'OPTIMAL OBJECTIVE')}</p><p class="solution-value${i ? ' b' : ''}">${fmt(x.objective)}</p><p class="case-description">${t('参考目标值', 'Reference objective')}: ${fmt(x.reference)}</p></div>`).join('');
  return `<div class="case-grid"><div><span class="case-eyebrow mono">THE RECORDED SOLUTION</span><h3 class="case-title">${multi ? t('两次求解，<br>并排保留。', 'Two solves,<br>side by side.') : t('最优方案，<br>与参考值一致。', 'Optimal, and it<br>matches the reference.')}</h3><div class="solution-blocks${multi ? ' is-pair' : ''}">${results}</div>
    <div class="checks"><span>${t('求解状态：最优', 'Solver status: optimal')}</span><span>${t('目标值与参考最优值一致', 'Objective matches the reference optimum')}</span></div></div>
    <div class="var-chart"><div class="var-head"><span class="mono">${t('取值非零的决策变量', 'NONZERO DECISION VARIABLES')}</span>${multi ? `<span class="legend"><span><i class="sw"></i>${t('首次', 'First')}</span><span><i class="sw sw-b"></i>${t('追问后', 'Follow-up')}</span></span>` : `<span class="mono">${t(`共 ${run.variableCount} 个变量`, `${run.variableCount} variables`)}</span>`}</div><div class="var-list">${bars}</div></div></div>`;
}
// The model text is Markdown with LaTeX; the Demo's renderer and KaTeX load the first time a model is shown.
let richText = null;
function loadRichText() {
  if (!richText) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'assets/vendor/katex/katex.min.css';
    document.head.append(css);
    const katex = new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), { src: 'assets/vendor/katex/katex.min.js', onload: resolve, onerror: reject });
      document.head.append(script);
    });
    richText = Promise.all([import('../demo/rich-text.js'), katex]).then(([module]) => module);
  }
  return richText;
}
function renderModelDoc(text) {
  const host = $('#case-doc');
  loadRichText().then(({ markdown, math }) => {
    if (!host.isConnected) return;
    const doc = markdown(text);
    host.replaceChildren(doc);
    math(doc);
  }).catch(() => {});
}
function fillStep(step, live = true, enter = '') {
  const c = currentCase();
  $('#replay-content').innerHTML = `<div class="step-in${enter}">${caseStep(c, step)}</div>`;
  if (!live) return;
  if (step === 3) renderModelDoc(caseTurn(c).model);
  if (step === 5) requestAnimationFrame(() => fillBars($('#replay-content')));
}
// Every step takes the height of the tallest one, so the card keeps one size from input to solution.
let replayWidth = 0, resizeTimer = 0;
function sizeReplay() {
  const panel = $('#replay-content'), current = state.caseId;
  replayWidth = panel.clientWidth;
  panel.style.height = '';
  panel.classList.add('is-measuring');
  let tallest = 0;
  // Measured over every case, so switching cases keeps the frame as well.
  for (const c of state.cases.cases) {
    state.caseId = c.id;
    for (let i = 0; i < STEPS.length; i++) { fillStep(i, false); tallest = Math.max(tallest, panel.offsetHeight); }
  }
  state.caseId = current;
  panel.classList.remove('is-measuring');
  panel.style.height = `${Math.ceil(tallest)}px`;
}
function renderReplay(enter = '') {
  tabList($('#replay-tabs'), STEPS.map((s, i) => [String(i), s[state.lang === 'zh' ? 0 : 1], `0${i + 1}`]), String(state.replay), 'replay', 'replay-content');
  $('#replay-content').setAttribute('aria-labelledby', `replay-tab-${state.replay}`);
  fillStep(state.replay, true, enter);
  $('#replay-count').textContent = `0${state.replay + 1} / 06`;
  $('#replay-stage-title').textContent = STEPS[state.replay][state.lang === 'zh' ? 0 : 1];
  $('#replay-prev').disabled = state.replay === 0;
  $('#replay-next').disabled = state.replay === STEPS.length - 1;
  const play = $('#replay-play');
  play.innerHTML = `<i>${state.playing && !reduced ? 'Ⅱ' : '▶'}</i><span>${reduced ? t('手动浏览', 'Manual view') : state.playing ? t('暂停', 'Pause') : t('播放', 'Play')}</span>`;
  play.disabled = reduced;
  play.setAttribute('aria-pressed', String(state.playing && !reduced));
  replayPlay.restart();
}
// Coming down to the case, the steps are dealt from 06 back to 01 as the card moves into place; the replay then starts at 01.
function stepIntro(vh) {
  const p = clamp((vh * .74 - deck.getBoundingClientRect().top) / (vh * .56));
  if (p >= 1) { stopIntro(); if (state.replay !== 0) { state.replay = 0; renderReplay(' is-dealt'); } else replayPlay.restart(); return; }
  const step = Math.round((1 - p) * (STEPS.length - 1));
  deck.dataset.left = String(Math.min(2, step));
  if (step !== state.replay) { state.replay = step; renderReplay(' is-dealt'); }
}
function stopIntro() { state.intro = false; deck.dataset.left = '0'; }
function selectReplay(index, manual = true) {
  if (manual) { state.playing = false; stopIntro(); }
  state.replay = clamp(index, 0, STEPS.length - 1);
  renderReplay();
}
function selectCase(id, manual = true) {
  if (!state.cases || id === state.caseId) return;
  if (manual) { state.playing = false; stopIntro(); }
  Object.assign(state, { caseId: id, caseTurn: 0, caseTable: 0, replay: 0 });
  const list = $('#case-list');
  for (const item of $$('[data-case]', list)) item.setAttribute('aria-current', String(item.dataset.case === id));
  // On narrow screens the list scrolls sideways; bring the chosen case into it.
  const chosen = $(`[data-case="${id}"]`, list);
  if (list.scrollWidth > list.clientWidth + 1) list.scrollTo({ left: chosen.offsetLeft - 8, behavior: reduced ? 'auto' : 'smooth' });
  renderReplay(' is-dealt');
}
$('#case-list').addEventListener('click', event => { const item = event.target.closest('[data-case]'); if (item) selectCase(item.dataset.case); });
$('#replay-tabs').addEventListener('click', event => { const button = event.target.closest('[data-replay]'); if (button) selectReplay(Number(button.dataset.replay)); });
tabKeys($('#replay-tabs'), button => selectReplay(Number(button.dataset.replay)));
$('#replay-prev').addEventListener('click', () => selectReplay(state.replay - 1));
$('#replay-next').addEventListener('click', () => selectReplay(state.replay + 1));
$('#replay-play').addEventListener('click', () => {
  stopIntro();
  if (state.playing) { state.playing = false; renderReplay(); return; }
  if (state.replay === STEPS.length - 1) state.replay = 0;
  state.playing = true;
  renderReplay();
});
$('#replay-content').addEventListener('change', event => {
  if (event.target.id !== 'case-table-select') return;
  state.caseTable = Number(event.target.value);
  const one = currentCase().turns[0].tables[state.caseTable];
  $('#case-table').innerHTML = valuesTable(one.columns, one.records);
  state.playing = false;
  replayPlay.stop();
});
$('#replay-content').addEventListener('click', event => {
  const button = event.target.closest('[data-turn]');
  if (!button) return;
  state.caseTurn = Number(button.dataset.turn);
  state.playing = false;
  renderReplay();
});
$('#replay-content').addEventListener('focusin', () => { stopIntro(); if (state.playing) { state.playing = false; replayPlay.stop(); } });

/* Experiments */
const STUDIES = { large: ['大规模基准', 'Large-scale'], small: ['小规模基准', 'Small-scale'], components: ['组件设置', 'Components'], perturbation: ['参数扰动', 'Perturbations'], repair: ['结构修复', 'Audit & repair'] };
const studyPlay = autoplay($('#experiments'), () => state.studyPlaying, () => {
  const keys = Object.keys(STUDIES);
  selectStudy(keys[keys.indexOf(state.study) + 1], false);
});
function groupLabel(group) {
  const labels = { Overall: ['总体', 'Overall'], 'Seed 17': ['种子 17', 'Seed 17'], 'Seed 42': ['种子 42', 'Seed 42'], 'Seed 73': ['种子 73', 'Seed 73'], 'Structural variants': ['结构变体', 'Structural variants'], 'RAG Only': ['仅 RAG', 'RAG Only'], 'Few-shot Only': ['仅 Few-shot', 'Few-shot Only'], TP: ['TP · 运输', 'TP · Transportation'], NRM: ['NRM · 收益管理', 'NRM · Revenue management'], RA: ['RA · 资源分配', 'RA · Resource allocation'], 'UFLP/FLP': ['FLP · 设施选址', 'FLP · Facility location'], AP: ['AP · 指派', 'AP · Assignment'], Mixture: ['混合问题', 'Mixed structures'], Others: ['其他问题', 'Other structures'] };
  return labels[group]?.[state.lang === 'zh' ? 0 : 1] || group;
}
const cls = model => (model === 'gpt41' ? 'a' : 'b');
function bigScores(rows) {
  return `<div class="big-scores">${rows.map(v => `<div class="big-score ${v.model === 'oss' ? 'oss' : ''}"><p class="mono">LEAN-LLM-OPT / ${modelName(v.model)}</p><strong><span class="count">${pct(v.rate)}</span><small>%</small></strong><span>${v.correct} / ${v.total}</span><div class="tiles" aria-hidden="true">${Array.from({ length: v.total }, (_, i) => `<i style="--i:${i}"${i >= v.correct ? ' class="miss"' : ''}></i>`).join('')}</div><p class="tile-key">${t('每个方格代表 1 个测试问题', 'Each tile is one evaluated instance')}</p></div>`).join('')}</div>`;
}
function barGroups(rows) {
  const groups = [...new Set(rows.map(v => v.group))];
  return `<div class="bar-groups">${groups.map(group => `<div class="bar-group"><h4>${esc(groupLabel(group))}</h4>${rows.filter(v => v.group === group).map(v => `<div class="bar ${cls(v.model)}"><span class="who">${modelName(v.model)}</span><div class="track" role="img" aria-label="${esc(groupLabel(group))} ${modelName(v.model)} ${pct(v.rate)}%"><span class="fill" data-w="${v.rate}"></span></div><span class="val">${pct(v.rate)}%${v.total ? `<small>${v.correct} / ${v.total}</small>` : ''}</span></div>`).join('')}</div>`).join('')}</div>`;
}
function repairBars(rows) {
  return `<div class="big-scores">${rows.map(v => {
    const before = v.before / v.total * 100;
    return `<div class="repair ${cls(v.model)}"><p class="mono">${modelName(v.model)}</p><div class="repair-score"><span class="before">${v.before}</span><span>→</span><span class="after">${v.after}</span><small>/ ${v.total}</small></div><div class="bar ${cls(v.model)}" style="grid-template-columns:1fr"><div class="track"><span class="fill" data-w="${before}"></span><span class="fill ext" data-l="${before}" data-w="${v.rate - before}"></span></div></div><p class="tile-key">${t('目标值匹配率', 'Objective match rate')}: ${pct(before)}% → ${pct(v.rate)}%</p><div class="checks"><span>${t('修复成功', 'Corrected')}: ${v.rescued}</span><span>${t('新增错误', 'New errors')}: ${v.harmed}</span></div></div>`;
  }).join('')}</div>`;
}
function renderExperiments() {
  tabList($('#experiment-tabs'), Object.entries(STUDIES).map(([key, v]) => [key, v[state.lang === 'zh' ? 0 : 1]]), state.study, 'study', 'experiment-panel');
  const study = state.research.studies[state.study];
  const rows = state.study === 'perturbation' ? study.views[state.view] : study.rows;
  const big = state.study === 'large' || (state.study === 'perturbation' && state.view === 'overall');
  const panel = $('#experiment-panel'), before = panel.offsetHeight;
  panel.setAttribute('aria-labelledby', `study-tab-${state.study}`);
  const views = [['overall', t('总体', 'Overall')], ['seed', t('按种子', 'By seed')], ['type', t('按类型', 'By type')]];
  panel.innerHTML = `<div class="step-in"><div class="study-head"><div><h3>${esc(pick(study.title))}</h3><p>${esc(pick(study.description))}</p></div><div class="legend"><span><i class="sw"></i>GPT-4.1</span><span><i class="sw sw-b"></i>gpt-oss-20B</span></div></div>
    <div class="study-toolbar"><span class="mono">${esc(pick(study.metric))} / %</span>${state.study === 'perturbation' ? `<div class="switch" role="group" aria-label="${t('扰动结果分组', 'Group perturbation results')}">${views.map(([key, label]) => `<button type="button" data-view="${key}" aria-pressed="${state.view === key}">${label}</button>`).join('')}</div>` : ''}</div>
    <div class="study-chart">${state.study === 'repair' ? repairBars(rows) : big ? bigScores(rows) : barGroups(rows)}</div>
    <div class="study-foot"><p>${esc(pick(study.note))}</p><div class="sources">${study.sources.map((v, i) => `<a href="${esc(v.url)}" target="_blank" rel="noopener">${t('来源', 'Source')} ${String(i + 1).padStart(2, '0')}</a>`).join('')}<a href="data/research.json" download>${t('下载汇总数据', 'Download data')} ↓</a></div>
    <details class="values"><summary>${t('查看数值表与来源说明', 'View values and source details')}</summary>${valuesTable([t('分组', 'Group'), t('模型', 'Model'), t('正确 / 总数', 'Matched / total'), t('匹配率', 'Match rate')], rows.map(v => [groupLabel(v.group), modelName(v.model), v.total ? `${v.correct} / ${v.total}` : t('报告值', 'Reported'), `${pct(v.rate)}%`]))}<div class="sources" style="margin-top:12px">${study.sources.map(v => `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.label)}</a>`).join('')}<a href="data/SOURCES.md" target="_blank" rel="noopener">${t('完整来源说明', 'Source notes')}</a></div></details></div></div>`;
  const play = $('#study-play'), last = state.study === Object.keys(STUDIES).at(-1);
  play.innerHTML = `<i>${state.studyPlaying && !reduced ? 'Ⅱ' : '▶'}</i><span>${reduced ? t('手动浏览', 'Manual view') : state.studyPlaying ? t('暂停切换', 'Pause rotation') : last ? t('重新播放', 'Replay') : t('继续切换', 'Resume rotation')}</span>`;
  play.disabled = reduced;
  play.setAttribute('aria-pressed', String(state.studyPlaying && !reduced));
  requestAnimationFrame(() => { fillBars(panel); panel.classList.add('is-in'); $$('.count', panel).forEach(el => countUp(el, 1100)); });
  morphHeight(panel, before);
  measureLayers();
  studyPlay.restart();
}
function selectStudy(key, manual = true) {
  if (!Object.hasOwn(STUDIES, key)) return;
  if (manual) state.studyPlaying = false;
  state.study = key;
  if (key === Object.keys(STUDIES).at(-1)) state.studyPlaying = false;
  renderExperiments();
}
$('#experiment-tabs').addEventListener('click', event => { const button = event.target.closest('[data-study]'); if (button) selectStudy(button.dataset.study); });
tabKeys($('#experiment-tabs'), button => selectStudy(button.dataset.study));
$('#experiment-panel').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  state.studyPlaying = false;
  state.view = button.dataset.view;
  renderExperiments();
  $(`[data-view="${state.view}"]`)?.focus({ preventScroll: true });
});
$('#study-play').addEventListener('click', () => {
  if (state.studyPlaying) { state.studyPlaying = false; renderExperiments(); return; }
  if (state.study === Object.keys(STUDIES).at(-1)) state.study = Object.keys(STUDIES)[0];
  state.studyPlaying = true;
  renderExperiments();
});
$('#experiment-panel').addEventListener('focusin', () => { if (state.studyPlaying) { state.studyPlaying = false; studyPlay.stop(); } });
function fillBars(scope) {
  for (const fill of $$('.fill', scope)) {
    if (fill.dataset.l) fill.style.left = fill.dataset.l + '%';
    fill.style.width = fill.dataset.w + '%';
  }
}

/* Airline */
// The medium-scale network named in the paper, and a schematic fan of the large-scale markets from the hub.
const CITIES = { SIN: [103.99, 1.36], HKG: [113.92, 22.31], MNL: [121.02, 14.51] };
const ROUTES = [['SIN', 'HKG', .16], ['SIN', 'MNL', -.14], ['HKG', 'MNL', .22]];
const FAN = [[-168, 330], [-150, 420], [-132, 470], [-112, 520], [-96, 560], [-80, 600], [-64, 520], [-48, 470], [-34, 560], [-18, 640], [-4, 660], [14, 560], [32, 420], [52, 380], [74, 300], [96, 260], [128, 300], [150, 360], [172, 430]];
const arcPath = (a, b, bend) => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
};
const PLANE = 'M-10 -1.6L5 -1.6Q10 -1.4 11 0Q10 1.4 5 1.6L-10 1.6ZM-1 -1.6L-6 -10L-3.2 -10L4 -1.6ZM-1 1.6L-6 10L-3.2 10L4 1.6ZM-10 -1L-12.5 -5.5L-10.5 -5.5L-7 -1ZM-10 1L-12.5 5.5L-10.5 5.5L-7 1Z';
function drawAirMap() {
  const svg = $('#air-map');
  const at = Object.fromEntries(Object.entries(CITIES).map(([k, v]) => [k, project(...v)]));
  const hub = at.SIN;
  const grat = [];
  for (let lon = 70; lon <= 150; lon += 10) { const [x] = project(lon, 0); grat.push(`M${x.toFixed(0)} 0V${MAP.height}`); }
  for (let lat = -10; lat <= 40; lat += 10) { const [, y] = project(0, lat); grat.push(`M0 ${y.toFixed(0)}H${MAP.width}`); }
  const fan = FAN.map(([deg, r], i) => {
    const a = deg * Math.PI / 180, end = [hub[0] + Math.cos(a) * r, hub[1] + Math.sin(a) * r];
    return `<path class="net" style="animation-delay:${(-i * .37).toFixed(2)}s" d="${arcPath(hub, end, i % 2 ? .14 : -.14)}"/><circle class="end" cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4"/>`;
  }).join('');
  const routes = ROUTES.map(([a, b, bend], i) => { const d = arcPath(at[a], at[b], bend); return `<path class="route-glow" d="${d}"/><path class="route" id="air-route-${i}" d="${d}"/>`; }).join('');
  const names = { HKG: t('香港', 'Hong Kong'), MNL: t('马尼拉', 'Manila') };
  const city = (code, dx, anchor) => `<g class="city"><circle cx="${at[code][0]}" cy="${at[code][1]}" r="7"/><text x="${at[code][0] + dx}" y="${at[code][1] - 4}" text-anchor="${anchor}">${code}</text><text class="sub" x="${at[code][0] + dx}" y="${at[code][1] + 14}" text-anchor="${anchor}">${names[code]}</text></g>`;
  svg.setAttribute('viewBox', `0 0 ${MAP.width} ${MAP.height}`);
  svg.setAttribute('aria-label', t('新加坡航空网络示意：枢纽新加坡，中规模案例连接香港与马尼拉', 'Schematic Singapore Airlines network: the Singapore hub, with the medium-scale case linking Hong Kong and Manila'));
  svg.innerHTML = `<defs><pattern id="air-dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4"/></pattern><clipPath id="air-land"><path d="${LAND}"/></clipPath></defs>
    <path class="grat" d="${grat.join('')}"/><path class="land" d="${LAND}"/><g class="land-dots"><rect width="${MAP.width}" height="${MAP.height}" fill="url(#air-dots)" clip-path="url(#air-land)"/></g>
    <g>${fan}</g><g>${routes}</g><g class="planes">${ROUTES.map(() => `<path class="plane" d="${PLANE}"/>`).join('')}</g>
    ${city('HKG', 14, 'start')}${city('MNL', 14, 'start')}
    <g class="hub"><circle class="ring" cx="${hub[0]}" cy="${hub[1]}" r="12"/><circle class="ring" cx="${hub[0]}" cy="${hub[1]}" r="12"/><circle class="core" cx="${hub[0]}" cy="${hub[1]}" r="10"/><text x="${hub[0] - 18}" y="${hub[1] - 6}" text-anchor="end">SIN</text><text class="sub" x="${hub[0] - 18}" y="${hub[1] + 12}" text-anchor="end">${t('新加坡 · 枢纽', 'Singapore hub')}</text></g>
`;
  placePlanes(0);
}
// Planes shuttle along the three medium-scale routes while the map is on screen.
function placePlanes(now) {
  ROUTES.forEach((_, i) => {
    const path = $(`#air-route-${i}`), plane = $$('#air-map .plane')[i];
    if (!path || !plane) return;
    const L = path.getTotalLength(), cycle = (now / 1000 / (7 + i * 1.6) + i * .37) % 2, forward = cycle < 1;
    const u = forward ? cycle : 2 - cycle, s = .5 - Math.cos(u * Math.PI) / 2;
    const p = path.getPointAtLength(s * L), q = path.getPointAtLength(Math.min(L, Math.max(0, s * L + (forward ? 1 : -1))));
    const angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    plane.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(1.35)`);
  });
}
let airVisible = false, airRaf = 0;
const flyPlanes = now => { airRaf = 0; if (!airVisible || document.hidden || reduced) return; placePlanes(now); airRaf = requestAnimationFrame(flyPlanes); };
new IntersectionObserver(([entry]) => { airVisible = entry.isIntersecting; if (airVisible && !airRaf && !reduced) airRaf = requestAnimationFrame(flyPlanes); }).observe($('#air-map'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && airVisible && !airRaf && !reduced) airRaf = requestAnimationFrame(flyPlanes); });
function renderAirline() {
  drawAirMap();
  const study = state.research.studies.air;
  const groups = [...new Set(study.rows.map(v => v.group))];
  const names = [t('票价类型容量分配', 'Fare-type capacity allocation'), t('联合容量与航班选择', 'Joint allocation + flight selection')];
  $('#airline-results').innerHTML = `<p class="air-label">${esc(pick(study.metric))}</p><div class="air-metrics">${groups.map((group, i) => `<div class="card air-metric"><span>${names[i] || esc(group)}</span>${study.rows.filter(v => v.group === group).map(v => `<strong>${pct(v.rate)}%<small>${modelName(v.model)}</small></strong>`).join('')}</div>`).join('')}</div><a class="link" href="${esc(state.research.paper.url)}" target="_blank" rel="noopener" style="margin-top:14px">${t('论文中的模拟案例', 'Simulation case studies in the paper')}</a>`;
}

/* Citation */
$('#copy-citation').addEventListener('click', async () => {
  const text = state.research?.paper.citation || '';
  let copied = true;
  try { await navigator.clipboard.writeText(text); } catch (_) { copied = false; }
  const toast = $('#toast');
  toast.textContent = copied ? t('已复制引用', 'Citation copied') : text;
  toast.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toast.classList.remove('is-on'), copied ? 1800 : 8000);
});

/* Reveal */
let revealObserver;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      let n = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        el.style.transitionDelay = `${n++ * 90}ms`;
        el.classList.add('is-in');
        if (el.classList.contains('stat')) $$('.num', el).forEach(num => countUp(num));
        revealObserver.unobserve(el);
        // Once in, the element goes back to its own transitions, so hovers stay quick.
        setTimeout(() => { el.style.transitionDelay = ''; el.classList.remove('rv'); }, 1400 + n * 90);
      }
    }, { rootMargin: '0px 0px -12% 0px' });
  }
  for (const el of $$('.rv:not(.is-in)')) {
    if (reduced) el.classList.add('is-in'); else revealObserver.observe(el);
  }
}

/* Hero: the published solid figure, which can be dragged and lifts off past the scroll line */
let heroFigure = null;
import('./hero-figure.js?v=20261119-2').then(({ createHeroFigure }) => {
  heroFigure = createHeroFigure($('#hero-figure'), { reduced });
  heroFigure.setLifted(state.lifted, { now: true });
}).catch(error => { $('#hero-figure').classList.add('is-static'); console.warn('Cover figure disabled:', error.message); });

/* Demo video: the narrated walkthrough in the reader's language, over the Figure 3 model seen from several angles */
const film = $('#film'), filmFrame = $('#film-frame'), filmVideo = $('#film-video'), filmChapters = $('#film-chapters');
let filmBackdrop = null, filmLang = null;
const clockTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function filmChapterAt(time) {
  let index = 0;
  state.film.chapters.forEach((chapter, i) => { if (chapter.at[filmLang] <= time + .05) index = i; });
  return index;
}
function seekFilm(at) {
  if (filmVideo.readyState >= 1) filmVideo.currentTime = at;
  else filmVideo.addEventListener('loadedmetadata', () => { filmVideo.currentTime = at; }, { once: true });
}
function renderFilm() {
  const data = state.film;
  if (!data) return;
  if (filmLang !== state.lang) {
    // The other language opens at the chapter the reader was in, paused.
    const started = film.classList.contains('is-started');
    const chapter = started && filmLang ? filmChapterAt(filmVideo.currentTime) : 0;
    filmLang = state.lang;
    filmVideo.poster = data.poster[filmLang];
    if (started) { filmVideo.pause(); filmVideo.src = data.src[filmLang]; seekFilm(data.chapters[chapter].at[filmLang]); }
  }
  $('#film-duration').textContent = clockTime(Math.round(data.duration[filmLang]));
  filmChapters.innerHTML = data.chapters.map((chapter, i) => `<li><button type="button" data-chapter="${i}"><span class="mono">${clockTime(chapter.at[filmLang])}</span>${esc(chapter[filmLang])}<i aria-hidden="true"></i></button></li>`).join('');
  syncFilmChapter();
}
function syncFilmChapter() {
  const data = state.film;
  if (!data) return;
  const time = filmVideo.currentTime || 0, current = film.classList.contains('is-started') ? filmChapterAt(time) : -1;
  $$('button', filmChapters).forEach((button, i) => {
    const on = i === current;
    button.classList.toggle('is-on', on);
    button.toggleAttribute('aria-current', on);
    const from = data.chapters[i].at[filmLang], to = data.chapters[i + 1]?.at[filmLang] ?? data.duration[filmLang];
    button.style.setProperty('--p', on ? clamp((time - from) / (to - from)).toFixed(3) : '0');
  });
}
function startFilm(at = null) {
  if (!state.film) return;
  // Once the reader has started it, the video may buffer, and a language switch loads the other version's position.
  filmVideo.preload = 'auto';
  if (!filmVideo.getAttribute('src')) filmVideo.src = state.film.src[filmLang];
  film.classList.add('is-started');
  filmVideo.controls = true;
  if (at !== null) seekFilm(at);
  filmVideo.play().catch(() => {});
}
$('#film-play').addEventListener('click', () => startFilm());
filmChapters.addEventListener('click', event => {
  const button = event.target.closest('button[data-chapter]');
  if (button) startFilm(state.film.chapters[Number(button.dataset.chapter)].at[filmLang]);
});
filmVideo.addEventListener('play', () => { film.classList.add('is-playing'); filmBackdrop?.setPlaying(true); });
// A new source discards the queued pause event, so 'emptied' also counts as stopping.
for (const type of ['pause', 'ended', 'emptied']) filmVideo.addEventListener(type, () => { film.classList.toggle('is-playing', false); filmBackdrop?.setPlaying(false); });
filmVideo.addEventListener('timeupdate', syncFilmChapter);
// The backdrop loads once the section comes near.
const filmWake = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  filmWake.disconnect();
  import('./film-scene.js?v=20261120-1')
    .then(({ createFilmBackdrop }) => createFilmBackdrop($('#film-stage'), { reduced }))
    .then(backdrop => { filmBackdrop = backdrop; backdrop.setPlaying(!filmVideo.paused); onScroll(); })
    .catch(error => { $('#film-stage').classList.add('is-static'); console.warn('Video backdrop disabled:', error.message); });
}, { rootMargin: '600px 0px' });
filmWake.observe(film);

/* Motion */
// Numbers count up from zero; the box keeps its final width so the text beside it stays put.
function countUp(el, ms = 1300) {
  const text = el.dataset.to ?? el.textContent.trim();
  el.dataset.to = text;
  const to = parseFloat(text.replace(/,/g, '')), digits = (text.split('.')[1] || '').length;
  if (reduced || !Number.isFinite(to)) { el.textContent = text; return; }
  el.textContent = text;
  el.style.minWidth = `${el.offsetWidth}px`;
  const start = performance.now();
  const tick = now => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = k < 1 ? (to * (1 - Math.pow(1 - k, 4))).toFixed(digits) : text;
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  el.textContent = (0).toFixed(digits);
  requestAnimationFrame(tick);
}
// A box whose content just changed grows or shrinks to its new height instead of jumping.
function morphHeight(el, from) {
  const to = el.offsetHeight;
  if (reduced || !from || Math.abs(to - from) < 2) return;
  el.getAnimations().forEach(a => a.id === 'morph' && a.cancel());
  el.style.overflow = 'hidden';
  const anim = el.animate({ height: [`${from}px`, `${to}px`] }, { id: 'morph', duration: 560, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  anim.onfinish = anim.oncancel = () => { el.style.overflow = ''; };
}
// Accordions open and close smoothly.
document.addEventListener('click', event => {
  const summary = event.target.closest('details > summary');
  if (!summary || reduced) return;
  event.preventDefault();
  const box = summary.parentElement;
  if (box.dataset.moving) return;
  const opening = !box.open, start = box.offsetHeight;
  box.open = true;
  const cs = getComputedStyle(box);
  const closed = summary.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const end = opening ? box.offsetHeight : closed;
  box.dataset.moving = '1';
  box.style.overflow = 'hidden';
  const anim = box.animate({ height: [`${start}px`, `${end}px`] }, { duration: 460, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  anim.onfinish = () => { if (!opening) box.open = false; box.style.overflow = ''; delete box.dataset.moving; };
});

// Parallax: each section's layers drift at their own pace as it passes the middle of the screen.
// Positive depth lags behind the page (further away); negative depth runs slightly ahead.
const LAYERS = [
  ['.strip .stat', [0, .025, .05]],
  ['.film-head', [.05]],
  ['.film-chapters', [-.02]],
  ['.overview .sec-head', [.05]],
  ['.ideas li', [-.01, -.025, -.04]],
  ['.journey-head', [.12]],
  ['.replay .sec-head', [.05]],
  ['.replay-deck', [-.02]],
  ['.experiments .sec-head', [.05]],
  ['.study-card', [-.015]],
  ['.airline .sec-head', [.05]],
  ['.air-map', [-.025]],
  ['.air-side', [.035]],
  ['.resources .sec-head', [.05]],
  ['.paper-links a', [-.01, -.03, -.05]],
  ['.paper-card', [-.02]],
];
const GLOWS = {
  overview: [[-14, 6, .3], [70, 56, .2, 'alt']],
  replay: [[74, -8, .3], [-16, 58, .22, 'alt']],
  experiments: [[-12, 18, .28, 'alt'], [68, 66, .2]],
  airline: [[58, -12, .3], [-10, 58, .22, 'alt']],
  resources: [[66, 4, .26, 'alt'], [-12, 46, .2]],
};
const layers = [];
for (const [name, list] of Object.entries(GLOWS)) {
  const sec = $(`section.${name}`);
  for (const [x, y, depth, alt] of list) {
    const glow = document.createElement('i');
    glow.className = `sec-glow${alt ? ' alt' : ''}`;
    glow.setAttribute('aria-hidden', 'true');
    glow.style.left = `${x}%`;
    glow.style.top = `${y}%`;
    sec.prepend(glow);
    layers.push({ el: glow, depth, sec, off: 0, h: 0, v: 0 });
  }
}
for (const [selector, depths] of LAYERS) $$(selector).forEach((el, i) => layers.push({ el, depth: depths[i % depths.length], sec: el.closest('section'), off: 0, h: 0, v: 0 }));
const layerSections = [...new Set(layers.map(l => l.sec))];
const offsetIn = (el, sec) => { let y = 0; for (let n = el; n && n !== sec; n = n.offsetParent) y += n.offsetTop; return y; };
function measureLayers() { for (const l of layers) { l.off = offsetIn(l.el, l.sec); l.h = l.el.offsetHeight; } }
function parallax(vh) {
  if (reduced) return;
  const k = innerWidth < 720 ? .5 : 1, tops = new Map(layerSections.map(sec => [sec, sec.getBoundingClientRect().top]));
  for (const l of layers) {
    const d = tops.get(l.sec) + l.off + l.h / 2 - vh / 2;
    if (Math.abs(d) > vh * 1.8) continue;
    const limit = l.depth > .15 ? 260 : 110, v = clamp(-d * l.depth * k, -limit, limit);
    if (Math.abs(v - l.v) < .1) continue;
    l.v = v;
    l.el.style.translate = `0 ${v.toFixed(1)}px`;
  }
}

// The current section's pill slides along the navigation.
const navInk = document.createElement('i');
navInk.className = 'nav-ink';
navInk.setAttribute('aria-hidden', 'true');
$('.nav-links').prepend(navInk);
let navCurrent = null;
function moveNavInk(link, instant = false) {
  if (link === navCurrent && !instant) return;
  const appearing = !navCurrent;
  navCurrent = link;
  if (!link) { navInk.style.opacity = '0'; return; }
  if (appearing || instant) navInk.style.transition = 'opacity .3s';
  navInk.style.transform = `translateX(${link.offsetLeft}px)`;
  navInk.style.width = `${link.offsetWidth}px`;
  navInk.style.opacity = '1';
  if (appearing || instant) { void navInk.offsetWidth; navInk.style.transition = ''; }
}

// Buttons lean a few pixels toward the pointer and spring back when it leaves.
if (!reduced && matchMedia('(pointer: fine)').matches) {
  let magnet = null;
  const release = () => { if (magnet) { magnet.style.translate = ''; magnet = null; } };
  document.addEventListener('pointermove', event => {
    const el = event.target.closest?.('.btn, .pill, .round, .tool, .dock');
    if (el !== magnet) release();
    if (!el || el.disabled) return;
    magnet = el;
    const r = el.getBoundingClientRect();
    const dx = (event.clientX - r.left) / r.width - .5, dy = (event.clientY - r.top) / r.height - .5;
    el.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 7).toFixed(1)}px`;
  }, { passive: true });
  document.addEventListener('pointerleave', release);
}

/* Scroll choreography */
const heroCopy = $('.hero-copy');
const stages = $$('.stage');
const rail = $('.rail');
const scrim = $('.scene-scrim');
const railItems = $$('.rail li');
const nav = $('.nav');
const navLinks = $$('.nav-links a');
const hero = $('#top'), journey = $('#architecture'), dock = $('#demo-dock'), foot = $('.foot');
let anchors = [];
function measure() {
  const vh = innerHeight;
  measureLayers();
  anchors = [0, ...stages.map(el => el.getBoundingClientRect().top + scrollY + el.offsetHeight / 2 - vh / 2)];
}
function journeyT(y) {
  if (y <= anchors[0]) return 0;
  for (let i = 1; i < anchors.length; i++) if (y <= anchors[i]) return i - 1 + (y - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
  return anchors.length - 1;
}
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    const progress = journeyT(y);
    // Past a short scroll every part of the figure lifts off at once; back above the line, they all drop in.
    const line = vh * .12;
    const lifted = !reduced && (state.lifted ? y > line - 24 : y > line + 24);
    if (lifted !== state.lifted) { state.lifted = lifted; root.classList.toggle('is-lifted', lifted); heroFigure?.setLifted(lifted); }
    state.scene?.setProgress(progress);
    if (state.intro && state.cases) stepIntro(vh);
    const heroBox = hero.getBoundingClientRect(), journeyBox = journey.getBoundingClientRect();
    // The tour scene shows only through the tour; it wakes a little early so parts left from an earlier visit are gone by then.
    state.scene?.setActive(journeyBox.top < vh * 2 && journeyBox.bottom > 0);
    let shown = 0;
    for (const stage of stages) {
      const r = stage.getBoundingClientRect();
      const d = (r.top + r.height / 2 - vh / 2) / vh;
      const o = reduced ? (Math.abs(d) < .5 ? 1 : 0) : clamp(1 - (Math.abs(d) - .14) / .26);
      shown = Math.max(shown, o);
      for (const child of stage.children) {
        child.style.opacity = o.toFixed(3);
        child.style.transform = reduced ? '' : `translate3d(0, ${(d * -60).toFixed(1)}px, 0)`;
      }
    }
    // The veil behind the copy only shows while a station's copy is on screen, so the figure stays crisp between them.
    scrim.style.opacity = (progress < .5 ? 1 : shown).toFixed(3);
    const active = Math.round(progress);
    const inJourney = journeyBox.top < vh * .5 && journeyBox.bottom > vh * .5;
    rail.classList.toggle('is-on', inJourney && progress > .55 && progress < 5.5);
    railItems.forEach((li, i) => li.classList.toggle('is-on', i + 1 === active));
    nav.classList.toggle('is-solid', y > 24);
    // The demo shortcut stays out of the tour and steps aside for the footer.
    dock.classList.toggle('is-on', heroBox.bottom < vh * .4 && !inJourney && foot.getBoundingClientRect().top > vh - 40);
    const marker = y + vh * .35;
    let current = '';
    for (const link of navLinks) { const sec = $(link.getAttribute('href')); if (sec && sec.getBoundingClientRect().top + y <= marker) current = link.getAttribute('href'); }
    navLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === current));
    moveNavInk(navLinks.find(link => link.getAttribute('href') === current) || null);
    // The cover copy lingers and fades as the page moves on.
    if (!reduced && y < vh * 1.2) {
      heroCopy.style.translate = `0 ${(y * .15).toFixed(1)}px`;
      heroCopy.style.opacity = (1 - clamp(y / (vh * .65))).toFixed(3);
    }
    // The video's backdrop follows the panel through the window, and the player settles to full size as it arrives.
    const filmBox = film.getBoundingClientRect();
    if (!reduced && filmBox.bottom > -vh * .2 && filmBox.top < vh * 1.2) {
      filmBackdrop?.setProgress((vh - filmBox.top) / (vh + filmBox.height));
      const k = clamp((vh - filmFrame.getBoundingClientRect().top) / (vh * .7));
      filmFrame.style.scale = (.9 + .1 * (1 - (1 - k) ** 3)).toFixed(4);
    }
    parallax(vh);
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => {
  measure(); onScroll();
  for (const tabs of $$('.tabs.has-ink')) placeInk(tabs, true);
  moveNavInk(navCurrent, true);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.cases && $('#replay-content').clientWidth !== replayWidth) { sizeReplay(); fillStep(state.replay); measureLayers(); } }, 150);
});

/* Scene */
async function startScene() {
  const canvas = $('#scene');
  try {
    const { createScene } = await import('./scene.js?v=20261119-3');
    state.scene = await createScene(canvas, { theme: state.theme, reduced });
    if (!state.scene) throw new Error('WebGL unavailable');
    measure();
    // The cover owns the assembled figure; the tour's parts start out of sight and land station by station.
    state.scene.setLifted(true);
    state.scene.setProgress(journeyT(scrollY));
    onScroll();
  } catch (error) {
    root.classList.add('no-webgl');
    console.warn('3D scene disabled:', error.message);
  }
}

/* Boot */
for (const el of $$('.strip .stat, .film-head > div, .film-chapters, .overview .sec-head, .ideas li, .journey-head, .sec-head, .replay-deck, .study-controls, .study-card, .metric-details, .air-map, .air-side, .paper-links, .paper-card')) el.classList.add('rv');
syncDemoLinks();
measure();
onScroll();
const [research, cases, filmData] = await Promise.all([
  fetch('data/research.json').then(r => r.json()),
  fetch('data/cases.json').then(r => r.json()),
  fetch('data/film.json').then(r => r.json()).catch(() => null),
]);
state.research = research;
state.cases = cases;
state.caseId = cases.cases[0].id;
state.film = filmData;
if (state.intro && deck.getBoundingClientRect().top > innerHeight * .74) { state.replay = STEPS.length - 1; deck.dataset.left = '2'; } else stopIntro();
applyLanguage();
observeReveals();
document.fonts?.ready.then(() => {
  sizeReplay(); fillStep(state.replay); measure(); onScroll();
  for (const tabs of $$('.tabs.has-ink')) placeInk(tabs, true);
  moveNavInk(navCurrent, true);
});
startScene();

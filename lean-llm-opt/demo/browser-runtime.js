// In-browser GPT-4.1 workspace for the static Demo. It serves the same session,
// file, run and event contract as the online backend, but runs entirely in this
// page: the visitor's key calls OpenAI directly, and generated gurobipy code runs
// in a Pyodide worker whose gurobipy module is solved by HiGHS (not Gurobi).
// The pipeline follows demo_backend/pipeline.py step by step.

export const BROWSER_SERVICE = 'lean-browser-demo';
export const OPENAI_MODEL = 'gpt-4.1', EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_URL = 'https://api.openai.com/v1';
const ASSET_VERSION = 'browser-highs-20261119-3';
const WORKER_URL = new URL(`browser/pyodide-worker.js?v=${ASSET_VERSION}`, import.meta.url);
const REFERENCE_URL = new URL(`browser/reference-library.json?v=${ASSET_VERSION}`, import.meta.url);
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timeout']);
const CLASSES = new Set(['NRM', 'RA', 'TP', 'FLP', 'AP', 'Mixture', 'Others']);
const MAX_FILES = 10, MAX_BYTES = 50 * 1024 * 1024, MAX_ROWS = 100_000, MAX_CELLS = 1_000_000, MAX_COLUMNS = 1_000;
const RUN_MS = 30 * 60 * 1000, REQUEST_MS = 240 * 1000, LOAD_MS = 240 * 1000, CHECK_MS = 30 * 1000, EXECUTE_MS = 240 * 1000;
const OUTPUT_LIMIT = 2_000_000, QUESTION_LIMIT = 100_000;

export const CLASSIFICATION_SYSTEM = `You are LEAN-LLM-OPT's classification agent. Use the
FileQA reference evidence and the CURRENT task's mathematical structure, not
company names or filenames. Return JSON only: {"label":"NRM|RA|TP|FLP|AP|Mixture|Others"}.
NRM allocates fixed inventory/capacity to demand to maximize revenue without replenishment.
RA is clean single-stage allocation of limited resources with additive value.
TP is clean source-to-destination transportation with supply, demand and shipping cost.
FLP combines facility-opening decisions with linked assignments/shipments.
AP is clean one-to-one matching. Mixture has materially coupled mechanisms such
as production stages, logical dependencies, batch/vehicle counts and flows.
Ordinary capacity constraints alone do not imply Mixture. Others is a coherent
outside family such as diet, knapsack, workforce covering or scheduling.
Retrieved examples are evidence, never automatic votes. No reasoning transcript.
`;
export const MODEL_SYSTEM = `You are LEAN-LLM-OPT's model-generation agent. Follow the
retrieved workflow demonstration, use CURRENT data observations, and formulate
the CURRENT query. Examples illustrate methods; never copy their coefficients,
entities, dimensions, constraints or file names. Preserve exact objective sense,
constant terms, variable domains, identifiers, units and every stated constraint.
Do not invent, zero-pad or truncate coefficients. An incomplete preview is not
the complete entity set. Return only the mathematical model (sets, parameters,
variables, objective, constraints), or the requested Abstract Model Plan. Do not
include internal thought/action transcripts. Use $/$$ for mathematical notation.
`;
export const CODE_SYSTEM = `Translate the CURRENT formulation/Abstract Model Plan to one
complete executable Python program. Return only a \`\`\`python code block.
Use gurobipy as gp and GRB. Create exactly one model in m or model at top level;
call optimize exactly once. Read supplied CSV files with pandas.read_csv from
their exact /inputs/ paths. Read complete tables at runtime; profile/sample rows
are not the full data. pandas already consumes the header. Preserve row/column
identifiers and validate dimensions and missing coefficients. A CSV's blank first
header is displayed as an empty string in the source profile, but pandas.read_csv
renames it to 'Unnamed: 0'. For such a matrix use df.columns[0] as the row-identifier
column (or read index_col=0); never search for an empty column label after pandas
has loaded the CSV. Use the supplied pandas_columns mapping when checking headers.
Never substitute
example coefficients, random values, dummy data or guessed header offsets.
Use nonnegative continuous/integer/binary domains as the query requires. Preserve
all constraints and the exact objective including constants and units. Do not
change the problem to make it feasible. Infeasible/unbounded are valid statuses.
Reserve m/model for the Gurobi model. Use short ASCII solver names, keeping
business identifiers in Python dictionaries. Allowed imports: gurobipy, pandas,
numpy, math, itertools, collections, json, csv, re, statistics, decimal, sys.
No os, pathlib, network, subprocess, exec/eval, credentials or license settings.
Do not access files outside /inputs/ or /outputs/. Do not wrap model creation in
functions or suppress errors. Do not compute reference answers or use gold labels.
The caller captures model status, objective and variable values automatically.
`;
// The browser executes gurobipy code through a linear HiGHS layer, so the code
// agent is told which modeling features that layer accepts.
export const BROWSER_SOLVER_NOTE = `
This program runs in a gurobipy-compatible layer solved by HiGHS. Use linear
objectives and linear constraints over continuous, integer and binary variables
(addVar/addVars, addConstr/addConstrs, quicksum, tupledict sum/prod, setObjective
or setObjectiveN). Express logic, max/min and fixed charges with linear big-M
constraints; do not use quadratic terms, addGenConstr*, indicator constraints,
callbacks, addMVar, gp.Env or model file reading.
`;
export const INTENT_SYSTEM = `Resolve the current conversational request. Return JSON only:
{"intent":"solve|revise|explain|clarify","task":"standalone complete modeling task","question":"clarifying question if needed"}.
solve is a new complete optimization task; revise changes an existing task and must
preserve all unchanged earlier requirements in task. explain asks about an existing
model/code/result and must not run a new solver. clarify is only for material
missing information that prevents a formulation; do not ask to confirm a clear task.
Current files may resolve schema questions. Do not invent data or target solutions.
No hidden reasoning. Language: `;
export const EXPLAIN_SYSTEM = ['Explain the supplied model/code/result in ', '. Use only the recorded artifacts and conversation. Clearly distinguish a solver result from a guarantee of business correctness. Give a concise explanation, not a reasoning transcript. Do not invent a new objective or claim a new run.'];
export const CSVQA_SYSTEM = `You plan the CSVQA data tool. Return JSON only:
{"selections":[{"file":"exact supplied filename","logic":"and","conditions":[{"column":"exact column name","op":"eq|ne|in|contains|gt|ge|lt|le","value":"value or list"}]}]}.
Include each supplied table exactly once, preserving all columns. Use conditions=[]
when the query does not request a subset; never copy entity filters from examples.
Use exact identifiers; a zero-match filter must not be broadened. Blank column
names can be actual row identifiers in matrix exports. No Python, no SQL, no thoughts.`;
export const REPAIR_NOTE = '\nRepair only the reported syntax/runtime error. Preserve all original modeling semantics, data selection, objective, variable domains and constraints. Return the complete program. Do not weaken constraints or invent data.';
const AGNOSTIC_NOTE = 'Produce an Abstract Model Plan: analyze query; identify LP/MILP type; define index sets and variable domains; identify exact source columns, selected sets and joins; state objective and every constraint.';
const TAILORED_NOTE = 'Use the type-specific demonstration to produce sets, parameters, variable domains, objective and every constraint using the CURRENT CSVQA observation.';

export class PipelineError extends Error {}
export class ProviderError extends Error {}
class Cancelled extends PipelineError {constructor() {super('Run cancelled');}}

// Ordered record so row dictionaries serialize in source column order, as json.dumps does.
class Row {
  constructor(columns, values) {this.entries = columns.map((column, index) => [column, values[index]]);}
  get(column) {return this.entries.find(([name]) => name === column)?.[1];}
}

export function pyJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NaN';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(pyJSON).join(', ')}]`;
  const entries = value instanceof Row ? value.entries : Object.entries(value).filter(([, item]) => item !== undefined);
  return `{${entries.map(([key, item]) => `${JSON.stringify(String(key))}: ${pyJSON(item)}`).join(', ')}}`;
}

const plain = value => JSON.parse(JSON.stringify(value, (key, item) => item instanceof Row ? Object.fromEntries(item.entries) : item));
const number = value => typeof value === 'number' ? new Intl.NumberFormat('en-US', {maximumFractionDigits: 6}).format(value) : String(value);

function redact(value, secret) {
  if (!secret) return value;
  if (typeof value === 'string') return value.replaceAll(secret, '[redacted]');
  if (Array.isArray(value)) return value.map(item => redact(item, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['api_key', 'authorization', 'password', 'secret', 'headers'].includes(key.toLowerCase()))
    .map(([key, item]) => [redact(key, secret), redact(item, secret)]));
  return value;
}

function parseJSONObject(text) {
  text = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new PipelineError('The model did not return a valid structured response');
  let value;
  try {value = JSON.parse(text.slice(start, end + 1));} catch {throw new PipelineError('The model did not return valid JSON');}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PipelineError('The model response must be a JSON object');
  return value;
}

function extractCode(text) {
  const match = text.match(/```(?:python)?\s*\n([\s\S]*?)```/i);
  return `${(match ? match[1] : text).trim()}\n`;
}

const visibleText = text => text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, '').trim();

function safeReference(text) {
  const lines = String(text).split(/\r?\n/).filter(line => !/WLSACCESSID|WLSSECRET|LICENSEID|api[_-]?key|sk-[A-Za-z0-9]/i.test(line));
  return lines.join('\n').replace(/(?:\/Users\/|\/home\/)[^\s'"]+/g, '<example-path>');
}

// CSV parsing compatible with Python's csv module (excel dialect) as used by the backend.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, started = false, afterQuote = false, rowTouched = false;
  const endCell = () => {row.push(cell); cell = ''; started = false; afterQuote = false;};
  // Python's reader yields [] for a blank line, which the backend skips.
  const endRow = () => {endCell(); if (rowTouched || row.length > 1 || row[0] !== '') rows.push(row); row = []; rowTouched = false;};
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {cell += '"'; index++;} else {quoted = false; afterQuote = true;}
      } else cell += char;
      continue;
    }
    if (char === '"' && !started && !afterQuote) {quoted = true; started = true; rowTouched = true; continue;}
    if (char === ',') {rowTouched = true; endCell(); continue;}
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      endRow();
      continue;
    }
    cell += char; started = true; rowTouched = true;
  }
  if (quoted) throw new PipelineError('unexpected end of data');
  if (cell || row.length || rowTouched) endRow();
  return rows;
}

class Budget {
  constructor() {this.rows = 0; this.cells = 0;}
  add(rows, cells) {
    if (this.rows + rows > MAX_ROWS || this.cells + cells > MAX_CELLS) throw new ServiceError(413, `CSV tables may contain at most ${MAX_ROWS} data rows and ${MAX_CELLS} cells in total`);
    this.rows += rows; this.cells += cells;
  }
  table(rowCount, columnCount) {
    if (!(columnCount > 0 && columnCount <= MAX_COLUMNS)) throw new ServiceError(413, `Each CSV may contain at most ${MAX_COLUMNS} columns`);
    this.add(rowCount, (rowCount + 1) * columnCount);
  }
}

class ServiceError extends Error {
  constructor(status, message) {super(message); this.status = status;}
}

function decodeCSV(bytes) {
  if (!bytes.length || bytes.includes(0)) throw new ServiceError(400, 'CSV must contain UTF-8 text');
  try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^﻿/, '');}
  catch {throw new ServiceError(400, 'Invalid UTF-8 CSV');}
}

function csvTable(name, text, size) {
  let rows;
  try {rows = parseCSV(text);} catch {throw new ServiceError(400, 'Invalid UTF-8 CSV');}
  const [columns, ...body] = rows;
  if (!columns?.length || new Set(columns).size !== columns.length || body.some(row => row.length !== columns.length)) throw new ServiceError(400, 'Invalid UTF-8 CSV');
  return {name, size, columns, rows: body, content: text};
}

function validFilename(name) {
  if (!name || name.length > 120 || /[\\/]/.test(name) || !name.toLowerCase().endsWith('.csv') || [...name].some(char => char.charCodeAt(0) < 32) || name === '.' || name === '..') throw new ServiceError(400, 'Use a plain CSV filename');
  return name;
}

function checkTables(tables) {
  const budget = new Budget();
  for (const table of tables) budget.table(table.rows.length, table.columns.length);
}

function fileView(table) {
  return {id: table.id, name: table.name, size: table.size, columns: [...table.columns], preview: table.rows.slice(0, 20).map(row => [...row]), row_count: table.rows.length};
}

async function fileBytes(file) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  const Reader = globalThis.FileReader || globalThis.window?.FileReader;
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new ServiceError(400, 'Could not read the CSV file'));
    reader.readAsArrayBuffer(file);
  });
}

function profiles(tables) {
  return tables.map(table => ({name: table.name, path: `/inputs/${table.name}`, columns: table.columns,
    pandas_columns: table.columns.map((column, index) => column || `Unnamed: ${index}`),
    row_count: table.rows.length, preview: table.rows.slice(0, 3).map(row => new Row(table.columns, row)),
    preview_is_complete: table.rows.length <= 3}));
}

function condition(row, item, columns) {
  const column = item?.column, operator = item?.op;
  if (!columns.includes(column)) throw new PipelineError('CSVQA plan refers to an unknown column');
  const actual = row.get(column), expected = item.value;
  const text = value => value === null ? 'None' : typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value);
  if (operator === 'eq') return actual === text(expected);
  if (operator === 'ne') return actual !== text(expected);
  if (operator === 'in') {
    if (!Array.isArray(expected)) throw new PipelineError('CSVQA in condition needs a list');
    return expected.map(text).includes(actual);
  }
  if (operator === 'contains') return actual.toLowerCase().includes(String(expected).toLowerCase());
  if (['gt', 'ge', 'lt', 'le'].includes(operator)) {
    const left = Number(actual.trim()), right = Number(typeof expected === 'string' ? expected.trim() : expected);
    if (actual.trim() === '' || Number.isNaN(left) || expected === null || Number.isNaN(right)) throw new PipelineError('CSVQA numeric condition has nonnumeric values');
    return {gt: left > right, ge: left >= right, lt: left < right, le: left <= right}[operator];
  }
  throw new PipelineError('CSVQA plan uses an unsupported comparison');
}

function extract(tables, plan) {
  const selections = plan.selections;
  if (!Array.isArray(selections) || selections.length !== tables.length) throw new PipelineError('CSVQA must account for every supplied table');
  const byName = new Map(selections.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => [item.file, item]));
  const names = new Set(tables.map(table => table.name));
  if (byName.size !== names.size || [...byName.keys()].some(name => !names.has(name))) throw new PipelineError('CSVQA table names do not match the supplied files');
  return tables.map(table => {
    const selection = byName.get(table.name);
    const conditions = 'conditions' in selection ? selection.conditions : [], logic = 'logic' in selection ? selection.logic : 'and';
    if (!Array.isArray(conditions) || !['and', 'or'].includes(logic)) throw new PipelineError('CSVQA conditions are invalid');
    const selected = [];
    table.rows.forEach((values, index) => {
      const row = new Row(table.columns, values), matches = conditions.map(item => condition(row, item, table.columns));
      if (!matches.length || (logic === 'and' ? matches.every(Boolean) : matches.some(Boolean))) selected.push({source_row: index, values: row});
    });
    const record = {file: table.name, source_rows: table.rows.length, selected_rows: selected.length, columns: table.columns,
      records: selected, records_complete: true, conditions, logic};
    if (pyJSON(record).length > 28000) Object.assign(record, {records: [...selected.slice(0, 3), ...selected.slice(-2)], records_complete: false,
      note: 'Illustrative first/last rows only. Read complete source CSV at runtime.'});
    return record;
  });
}

function priorContext(prior) {
  if (!prior || typeof prior !== 'object' || Array.isArray(prior)) return {};
  const nested = prior.artifacts && typeof prior.artifacts === 'object' && !Array.isArray(prior.artifacts) ? prior.artifacts : {};
  const result = {};
  for (const key of ['query', 'formulation', 'model', 'code', 'execution', 'answer']) {
    let value = prior[key];
    if (value === null || value === undefined || (key === 'query' && ['explain', 'clarify'].includes(prior.intent))) value = nested[key];
    if (value !== null && value !== undefined) result[key] = (typeof value === 'string' ? value : pyJSON(value)).slice(0, 20000);
  }
  return result;
}

function httpMessage(status, code) {
  if (status === 401) return 'OpenAI rejected the API key (HTTP 401). Check the key in Personal settings.';
  if (status === 403) return 'OpenAI denied this key access to the request (HTTP 403).';
  if (status === 404) return 'OpenAI reports the model is unavailable for this key (HTTP 404).';
  if (status === 429) return code === 'insufficient_quota' ? 'OpenAI reports insufficient quota for this key (HTTP 429).' : 'OpenAI rate limit reached (HTTP 429). Wait a moment and try again.';
  if (status >= 500) return `OpenAI service error (HTTP ${status}). Try again shortly.`;
  return `Model service returned HTTP ${status}`;
}

class OpenAIClient {
  constructor({key, fetch, signal, deadline}) {Object.assign(this, {key, fetch, signal, deadline});}

  async post(path, body) {
    if (this.signal.aborted) throw new Cancelled();
    const remaining = Math.min(REQUEST_MS, this.deadline - Date.now());
    if (remaining <= 0) throw new ProviderError('Run deadline exceeded');
    const controller = new AbortController(), stop = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {timedOut = true; controller.abort();}, remaining);
    this.signal.addEventListener('abort', stop, {once: true});
    const release = () => {clearTimeout(timer); this.signal.removeEventListener('abort', stop);};
    let response;
    try {
      response = await this.fetch(OPENAI_URL + path, {method: 'POST', headers: {Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'});
    } catch {
      release();
      if (this.signal.aborted) throw new Cancelled();
      if (timedOut) throw new ProviderError('OpenAI did not respond in time');
      // OpenAI sends invalid-key (401) errors without CORS headers, so the browser
      // reports them as network failures. A keyless no-cors probe tells the two apart.
      const reachable = await this.fetch(`${OPENAI_URL}/models`, {mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: this.signal}).then(() => true, () => false);
      if (this.signal.aborted) throw new Cancelled();
      throw new ProviderError(reachable
        ? 'OpenAI rejected the request without details, which usually means the API key is invalid, revoked or lacks model access. Check the key in Personal settings.'
        : 'Could not reach api.openai.com from this browser. Check the network connection or any blocking extension.');
    }
    if (!response.ok) {
      release();
      // Error bodies may quote submitted data or key fragments; keep only a code.
      let code = '';
      try {const data = await response.json(); code = String(data?.error?.code || data?.error?.type || '');} catch {}
      throw new ProviderError(httpMessage(response.status, /^[a-z0-9_]{1,60}$/.test(code) ? code : ''));
    }
    return {response, release, timedOut: () => timedOut};
  }

  async embed(texts) {
    const {response, release} = await this.post('/embeddings', {model: EMBEDDING_MODEL, input: texts});
    try {
      const data = await response.json();
      const vectors = [...data.data].sort((a, b) => a.index - b.index).map(item => item.embedding);
      if (vectors.length !== texts.length || !vectors.every(vector => Array.isArray(vector) && vector.length)) throw new Error();
      return vectors;
    } catch (error) {
      if (this.signal.aborted) throw new Cancelled();
      throw new ProviderError('Embedding service failed; check the selected provider and embedding model');
    } finally {release();}
  }

  async complete(messages, {json = false, onToken = null} = {}) {
    const body = {model: OPENAI_MODEL, messages, stream: true, temperature: 0};
    if (json) body.response_format = {type: 'json_object'};
    const {response, release, timedOut} = await this.post('/chat/completions', body);
    const content = [];
    let size = 0, truncated = false, buffer = '';
    try {
      const reader = response.body.getReader(), decoder = new TextDecoder();
      reading: for (;;) {
        const {value, done} = await reader.read();
        if (this.signal.aborted) throw new Cancelled();
        buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
        const lines = buffer.split(/\r?\n/);
        buffer = done ? '' : lines.pop();
        for (let line of lines) {
          if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
          line = line.slice(5).trim();
          if (line === '[DONE]') break reading;
          const item = JSON.parse(line);
          if (item.error) throw new ProviderError('Model service reported a generation error');
          const choice = (item.choices || [{}])[0] || {};
          const text = choice.delta?.content || '';
          truncated ||= choice.finish_reason === 'length';
          if (text) {
            size += text.length;
            if (size > OUTPUT_LIMIT) throw new ProviderError('Model output exceeded the service limit; no partial program was executed');
            content.push(text);
          }
        }
        if (done) break;
      }
    } catch (error) {
      if (error instanceof PipelineError || error instanceof ProviderError) throw error;
      if (this.signal.aborted) throw new Cancelled();
      throw new ProviderError(timedOut() ? 'OpenAI did not respond in time' : 'Model generation failed; check the selected model service');
    } finally {release();}
    if (truncated) throw new ProviderError('Model output was truncated; no partial program was executed');
    const result = visibleText(content.join(''));
    if (!result) throw new ProviderError('Model returned no visible answer');
    if (onToken) for (const chunk of result.match(/.{1,80}(?:\s|$)|.{1,80}/gs) || []) {
      if (this.signal.aborted) throw new Cancelled();
      onToken(chunk);
    }
    return result;
  }
}

function decodeVector(text) {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Float32Array(bytes.buffer);
}

class ReferenceRetriever {
  constructor(library, client) {
    this.rows = library.examples;
    this.vectors = library.examples.map(example => decodeVector(example.embedding));
    this.client = client;
    this.cache = new Map();
    if (this.rows.length < 5) throw new PipelineError('Ref-Data needs at least five labeled examples');
  }

  async search(query, {route = null, count = 5} = {}) {
    if (!this.cache.has(query)) this.cache.set(query, this.client.embed([query]).then(([vector]) => vector));
    const vector = await this.cache.get(query);
    const score = other => {
      if (vector.length !== other.length) throw new PipelineError('Embedding dimensions changed during the run');
      let dot = 0, left = 0, right = 0;
      for (let index = 0; index < vector.length; index++) {dot += vector[index] * other[index]; left += vector[index] ** 2; right += other[index] ** 2;}
      const norm = Math.sqrt(left * right);
      return norm ? dot / norm : 0;
    };
    const selected = [];
    this.rows.forEach((row, index) => {
      const label = row.type === 'UFLP' ? 'FLP' : row.type;
      if (route === 'Others' && !['Others', 'Mixture'].includes(label)) return;
      if (route && route !== 'Others' && label !== route) return;
      selected.push([score(this.vectors[index]), index, row, label]);
    });
    selected.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return selected.slice(0, count).map(([, index, row, label]) => ({id: `ref-${index + 1}`, type: label, query: row.prompt,
      formulation: safeReference(row.formulation), code: safeReference(row.code || '')}));
  }
}

// One Pyodide worker per page. It is created on demand, reused between runs,
// and terminated to stop a cancelled or overdue program.
export class PythonRuntime {
  constructor({createWorker = () => new Worker(WORKER_URL), onChange = () => {}} = {}) {
    Object.assign(this, {createWorker, onChange});
    this.worker = null; this.ready = null; this.pending = new Map(); this.sequence = 0;
    this.state = 'idle'; this.error = ''; this.versions = null;
  }

  status() {return {state: this.state, error: this.error, versions: this.versions};}

  setState(state, error = '') {
    this.state = state; this.error = error;
    try {this.onChange(this.status());} catch {}
  }

  ensure() {
    if (this.ready) return this.ready;
    this.setState('loading');
    try {
      this.worker = this.createWorker();
    } catch {
      this.setState('failed', 'This browser could not start a Web Worker for Python.');
      return Promise.reject(new Error(this.error));
    }
    this.worker.onmessage = ({data}) => {
      const entry = this.pending.get(data?.id);
      if (!entry) return;
      this.pending.delete(data.id); clearTimeout(entry.timer);
      if (data.ok) entry.resolve(data); else entry.reject(new Error(String(data.error || 'Python runtime error')));
    };
    this.worker.onerror = event => {
      event?.preventDefault?.();
      this.reset('The in-browser Python runtime stopped unexpectedly.');
    };
    const ready = this.call('init', {}, LOAD_MS).then(data => {
      this.versions = data.versions; this.setState('ready');
      return data;
    }, error => {
      if (this.ready === ready) this.ready = null;
      this.terminate(error.message);
      this.setState('failed', `The in-browser Python runtime could not load (${error.message}).`);
      throw error;
    });
    this.ready = ready;
    return ready;
  }

  call(type, payload, timeout) {
    return new Promise((resolve, reject) => {
      if (!this.worker) {reject(new Error('Python runtime is not running')); return;}
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        const error = new Error(type === 'init' ? 'download or start-up timed out' : `exceeded ${Math.round(timeout / 1000)} seconds`);
        error.name = 'TimeoutError';
        this.reset(error.message);
        reject(error);
      }, timeout);
      this.pending.set(id, {resolve, reject, timer});
      this.worker.postMessage({id, type, ...payload});
    });
  }

  terminate(reason) {
    this.worker?.terminate();
    this.worker = null; this.ready = null;
    for (const entry of this.pending.values()) {clearTimeout(entry.timer); entry.reject(new Error(reason));}
    this.pending.clear();
  }

  reset(reason = 'Python runtime was reset') {
    this.terminate(reason);
    if (this.state !== 'failed') this.setState('idle');
  }

  async check(code) {
    await this.ensure();
    return (await this.call('check', {code}, CHECK_MS)).result;
  }

  async run(code, files, signal) {
    await this.ensure();
    if (signal?.aborted) throw new Cancelled();
    const stop = () => this.reset('cancelled');
    signal?.addEventListener('abort', stop, {once: true});
    try {
      return (await this.call('run', {code, files, kind: 'solve'}, EXECUTE_MS)).result;
    } catch (error) {
      if (signal?.aborted) throw new Cancelled();
      if (error.name === 'TimeoutError') return {status: 'error', objective: null, variables: [], stdout: '', stderr: '', artifacts: [], error: `TimeoutError: the program ${error.message} in this browser`};
      throw error;
    } finally {signal?.removeEventListener('abort', stop);}
  }
}

const now = () => new Date().toISOString();
const id = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, '');

async function runPipeline(context, emit, python, library, client, signal) {
  const check = () => {if (signal.aborted) throw new Cancelled();};
  const language = context.language === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => language === 'en' ? en : zh;
  const query = String(context.query || '').trim();
  if (!query) throw new PipelineError('A question is required');
  let stage = 'classification';
  const event = (kind, payload) => {check(); emit(stage, kind, payload);};
  const chat = (system, payload, {structured = false, tokens = false} = {}) => {
    check();
    return client.complete([{role: 'system', content: system}, {role: 'user', content: pyJSON(payload)}],
      {json: structured, onToken: tokens ? text => event('token', {text}) : null});
  };
  const result = {intent: 'solve', query, classification: null, workflow: null, data: null, model: null, code: null, execution: null, answer: '', artifacts: {}};
  try {
    event('started', {message: tr('理解当前问题与对话上下文', 'Reading the task and conversation context')});
    const messages = (context.messages || []).slice(-12).filter(message => message && ['user', 'assistant'].includes(message.role))
      .map(message => ({role: message.role, content: String(message.content ?? '').slice(0, 6000)}));
    const prior = priorContext(context.prior_artifacts);
    const intent = parseJSONObject(await chat(INTENT_SYSTEM + language,
      {query, messages, files: context.files.map(file => file.name), prior_artifacts: prior}, {structured: true}));
    const action = intent.intent;
    if (!['solve', 'revise', 'explain', 'clarify'].includes(action)) throw new PipelineError('The model returned an invalid conversation action');
    result.intent = action;
    if (action === 'explain' || action === 'clarify') {
      event('completed', {intent: action});
      stage = 'output';
      event('started', {message: tr('回答当前问题', 'Answering the question')});
      result.answer = action === 'clarify'
        ? String(intent.question || tr('请补充目标、决策变量和必要约束。', 'Please specify the objective, decisions and required constraints.'))
        : await chat(EXPLAIN_SYSTEM[0] + language + EXPLAIN_SYSTEM[1], {query, messages, prior_artifacts: prior}, {tokens: true});
      result.artifacts = Object.keys(prior).length ? prior : {query};
      event('completed', {answer: result.answer, intent: action});
      return result;
    }
    const rewritten = String(intent.task || query).trim();
    // The literal latest request stays authoritative; the rewrite only supports it.
    let resolved = 'CURRENT USER REQUEST (authoritative; apply every stated change):\n' + query;
    if (prior.query) resolved += '\n\nPREVIOUS MODELING TASK (context; retain unchanged requirements for a follow-up):\n' + prior.query;
    resolved += '\n\nASSISTANT TASK REWRITE (supporting only; never override or omit the current request):\n' + rewritten;
    result.query = resolved;
    const tables = context.files, tableProfiles = profiles(tables);
    python.ensure().catch(() => {});
    const retriever = new ReferenceRetriever(await library(), client);
    const evidence = await retriever.search(resolved, {count: 5});
    event('tool', {name: 'FileQA', status: 'completed', examples: evidence.map(item => ({id: item.id, type: item.type, query: item.query}))});
    const classification = parseJSONObject(await chat(CLASSIFICATION_SYSTEM,
      {query: resolved, FileQA: evidence.map(item => ({type: item.type, query: item.query}))}, {structured: true}));
    const label = classification.label;
    if (!CLASSES.has(label)) throw new PipelineError('Classification did not return a supported problem type');
    const route = ['Others', 'Mixture'].includes(label) || !tables.length ? 'Others' : label;
    result.classification = {label, route};
    event('completed', result.classification);

    stage = 'workflow';
    event('started', {message: tr('检索示例并构建建模工作流', 'Retrieving demonstrations and assembling the workflow')});
    const examples = await retriever.search(resolved, {route, count: route === 'Others' ? 3 : 1});
    const mode = route === 'Others' ? 'type-agnostic' : 'type-tailored';
    result.workflow = {mode, route, examples: examples.map(item => ({id: item.id, type: item.type, query: item.query})),
      steps: ['query', 'schema', 'indices', 'variables', 'parameters', 'objective', 'constraints']};
    event('completed', result.workflow);

    stage = 'data';
    event('started', {message: tr('读取真实 CSV 并检查数据选取', 'Reading source CSVs and checking data selection')});
    let warning = null, observations = [];
    if (tables.length) {
      try {
        const plan = parseJSONObject(await chat(CSVQA_SYSTEM, {query: resolved, tables: tableProfiles}, {structured: true}));
        observations = extract(tables, plan);
      } catch (error) {
        if (!(error instanceof PipelineError) || error instanceof Cancelled) throw error;
        warning = 'Invalid extraction plan; source tables are preserved without filtering. The current query controls runtime selection.';
        observations = extract(tables, {selections: tables.map(table => ({file: table.name, conditions: []}))});
      }
    }
    result.data = plain({tables: tableProfiles, observations, warning});
    event('tool', {name: 'CSVQA', status: 'completed', tables: result.data.tables,
      selected_rows: Object.fromEntries(observations.map(item => [item.file, item.selected_rows])), warning});
    event('completed', result.data);

    stage = 'model';
    event('started', {message: tr('生成数学模型或抽象建模计划', 'Generating the formulation or abstract model plan')});
    const model = await chat(`${MODEL_SYSTEM}\n${mode === 'type-agnostic' ? AGNOSTIC_NOTE : TAILORED_NOTE}`,
      {query: resolved, latest_request: query, prior_artifacts: prior, workflow: result.workflow,
        reference_demonstrations: examples.map(item => ({query: item.query, formulation: item.formulation})), CSVQA: {tables: tableProfiles, observations, warning}});
    result.model = model;
    event('artifact', {kind: 'formulation', content: model});
    event('completed', {formulation: model, mode});

    stage = 'code';
    event('started', {message: tr('生成读取完整源数据的求解程序', 'Generating a program that reads complete source data')});
    const codeSystem = CODE_SYSTEM + BROWSER_SOLVER_NOTE;
    const codeContext = {query: resolved, latest_request: query, prior_artifacts: prior, formulation: model, files: tableProfiles,
      data_observations: observations, reference_examples: examples.map(item => ({query: item.query, formulation: item.formulation, code: item.code}))};
    let code = extractCode(await chat(codeSystem, codeContext));
    let repaired = false;
    const repair = async (source, diagnostic) => {
      repaired = true;
      event('tool', {name: 'code-repair', status: 'started', message: tr('根据实际错误修复程序一次', 'Repairing the program once using the actual diagnostic')});
      const updated = extractCode(await chat(codeSystem + REPAIR_NOTE, {...codeContext, previous_code: source, diagnostic}));
      event('tool', {name: 'code-repair', status: 'completed'});
      return updated;
    };
    // A runtime that failed to load in this run is not retried until the next run.
    const syntax = async source => {
      if (python.state === 'failed') return null;
      try {return await python.check(source);} catch (error) {if (signal.aborted) throw new Cancelled(); return null;}
    };
    let problem = await syntax(code);
    if (problem) {
      code = await repair(code, problem);
      if (await syntax(code)) throw new PipelineError('Generated code still has a syntax error after one repair');
    }
    result.code = code;
    event('artifact', {kind: 'code', content: code});
    event('completed', {code});

    stage = 'execution';
    event('started', {message: tr('在浏览器中用 HiGHS 运行 Python', 'Running Python with HiGHS in this browser')});
    const files = tables.map(table => ({name: table.name, content: table.content}));
    const unavailable = reason => ({status: 'execution_unavailable', objective: null, variables: [], stdout: '', stderr: '', artifacts: [], error: reason});
    const execute = async source => {
      if (python.state === 'failed') return unavailable(python.error);
      try {return await python.run(source, files, signal);}
      catch (error) {
        if (error instanceof Cancelled || signal.aborted) throw new Cancelled();
        return unavailable(python.error || `The in-browser Python runtime is unavailable (${error.message}).`);
      }
    };
    let execution = await execute(code);
    check();
    if (execution.status === 'error' && !repaired) {
      stage = 'code';
      code = await repair(code, String(execution.error || execution.stderr || 'Execution failed').slice(-8000));
      if (await syntax(code)) throw new PipelineError('The repaired program has a syntax error');
      result.code = code;
      event('artifact', {kind: 'code', content: code});
      stage = 'execution';
      execution = await execute(code);
      check();
    }
    result.execution = execution;
    event('completed', execution);
    stage = 'output';
    const status = execution.status || 'error';
    const descriptions = {
      optimal: tr('已求得最优解。', 'An optimal solution was found.'),
      infeasible: tr('求解器报告模型不可行；请检查需求、容量及其他约束。', 'The solver reports infeasibility; inspect demand, capacity and the other constraints.'),
      unbounded: tr('求解器报告模型无界。', 'The solver reports an unbounded model.'),
      time_limit: tr('求解达到时间上限；当前结果不应称为已证最优。', 'The solve reached its time limit; do not describe the incumbent as proven optimal.'),
      solver_stopped: tr('求解器已停止，尚未证得最优解；请查看求解状态码。', 'The solver stopped without proving optimality; inspect the solver status code.'),
      execution_unavailable: tr('数学模型与代码已生成；浏览器内 Python 环境当前不可用，尚未求解。', 'The formulation and code are ready; the in-browser Python runtime is unavailable, so no solve was performed.'),
    };
    result.answer = descriptions[status] || tr('程序执行失败；已保留模型、代码与错误诊断。', 'Execution failed; the formulation, code and diagnostic are retained.');
    if (status === 'solver_stopped' && execution.solver_status_code !== undefined && execution.solver_status_code !== null) result.answer += tr(' 状态码：', ' Status code: ') + execution.solver_status_code;
    if (execution.objective !== null && execution.objective !== undefined) result.answer += tr(' 目标值：', ' Objective: ') + number(execution.objective);
    result.artifacts = {query: resolved, formulation: model, code, execution};
    event('artifact', {kind: 'result', content: result.artifacts});
    event('completed', {answer: result.answer, artifacts: result.artifacts});
    return result;
  } catch (error) {
    if (error instanceof Cancelled || signal.aborted) throw new Cancelled();
    const message = error instanceof PipelineError || error instanceof ProviderError ? error.message : `Pipeline failed (${error?.name || 'Error'})`;
    emit(stage, 'error', {message});
    throw error instanceof PipelineError ? error : new PipelineError(message);
  }
}

// Emulates the /api/demo contract used by demo.js for sessions, files, runs and
// events. All state lives in this page's memory and disappears on reload.
export function createBrowserService({catalog = () => [], fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  createWorker, onRuntimeChange = () => {}, loadLibrary} = {}) {
  const sessions = new Map(), runs = new Map();
  const python = new PythonRuntime({createWorker, onChange: onRuntimeChange});
  let libraryPromise = null;
  const library = () => libraryPromise ||= (loadLibrary ? Promise.resolve(loadLibrary()) : fetchImpl(REFERENCE_URL.href, {cache: 'force-cache'}).then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  })).then(data => {
    if (data?.schema_version !== 1 || data.embedding_model !== EMBEDDING_MODEL || !Array.isArray(data.examples)) throw new Error();
    return data;
  }).catch(() => {libraryPromise = null; throw new PipelineError("The project's Ref-Data library is unavailable");});

  const sessionView = session => structuredClone({id: session.id, session_id: session.id, created_at: session.created_at,
    files: session.files.map(fileView), messages: session.messages, runs: session.runs, examples: []});
  const runView = run => structuredClone({id: run.id, run_id: run.id, session_id: run.session_id, status: run.status, created_at: run.created_at,
    last_seq: run.sequence, first_seq: run.events[0]?.seq || 0, result: run.result, error: run.error, artifacts: []});
  const ownSession = sid => {const session = sessions.get(sid); if (!session) throw new ServiceError(404, 'Conversation not found'); return session;};
  const ownRun = rid => {const run = runs.get(rid); if (!run) throw new ServiceError(404, 'Run not found'); return run;};

  function emit(run, stage, type, payload = {}) {
    const record = {seq: run.sequence + 1, run_id: run.id, stage, type, payload: redact(payload, run.secret), timestamp: now()};
    run.sequence += 1;
    run.events.push(record);
    for (const listener of run.listeners) listener(record);
  }

  function terminate(run, status, payload) {
    run.status = status;
    emit(run, 'run', status, payload);
    run.secret = '';
  }

  async function execute(run) {
    run.status = 'running';
    emit(run, 'run', 'started', {});
    const client = new OpenAIClient({key: run.secret, fetch: fetchImpl, signal: run.controller.signal, deadline: run.deadline});
    try {
      const result = redact(await runPipeline(run.context, (stage, type, payload) => emit(run, stage, type, payload), python, library, client, run.controller.signal), run.secret);
      run.result = result;
      const session = sessions.get(run.session_id);
      session?.messages.push({id: id(), role: 'assistant', content: typeof result?.answer === 'string' ? result.answer : '', run_id: run.id, created_at: now()});
      terminate(run, run.timedOut ? 'timeout' : run.controller.signal.aborted ? 'cancelled' : 'completed', {result: run.result, artifacts: []});
    } catch (error) {
      const status = run.timedOut ? 'timeout' : run.controller.signal.aborted ? 'cancelled' : 'failed';
      run.error = status === 'cancelled' ? 'Run cancelled' : status === 'timeout' ? 'Run exceeded 30 minutes' : redact(error?.message || 'Pipeline failed', run.secret);
      const partial = {answer: '', execution: null};
      for (const record of run.events) {
        if (record.type !== 'artifact' || !record.payload || typeof record.payload !== 'object') continue;
        const key = {formulation: 'model'}[record.payload.kind] || record.payload.kind;
        if (['model', 'code', 'data', 'workflow'].includes(key)) partial[key] = record.payload.content;
      }
      run.result = partial;
      terminate(run, status, {error: run.error, result: run.result, artifacts: []});
    } finally {
      clearTimeout(run.deadlineTimer);
      run.context = null;
    }
  }

  async function upload(session, form) {
    const uploads = [...form.getAll('files'), ...form.getAll('files[]')];
    if (!uploads.length) throw new ServiceError(400, 'Upload at least one CSV using the files field');
    if (session.files.length + uploads.length > MAX_FILES) throw new ServiceError(413, 'At most 10 CSV files per session');
    const names = new Set(session.files.map(file => file.name)), prepared = [];
    let size = session.files.reduce((sum, file) => sum + file.size, 0);
    for (const item of uploads) {
      const name = validFilename(item?.name || '');
      if (names.has(name)) throw new ServiceError(409, 'A CSV with this filename is already uploaded');
      const bytes = await fileBytes(item);
      size += bytes.length;
      if (size > MAX_BYTES) throw new ServiceError(413, 'Session CSV files exceed 50 MB');
      prepared.push({...csvTable(name, decodeCSV(bytes), bytes.length), id: id()});
      names.add(name);
      checkTables([...session.files, ...prepared]);
    }
    session.files.push(...prepared);
    return {session_id: session.id, files: sessionView(session).files};
  }

  function loadExample(session, exampleId) {
    const example = catalog().find(item => item.id === exampleId);
    if (!example) throw new ServiceError(404, 'Example not found');
    const tables = example.files.map(file => {
      const bytes = new TextEncoder().encode(file.content);
      return {...csvTable(validFilename(file.name), decodeCSV(bytes), bytes.length), id: id()};
    });
    checkTables(tables);
    session.files = tables;
    return {...sessionView(session), example: Object.fromEntries(Object.entries(example).filter(([key]) => key !== 'files')), query: example.query};
  }

  function message(session, body) {
    if (body.provider !== 'openai' || !['', OPENAI_MODEL].includes(body.model || '') || !['zh', 'en'].includes(body.language || 'zh')) throw new ServiceError(400, 'This workspace uses OpenAI GPT-4.1');
    const secret = String(body.api_key || '').trim(), content = String(body.content || '').trim();
    if (!secret) throw new ServiceError(400, 'An API key is required for this provider');
    if (!content) throw new ServiceError(400, 'Message is empty');
    if (content.length > QUESTION_LIMIT) throw new ServiceError(413, `Question exceeds ${QUESTION_LIMIT} characters`);
    checkTables(session.files);
    if ([...runs.values()].some(run => !TERMINAL.has(run.status))) throw new ServiceError(409, 'A run is already active in this page');
    if (session.files.some(file => file.content.includes(secret))) throw new ServiceError(400, 'Remove the configured API key from uploaded CSV data before running');
    const query = content.replaceAll(secret, '[redacted]');
    for (const item of session.messages) if (typeof item.content === 'string') item.content = item.content.replaceAll(secret, '[redacted]');
    let prior = {};
    for (const rid of [...session.runs].reverse()) {
      const result = runs.get(rid)?.result;
      if (!result || typeof result !== 'object') continue;
      const nested = result.artifacts && typeof result.artifacts === 'object' ? result.artifacts : {};
      if (['query', 'formulation', 'model', 'code', 'answer'].some(key => result[key] || nested[key])) {prior = result; break;}
    }
    const run = {id: id(), session_id: session.id, status: 'queued', created_at: now(), events: [], sequence: 0, result: null, error: null,
      listeners: new Set(), controller: new AbortController(), deadline: Date.now() + RUN_MS, timedOut: false, secret,
      context: {query, messages: structuredClone(session.messages), language: body.language || 'en', prior_artifacts: redact(structuredClone(prior), secret),
        files: session.files.map(file => ({name: file.name, columns: file.columns, rows: file.rows, content: file.content}))}};
    run.deadlineTimer = setTimeout(() => {run.timedOut = true; run.controller.abort();}, RUN_MS);
    runs.set(run.id, run);
    session.runs.push(run.id);
    session.messages.push({id: id(), role: 'user', content: query, run_id: run.id, created_at: now()});
    emit(run, 'run', 'queued', {position: 1});
    Promise.resolve().then(() => execute(run));
    return {run_id: run.id, session_id: session.id, status: run.status, run: runView(run)};
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase(), parts = path.split('?')[0].split('/').filter(Boolean);
    if (path === '/capabilities' && method === 'GET') return capabilities();
    if (path === '/runtime/check' && method === 'POST') {
      try {await python.ensure();} catch {}
      return capabilities();
    }
    if (parts[0] === 'sessions') {
      if (parts.length === 1 && method === 'POST') {
        const session = {id: id(), created_at: now(), files: [], messages: [], runs: []};
        sessions.set(session.id, session);
        return sessionView(session);
      }
      if (parts.length === 1 && method === 'GET') return {sessions: [...sessions.values()].map(session => {
        const last = runs.get(session.runs.at(-1)), title = session.messages.find(item => item.role === 'user')?.content || '';
        const updated = [session.created_at, ...session.messages.map(item => item.created_at), ...(last ? [last.created_at] : [])].sort().at(-1);
        return {id: session.id, title: title.split(/\s+/).join(' ').slice(0, 80), created_at: session.created_at, updated_at: updated, run_count: session.runs.length, status: last ? last.status : 'empty'};
      }).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))};
      const session = ownSession(decodeURIComponent(parts[1]));
      if (parts.length === 2 && method === 'GET') return sessionView(session);
      if (parts.length === 2 && method === 'DELETE') {
        if (session.runs.some(rid => !TERMINAL.has(runs.get(rid)?.status))) throw new ServiceError(409, 'Cancel the active run before deleting this conversation');
        for (const rid of session.runs) runs.delete(rid);
        sessions.delete(session.id);
        return {deleted: session.id};
      }
      if (parts[2] === 'files' && parts.length === 3 && method === 'POST') return upload(session, options.body);
      if (parts[2] === 'files' && parts.length === 4 && method === 'DELETE') {
        const file = session.files.find(item => item.id === parts[3]);
        if (!file) throw new ServiceError(404, 'File not found');
        session.files = session.files.filter(item => item !== file);
        return {session_id: session.id, files: sessionView(session).files};
      }
      if (parts[2] === 'examples' && parts.length === 4 && method === 'POST') return loadExample(session, parts[3]);
      if (parts[2] === 'messages' && parts.length === 3 && method === 'POST') return message(session, typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {});
    }
    if (parts[0] === 'runs' && parts.length >= 2) {
      const run = ownRun(parts[1]);
      if (parts.length === 2 && method === 'GET') return runView(run);
      if (parts[2] === 'cancel' && method === 'POST') {
        if (!TERMINAL.has(run.status) && !run.controller.signal.aborted) {
          run.controller.abort();
          emit(run, 'run', 'cancellation_requested', {});
        }
        return runView(run);
      }
    }
    throw new ServiceError(404, 'Not found');
  }

  function capabilities() {
    const runtime = python.status();
    return {service: BROWSER_SERVICE, protocol: 1, mode: 'browser', status: 'ok', providers: ['openai'], models: {openai: OPENAI_MODEL},
      execution_available: true, runtime: {ready: true, checked: runtime.state === 'ready', status: runtime.state, error: runtime.error,
        solver: 'highs', versions: runtime.versions},
      limits: {files: MAX_FILES, bytes: MAX_BYTES, preview_rows: 20}};
  }

  // EventSource-shaped subscription for one run's events after a sequence number.
  function events(runId, after = 0) {
    const source = {onmessage: null, onerror: null, closed: false, close() {this.closed = true; runs.get(runId)?.listeners.delete(deliver);}};
    const deliver = record => {if (!source.closed && record.seq > after) source.onmessage?.({data: JSON.stringify(record)});};
    Promise.resolve().then(() => {
      const run = runs.get(runId);
      if (source.closed) return;
      if (!run) {source.onerror?.(new Event('error')); return;}
      for (const record of run.events) deliver(record);
      run.listeners.add(deliver);
    });
    return source;
  }

  return {
    async request(path, options) {
      try {return await request(path, options);}
      catch (error) {throw new Error(error instanceof ServiceError || error instanceof PipelineError ? error.message : 'The in-browser workspace could not complete the request.');}
    },
    events,
    // Custom CSVs held by an in-page conversation, for the GPT-OSS local handoff.
    sessionFiles: sid => (sessions.get(sid)?.files || []).map(file => ({id: file.id, name: file.name, content: file.content})),
    runtime: () => python.status(),
    prepareRuntime: () => python.ensure(),
    cancelAll() {for (const run of runs.values()) if (!TERMINAL.has(run.status)) run.controller.abort();},
  };
}

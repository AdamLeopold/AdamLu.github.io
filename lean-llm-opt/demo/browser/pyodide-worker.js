// Web Worker that runs generated Python for the in-browser Demo. Pyodide,
// NumPy, pandas and SciPy load from the pinned jsDelivr release; the local
// gurobipy module is the HiGHS layer, so Gurobi itself is never used.
const PYODIDE_VERSION = '0.27.7';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let boot = null;

async function start() {
  importScripts(`${PYODIDE_URL}pyodide.js`);
  const pyodide = await self.loadPyodide({indexURL: PYODIDE_URL, stdout: () => {}, stderr: () => {}});
  await pyodide.loadPackage(['numpy', 'pandas', 'scipy'], {messageCallback: () => {}, errorCallback: () => {}});
  const sources = await Promise.all(['gurobipy_shim.py', 'runner.py'].map(async name => {
    const response = await fetch(new URL(name + self.location.search, self.location.href), {cache: 'no-cache'});
    if (!response.ok) throw new Error(`could not load ${name}`);
    return response.text();
  }));
  pyodide.FS.mkdirTree('/lean');
  pyodide.FS.writeFile('/lean/gurobipy.py', sources[0]);
  pyodide.FS.writeFile('/lean/lean_runner.py', sources[1]);
  pyodide.runPython("import sys\nsys.path.insert(0, '/lean')\nimport lean_runner");
  const runner = pyodide.pyimport('lean_runner');
  return {runner, versions: JSON.parse(runner.versions())};
}

const failure = (id, error) => self.postMessage({id, ok: false, error: String(error?.message || error).split('\n')[0].slice(0, 300)});

self.onmessage = async ({data}) => {
  const {id, type} = data || {};
  let loaded;
  try {
    boot ||= start();
    loaded = await boot;
  } catch (error) {
    boot = null;
    failure(id, error);
    return;
  }
  try {
    if (type === 'init') self.postMessage({id, ok: true, versions: loaded.versions});
    else if (type === 'check') self.postMessage({id, ok: true, result: loaded.runner.check(data.code)});
    else if (type === 'run') self.postMessage({id, ok: true, result: JSON.parse(loaded.runner.run(JSON.stringify({code: data.code, files: data.files, kind: data.kind})))});
    else throw new Error('unknown request');
  } catch (error) {
    failure(id, error);
  }
};

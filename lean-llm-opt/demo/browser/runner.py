"""Run one generated program inside Pyodide with the HiGHS gurobipy layer.

Validation and the result record follow demo_backend/runtime.py so the browser
and server executors accept the same programs and report the same fields.
"""
import ast
import builtins
import contextlib
import importlib
import io
import json
import math
import re
import shutil
import sys
from pathlib import Path

import gurobipy
import numpy
import pandas
import scipy
from gurobipy import GRB

ALLOWED_IMPORTS = {"gurobipy", "pandas", "numpy", "math", "itertools", "collections", "json", "csv", "re", "statistics", "decimal", "sys"}
FORBIDDEN_NAMES = {"exec", "eval", "compile", "__import__", "getattr", "setattr", "delattr", "globals", "locals", "vars", "input", "breakpoint", "help", "super"}
FORBIDDEN_ATTRIBUTES = {"system", "popen", "spawn", "load", "loads", "read_pickle", "to_pickle", "load_library", "ctypeslib", "modules", "environ", "getenv", "os", "socket", "fromfile", "memmap", "read", "readParams", "getEnv", "getParam", "getParamInfo", "Env", "open_code", "FileIO", "settrace", "setprofile", "setrecursionlimit", "setswitchinterval", "mro", "optimizeAsync"}
FORBIDDEN_ATTRIBUTES |= {"import_optional_dependency", "import_module", "importlib", "subprocess",
                         "io", "common", "compat", "Popen", "check_call", "check_output",
                         "create_connection", "fork", "posix_spawn"}
SENSITIVE_CONFIGURATION = re.compile(r"\bwls(?:accessid|secret|token|config)?\b|\blicenseid\b|\bserverpassword\b|\bcomputepassword\b|\btokenserver\b", re.I)
INPUTS, OUTPUTS = Path("/inputs"), Path("/outputs")
STATUS = {GRB.OPTIMAL: "optimal", GRB.INFEASIBLE: "infeasible", GRB.UNBOUNDED: "unbounded", GRB.TIME_LIMIT: "time_limit"}


def validate_code(code: str) -> None:
    """Reject unsupported code early, matching the server executor."""
    if not isinstance(code, str) or not code.strip() or len(code) > 1_000_000:
        raise ValueError("Empty or oversized solver code")
    tree = ast.parse(code)
    module_aliases = {"gp", "pd", "np", "GRB"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            module_aliases.update(alias.asname or alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module_aliases.update(alias.asname or alias.name for alias in node.names)
    changed = True
    while changed:
        changed = False
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Name) and node.value.id in module_aliases:
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id not in module_aliases:
                        module_aliases.add(target.id); changed = True
    def root_name(node):
        while isinstance(node, (ast.Attribute, ast.Subscript)):
            node = node.value
        return node.id if isinstance(node, ast.Name) else None
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == "optimize" and isinstance(node.ctx, (ast.Store, ast.Del)):
            raise ValueError("Solver code cannot replace the controlled optimizer")
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Delete)):
            targets = node.targets if isinstance(node, (ast.Assign, ast.Delete)) else [node.target]
            for target in targets:
                if isinstance(target, (ast.Attribute, ast.Subscript)) and root_name(target) in module_aliases:
                    raise ValueError("Solver code cannot modify imported modules")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            if any(name not in ALLOWED_IMPORTS for name in names):
                raise ValueError("Solver code contains an unsupported import")
            if isinstance(node, ast.ImportFrom) and any(a.name in FORBIDDEN_ATTRIBUTES for a in node.names):
                raise ValueError("Solver code contains an unsupported import")
        if isinstance(node, ast.Name) and (node.id in FORBIDDEN_NAMES or node.id.startswith("__")):
            raise ValueError("Solver code contains an unsupported operation")
        if isinstance(node, ast.Attribute) and (node.attr.startswith("_") or node.attr in FORBIDDEN_ATTRIBUTES):
            raise ValueError("Solver code contains an unsupported attribute")
        if isinstance(node, ast.Attribute) and SENSITIVE_CONFIGURATION.search(node.attr):
            raise ValueError("Solver code cannot access license configuration")
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value.lower()
            if SENSITIVE_CONFIGURATION.search(value) or any(prefix in value for prefix in ("http://", "https://", "ftp://", "/licenses", "/proc/", "/etc/")):
                raise ValueError("Solver code may access only the supplied local data")


def make_file_guard(original_open, input_root=INPUTS, output_root=OUTPUTS):
    input_root = Path(input_root).resolve(); output_root = Path(output_root).resolve()
    def guarded_open(file, mode="r", *args, **kwargs):
        path = Path(file).resolve(); writable = any(flag in mode for flag in "wax+")
        if writable and not path.is_relative_to(output_root):
            raise PermissionError("Write only to /outputs")
        if not writable and not (path.is_relative_to(input_root) or path.is_relative_to(output_root)):
            raise PermissionError("Read only supplied data")
        return original_open(file, mode, *args, **kwargs)
    return guarded_open


class _BoundedText(io.StringIO):
    def write(self, value):
        room = 2_000_000 - self.tell()
        if room > 0: super().write(value[:room])
        return len(value)

    def close(self):
        pass


def _result(status="error", **kw):
    return {"status": status, "objective": None, "variables": [], "stdout": "", "stderr": "", "artifacts": [], **kw}


def versions():
    return json.dumps({"python": sys.version.split()[0], "numpy": numpy.__version__, "pandas": pandas.__version__,
                       "scipy": scipy.__version__, "solver": gurobipy.SOLVER_NAME})


def check(code):
    try:
        ast.parse(code)
        return ""
    except SyntaxError as exc:
        return f"Python syntax error at line {exc.lineno}: {exc.msg}"


def _prepare(files):
    for directory in (INPUTS, OUTPUTS):
        shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True)
    for item in files:
        name = Path(item["name"]).name
        if name != item["name"] or not name.lower().endswith(".csv"):
            raise ValueError("Each input needs a plain CSV filename")
        (INPUTS / name).write_text(item["content"], encoding="utf-8")


def run(payload_json):
    payload = json.loads(payload_json)
    buffer = _BoundedText()
    result = _result()
    modules = [importlib.import_module(name) for name in sorted(ALLOWED_IMPORTS)] + [builtins, io]
    snapshots = [(module, dict(vars(module))) for module in modules]
    constants = {name: value for name, value in vars(GRB).items() if not name.startswith("_")}
    original_open, original_io_open, original_import = builtins.open, io.open, builtins.__import__
    gurobipy._reset_models()
    try:
        _prepare(payload.get("files", []))
        code = payload["code"]; validate_code(code)
        safe_open = make_file_guard(original_open, INPUTS, OUTPUTS)
        builtins.open = safe_open; io.open = safe_open
        def safe_import(name, *args, **kwargs):
            if name.split(".")[0] not in ALLOWED_IMPORTS: raise ImportError("Unsupported solver import")
            return original_import(name, *args, **kwargs)
        namespace = {"__builtins__": {**builtins.__dict__, "__import__": safe_import, "open": safe_open}, "gp": gurobipy, "GRB": GRB, "pd": pandas, "np": numpy}
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            exec(compile(code, "generated-model.py", "exec"), namespace)
            created = gurobipy._created_models()
            if not created and payload.get("kind") == "data": result = _result("completed")
            elif not created: raise ValueError("Generated code did not create a Gurobi model")
            else:
                model = created[-1]
                status = STATUS.get(model.Status, "solver_stopped")
                objective = float(model.ObjVal) if model.SolCount else None
                if objective is not None and not math.isfinite(objective): objective = None
                variables = [{"name": v.VarName, "value": float(v.X)} for v in model.getVars()[:20000]] if model.SolCount else []
                result = _result(status, solver_status_code=int(model.Status), objective=objective, variables=variables)
        result["stdout"] = buffer.getvalue()
    except BaseException as exc:
        diagnostic = str(exc)[:2000]
        if buffer.getvalue().strip(): diagnostic += "\nProgram output: " + buffer.getvalue()[-4000:]
        result = _result(error=f"{type(exc).__name__}: {diagnostic}", stderr=buffer.getvalue()[-8000:])
    finally:
        for module, values in snapshots:
            current = vars(module)
            for name in list(current):
                if name not in values: del current[name]
            current.update(values)
        for name in list(vars(GRB)):
            if not name.startswith("_") and name not in constants: delattr(GRB, name)
        for name, value in constants.items():
            if getattr(GRB, name, None) is not value: setattr(GRB, name, value)
        builtins.open = original_open; io.open = original_io_open; builtins.__import__ = original_import
        gurobipy._reset_models()
    result["solver"] = f"{gurobipy.SOLVER_NAME} (SciPy {scipy.__version__}, in browser)"
    return json.dumps(result)

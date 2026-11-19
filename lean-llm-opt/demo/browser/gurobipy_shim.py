"""A gurobipy-compatible modeling layer solved by HiGHS through SciPy.

The in-browser Demo cannot run Gurobi. Generated programs keep the gurobipy
API they were written for, while this module builds the linear model and solves
it with scipy.optimize.milp/linprog (HiGHS). Only linear objectives and linear
constraints over continuous, integer and binary variables are supported;
unsupported Gurobi features raise GurobiError so the caller can report them.
"""
import itertools
import math
import numbers
import time

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, linprog, milp
from scipy.sparse import csr_matrix

SOLVER_NAME = "HiGHS"
MAX_TIME_LIMIT = 180.0


class GurobiError(Exception):
    def __init__(self, message, errno=10003):
        super().__init__(message)
        self.errno = errno
        self.message = message


def _unsupported(feature):
    raise GurobiError(f"{feature}: not supported by the in-browser HiGHS solver (linear objectives and constraints only)", 10032)


class _Namespace:
    def __init__(self, **values):
        self.__dict__.update(values)


class GRB:
    MINIMIZE = 1
    MAXIMIZE = -1
    CONTINUOUS = "C"
    BINARY = "B"
    INTEGER = "I"
    SEMICONT = "S"
    SEMIINT = "N"
    LESS_EQUAL = "<"
    GREATER_EQUAL = ">"
    EQUAL = "="
    INFINITY = 1e100
    UNDEFINED = 1e101
    LOADED = 1
    OPTIMAL = 2
    INFEASIBLE = 3
    INF_OR_UNBD = 4
    UNBOUNDED = 5
    CUTOFF = 6
    ITERATION_LIMIT = 7
    NODE_LIMIT = 8
    TIME_LIMIT = 9
    SOLUTION_LIMIT = 10
    INTERRUPTED = 11
    NUMERIC = 12
    SUBOPTIMAL = 13
    INPROGRESS = 14
    USER_OBJ_LIMIT = 15
    Status = _Namespace(LOADED=1, OPTIMAL=2, INFEASIBLE=3, INF_OR_UNBD=4, UNBOUNDED=5, CUTOFF=6,
                        ITERATION_LIMIT=7, NODE_LIMIT=8, TIME_LIMIT=9, SOLUTION_LIMIT=10, INTERRUPTED=11,
                        NUMERIC=12, SUBOPTIMAL=13, INPROGRESS=14, USER_OBJ_LIMIT=15)
    status = Status
    Attr = _Namespace(**{name: name for name in [
        "X", "Obj", "LB", "UB", "VType", "VarName", "RC", "Start", "ObjVal", "ObjBound", "MIPGap",
        "Status", "SolCount", "NumVars", "NumConstrs", "NumIntVars", "NumBinVars", "IsMIP", "ModelSense",
        "Runtime", "ConstrName", "Pi", "Slack", "RHS", "Sense", "ObjCon", "ModelName", "NodeCount", "IterCount"]})
    attr = Attr
    Param = _Namespace(**{name: name for name in [
        "OutputFlag", "LogToConsole", "TimeLimit", "MIPGap", "MIPGapAbs", "Threads", "Seed", "Method",
        "Presolve", "FeasibilityTol", "IntFeasTol", "OptimalityTol", "NonConvex", "LogFile", "DualReductions",
        "InfUnbdInfo", "MIPFocus", "SolutionLimit", "NodeLimit", "Heuristics", "Cuts", "ObjNumber"]})
    param = Param


def _number(value):
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (numbers.Real, np.number)):
        return float(value)
    raise GurobiError(f"Unsupported coefficient type: {type(value).__name__}", 10003)


def _is_number(value):
    return isinstance(value, (numbers.Real, np.number)) and not isinstance(value, bool) or isinstance(value, bool)


class _CaseInsensitive:
    """gurobipy attributes are case-insensitive: m.objVal, m.ObjVal, v.x and v.X."""
    _canonical = {}

    def __getattr__(self, name):
        canonical = type(self)._canonical.get(name.lower())
        if canonical and canonical != name:
            return getattr(self, canonical)
        raise AttributeError(f"'{type(self).__name__}' object has no attribute '{name}'")

    def __setattr__(self, name, value):
        canonical = type(self)._canonical.get(name.lower(), name)
        object.__setattr__(self, canonical, value)


_VAR_COUNTER = itertools.count()


class Var(_CaseInsensitive):
    __array_ufunc__ = None
    __array_priority__ = 1000
    _canonical = {name.lower(): name for name in ["VarName", "LB", "UB", "VType", "Obj", "X", "Xn", "RC", "Start", "index"]}

    def __init__(self, model, lb, ub, obj, vtype, name):
        object.__setattr__(self, "_model", model)
        object.__setattr__(self, "_uid", next(_VAR_COUNTER))
        object.__setattr__(self, "_index", len(model._vars))
        object.__setattr__(self, "_lb", _number(lb))
        object.__setattr__(self, "_ub", _number(ub))
        object.__setattr__(self, "_obj", _number(obj))
        object.__setattr__(self, "_vtype", str(vtype))
        object.__setattr__(self, "_name", str(name) if name else f"C{len(model._vars)}")
        object.__setattr__(self, "_value", None)
        object.__setattr__(self, "_rc", None)
        if self._vtype not in {GRB.CONTINUOUS, GRB.BINARY, GRB.INTEGER}:
            _unsupported("Semi-continuous and semi-integer variables")

    def __hash__(self):
        return self._uid

    def __repr__(self):
        value = "" if self._value is None else f" (value {self._value:g})"
        return f"<gurobi.Var {self._name}{value}>"

    __str__ = __repr__

    @property
    def VarName(self): return self._name
    @VarName.setter
    def VarName(self, value): object.__setattr__(self, "_name", str(value))
    @property
    def LB(self): return self._lb
    @LB.setter
    def LB(self, value): object.__setattr__(self, "_lb", _number(value))
    @property
    def UB(self): return self._ub
    @UB.setter
    def UB(self, value): object.__setattr__(self, "_ub", _number(value))
    @property
    def VType(self): return self._vtype
    @VType.setter
    def VType(self, value):
        if value not in {GRB.CONTINUOUS, GRB.BINARY, GRB.INTEGER}:
            _unsupported("Semi-continuous and semi-integer variables")
        object.__setattr__(self, "_vtype", value)
    @property
    def Obj(self): return self._obj
    @Obj.setter
    def Obj(self, value): object.__setattr__(self, "_obj", _number(value))
    @property
    def Start(self): return GRB.UNDEFINED
    @Start.setter
    def Start(self, value): pass
    @property
    def index(self): return self._index

    @property
    def X(self):
        if self._value is None:
            raise GurobiError("Unable to retrieve attribute 'X'", 10005)
        return self._value

    Xn = X

    @property
    def RC(self):
        if self._rc is None:
            raise GurobiError("Unable to retrieve attribute 'RC'", 10005)
        return self._rc

    def getAttr(self, name): return getattr(self, name)
    def setAttr(self, name, value): setattr(self, name, value)
    def sameAs(self, other): return self is other

    def _expr(self):
        return LinExpr._from_terms({self._uid: (self, 1.0)}, 0.0)

    def __add__(self, other): return self._expr() + other
    def __radd__(self, other): return self._expr() + other
    def __sub__(self, other): return self._expr() - other
    def __rsub__(self, other): return other + (-1.0) * self._expr()
    def __mul__(self, other): return self._expr() * other
    def __rmul__(self, other): return self._expr() * other
    def __truediv__(self, other): return self._expr() / other
    def __neg__(self): return -1.0 * self._expr()
    def __pos__(self): return self._expr()
    def __pow__(self, power): _unsupported("Quadratic expressions")
    def __le__(self, other): return self._expr() <= other
    def __ge__(self, other): return self._expr() >= other
    def __eq__(self, other): return self._expr() == other
    def __bool__(self): return True


class LinExpr:
    __array_ufunc__ = None
    __array_priority__ = 1000

    def __init__(self, arg1=0.0, arg2=None):
        self._terms = {}
        self._constant = 0.0
        if arg2 is not None:
            # LinExpr(coeffs, vars) or LinExpr(coeff, var)
            if isinstance(arg2, Var):
                self._add_term(arg2, _number(arg1))
            else:
                for coefficient, variable in zip(arg1, arg2):
                    self._add_term(variable, _number(coefficient))
        elif isinstance(arg1, Var):
            self._add_term(arg1, 1.0)
        elif isinstance(arg1, LinExpr):
            self._terms = dict(arg1._terms)
            self._constant = arg1._constant
        elif isinstance(arg1, (list, tuple)):
            for coefficient, variable in arg1:
                self._add_term(variable, _number(coefficient))
        else:
            self._constant = _number(arg1)

    @classmethod
    def _from_terms(cls, terms, constant):
        expr = cls()
        expr._terms = dict(terms)
        expr._constant = constant
        return expr

    def _add_term(self, variable, coefficient):
        if not isinstance(variable, Var):
            raise GurobiError("Linear expression terms must use model variables", 10003)
        previous = self._terms.get(variable._uid)
        self._terms[variable._uid] = (variable, coefficient + (previous[1] if previous else 0.0))

    def _copy(self):
        return LinExpr._from_terms(self._terms, self._constant)

    def _iadd(self, other, scale=1.0):
        if isinstance(other, Var):
            self._add_term(other, scale)
        elif isinstance(other, LinExpr):
            for variable, coefficient in other._terms.values():
                self._add_term(variable, scale * coefficient)
            self._constant += scale * other._constant
        elif isinstance(other, QuadExpr):
            _unsupported("Quadratic expressions")
        elif _is_number(other):
            self._constant += scale * _number(other)
        else:
            return NotImplemented
        return self

    def __add__(self, other):
        result = self._copy()
        return result._iadd(other)

    __radd__ = __add__

    def __iadd__(self, other):
        return self._iadd(other)

    def __sub__(self, other):
        result = self._copy()
        return result._iadd(other, -1.0)

    def __isub__(self, other):
        return self._iadd(other, -1.0)

    def __rsub__(self, other):
        return (-1.0 * self) + other

    def __mul__(self, other):
        if isinstance(other, (Var, LinExpr)):
            if isinstance(other, LinExpr) and not other._terms:
                other = other._constant
            elif not self._terms:
                return other * self._constant
            else:
                _unsupported("Quadratic expressions")
        if not _is_number(other):
            return NotImplemented
        factor = _number(other)
        return LinExpr._from_terms({uid: (variable, coefficient * factor) for uid, (variable, coefficient) in self._terms.items()}, self._constant * factor)

    __rmul__ = __mul__

    def __imul__(self, other):
        return self * other

    def __truediv__(self, other):
        if isinstance(other, LinExpr) and not other._terms:
            other = other._constant
        if not _is_number(other):
            _unsupported("Division by a variable expression")
        return self * (1.0 / _number(other))

    def __neg__(self):
        return self * -1.0

    def __pos__(self):
        return self._copy()

    def __pow__(self, power):
        _unsupported("Quadratic expressions")

    def __le__(self, other):
        return TempConstr(self - other, GRB.LESS_EQUAL)

    def __ge__(self, other):
        return TempConstr(self - other, GRB.GREATER_EQUAL)

    def __eq__(self, other):
        return TempConstr(self - other, GRB.EQUAL)

    __hash__ = object.__hash__

    def add(self, expr, mult=1.0):
        self._iadd(expr, _number(mult))

    def addTerms(self, coeffs, variables):
        if isinstance(variables, Var):
            self._add_term(variables, _number(coeffs))
        else:
            for coefficient, variable in zip(coeffs, variables):
                self._add_term(variable, _number(coefficient))

    def addConstant(self, constant):
        self._constant += _number(constant)

    def size(self): return len(self._terms)
    def getVar(self, index): return list(self._terms.values())[index][0]
    def getCoeff(self, index): return list(self._terms.values())[index][1]
    def getConstant(self): return self._constant
    def clear(self):
        self._terms = {}
        self._constant = 0.0
    def copy(self): return self._copy()

    def getValue(self):
        return self._constant + sum(coefficient * variable.X for variable, coefficient in self._terms.values())

    def __repr__(self):
        parts = [f"{coefficient:g} {variable._name}" for variable, coefficient in self._terms.values()]
        if self._constant or not parts:
            parts.append(f"{self._constant:g}")
        return "<gurobi.LinExpr: " + " + ".join(parts) + ">"

    __str__ = __repr__


class QuadExpr:
    def __init__(self, *args, **kwargs):
        _unsupported("Quadratic expressions")


def quicksum(values):
    expr = LinExpr()
    for value in values:
        if expr._iadd(value) is NotImplemented:
            raise GurobiError(f"Unsupported term in quicksum: {type(value).__name__}", 10003)
    return expr


quickSum = quicksum


class TempConstr:
    __array_ufunc__ = None
    __array_priority__ = 1000

    def __init__(self, expr, sense):
        if isinstance(expr, (int, float)):
            expr = LinExpr(expr)
        if not isinstance(expr, LinExpr):
            raise GurobiError("Unsupported constraint expression", 10003)
        self._expr = expr
        self._sense = sense

    def __bool__(self):
        raise GurobiError("Constraint has no bool value (are you trying \"lb <= expr <= ub\"?)", 10003)

    def __le__(self, other):
        raise GurobiError("Chained constraints are not supported; use addRange or two constraints", 10003)

    __ge__ = __le__


class Constr(_CaseInsensitive):
    _canonical = {name.lower(): name for name in ["ConstrName", "Pi", "Slack", "RHS", "Sense", "index"]}

    def __init__(self, model, expr, lower, upper, sense, name):
        object.__setattr__(self, "_model", model)
        object.__setattr__(self, "_index", len(model._constrs))
        object.__setattr__(self, "_expr", expr)
        object.__setattr__(self, "_lower", lower)
        object.__setattr__(self, "_upper", upper)
        object.__setattr__(self, "_sense", sense)
        object.__setattr__(self, "_name", str(name) if name else f"R{len(model._constrs)}")
        object.__setattr__(self, "_pi", None)
        object.__setattr__(self, "_activity", None)

    def __repr__(self):
        return f"<gurobi.Constr {self._name}>"

    __str__ = __repr__

    @property
    def ConstrName(self): return self._name
    @property
    def Sense(self): return self._sense
    @property
    def index(self): return self._index

    @property
    def RHS(self):
        return self._lower if self._sense in {GRB.GREATER_EQUAL, GRB.EQUAL} else self._upper

    @RHS.setter
    def RHS(self, value):
        value = _number(value)
        if self._sense in {GRB.GREATER_EQUAL, GRB.EQUAL}:
            object.__setattr__(self, "_lower", value)
        if self._sense in {GRB.LESS_EQUAL, GRB.EQUAL}:
            object.__setattr__(self, "_upper", value)

    @property
    def Pi(self):
        if self._pi is None:
            raise GurobiError("Unable to retrieve attribute 'Pi'", 10005)
        return self._pi

    @property
    def Slack(self):
        if self._activity is None:
            raise GurobiError("Unable to retrieve attribute 'Slack'", 10005)
        return self.RHS - self._activity

    def getAttr(self, name): return getattr(self, name)
    def setAttr(self, name, value): setattr(self, name, value)


def _wildcard(pattern, key):
    key = key if isinstance(key, tuple) else (key,)
    if len(pattern) != len(key):
        return False
    return all(part == "*" or part == value for part, value in zip(pattern, key))


class tupledict(dict):
    def select(self, *pattern):
        if not pattern:
            return list(self.values())
        return [value for key, value in self.items() if _wildcard(pattern, key)]

    def sum(self, *pattern):
        return quicksum(self.select(*pattern))

    def prod(self, coeff, *pattern):
        expr = LinExpr()
        for key, value in self.items():
            if pattern and not _wildcard(pattern, key):
                continue
            if key in coeff:
                expr._iadd(value, _number(coeff[key]))
        return expr

    def keys(self):
        return tuplelist(super().keys())


class tuplelist(list):
    def select(self, *pattern):
        return tuplelist(item for item in self if _wildcard(pattern, item))


def multidict(data):
    keys = tuplelist(data.keys())
    first = next(iter(data.values()), None)
    if isinstance(first, (list, tuple)):
        columns = [dict() for _ in first]
        for key, values in data.items():
            for column, value in zip(columns, values):
                column[key] = value
        return [keys, *columns]
    return [keys, dict(data)]


def _general(*args, **kwargs):
    _unsupported("General constraints (max_, min_, abs_, and_, or_)")


max_ = min_ = abs_ = and_ = or_ = norm = _general


def _flatten(values):
    if isinstance(values, (dict,)):
        return list(values.values())
    return list(values)


def _index_sets(indices):
    sets = []
    for index in indices:
        if isinstance(index, (int, np.integer)):
            sets.append(list(range(int(index))))
        else:
            sets.append(list(index))
    return sets


def _option(value, key, position):
    if isinstance(value, dict):
        return value.get(key, None)
    if isinstance(value, (list, tuple, np.ndarray)) and not isinstance(value, str):
        return value[position]
    return value


def _label(name, key):
    parts = key if isinstance(key, tuple) else (key,)
    return f"{name}[{','.join(str(part) for part in parts)}]"


class _Params(_CaseInsensitive):
    _canonical = {name.lower(): name for name in vars(GRB.Param) if not name.startswith("_")}

    def __init__(self):
        object.__setattr__(self, "TimeLimit", MAX_TIME_LIMIT)
        object.__setattr__(self, "MIPGap", 1e-4)
        object.__setattr__(self, "OutputFlag", 1)

    def __getattr__(self, name):
        canonical = _Params._canonical.get(name.lower())
        if canonical and canonical in self.__dict__:
            return self.__dict__[canonical]
        if canonical:
            return 0
        raise AttributeError(f"Unknown parameter '{name}'")

    def __setattr__(self, name, value):
        canonical = _Params._canonical.get(name.lower(), name)
        if canonical == "TimeLimit":
            value = min(MAX_TIME_LIMIT, max(0.0, _number(value)))
        object.__setattr__(self, canonical, value)


_MODELS = []


class Model(_CaseInsensitive):
    _canonical = {name.lower(): name for name in [
        "Status", "ObjVal", "ObjBound", "MIPGap", "SolCount", "NumVars", "NumConstrs", "NumIntVars",
        "NumBinVars", "IsMIP", "ModelSense", "Runtime", "ModelName", "ObjCon", "NodeCount", "IterCount", "Params",
        "NumObj", "ObjNVal"]}

    def __init__(self, name="", env=None):
        object.__setattr__(self, "_vars", [])
        object.__setattr__(self, "_constrs", [])
        object.__setattr__(self, "_objective", None)
        object.__setattr__(self, "_sense", GRB.MINIMIZE)
        object.__setattr__(self, "_status", GRB.LOADED)
        object.__setattr__(self, "_objval", None)
        object.__setattr__(self, "_objbound", None)
        object.__setattr__(self, "_mipgap", None)
        object.__setattr__(self, "_runtime", 0.0)
        object.__setattr__(self, "_nodes", 0)
        object.__setattr__(self, "_iterations", 0)
        object.__setattr__(self, "_solved", 0)
        object.__setattr__(self, "_name", str(name))
        object.__setattr__(self, "_multi", {})
        object.__setattr__(self, "Params", _Params())
        _MODELS.append(self)

    def __enter__(self): return self
    def __exit__(self, *exc): return False
    def __repr__(self): return f"<gurobi.Model {self._name}>"

    @property
    def params(self): return self.Params
    @property
    def ModelName(self): return self._name
    @property
    def Status(self): return self._status
    @property
    def SolCount(self): return 1 if self._objval is not None else 0
    @property
    def NumVars(self): return len(self._vars)
    @property
    def NumConstrs(self): return len(self._constrs)
    @property
    def NumIntVars(self): return sum(v._vtype != GRB.CONTINUOUS for v in self._vars)
    @property
    def NumBinVars(self): return sum(v._vtype == GRB.BINARY for v in self._vars)
    @property
    def IsMIP(self): return int(self.NumIntVars > 0)
    @property
    def Runtime(self): return self._runtime
    @property
    def NodeCount(self): return self._nodes
    @property
    def IterCount(self): return self._iterations

    @property
    def ModelSense(self): return self._sense
    @ModelSense.setter
    def ModelSense(self, value):
        if value not in (GRB.MINIMIZE, GRB.MAXIMIZE):
            raise GurobiError("Invalid ModelSense", 10003)
        object.__setattr__(self, "_sense", value)

    @property
    def ObjCon(self):
        return self._objective._constant if self._objective is not None else 0.0

    @property
    def ObjVal(self):
        if self._objval is None:
            raise GurobiError("Unable to retrieve attribute 'ObjVal'", 10005)
        return self._objval

    @property
    def ObjBound(self):
        if self._objbound is None:
            raise GurobiError("Unable to retrieve attribute 'ObjBound'", 10005)
        return self._objbound

    @property
    def MIPGap(self):
        if self._mipgap is None:
            raise GurobiError("Unable to retrieve attribute 'MIPGap'", 10005)
        return self._mipgap

    def setParam(self, name, value):
        setattr(self.Params, name, value)

    def getParamInfo(self, name):
        return (name, type(getattr(self.Params, name)), getattr(self.Params, name))

    def update(self): pass
    def reset(self, clearall=0):
        object.__setattr__(self, "_status", GRB.LOADED)
        object.__setattr__(self, "_objval", None)
        for variable in self._vars:
            object.__setattr__(variable, "_value", None)
    def dispose(self): pass
    def terminate(self): pass
    def printStats(self):
        print(f"Model {self._name}: {self.NumVars} variables, {self.NumConstrs} constraints, {self.NumIntVars} integer")
    def printQuality(self): pass

    def addVar(self, lb=0.0, ub=GRB.INFINITY, obj=0.0, vtype=GRB.CONTINUOUS, name="", column=None):
        if column is not None:
            _unsupported("Column-wise modeling")
        if vtype == GRB.BINARY:
            lb, ub = max(_number(lb), 0.0), min(_number(ub), 1.0)
        variable = Var(self, lb, ub, obj, vtype, name)
        self._vars.append(variable)
        return variable

    def addVars(self, *indices, lb=0.0, ub=GRB.INFINITY, obj=0.0, vtype=GRB.CONTINUOUS, name=""):
        if not indices:
            raise GurobiError("addVars requires at least one index set", 10003)
        if len(indices) == 1 and not isinstance(indices[0], (int, np.integer)):
            keys = list(indices[0])
        else:
            sets = _index_sets(indices)
            keys = [combo if len(combo) > 1 else combo[0] for combo in itertools.product(*sets)]
        result = tupledict()
        for position, key in enumerate(keys):
            label = _label(name, key) if name and isinstance(name, str) else (_option(name, key, position) if name else "")
            result[key] = self.addVar(
                lb=_option(lb, key, position) if _option(lb, key, position) is not None else 0.0,
                ub=_option(ub, key, position) if _option(ub, key, position) is not None else GRB.INFINITY,
                obj=_option(obj, key, position) or 0.0,
                vtype=_option(vtype, key, position) or GRB.CONTINUOUS,
                name=label)
        return result

    def addMVar(self, *args, **kwargs):
        _unsupported("Matrix variables (addMVar)")

    def _add_temp(self, temp, name):
        if isinstance(temp, (bool, np.bool_)):
            raise GurobiError("Constraint has no variables; check that both sides are not constants", 10003)
        if not isinstance(temp, TempConstr):
            _unsupported(f"Constraint type {type(temp).__name__}")
        expr = LinExpr._from_terms(temp._expr._terms, 0.0)
        rhs = -temp._expr._constant
        lower, upper = {GRB.LESS_EQUAL: (-np.inf, rhs), GRB.GREATER_EQUAL: (rhs, np.inf), GRB.EQUAL: (rhs, rhs)}[temp._sense]
        constraint = Constr(self, expr, lower, upper, temp._sense, name)
        self._constrs.append(constraint)
        return constraint

    def addConstr(self, constr, name="", *args):
        # Legacy signature: addConstr(lhs, sense, rhs, name)
        if isinstance(name, str) and name in {GRB.LESS_EQUAL, GRB.GREATER_EQUAL, GRB.EQUAL, "<=", ">=", "=="} and args:
            sense = {"<=": GRB.LESS_EQUAL, ">=": GRB.GREATER_EQUAL, "==": GRB.EQUAL}.get(name, name)
            rhs = args[0]
            label = args[1] if len(args) > 1 else ""
            lhs = constr if isinstance(constr, LinExpr) else LinExpr() + constr
            return self._add_temp(TempConstr(lhs - rhs, sense), label)
        return self._add_temp(constr, name)

    addLConstr = addConstr

    def addConstrs(self, generator, name=""):
        result = tupledict()
        frame_names = None
        code = getattr(generator, "gi_code", None)
        if code is not None:
            frame_names = [variable for variable in code.co_varnames if not variable.startswith(".")]
        position = 0
        for constraint in generator:
            key = position
            if frame_names:
                frame = getattr(generator, "gi_frame", None)
                local_values = frame.f_locals if frame is not None else {}
                values = tuple(local_values[variable] for variable in frame_names if variable in local_values)
                if values:
                    key = values[0] if len(values) == 1 else values
            label = _label(name, key) if name else ""
            result[key] = self._add_temp(constraint, label)
            position += 1
        return result

    def addRange(self, expr, lower, upper, name=""):
        expr = LinExpr() + expr
        constraint = Constr(self, LinExpr._from_terms(expr._terms, 0.0), _number(lower) - expr._constant,
                            _number(upper) - expr._constant, GRB.EQUAL if lower == upper else "R", name)
        self._constrs.append(constraint)
        return constraint

    def addSOS(self, *args, **kwargs): _unsupported("SOS constraints")
    def addGenConstrMax(self, *args, **kwargs): _unsupported("General constraints (addGenConstrMax)")
    def addGenConstrMin(self, *args, **kwargs): _unsupported("General constraints (addGenConstrMin)")
    def addGenConstrAbs(self, *args, **kwargs): _unsupported("General constraints (addGenConstrAbs)")
    def addGenConstrAnd(self, *args, **kwargs): _unsupported("General constraints (addGenConstrAnd)")
    def addGenConstrOr(self, *args, **kwargs): _unsupported("General constraints (addGenConstrOr)")
    def addGenConstrIndicator(self, *args, **kwargs): _unsupported("Indicator constraints")
    def addGenConstrPWL(self, *args, **kwargs): _unsupported("Piecewise-linear constraints")
    def setPWLObj(self, *args, **kwargs): _unsupported("Piecewise-linear objectives")
    def addQConstr(self, *args, **kwargs): _unsupported("Quadratic constraints")
    def computeIIS(self): _unsupported("IIS computation")
    def feasRelaxS(self, *args, **kwargs): _unsupported("Feasibility relaxation")
    def tune(self): _unsupported("Parameter tuning")

    def setObjective(self, expr, sense=None):
        if isinstance(expr, QuadExpr):
            _unsupported("Quadratic objectives")
        expr = LinExpr() + expr
        object.__setattr__(self, "_objective", expr)
        for variable in self._vars:
            object.__setattr__(variable, "_obj", 0.0)
        for variable, coefficient in expr._terms.values():
            object.__setattr__(variable, "_obj", coefficient)
        if sense is not None:
            self.ModelSense = sense

    def setObjectiveN(self, expr, index, priority=0, weight=1.0, abstol=1e-6, reltol=0.0, name=""):
        if isinstance(expr, QuadExpr):
            _unsupported("Quadratic objectives")
        self._multi[int(index)] = {"expr": LinExpr() + expr, "priority": _number(priority), "weight": _number(weight),
                                   "abstol": _number(abstol), "reltol": _number(reltol), "name": str(name)}

    @property
    def NumObj(self):
        return len(self._multi) or 1

    @property
    def ObjNVal(self):
        spec = self._multi.get(int(getattr(self.Params, "ObjNumber") or 0))
        if spec is None:
            return self.ObjVal
        if self._objval is None:
            raise GurobiError("Unable to retrieve attribute 'ObjNVal'", 10005)
        return spec["expr"].getValue()

    def getObjective(self, index=None):
        if index is not None and self._multi:
            return self._multi[int(index)]["expr"]._copy()
        if self._objective is not None:
            return self._objective._copy()
        return quicksum(variable._obj * variable for variable in self._vars)

    def getVars(self): return list(self._vars)
    def getConstrs(self): return list(self._constrs)
    def getVarByName(self, name): return next((v for v in self._vars if v._name == name), None)
    def getConstrByName(self, name): return next((c for c in self._constrs if c._name == name), None)

    def getRow(self, constraint):
        return constraint._expr._copy()

    def remove(self, items):
        items = items if isinstance(items, (list, tuple, dict)) else [items]
        for item in _flatten(items):
            if isinstance(item, Constr) and item in self._constrs:
                self._constrs.remove(item)
            elif isinstance(item, Var):
                _unsupported("Removing variables")
        for position, constraint in enumerate(self._constrs):
            object.__setattr__(constraint, "_index", position)

    def chgCoeff(self, constraint, variable, value):
        terms = dict(constraint._expr._terms)
        terms[variable._uid] = (variable, _number(value))
        object.__setattr__(constraint, "_expr", LinExpr._from_terms(terms, 0.0))

    def getAttr(self, name, objects=None):
        if objects is None:
            return getattr(self, name)
        if isinstance(objects, dict):
            return {key: getattr(item, name) for key, item in objects.items()}
        return [getattr(item, name) for item in objects]

    def setAttr(self, name, objects, values=None):
        if values is None:
            setattr(self, name, objects)
            return
        if isinstance(objects, dict):
            for key, item in objects.items():
                setattr(item, name, values[key] if isinstance(values, dict) else values)
        else:
            for position, item in enumerate(objects):
                setattr(item, name, values[position] if isinstance(values, (list, tuple)) else values)

    def write(self, filename):
        filename = str(filename)
        if not filename.endswith(".lp"):
            _unsupported(f"Writing {filename.rsplit('.', 1)[-1]} files")
        with open(filename, "w") as handle:
            handle.write(self._lp_text())

    def _lp_text(self):
        def term_text(expr):
            parts = []
            for variable, coefficient in expr._terms.values():
                if coefficient:
                    parts.append(f"{'+' if coefficient >= 0 else '-'} {abs(coefficient):.12g} {variable._name}")
            return " ".join(parts) or "0"
        lines = ["\\ Written by the in-browser HiGHS layer", "Maximize" if self._sense == GRB.MAXIMIZE else "Minimize",
                 " obj: " + term_text(self.getObjective()), "Subject To"]
        for constraint in self._constrs:
            body = term_text(constraint._expr)
            if constraint._lower == constraint._upper:
                lines.append(f" {constraint._name}: {body} = {constraint._lower:.12g}")
            else:
                if np.isfinite(constraint._lower):
                    lines.append(f" {constraint._name}_lb: {body} >= {constraint._lower:.12g}")
                if np.isfinite(constraint._upper):
                    lines.append(f" {constraint._name}: {body} <= {constraint._upper:.12g}")
        lines.append("Bounds")
        for variable in self._vars:
            lower = "-inf" if variable._lb <= -GRB.INFINITY else f"{variable._lb:.12g}"
            upper = "+inf" if variable._ub >= GRB.INFINITY else f"{variable._ub:.12g}"
            lines.append(f" {lower} <= {variable._name} <= {upper}")
        integers = [v._name for v in self._vars if v._vtype == GRB.INTEGER]
        binaries = [v._name for v in self._vars if v._vtype == GRB.BINARY]
        if integers:
            lines += ["General", " " + " ".join(integers)]
        if binaries:
            lines += ["Binary", " " + " ".join(binaries)]
        return "\n".join(lines + ["End", ""])

    def _matrices(self):
        positions = {variable._uid: position for position, variable in enumerate(self._vars)}
        objective = self.getObjective()
        cost = np.zeros(len(self._vars))
        for variable, coefficient in objective._terms.values():
            if variable._uid not in positions:
                raise GurobiError("Objective uses a variable from another model", 10003)
            cost[positions[variable._uid]] += coefficient
        rows, columns, values, lower, upper = [], [], [], [], []
        for row, constraint in enumerate(self._constrs):
            for variable, coefficient in constraint._expr._terms.values():
                if variable._uid not in positions:
                    raise GurobiError("Constraint uses a variable from another model", 10003)
                if coefficient:
                    rows.append(row); columns.append(positions[variable._uid]); values.append(coefficient)
            lower.append(constraint._lower)
            upper.append(constraint._upper)
        matrix = csr_matrix((values, (rows, columns)), shape=(len(self._constrs), len(self._vars)))
        def bound(value):
            return -np.inf if value <= -GRB.INFINITY else np.inf if value >= GRB.INFINITY else value
        lb = np.array([bound(v._lb) for v in self._vars], dtype=float)
        ub = np.array([bound(v._ub) for v in self._vars], dtype=float)
        integrality = np.array([0 if v._vtype == GRB.CONTINUOUS else 1 for v in self._vars])
        return objective, cost, matrix, np.array(lower, dtype=float), np.array(upper, dtype=float), lb, ub, integrality

    def optimize(self, callback=None):
        if callback is not None:
            _unsupported("Callbacks")
        if self._multi:
            self._optimize_hierarchical()
        else:
            self._optimize_single()

    def _optimize_hierarchical(self):
        """Lexicographic priorities with weighted blending inside a priority, as in Gurobi."""
        saved = self._objective
        added = []
        priorities = sorted({spec["priority"] for spec in self._multi.values()}, reverse=True)
        try:
            for level, priority in enumerate(priorities):
                specs = [spec for spec in self._multi.values() if spec["priority"] == priority]
                blended = quicksum(spec["weight"] * spec["expr"] for spec in specs)
                object.__setattr__(self, "_objective", blended)
                self._optimize_single()
                if self._status != GRB.OPTIMAL:
                    return
                if level + 1 < len(priorities):
                    value = self._objval
                    tolerance = max(max(spec["abstol"] for spec in specs), max(spec["reltol"] for spec in specs) * abs(value))
                    bound = blended <= value + tolerance if self._sense == GRB.MINIMIZE else blended >= value - tolerance
                    added.append(self._add_temp(bound, f"objective_priority_{priority:g}"))
            primary = self._multi.get(0) or self._multi[min(self._multi)]
            object.__setattr__(self, "_objval", primary["expr"].getValue())
            object.__setattr__(self, "_objbound", None)
        finally:
            for constraint in added:
                self._constrs.remove(constraint)
            for position, constraint in enumerate(self._constrs):
                object.__setattr__(constraint, "_index", position)
            object.__setattr__(self, "_objective", saved)

    def _optimize_single(self):
        started = time.monotonic()
        for variable in self._vars:
            object.__setattr__(variable, "_value", None)
            object.__setattr__(variable, "_rc", None)
        for constraint in self._constrs:
            object.__setattr__(constraint, "_pi", None)
            object.__setattr__(constraint, "_activity", None)
        object.__setattr__(self, "_objval", None)
        object.__setattr__(self, "_objbound", None)
        object.__setattr__(self, "_mipgap", None)
        objective, cost, matrix, lower, upper, lb, ub, integrality = self._matrices()
        if np.any(lb > ub):
            object.__setattr__(self, "_status", GRB.INFEASIBLE)
            return
        sign = -1.0 if self._sense == GRB.MAXIMIZE else 1.0
        time_limit = float(min(MAX_TIME_LIMIT, getattr(self.Params, "TimeLimit") or MAX_TIME_LIMIT))
        mip_gap = float(getattr(self.Params, "MIPGap") or 1e-4)
        if not self._vars:
            feasible = all(l <= 1e-9 and u >= -1e-9 for l, u in zip(lower, upper))
            object.__setattr__(self, "_status", GRB.OPTIMAL if feasible else GRB.INFEASIBLE)
            if feasible:
                object.__setattr__(self, "_objval", objective._constant)
            return
        if integrality.any():
            self._solve_mip(sign * cost, matrix, lower, upper, lb, ub, integrality, time_limit, mip_gap)
        else:
            self._solve_lp(sign * cost, matrix, lower, upper, lb, ub, time_limit)
        if self._objval is not None:
            object.__setattr__(self, "_objval", sign * self._objval + objective._constant)
            if self._objbound is not None:
                object.__setattr__(self, "_objbound", sign * self._objbound + objective._constant)
        object.__setattr__(self, "_runtime", time.monotonic() - started)
        object.__setattr__(self, "_solved", self._solved + 1)

    def _status_from(self, status, message):
        message = (message or "").lower()
        if status == 0:
            return GRB.OPTIMAL
        if status == 1:
            return GRB.TIME_LIMIT if "time" in message else GRB.ITERATION_LIMIT
        if status == 2:
            return GRB.INFEASIBLE
        if status == 3:
            return GRB.UNBOUNDED
        if "unbounded or infeasible" in message or "infeasible or unbounded" in message:
            return GRB.INF_OR_UNBD
        return GRB.NUMERIC

    def _store_solution(self, values):
        for variable, value in zip(self._vars, values):
            if variable._vtype != GRB.CONTINUOUS:
                rounded = round(value)
                value = float(rounded) if abs(value - rounded) <= 1e-6 else float(value)
            object.__setattr__(variable, "_value", float(value) + 0.0)
        for constraint in self._constrs:
            object.__setattr__(constraint, "_activity", sum(coefficient * variable._value for variable, coefficient in constraint._expr._terms.values()))

    def _solve_mip(self, cost, matrix, lower, upper, lb, ub, integrality, time_limit, mip_gap):
        constraints = [LinearConstraint(matrix, lower, upper)] if matrix.shape[0] else []
        result = milp(cost, integrality=integrality, bounds=Bounds(lb, ub), constraints=constraints,
                      options={"time_limit": time_limit, "mip_rel_gap": mip_gap, "disp": False, "presolve": True})
        status = self._status_from(result.status, result.message)
        object.__setattr__(self, "_nodes", int(getattr(result, "mip_node_count", 0) or 0))
        if result.x is not None:
            self._store_solution(result.x)
            object.__setattr__(self, "_objval", float(cost @ np.array([v._value for v in self._vars])))
            bound = getattr(result, "mip_dual_bound", None)
            object.__setattr__(self, "_objbound", float(bound) if bound is not None and np.isfinite(bound) else None)
            gap = getattr(result, "mip_gap", None)
            object.__setattr__(self, "_mipgap", float(gap) if gap is not None and np.isfinite(gap) else None)
            if status == GRB.TIME_LIMIT:
                status = GRB.TIME_LIMIT
        object.__setattr__(self, "_status", status)

    def _solve_lp(self, cost, matrix, lower, upper, lb, ub, time_limit):
        dense = matrix.tocsr()
        ub_rows, ub_rhs, ub_sign, eq_rows, eq_rhs = [], [], [], [], []
        ub_owner, eq_owner = [], []
        for row, constraint in enumerate(self._constrs):
            if lower[row] == upper[row]:
                eq_rows.append(row); eq_rhs.append(lower[row]); eq_owner.append(row)
                continue
            if np.isfinite(upper[row]):
                ub_rows.append(row); ub_rhs.append(upper[row]); ub_sign.append(1.0); ub_owner.append(row)
            if np.isfinite(lower[row]):
                ub_rows.append(row); ub_rhs.append(-lower[row]); ub_sign.append(-1.0); ub_owner.append(row)
        a_ub = dense[ub_rows].multiply(np.array(ub_sign)[:, None]).tocsr() if ub_rows else None
        a_eq = dense[eq_rows] if eq_rows else None
        result = linprog(cost, A_ub=a_ub, b_ub=np.array(ub_rhs) if ub_rows else None,
                         A_eq=a_eq, b_eq=np.array(eq_rhs) if eq_rows else None,
                         bounds=list(zip(lb, ub)), method="highs", options={"time_limit": time_limit, "disp": False})
        status = self._status_from(result.status, result.message)
        object.__setattr__(self, "_iterations", int(getattr(result, "nit", 0) or 0))
        if result.x is not None and status == GRB.OPTIMAL:
            self._store_solution(result.x)
            object.__setattr__(self, "_objval", float(cost @ result.x))
            # SciPy marginals are sensitivities of the minimized objective to the
            # right-hand side; convert to Gurobi's Pi for the stated sense.
            sign = -1.0 if self._sense == GRB.MAXIMIZE else 1.0
            duals = np.zeros(len(self._constrs))
            if ub_rows and getattr(result, "ineqlin", None) is not None:
                for marginal, owner, factor in zip(result.ineqlin.marginals, ub_owner, ub_sign):
                    duals[owner] += sign * factor * marginal
            if eq_rows and getattr(result, "eqlin", None) is not None:
                for marginal, owner in zip(result.eqlin.marginals, eq_owner):
                    duals[owner] += sign * marginal
            for constraint, dual in zip(self._constrs, duals):
                object.__setattr__(constraint, "_pi", float(dual) + 0.0)
            original = sign * cost
            reduced = original - dense.T @ duals
            for variable, value in zip(self._vars, reduced):
                object.__setattr__(variable, "_rc", float(value) + 0.0)
        object.__setattr__(self, "_status", status)


Env = None


def read(*args, **kwargs):
    _unsupported("Reading model files")


def _created_models():
    return _MODELS


def _reset_models():
    _MODELS.clear()


__all__ = ["GRB", "Model", "Var", "Constr", "LinExpr", "QuadExpr", "TempConstr", "GurobiError",
           "quicksum", "quickSum", "tupledict", "tuplelist", "multidict", "max_", "min_", "abs_", "and_", "or_"]

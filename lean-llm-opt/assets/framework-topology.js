const text = (zh, en) => ({zh, en});
const QUERY_ID = 'tp-demo-query';
const DATA_ID = 'tp-demo-data';
const REFERENCE_ID = 'lean-reference-library';

export const JOURNEY_EXAMPLE = {
  id: 'tp-demo',
  title: text('运输规划示例', 'Transportation example'),
  dimensions: {suppliers: 3, customers: 4, variables: 12},
  query: {
    id: QUERY_ID,
    label: text('QUERY · Q1', 'QUERY · Q1'),
    text: text(
      '从 3 个供应点向 4 个客户运输货物，满足需求且不超过供应能力，最小化总运输成本。',
      'Ship from 3 suppliers to 4 customers, meeting demand within supply capacities while minimizing total transportation cost.',
    ),
  },
  data: {
    id: DATA_ID,
    label: text('DATA · D1', 'DATA · D1'),
    files: ['customer_demand.csv', 'supply_capacity.csv', 'transportation_costs.csv'],
    dimensions: {suppliers: 3, customers: 4, variables: 12},
    description: text('同一次任务的需求、供应能力与运输成本数据。', 'Demand, supply capacities, and transportation costs for the same task.'),
    tables: [
      {file: 'customer_demand.csv', rows: 4, fields: ['customer', 'demand'], role: text('客户标识与需求 d_j', 'Customer identifiers and demand d_j')},
      {file: 'supply_capacity.csv', rows: 3, fields: ['supplier', 'supply_capacity'], role: text('供应点标识与容量 s_i', 'Supplier identifiers and capacity s_i')},
      {file: 'transportation_costs.csv', rows: 3, columns: 4, fields: ['', 'C1', 'C2', 'C3', 'C4'], role: text('首列为供应点，列标题为客户，单元格为成本 c_ij', 'Supplier row identifiers, customer column headers, and cost cells c_ij')},
    ],
  },
  formulation: {
    sets: {suppliers: ['S1', 'S2', 'S3'], customers: ['C1', 'C2', 'C3', 'C4']},
    variable: text('x_ij ≥ 0：供应点 i 运往客户 j 的连续运量。', 'x_ij ≥ 0: continuous quantity shipped from supplier i to customer j.'),
    objective: 'min Σ_i Σ_j c_ij x_ij',
    constraints: ['Σ_i x_ij ≥ d_j  ∀j', 'Σ_j x_ij ≤ s_i  ∀i', 'x_ij ≥ 0  ∀i,j'],
  },
  result: {
    status: 'optimal', objective: 907126.1,
    sourceNote: text(
      'Demo 运输示例的已记录原始运行：3 个供应点、4 个客户、12 个连续运量变量。',
      'Recorded unmodified transportation demo run: 3 suppliers, 4 customers, and 12 continuous shipment variables.',
    ),
  },
  source: {example: 'tp', url: 'demo/', note: text('Demo 页的运输规划示例及其三份 CSV。', 'The transportation example and its three CSVs on the Demo page.')},
};
export const EXAMPLE = JOURNEY_EXAMPLE;
export const PRIMARY_PATH = ['query', 'classification', 'workflow', 'model', 'codegen', 'solver', 'solution'];

const node = (id, kind, stage, title, description, position, mobile, extra = {}) => ({
  id, kind, stage, title: text(...title), description: text(...description),
  position, mobile, level: 0, parent: null, children: [], details: [], ...extra,
});

export const NODES = [
  node('query', 'input', 1, ['问题描述', 'Query'],
    ['说明优化目标、决策含义和业务约束，作为分类与建模的任务上下文。', 'Specifies the optimization objective, decisions, and business constraints as context for classification and formulation.'],
    [-9, 0, .08], [0, 9, .08], {
      icon: 'query', short: text('问题描述', 'Query'), payloadId: QUERY_ID,
      details: [text('优化目标、决策与约束。', 'The objective, decisions, and constraints.'), text('查询上下文贯穿工作流、建模和代码生成。', 'Query context is retained through workflow construction, formulation, and code generation.')],
      exampleDetails: [text('3 个供应点 → 4 个客户；决策为非负连续运量。', '3 suppliers → 4 customers; decisions are nonnegative continuous shipment quantities.')],
    }),
  node('classification', 'agent', 2, ['分类智能体', 'Classification agent'],
    ['结合查询与 FileQA 返回的参考示例识别问题结构，输出相应类型标签。', 'Identifies the problem structure from the query and FileQA references, returning the corresponding type label.'],
    [-6, 0, .12], [0, 6, .12], {
      icon: 'classification', short: text('分类', 'Classify'),
      inlineTools: [{id: 'fileqa', icon: 'references', title: text('FileQA', 'FileQA'), description: text('请求并接收带类型标签的参考问题。', 'Requests and receives labeled reference problems.')}],
      details: [text('FileQA 检索参考问题及其类型。', 'FileQA retrieves reference problems and their types.'), text('实例 CSV 在后续的数据访问阶段读取。', 'Instance CSVs are read in the subsequent data-access stage.')],
    }),
  node('workflow', 'agent', 3, ['工作流生成智能体', 'Workflow generation agent'],
    ['根据问题类型和相关示例组织数据访问、变量定义、目标与约束的建模步骤。', 'Uses the problem type and relevant demonstrations to organize data access, variable definitions, the objective, and constraints.'],
    [-3, 0, .12], [0, 3, .12], {
      icon: 'workflow', short: text('工作流', 'Workflow'),
      inlineTools: [{id: 'retriever', icon: 'references', title: text('示例检索', 'Example retrieval'), description: text('请求相关数学表述与代码示例。', 'Requests relevant formulations and code examples.')}],
      routes: [
        {id: 'tailored', title: text('类型定制', 'Type-tailored'), description: text('TP、NRM、RA、FLP、AP 使用相应示例和数据格式。', 'TP, NRM, RA, FLP, and AP use corresponding examples and data formats.')},
        {id: 'agnostic', title: text('通用建模', 'Type-agnostic'), description: text('Others 与 Mixture 先组织抽象建模计划。', 'Others and Mixture first organize an Abstract Model Plan.')},
      ],
      details: [text('常见类型采用定制工作流，其他或混合结构采用通用工作流。', 'Familiar types use tailored workflows; other or mixed structures use type-agnostic workflows.'), text('少样本示例说明建模方法和工具使用顺序。', 'Few-shot demonstrations provide modeling patterns and tool-use guidance.')],
      exampleDetails: [text('本运输示例使用类型定制工作流。', 'This transportation example uses a type-tailored workflow.')],
    }),
  node('model', 'agent', 4, ['模型生成智能体', 'Model generation agent'],
    ['结合原查询、工作流与数据记录生成变量、目标和约束；通用路线可先形成抽象建模计划。', 'Combines the query, workflow, and data records into variables, an objective, and constraints; the type-agnostic route can first produce an Abstract Model Plan.'],
    [0, 0, .12], [0, 0, .12], {
      icon: 'model', short: text('数学模型', 'Formulation'),
      details: [text('依据查询选择连续、整数或二元变量。', 'Choose continuous, integer, or binary variables from the query.'), text('将目标、常数项和业务约束映射到数据字段。', 'Map the objective, constant terms, and business constraints to data fields.'), text('通用路线可先输出 Abstract Model Plan，再交代码生成实现。', 'The type-agnostic route can first produce an Abstract Model Plan for code generation.')],
      exampleDetails: [text('12 个连续运量变量；目标为最小总运输成本。', '12 continuous shipment variables; minimize total transportation cost.'), text('客户需求下界和供应能力上界。', 'Customer-demand lower bounds and supplier-capacity upper bounds.')],
    }),
  node('codegen', 'code', 5, ['代码生成', 'Code generation'],
    ['将模型与数据映射转为 Python / Gurobi 程序，读取本次任务的完整 CSV。', 'Translates the formulation and data mapping into a Python / Gurobi program that reads the task’s complete CSVs.'],
    [3, 0, .08], [0, -3, .08], {
      icon: 'code', short: text('代码', 'Code'), group: 'execution',
      details: [text('按当前任务的实体标识读取系数。', 'Loads coefficients using the current task’s entity identifiers.'), text('创建变量、目标和约束，再调用求解器。', 'Creates variables, the objective, and constraints, then calls the solver.')],
    }),
  node('solver', 'solver', 5, ['Python / Gurobi', 'Python / Gurobi'],
    ['执行生成的模型，返回求解状态、目标值和可用的变量取值。', 'Executes the generated model and returns solver status, objective value, and available variable values.'],
    [6, 0, .08], [0, -6, .08], {
      icon: 'solver', short: text('求解', 'Solve'), group: 'execution',
      details: [text('同一数据包在程序运行时提供完整数值。', 'The same data package supplies complete coefficients at runtime.'), text('求解状态与数学模型、代码一起保留。', 'Solver status is retained with the formulation and code.')],
    }),
  node('solution', 'output', 6, ['完整结果', 'Complete result'],
    ['汇集数学表述或抽象计划、生成代码、求解状态和可用的目标与变量值。', 'Collects the formulation or abstract plan, generated code, solver status, and available objective and variable values.'],
    [9, 0, .08], [0, -9, .08], {
      icon: 'result', short: text('结果', 'Result'),
      details: [text('数学模型与 Python 程序。', 'The mathematical formulation and Python program.'), text('求解状态、目标值与决策变量取值。', 'Solver status, objective value, and decision-variable values.')],
    }),
  node('references', 'reference', 2, ['参考示例库', 'Reference examples'],
    ['为 FileQA、工作流和代码生成提供带标签的问题、数学表述与程序示例。', 'Provides labeled problems, formulations, and code examples for FileQA, workflow construction, and code generation.'],
    [-4.5, 3.2, .08], [-3.3, 4.5, .08], {
      icon: 'references', short: text('参考示例', 'Examples'),
      details: [text('分类检索：问题描述与类型标签。', 'Classification retrieval: problem descriptions and type labels.'), text('建模与代码检索：示例表述及程序模式。', 'Formulation and code retrieval: example formulations and programming patterns.')],
    }),
  node('csv', 'data', 1, ['CSV 数据包', 'CSV data package'],
    ['提供当前任务的表格、实体标识与数值参数，供数据工具和求解程序读取。', 'Supplies the current task’s tables, entity identifiers, and numerical parameters for data tools and the solver program.'],
    [-8, -2.8, .08], [3.3, 7.4, .08], {
      icon: 'csv', short: text('CSV 数据', 'CSV data'), payloadId: DATA_ID,
      details: [text('当前查询对应的数据表与参数。', 'Data tables and parameters associated with the current query.'), text('在模型生成及程序运行时读取。', 'Read during formulation and program execution.')],
      exampleDetails: [text('customer_demand.csv：4 个客户的需求。', 'customer_demand.csv: demand for 4 customers.'), text('supply_capacity.csv：3 个供应点的容量。', 'supply_capacity.csv: capacity for 3 suppliers.'), text('transportation_costs.csv：3 × 4 成本矩阵。', 'transportation_costs.csv: a 3 × 4 cost matrix.')],
    }),
  node('csvqa', 'tool', 4, ['CSVQA 数据访问', 'CSVQA data access'],
    ['按当前查询读取所需表格、标识与系数，将记录返回模型生成智能体。', 'Reads required tables, identifiers, and coefficients according to the current query, then returns records to the model-generation agent.'],
    [.6, -1.7, .08], [2.8, -.5, .08], {
      icon: 'data-access', short: text('CSVQA', 'CSVQA'),
      details: [text('请求：当前查询需要的表格、字段与数据范围。', 'Request: the tables, fields, and data scope required by the current query.'), text('返回：保留源标识和记录顺序的数据。', 'Return: data preserving source identifiers and record order.')],
      exampleDetails: [text('读取客户需求、供应能力和运输成本。', 'Read customer demand, supply capacity, and transportation costs.')],
    }),
];

const edge = (from, to, kind = 'flow', extra = {}) => ({
  id: from + '--' + to + (extra.route ? '--' + extra.route : ''),
  from, to, kind, ...extra,
});
export const EDGES = [
  edge('query', 'classification'),
  edge('classification', 'workflow'),
  edge('workflow', 'model', 'flow', {route: 'tailored', label: text('类型定制工作流', 'Type-tailored workflow')}),
  edge('workflow', 'model', 'flow', {route: 'agnostic', label: text('通用工作流', 'Type-agnostic workflow')}),
  edge('model', 'codegen'),
  edge('codegen', 'solver'),
  edge('solver', 'solution'),
  edge('classification', 'references', 'request', {via: 'fileqa', fromPort: 'fileqa', payload: 'reference', label: text('FileQA 检索请求', 'FileQA retrieval request')}),
  edge('references', 'classification', 'reference', {via: 'fileqa', toPort: 'fileqa', label: text('参考问题与类型标签', 'Reference problems and type labels')}),
  edge('workflow', 'references', 'request', {via: 'retriever', fromPort: 'retriever', payload: 'reference', label: text('示例检索请求', 'Example retrieval request')}),
  edge('references', 'workflow', 'reference', {via: 'retriever', toPort: 'retriever', label: text('相关建模示例', 'Relevant formulation examples')}),
  edge('references', 'codegen', 'reference', {via: 'retriever', label: text('代码参考示例', 'Code demonstrations')}),
  edge('model', 'csvqa', 'request', {label: text('数据读取请求', 'Data-access request')}),
  edge('csvqa', 'csv', 'request', {payload: 'data', label: text('读取当前 CSV', 'Read instance CSVs')}),
  edge('csv', 'csvqa', 'data', {label: text('源数据记录', 'Source records')}),
  edge('csvqa', 'model', 'data', {label: text('CSVQA 返回数据', 'CSVQA data response')}),
  edge('csvqa', 'codegen', 'data', {label: text('数据与字段映射', 'Data and field mapping')}),
  edge('csv', 'solver', 'runtime', {label: text('运行时完整数据', 'Complete runtime data')}),
  edge('model', 'solution', 'artifact', {label: text('数学模型 / 抽象计划', 'Formulation / abstract plan')}),
  edge('codegen', 'solution', 'artifact', {label: text('Python 程序', 'Python program')}),
];
export const TOPOLOGY = {
  nodes: NODES, edges: EDGES, layout: 'planar', example: JOURNEY_EXAMPLE,
  groups: [
    {id: 'input', nodes: ['query', 'csv'], title: text('查询与数据', 'Query and data')},
    {id: 'classification', nodes: ['classification'], title: text('分类', 'Classification')},
    {id: 'workflow', nodes: ['workflow'], title: text('工作流', 'Workflow')},
    {id: 'modeling', nodes: ['model', 'csvqa'], title: text('模型与数据访问', 'Formulation and data access')},
    {id: 'execution', nodes: ['codegen', 'solver', 'solution'], title: text('程序与求解结果', 'Program and solver result')},
    {id: 'reference', nodes: ['references'], title: text('参考示例', 'Reference examples')},
  ],
};
export const NODE_BY_ID = new Map(NODES.map(n => [n.id, n]));
const NODE_ALIASES = {fileqa: 'classification', retriever: 'references', tailored: 'workflow', agnostic: 'workflow'};

const context = (action, artifact) => ({
  query: JOURNEY_EXAMPLE.query.text,
  data: text('同一运输数据包：3 CSV，3 个供应点、4 个客户。', 'The same transportation package: 3 CSVs, 3 suppliers, and 4 customers.'),
  action: text(...action), artifact: text(...artifact),
});
const pathEdges = paths => EDGES.filter(e => paths.some(path => path.some((from, index) => index < path.length - 1 && from === e.from && path[index + 1] === e.to))).map(e => e.id);
function shot(id, title, description, focus, queryPaths, dataPaths, referencePaths, action, artifact, highlightedEdges = []) {
  const journey = {
    focus,
    query: {id: QUERY_ID, label: JOURNEY_EXAMPLE.query.label, paths: queryPaths},
    data: {id: DATA_ID, label: JOURNEY_EXAMPLE.data.label, paths: dataPaths},
    references: {id: REFERENCE_ID, label: text('参考示例', 'Reference examples'), paths: referencePaths},
  };
  const flowPackets = [
    {id: QUERY_ID, kind: 'query', paths: queryPaths, path: queryPaths[0], label: JOURNEY_EXAMPLE.query.label},
    {id: DATA_ID, kind: 'data', paths: dataPaths, path: dataPaths[0], label: JOURNEY_EXAMPLE.data.label},
    ...(referencePaths.length ? [{id: REFERENCE_ID, kind: 'reference', paths: referencePaths, path: referencePaths[0], label: journey.references.label}] : []),
  ];
  return {id, title: text(...title), description: text(...description), focus, expand: [], journey,
    activeEdges: [...new Set([...pathEdges(flowPackets.flatMap(packet => packet.paths || [packet.path])), ...highlightedEdges])],
    flowPackets, context: context(action, artifact)};
}

export const STAGES = [
  shot('overview', ['一次运输查询的完整流程', 'One transportation query, end to end'],
    ['同一条查询和同一份运输数据，经过分类、检索、建模、代码生成与求解。', 'One query and one transportation data package pass through classification, retrieval, formulation, code generation, and solving.'],
    NODES.map(n => n.id), [['query']], [['csv']], [],
    ['查看三类智能体、参考支路与数据通路。', 'View the three agent roles, reference branch, and data path.'],
    ['本次任务：3 个供应点、4 个客户、12 个运量变量。', 'Task: 3 suppliers, 4 customers, and 12 shipment variables.']),
  shot('input', ['输入查询与数据', 'Input the query and data'],
    ['运输目标写在查询中，需求、供应能力和成本保存在同一数据包的三份 CSV 中。', 'The query states the transportation objective; three CSVs in one data package contain demand, supply capacity, and costs.'],
    ['query', 'csv'], [['query']], [['csv']], [],
    ['提交运输问题描述及三份 CSV。', 'Submit the transportation query and its three CSVs.'],
    ['一条运输查询 + 一份三文件数据包。', 'One transportation query + one three-file data package.']),
  shot('classification', ['分类与参考检索', 'Classify and retrieve references'],
    ['FileQA 用当前查询检索带标签的参考问题，分类智能体据此识别运输结构。', 'FileQA uses the current query to retrieve labeled reference problems; the classification agent identifies the transportation structure.'],
    ['query', 'classification', 'references'], [['query', 'classification']], [['csv']], [['classification', 'references', 'classification']],
    ['查询检索参考示例；本步不读取实例 CSV。', 'Retrieve reference examples using the query; instance CSVs are not read at this step.'],
    ['问题类型：TP（运输问题）。', 'Problem type: TP, transportation.']),
  shot('workflow', ['组织建模工作流', 'Assemble the modeling workflow'],
    ['匹配的运输示例指导数据访问、变量定义、目标与约束的组织。', 'Matched transportation demonstrations guide data access, variable definitions, the objective, and constraints.'],
    ['classification', 'workflow', 'references'], [['classification', 'workflow']], [['csv']], [['workflow', 'references', 'workflow']],
    ['为本 TP 示例选择类型定制工作流。', 'Select a type-tailored workflow for this TP example.'],
    ['建模步骤：读取需求、容量和成本，再定义变量、目标与约束。', 'Modeling steps: read demand, capacity, and costs; define variables, the objective, and constraints.']),
  shot('model', ['检索 CSV 并建立模型', 'Read the CSVs and formulate'],
    ['模型智能体请求 CSVQA 读取当前数据，将源记录写入变量、目标函数和约束。', 'The model agent asks CSVQA to read the instance data and maps source records into variables, the objective, and constraints.'],
    ['workflow', 'model', 'csvqa', 'csv'], [['workflow', 'model']], [['model', 'csvqa', 'csv', 'csvqa', 'model']], [],
    ['CSVQA 请求读取三张表，返回需求、供应能力与成本记录。', 'CSVQA reads the three tables and returns demand, capacity, and cost records.'],
    ['12 个连续运量变量；最小总成本目标；需求和容量约束。', '12 continuous shipment variables; minimum total cost; demand and capacity constraints.']),
  shot('execution', ['生成代码并求解', 'Generate code and solve'],
    ['Python / Gurobi 程序读取同一数据包的完整数据，构造并求解运输模型。', 'The Python / Gurobi program reads the complete data from the same package, builds the transportation model, and solves it.'],
    ['model', 'csvqa', 'csv', 'codegen', 'solver'], [['model', 'codegen', 'solver']], [['csv', 'solver']], [['references', 'codegen']],
    ['把数学模型转为程序；运行时读取完整 CSV 并调用 Gurobi。', 'Translate the formulation into code; read complete CSVs and call Gurobi at runtime.'],
    ['Python 程序、求解状态与可用的目标值和变量取值。', 'Python code, solver status, and available objective and variable values.']),
  shot('output', ['汇集完整结果', 'Collect the complete result'],
    ['数学模型、生成代码和求解结果汇入同一个任务结果。', 'The formulation, generated code, and solver output are collected for the same task.'],
    ['model', 'codegen', 'solver', 'solution'], [['solver', 'solution']], [['solver']], [],
    ['汇集模型、代码与运输方案。', 'Collect the formulation, code, and transportation plan.'],
    ['本示例原始运行目标值：907126.1；同时保留 12 个运量变量。', 'Recorded original-example objective: 907126.1, with 12 shipment-variable values.'],
    ['model--solution', 'codegen--solution']),
];

const STAGE_IO = {
  overview: {
    input: text('Q1 运输查询与 D1 三份 CSV。', 'Transportation query Q1 and three CSVs in D1.'),
    output: text('同一任务的分类、工作流、模型、程序与求解结果。', 'The classification, workflow, formulation, program, and solver result for one task.'),
    evidence: [text('核心智能体：分类、工作流生成、模型生成。', 'Core agents: classification, workflow generation, and model generation.'), text('参考示例用于分类与建模；D1 提供当前实例的系数。', 'Reference examples support classification and modeling; D1 supplies the current instance coefficients.')],
  },
  input: {
    input: JOURNEY_EXAMPLE.query.text,
    output: text('保留查询含义、三份文件名和全部实体标识。', 'Retain the query semantics, three filenames, and all entity identifiers.'),
    evidence: JOURNEY_EXAMPLE.data.tables.map(table => text(`${table.file}：${table.role.zh}。`, `${table.file}: ${table.role.en}.`)),
  },
  classification: {
    input: text('原查询与 FileQA 检索到的带标签参考问题。', 'The original query and labeled reference problems returned by FileQA.'),
    output: text('类型 TP；该教学示例采用类型定制路线。', 'Type TP; this teaching example uses the type-tailored route.'),
    evidence: [text('可观察结构：供应点、客户、运量决策、容量、需求与运输成本。', 'Observed structure: suppliers, customers, shipment decisions, capacities, demand, and transportation costs.'), text('分类对照参考问题的结构与标签，不将参考数值用作当前输入。', 'Classification compares reference structures and labels; reference coefficients are not used as instance input.')],
  },
  workflow: {
    input: text('Q1、TP 类型标签与相关运输建模示例。', 'Q1, its TP label, and relevant transportation modeling examples.'),
    output: text('读取字段 → 对齐实体 → 定义变量 → 写目标 → 写约束。', 'Read fields → align entities → define variables → write the objective → write constraints.'),
    evidence: [text('定制路线选用相应类型示例与数据格式。', 'The tailored route uses examples and data formats for the selected type.'), text('通用路线对 Others / Mixture 组织 Abstract Model Plan；本 TP 动画展示定制路线。', 'The agnostic route organizes an Abstract Model Plan for Others / Mixture; this TP animation follows the tailored route.')],
  },
  model: {
    input: text('Q1、工作流与 CSVQA 返回的 D1 记录。', 'Q1, the workflow, and D1 records returned by CSVQA.'),
    output: text('12 个连续变量；一个成本目标；4 条需求约束与3条容量约束。', '12 continuous variables; one cost objective; 4 demand constraints and 3 capacity constraints.'),
    evidence: [JOURNEY_EXAMPLE.formulation.variable, text('customer/demand → d_j；supplier/supply_capacity → s_i；成本矩阵 → c_ij。', 'customer/demand → d_j; supplier/supply_capacity → s_i; cost matrix → c_ij.'), text('min Σ_iΣ_j c_ij x_ij；Σ_i x_ij ≥ d_j；Σ_j x_ij ≤ s_i。', 'min Σ_iΣ_j c_ij x_ij; Σ_i x_ij ≥ d_j; Σ_j x_ij ≤ s_i.')],
  },
  execution: {
    input: text('数学模型、字段映射、完整源 CSV 与代码参考。', 'The formulation, field mapping, complete source CSVs, and code examples.'),
    output: text('Python / Gurobi 程序及其求解状态、目标和变量取值。', 'A Python / Gurobi program and its solver status, objective, and variable values.'),
    evidence: [text('程序按供应点和客户标识对齐矩阵，读取全部 3×4 成本。', 'The program aligns the matrix by supplier and customer identifiers and reads all 3×4 costs.'), text('运行时重新读取完整 CSV；CSVQA 记录保留同一数据来源。', 'Execution reads the complete CSVs; CSVQA records retain the same provenance.'), text('语法或运行异常可触发一次代码修复；不可行是求解状态。', 'A syntax or runtime error may trigger one code repair; infeasibility is a solver status.')],
  },
  output: {
    input: text('数学模型、生成程序与 Gurobi 输出。', 'The formulation, generated program, and Gurobi output.'),
    output: text('求解状态、目标值、12 个变量及对应模型和程序。', 'Solver status, objective, 12 variables, and the corresponding formulation and program.'),
    evidence: [JOURNEY_EXAMPLE.result.sourceNote, text('目标值对应该示例已记录的原始运行；实时 Demo 的结果由各次运行给出。', 'The objective belongs to the recorded original example; live demo results belong to their individual runs.')],
  },
};
for (const stage of STAGES) {
  const copy = STAGE_IO[stage.id];
  stage.input = copy.input;
  stage.action = stage.context.action;
  stage.output = copy.output;
  stage.evidence = copy.evidence;
  stage.io = {input: stage.input, action: stage.action, output: stage.output};
}

const queryTrack = (location, role = 'query', label = ['Q1 · 运输查询', 'Q1 · Transportation query'], extra = {}) => ({
  id: QUERY_ID, label: text(...label), role,
  ...(Array.isArray(location) ? {path: location} : {at: location}), ...extra,
});
const dataTrack = (location, role = 'source', extra = {}) => ({
  id: DATA_ID, label: text('D1 · 当前实例数据', 'D1 · Instance data'), role,
  source: 'csv', files: JOURNEY_EXAMPLE.data.files,
  ...(Array.isArray(location) ? {path: location} : {at: location}), ...extra,
});
const referenceTrack = (path, role, extra = {}) => ({
  id: REFERENCE_ID, path, role, label: text('R · 参考示例', 'R · Reference examples'), ...extra,
});
const requestTrack = (kind, path, label, extra = {}) => ({kind, path, label: text(...label), ...extra});
function cycleStep(id, stage, durationMs, label, description, query, data, extra = {}) {
  const narrative = STAGES[stage];
  const requests = extra.requests || [];
  const paths = [query, data, extra.reference, ...requests].filter(Boolean).map(track => track.path || [track.at]);
  return {id, stage, durationMs, label: text(...label), description: text(...description), query, data,
    requests, transformations: [], context: {...narrative.context, action: text(...description)},
    input: narrative.input, output: narrative.output,
    ...extra, activeEdges: [...new Set([...pathEdges(paths), ...(extra.activeEdges || [])])],
  };
}

// Teaching time is independent of scroll position and camera focus. Q1 and D1
// retain their identities while their roles evolve; the CSV source stays put.
const CYCLE_STEPS = [
  cycleStep('inputs-ready', 1, 1700, ['查询与 CSV 就绪', 'Query and CSVs are ready'],
    ['Q1 说明运输目标，D1 保留需求、容量和成本三张表。', 'Q1 states the transportation objective; D1 retains the demand, capacity, and cost tables.'],
    queryTrack('query'), dataTrack('csv')),
  cycleStep('query-to-classification', 2, 1900, ['读取问题结构', 'Read the problem structure'],
    ['分类智能体接收 Q1，识别供应点、客户与运量决策。', 'The classification agent receives Q1 and identifies suppliers, customers, and shipment decisions.'],
    queryTrack(['query', 'classification']), dataTrack('csv')),
  cycleStep('classification-references', 2, 2800, ['检索分类参考', 'Retrieve classification references'],
    ['FileQA 先发出检索请求，再返回带类型标签的问题示例。', 'FileQA sends a retrieval request, then returns labeled example problems.'],
    queryTrack('classification'), dataTrack('csv'), {
      reference: referenceTrack(['references', 'classification'], 'classification-evidence', {window: [.5, 1]}),
      requests: [requestTrack('reference', ['classification', 'references'], ['检索类型示例', 'Retrieve labeled examples'], {window: [0, .5]})],
      transformations: [{node: 'classification', kind: 'classification', label: text('问题类型：TP', 'Problem type: TP')}],
    }),
  cycleStep('workflow-references', 3, 3200, ['组织运输建模步骤', 'Organize the transportation workflow'],
    ['Q1 连同 TP 标签进入工作流智能体；相关示例随后指导字段与建模步骤。', 'Q1 and its TP label enter the workflow agent; retrieved examples then guide fields and modeling steps.'],
    queryTrack(['classification', 'workflow'], 'classified-query', ['Q1 · 类型 TP', 'Q1 · Type TP'], {window: [0, .25]}), dataTrack('csv'), {
      reference: referenceTrack(['references', 'workflow'], 'workflow-example', {window: [.6, 1]}),
      requests: [requestTrack('reference', ['workflow', 'references'], ['检索建模示例', 'Retrieve modeling examples'], {window: [.25, .6]})],
      transformations: [{node: 'workflow', kind: 'workflow', label: text('字段 → 实体 → 变量 → 目标 → 约束', 'Fields → entities → variables → objective → constraints')}],
    }),
  cycleStep('workflow-to-model', 4, 1900, ['传递工作流', 'Pass the workflow to formulation'],
    ['模型智能体收到原查询、类型定制工作流与所需数据项。', 'The model agent receives the original query, tailored workflow, and required data items.'],
    queryTrack(['workflow', 'model'], 'workflow', ['Q1 · 建模工作流', 'Q1 · Modeling workflow']), dataTrack('csv')),
  cycleStep('csv-request', 4, 2600, ['请求当前 CSV', 'Request the instance CSVs'],
    ['模型经 CSVQA 请求 D1 的需求、供应能力和成本记录。', 'The model requests D1 demand, supply-capacity, and cost records through CSVQA.'],
    queryTrack('model', 'workflow', ['Q1 · 建模工作流', 'Q1 · Modeling workflow']), dataTrack('csv'), {
      requests: [requestTrack('data', ['model', 'csvqa', 'csv'], ['读取需求、容量与成本', 'Read demand, capacity, and costs'])],
    }),
  cycleStep('csv-response', 4, 2400, ['返回实例记录', 'Return instance records'],
    ['CSVQA 返回保留供应点与客户标识的 D1 记录；源文件仍保存在数据包中。', 'CSVQA returns D1 records with supplier and customer identifiers; the source files remain in the data package.'],
    queryTrack('model', 'workflow', ['Q1 · 建模工作流', 'Q1 · Modeling workflow']), dataTrack(['csv', 'csvqa', 'model'], 'records')),
  cycleStep('formulation-ready', 4, 2200, ['形成数学模型', 'Form the mathematical model'],
    ['以 x_ij 表示 12 个连续运量变量，将 c_ij、d_j、s_i 绑定到目标与约束。', 'Define 12 continuous shipment variables x_ij and bind c_ij, d_j, and s_i to the objective and constraints.'],
    queryTrack('model', 'formulation', ['Q1 · 数学模型', 'Q1 · Formulation']), dataTrack('model', 'records'), {
      transformations: [{node: 'model', kind: 'formulation', label: text('min Σ c_ij x_ij；需求下界与容量上界', 'min Σ c_ij x_ij; demand lower bounds and capacity upper bounds')}],
    }),
  cycleStep('code-generation', 5, 3000, ['生成求解程序', 'Generate the solver program'],
    ['数学模型与 D1 字段映射进入代码生成，参考代码提供程序模式。', 'The formulation and D1 field mapping enter code generation; code examples provide programming patterns.'],
    queryTrack(['model', 'codegen'], 'formulation', ['Q1 · 数学模型', 'Q1 · Formulation'], {window: [0, .75]}), dataTrack(['model', 'codegen'], 'records', {window: [.2, 1]}), {
      reference: referenceTrack(['references', 'codegen'], 'code-example'),
      transformations: [{node: 'codegen', kind: 'code', label: text('Python / Gurobi 程序', 'Python / Gurobi program')}],
    }),
  cycleStep('program-to-solver', 5, 1700, ['提交程序与数据映射', 'Submit the program and data mapping'],
    ['Q1 对应的程序与 D1 数据映射一起进入执行环节。', 'The program for Q1 and the D1 data mapping enter execution together.'],
    queryTrack(['codegen', 'solver'], 'program', ['Q1 · 求解程序', 'Q1 · Solver program'], {window: [0, .75]}), dataTrack(['codegen', 'solver'], 'records', {window: [.2, 1]})),
  cycleStep('runtime-read-and-solve', 5, 3000, ['读取完整数据并求解', 'Read complete data and solve'],
    ['程序读取 D1 的完整三份 CSV，构造模型并调用 Gurobi。', 'The program reads all three complete CSVs in D1, builds the model, and calls Gurobi.'],
    queryTrack('solver', 'program', ['Q1 · 求解程序', 'Q1 · Solver program']), dataTrack('solver', 'runtime'), {
      requests: [requestTrack('data', ['csv', 'solver'], ['读取完整 CSV', 'Read complete CSVs'], {role: 'runtime-read', window: [0, .45]})],
      transformations: [{node: 'solver', kind: 'solver-result', label: text('返回求解状态、目标与变量', 'Return solver status, objective, and variables')}],
    }),
  cycleStep('result-collected', 6, 4200, ['汇集同一任务的结果', 'Collect the result for the same task'],
    ['求解输出与模型、程序汇合；保留 Q1 的任务上下文和 D1 的数据来源。', 'Solver output joins the formulation and program, retaining Q1 task context and D1 data provenance.'],
    queryTrack(['solver', 'solution'], 'result', ['Q1 · 任务结果', 'Q1 · Task result'], {window: [0, .35]}), dataTrack('solver', 'runtime'), {
      activeEdges: ['model--solution', 'codegen--solution'],
      transformations: [{node: 'solution', kind: 'result', label: text('模型 · 程序 · 求解结果', 'Formulation · program · solver result')}],
    }),
];
export const TEACHING_TIME_SCALE = 1.65;
for (const step of CYCLE_STEPS) step.durationMs = Math.round(step.durationMs * TEACHING_TIME_SCALE);
export const TEACHING_CYCLE = {
  id: 'tp-demo-cycle', exampleId: JOURNEY_EXAMPLE.id, route: 'tailored',
  durationMs: CYCLE_STEPS.reduce((sum, step) => sum + step.durationMs, 0),
  steps: CYCLE_STEPS,
};

const unit = value => Math.max(0, Math.min(1, value));
function sampleTrack(track, progress) {
  if (!track) return null;
  const path = track.path || [track.at], window = track.window || [0, 1];
  const localProgress = unit((progress - window[0]) / (window[1] - window[0] || 1));
  const before = progress < window[0], after = progress >= window[1];
  return {...track, path, window, localProgress, active: !before && !after, before, after,
    at: before || localProgress === 0 ? path[0] : after || localProgress === 1 ? path.at(-1) : null};
}
/** Locate the independent teaching phase without reading scroll or scene state. */
export function sampleTeachingCycle(elapsedMs = 0) {
  const supplied = Number(elapsedMs), elapsed = Number.isFinite(supplied) ? Math.max(0, supplied) : 0;
  const timeMs = elapsed % TEACHING_CYCLE.durationMs;
  let startMs = 0, index = 0;
  while (index < CYCLE_STEPS.length - 1 && timeMs >= startMs + CYCLE_STEPS[index].durationMs) {
    startMs += CYCLE_STEPS[index].durationMs; index++;
  }
  const step = CYCLE_STEPS[index], localProgress = (timeMs - startMs) / step.durationMs;
  return {step, index, total: CYCLE_STEPS.length, stage: step.stage,
    stepId: step.id, label: step.label, description: step.description,
    elapsedMs: elapsed, timeMs, startMs, durationMs: TEACHING_CYCLE.durationMs,
    localProgress, progress: timeMs / TEACHING_CYCLE.durationMs,
    query: sampleTrack(step.query, localProgress), data: sampleTrack(step.data, localProgress),
    reference: sampleTrack(step.reference, localProgress),
    requests: step.requests.map(track => sampleTrack(track, localProgress)).filter(track => track.active),
    activeEdges: step.activeEdges, transformations: step.transformations, context: step.context,
    input: step.input, output: step.output,
  };
}

/** Two phase-shifted walkthroughs of the same recorded teaching input. */
export const TEACHING_STREAMS = Object.freeze([
  Object.freeze({
    streamId: 'primary', taskIndex: 1, phaseOffset: 0, offsetMs: 0,
    exampleId: JOURNEY_EXAMPLE.id, label: text('教学流 1', 'Teaching stream 1'),
    marks: Object.freeze({query: 'Q1', data: 'D1', reference: 'R1'}),
    ids: Object.freeze({query: QUERY_ID, data: DATA_ID, reference: REFERENCE_ID}),
  }),
  Object.freeze({
    streamId: 'secondary', taskIndex: 2, phaseOffset: .45,
    offsetMs: TEACHING_CYCLE.durationMs * .45,
    exampleId: JOURNEY_EXAMPLE.id, label: text('教学流 2', 'Teaching stream 2'),
    marks: Object.freeze({query: 'Q2', data: 'D2', reference: 'R2'}),
    ids: Object.freeze({query: `${QUERY_ID}-secondary`, data: `${DATA_ID}-secondary`, reference: `${REFERENCE_ID}-secondary`}),
  }),
]);

function labelTeachingInstance(value, stream) {
  if (typeof value === 'string') {
    const id = Object.entries(TEACHING_STREAMS[0].ids).find(([, original]) => original === value);
    if (id) return stream.ids[id[0]];
    return value.replace(/\bQ1\b/g, stream.marks.query).replace(/\bD1\b/g, stream.marks.data)
      .replace(/\bR1?\b/g, stream.marks.reference);
  }
  if (Array.isArray(value)) return value.map(item => labelTeachingInstance(item, stream));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, labelTeachingInstance(item, stream)]),
  );
  return value;
}

export function sampleTeachingFlows(elapsedMs = 0) {
  const supplied = Number(elapsedMs), elapsed = Number.isFinite(supplied) ? Math.max(0, supplied) : 0;
  return TEACHING_STREAMS.map(stream => {
    const sampled = sampleTeachingCycle(elapsed + stream.offsetMs);
    const frame = stream.taskIndex === 1 ? sampled : labelTeachingInstance(sampled, stream);
    return {...frame, streamId: stream.streamId, taskIndex: stream.taskIndex,
      exampleId: stream.exampleId, globalElapsedMs: elapsed, offsetMs: stream.offsetMs};
  });
}

export function activeEdges(route = 'tailored') {
  const selected = route === 'agnostic' ? 'agnostic' : 'tailored';
  return EDGES.filter(e => !e.route || e.route === selected);
}
export function visibleNodes(route = 'tailored', path = []) {
  // The physical framework stays intact; selection and camera zoom carry focus.
  return [...NODES];
}
export function nodePath(id) {
  const actual = NODE_BY_ID.has(id) ? id : NODE_ALIASES[id];
  return actual ? [actual] : [];
}
export function stageExpansion(stage = 0) { return []; }

const STAGE_NODE = {
  input: 'query', inputs: 'query', query: 'query',
  classify: 'classification', classification: 'classification',
  workflow: 'workflow', 'workflow-generation': 'workflow',
  retrieval: 'references', retriever: 'references',
  data: 'csvqa', 'data-extraction': 'csvqa', 'data-retrieval': 'csvqa', csvqa: 'csvqa',
  model: 'model', modeling: 'model', 'model-generation': 'model', formulation: 'model',
  code: 'codegen', codegen: 'codegen', 'code-generation': 'codegen',
  execution: 'solver', execute: 'solver', python: 'solver', solve: 'solver', solver: 'solver',
  output: 'solution', outputs: 'solution', result: 'solution', solution: 'solution', completed: 'solution',
};
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
export function routeFromRunValue(value) {
  const name = normalized(value);
  if (['agnostic', 'type-agnostic', 'others', 'other', 'mixture', 'mixed'].includes(name)) return 'agnostic';
  if (['tailored', 'type-tailored', 'nrm', 'ra', 'tp', 'flp', 'uflp', 'ap'].includes(name)) return 'tailored';
  return null;
}

/** Map real SSE records onto the same fixed graph, including inline tool owners. */
export function resolveRunEvent(event, previous = {}) {
  if (!event || typeof event !== 'object') return null;
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
  const phase = normalized(event.stage || event.phase || event.type);
  const type = normalized(event.type || event.status || 'started');
  const explicitStatus = normalized(event.status);
  let status = 'running';
  if (['error', 'failed', 'failure', 'timeout', 'timed-out'].includes(type) || ['error', 'failed', 'failure', 'timeout'].includes(explicitStatus)) status = 'failed';
  else if (type === 'cancelled' || explicitStatus === 'cancelled') status = 'cancelled';
  else if (['cancellation-requested', 'cancelling'].includes(type) || explicitStatus === 'cancelling') status = 'cancelling';
  else if (type === 'queued' || explicitStatus === 'queued') status = 'queued';
  else if (['completed', 'finished', 'done'].includes(type) || ['completed', 'done'].includes(explicitStatus)) status = 'completed';
  else if (type === 'tool' && normalized(payload.status) === 'completed') status = 'completed';
  const route = routeFromRunValue(payload.mode) || routeFromRunValue(event.mode)
    || routeFromRunValue(payload.route) || routeFromRunValue(event.route)
    || routeFromRunValue(result.workflow?.mode) || routeFromRunValue(result.workflow?.route)
    || routeFromRunValue(result.classification?.route) || routeFromRunValue(payload.label)
    || previous.route || null;
  const explicitNode = event.nodeId || event.node_id;
  let nodeId = NODE_BY_ID.has(explicitNode) ? explicitNode : NODE_ALIASES[explicitNode] || STAGE_NODE[phase];
  if (type === 'tool') {
    const tool = normalized(payload.name);
    if (tool === 'fileqa') nodeId = 'classification';
    else if (tool === 'csvqa') nodeId = 'csvqa';
    else if (tool === 'retriever') nodeId = 'references';
    else if (['code-repair', 'code-generation', 'codegen'].includes(tool)) nodeId = 'codegen';
  }
  if (phase === 'run') {
    if (status === 'completed') nodeId = 'solution';
    else if (['queued', 'running'].includes(status)) nodeId = 'query';
    else nodeId = previous.nodeId || 'query';
  }
  if (!nodeId && type === 'artifact') nodeId = ({formulation: 'model', code: 'codegen', result: 'solution'})[payload.kind];
  if (!nodeId || !NODE_BY_ID.has(nodeId)) return null;
  let stage = NODE_BY_ID.get(nodeId).stage;
  if (nodeId === 'references') {
    // The archive is shared by classification, workflow, and code generation;
    // selecting it must retain the requesting phase rather than restart it.
    const owner = normalized(payload.owner || payload.agent || payload.caller || event.owner || phase);
    const ownerId = STAGE_NODE[owner] || NODE_ALIASES[owner];
    if (ownerId && ownerId !== 'references') stage = NODE_BY_ID.get(ownerId).stage;
    else if (Number.isInteger(previous.stage) && previous.stage >= 0 && previous.stage < STAGES.length) stage = previous.stage;
  }
  return {nodeId, stage, status, route};
}

# 研究数据与实验来源 / Research data and sources

本页说明网站采用的实验集、指标与来源。公开结果快照日期为 2026-11-02，图表数值统一保存在 [research.json](research.json)。

This document describes the datasets, metrics, and sources used by the website. The public-result snapshot is dated 2026-11-02. Chart values are maintained in [research.json](research.json).

[论文 / Paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5329027) · [官方仓库 / Repository](https://github.com/CoraLiang01/lean-llm-opt)

## 实验范围 / Evaluation scope

| 实验 / Study | 数据与设置 / Data and settings | 结果来源 / Results |
| --- | --- | --- |
| 大规模基准 / Large-scale benchmark | Large-scale-or，101 个问题；自动分类工作流 / 101 problems with automatic classification | [GPT-4.1](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/4.1-Full-1018-99/101/automatic/summary.csv) · [gpt-oss-20B](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/final_101_oss20b/automatic/summary.csv) |
| 小规模基准 / Small-scale benchmarks | NL4OPT、MAMO Easy、IndustryOR；按测试集分别报告 / Results reported per dataset | [公开结果 / Published results](https://github.com/CoraLiang01/lean-llm-opt/tree/main/Results/Benchmark_test) |
| 组件设置 / Component configurations | 101 个原始问题上的 RAG Only 与 Few-shot Only 独立运行 / Separate RAG Only and Few-shot Only runs on the 101 original problems | [RAG Only](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/rag_only_1018-4.1/automatic/summary.csv) · [Few-shot Only](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/few_shot_only_1018-4.1/automatic/summary.csv) |
| 参数扰动 / Parameter perturbations | 101 个问题 × 3 个数据种子，共 303 个数值变体 / 101 problems × 3 data seeds, producing 303 variants | [总体 / Overall](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/perturbation_303/summary.csv) · [按种子 / By seed](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/perturbation_303/accuracy_by_seed.csv) · [按类型 / By type](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/perturbation_303/accuracy_by_problem_type.csv) |
| 结构修复 / Structural repair | 同一组 36 个结构变体的修复前后比较 / Paired before-and-after evaluation on 36 structural variants | [GPT-4.1](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/variants_fallback_gpt41/summary.csv) · [gpt-oss-20B](https://github.com/CoraLiang01/lean-llm-opt/blob/main/outputs/variants_fallback_gpt_oss_20b/summary.csv) |
| 航空收益管理 / Airline revenue management | 模拟航空网络中的容量分配与网络规划；比例来自研究稿件 / Simulated capacity-allocation and network-planning cases, with rates reported in the manuscript | [论文 / Paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5329027) · [案例数据与说明 / Case data and documentation](https://github.com/CoraLiang01/lean-llm-opt/tree/main/Test_Dataset/Air_NRM) |

每项实验的模型级来源链接见图表下方及 `research.json` 的 `sources` 字段。组件设置与完整框架采用各自的运行配置；gpt-oss 的两种组件设置使用不同服务版本。

Model-specific source links appear below each chart and in the `sources` fields of `research.json`. Component configurations and the full framework use separate runs; the two gpt-oss component settings use different serving versions.

## 指标与统计口径 / Metrics and reporting

- **目标值匹配率 / Objective match rate**：生成程序取得最优解，且目标值与参考最优值在相对和绝对容差 10⁻⁴ 内一致的样本比例。运行失败计入总样本数。/ The fraction of instances for which the generated program reaches optimality and matches the reference optimum within relative and absolute tolerances of 10⁻⁴. Failed runs count toward the total.
- **数学表述等价性 / Formulation equivalence (EM)**：评估生成模型与参考模型的数学表述是否等价。/ Evaluates the mathematical equivalence of generated and reference formulations.
- **参数扰动分组 / Perturbation groups**：总体、种子和类型视图汇总同一组 303 个变体。种子 17、42、73 用于生成数据中的参数变化。/ Overall, seed, and type views summarize the same 303 variants. Seeds 17, 42, and 73 generate changes in the data parameters.
- **修复前后统计 / Repair counts**：`before` 与 `after` 记录同一组结构变体的目标值匹配题数；另列修复成功和新增错误数。/ `before` and `after` count objective matches on the same structural variants; corrected cases and new errors are also reported.

### 小规模结果说明 / Small-scale reporting notes

MAMO Easy 包含 642 例，IndustryOR 包含 100 例。NL4OPT 图表沿用稿件报告的 94.7% 与 93.5%：公开逐题文件有 245 条非空问题，汇总比例对应的分母为 246，因此该组仅展示报告比例。其余数据集通过资料入口提供。

MAMO Easy contains 642 cases, and IndustryOR contains 100. The NL4OPT chart retains manuscript-reported rates of 94.7% and 93.5%. Its public per-instance files contain 245 nonempty queries, while the summary rates correspond to a denominator of 246, so this chart reports the published percentages. Other datasets are available through the research resources.

## 运输规划案例 / Transportation case

TP1 包括 18 个配送中心、18 个客户和 324 个连续运输变量。回放提供该次记录的输入、数学模型、Python/Gurobi 程序和运输方案。三维导览介绍框架工作机制。

TP1 contains 18 distribution centers, 18 customers, and 324 continuous shipment variables. The replay provides the recorded inputs, formulation, Python/Gurobi program, and shipping plan. The 3D tour describes the framework’s workflow.

[TP1 原始数据 / Source tables](https://github.com/CoraLiang01/lean-llm-opt/tree/main/Test_Dataset/Large-scale-or/TP_testing/TP1) · [案例导出 / Case export](case.json) · [生成程序 / Generated program](transport-code.py)

交互式 Demo 的每次运行根据用户输入、上传数据和所选模型生成新产物；结果保存在相应的会话版本中。

Each interactive demo run generates new artifacts from the user’s query, uploaded data, and selected model. Results are retained in that session’s run history.

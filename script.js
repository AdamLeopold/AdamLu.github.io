const projects = [
  {
    tag: "Working Paper · Jan 2026 - Present",
    title: "Multi-Agent LLM Framework for Reasoning and Behavioral Benchmark Evaluation",
    description:
      "独立设计 Python 多智能体 LLM 实验框架，比较 self-reflection、debate、reconciliation、role-specialized reasoning 和 chain-of-agents 在 GSM8K、CRT、Linda benchmarks 上的表现。",
    tools: ["Python", "OpenAI/Ollama", "Streamlit", "Excel traces", "119 runs"],
    link: "",
  },
  {
    tag: "Working Paper · Aug 2023 - Present",
    title: "LEAN-LLM-OPT: Lightweight Multi-Agent LLM Framework for Optimization Modeling",
    description:
      "构建面向大规模优化问题的多智能体 LLM 自动建模框架，结合 FAISS RAG、few-shot prompting、CoT 推理和 Gurobi，输出标准 LP、可执行 Python 代码与最优解。",
    tools: ["GPT-4.1", "FAISS", "LangChain", "Gurobi", "95.1% NL4OPT"],
    link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5329027",
  },
  {
    tag: "Research Project · Feb 2024 - Jun 2024",
    title: "Multivariable Deep Learning Model for European Natural Gas Forecasting",
    description:
      "融合经济指数、股市波动、天气、替代能源、供需基本面和地缘政治文本，使用 LSTM、Random Forest、PatchTSMixer 与 Llama3-8B 微调提升 TTF 价格预测能力。",
    tools: ["LSTM", "PatchTSMixer", "Random Forest", "Llama3-8B", "HTML UI"],
    link: "",
  },
  {
    tag: "Industry · 2020",
    title: "iFlyTek Assistant Account Manager Internship",
    description:
      "参与客户服务管理、组织结构与业务管理调研、人员数据库维护、会议纪要与内部流程支持，积累企业协作和产品运营经验。",
    tools: ["Client service", "Operations", "Research", "Documentation"],
    link: "",
  },
];

const projectGrid = document.querySelector("#project-grid");

projectGrid.innerHTML = projects
  .map(
    (project) => `
      <article class="project-card">
        <div class="project-card-inner">
          <span class="project-tag">${project.tag}</span>
          <h3>${project.title}</h3>
          <p>${project.description}</p>
          <ul>
            ${project.tools.map((tool) => `<li>${tool}</li>`).join("")}
          </ul>
          ${
            project.link
              ? `<a class="project-link" href="${project.link}" target="_blank" rel="noreferrer">查看论文链接</a>`
              : ""
          }
        </div>
      </article>
    `,
  )
  .join("");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.animate(
          [
            { opacity: 0, transform: "translateY(18px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
        );
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 },
);

document.querySelectorAll(".project-card, .stack-grid article, .method-panel li").forEach((node) => {
  node.style.opacity = "0";
  observer.observe(node);
});

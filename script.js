const work = [
  {
    period: "2026 - Present",
    title: "Multi-Agent LLM Framework for Reasoning and Behavioral Benchmark Evaluation",
    description:
      "A Python framework for comparing self-reflection, debate, reconciliation, role-specialized reasoning, and chain-of-agents on GSM8K, CRT, and Linda-style tasks. It includes model wrappers, prompt templates, answer parsers, trace export, and a Streamlit interface for running batches.",
    tags: ["multi-agent LLM", "reasoning evaluation", "Streamlit", "119 runs"],
  },
  {
    period: "2024",
    title: "European Natural Gas Forecasting",
    description:
      "A forecasting project for TTF natural gas prices using market fundamentals, weather, exchange rates, alternative energy variables, and political news. The model comparison included LSTM, Random Forest, PatchTSMixer, and a domain-adapted Llama3-8B sentiment component.",
    tags: ["time series", "energy markets", "PatchTSMixer", "Llama3-8B"],
  },
  {
    period: "2020",
    title: "iFlyTek Internship",
    description:
      "Assistant Account Manager intern. Worked on customer service support, organization research, meeting records, personnel data maintenance, and internal process documentation.",
    tags: ["operations", "client service", "documentation"],
  },
];

const container = document.querySelector("#work-list");

container.innerHTML = work
  .map(
    (item) => `
      <article class="work-item">
        <time>${item.period}</time>
        <div>
          <h3>${item.title}</h3>
          <p>${item.description}</p>
          <ul class="tag-list">
            ${item.tags.map((tag) => `<li>${tag}</li>`).join("")}
          </ul>
        </div>
      </article>
    `,
  )
  .join("");

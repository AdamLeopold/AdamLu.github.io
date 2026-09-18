const content = window.HOMEPAGE_CONTENT;
const supportedLanguages = new Set(["en", "zh"]);

function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem("homepage-language");
    return supportedLanguages.has(stored) ? stored : "en";
  } catch (_error) {
    return "en";
  }
}

let currentLanguage = readStoredLanguage();

function localize(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return value[currentLanguage] || value.en || value.zh || "";
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attributesForLink(url) {
  return url.startsWith("mailto:") ? "" : ' target="_blank" rel="noreferrer"';
}

function renderLink(link, className = "text-link") {
  return `<a class="${className}" href="${escapeHTML(link.url)}"${attributesForLink(link.url)}>${escapeHTML(localize(link.label))}</a>`;
}

function renderPeople(people = []) {
  return people
    .map((person) => {
      const name = person.self ? `<strong>${escapeHTML(person.name)}</strong>` : escapeHTML(person.name);
      if (!person.url) return `<span>${name}</span>`;
      return `<a href="${escapeHTML(person.url)}" target="_blank" rel="noreferrer">${name}</a>`;
    })
    .join(", ");
}

function renderStatus(status, role, period) {
  const values = [status, role, period].map(localize).filter(Boolean);
  return `<div class="entry-meta">${values.map((value) => `<span>${escapeHTML(value)}</span>`).join("")}</div>`;
}

function renderParagraphs(paragraphs = []) {
  return paragraphs.map((paragraph) => `<p>${escapeHTML(localize(paragraph))}</p>`).join("");
}

function renderFigure(image) {
  if (!image) return "";
  return `
    <figure class="research-figure">
      <a class="image-frame" href="${escapeHTML(image.src)}" target="_blank" rel="noreferrer" aria-label="${escapeHTML(localize(image.caption))}">
        <img src="${escapeHTML(image.src)}" alt="${escapeHTML(localize(image.alt))}" width="${image.width}" height="${image.height}" loading="lazy" />
      </a>
      <figcaption>${escapeHTML(localize(image.caption))}</figcaption>
    </figure>
  `;
}

function renderSectionHeading(key, containerId) {
  const heading = content.headings[key];
  document.querySelector(`#${containerId}`).innerHTML = `
    <p class="eyebrow">${escapeHTML(localize(heading.eyebrow))}</p>
    <h2 id="${key}-title">${escapeHTML(localize(heading.title))}</h2>
  `;
}

function renderProfile() {
  const profile = content.profile;
  const affiliationLinks = profile.affiliations
    .map(
      (affiliation) =>
        `<a href="${escapeHTML(affiliation.url)}" target="_blank" rel="noreferrer" title="${escapeHTML(localize(affiliation.label))}">${escapeHTML(localize(affiliation.shortLabel))}</a>`,
    )
    .join(" <span aria-hidden=\"true\">/</span> ");

  document.querySelector("#profile").innerHTML = `
    <div class="profile-main">
      <img class="portrait" src="${escapeHTML(profile.photo.src)}" alt="${escapeHTML(localize(profile.photo.alt))}" />
      <div class="identity">
        <p class="secondary-name">${escapeHTML(localize(profile.secondaryName))}</p>
        <h1>${escapeHTML(localize(profile.name))}</h1>
        <p class="profile-role">${escapeHTML(localize(profile.role))}</p>
        <p class="affiliations">${affiliationLinks}</p>
      </div>
    </div>
    <div class="profile-links">
      ${profile.links.map((link) => renderLink(link, "profile-link")).join("")}
    </div>
  `;
}

function renderNavigation() {
  document.querySelector("#site-nav").innerHTML = content.navigation
    .map((item) => `<a href="${escapeHTML(item.href)}">${escapeHTML(localize(item.label))}</a>`)
    .join("");
}

function renderAbout() {
  const about = content.about;
  document.querySelector("#about-content").innerHTML = `
    <p class="eyebrow">${escapeHTML(localize(about.eyebrow))}</p>
    <h2 id="about-title" class="intro-title">${escapeHTML(localize(about.title))}</h2>
    <div class="intro-copy">${renderParagraphs(about.paragraphs)}</div>
    <dl class="about-facts">
      <div>
        <dt>${escapeHTML(localize(about.advisorsLabel))}</dt>
        <dd>${renderPeople(about.advisors)}</dd>
      </div>
      <div>
        <dt>${escapeHTML(localize(about.focusLabel))}</dt>
        <dd>${about.focus.map((item) => escapeHTML(localize(item))).join(" / ")}</dd>
      </div>
    </dl>
  `;

  const recruitment = content.recruitment;
  document.querySelector("#recruitment").innerHTML = `
    <aside class="recruitment-note" aria-label="${escapeHTML(localize(recruitment.label))}">
      <div>
        <p class="recruitment-label">${escapeHTML(localize(recruitment.label))}</p>
        <p>${escapeHTML(localize(recruitment.text))}</p>
      </div>
      <a href="${escapeHTML(recruitment.url)}">${escapeHTML(localize(recruitment.action))}</a>
    </aside>
  `;
}

function renderNews() {
  document.querySelector("#news-list").innerHTML = content.updates
    .map(
      (item) => `
        <article class="news-item">
          <time>${escapeHTML(item.date)}</time>
          <div>
            <h3>${escapeHTML(localize(item.title))}</h3>
            <p>${escapeHTML(localize(item.text))}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderFeaturedProject() {
  const project = content.featuredProject;
  document.querySelector("#featured-project").innerHTML = `
    <article class="featured-project">
      <header class="project-header">
        <div>
          <p class="project-category">${escapeHTML(localize(project.category))}</p>
          <h3>${escapeHTML(project.title)}</h3>
          <p class="paper-title">${escapeHTML(localize(project.fullTitle))}</p>
        </div>
        ${renderStatus(project.status, project.role, project.period)}
      </header>
      <div class="project-prose">${renderParagraphs(project.paragraphs)}</div>
      <div class="people-line">
        <span>${escapeHTML(localize(project.authorsLabel))}</span>
        <p>${renderPeople(project.people)}</p>
      </div>
      <div class="resource-links">${project.links.map((link) => renderLink(link, "resource-link")).join("")}</div>
      ${renderFigure(project.image)}
    </article>
  `;
}

function renderResearch() {
  document.querySelector("#research-list").innerHTML = content.projects
    .map(
      (project) => `
        <article class="research-entry" id="${escapeHTML(project.id)}">
          <header class="project-header">
            <div>
              <p class="project-category">${escapeHTML(localize(project.category))}</p>
              <h3>${escapeHTML(project.title)}</h3>
            </div>
            ${renderStatus(project.status, project.role, project.period)}
          </header>
          <div class="project-prose">${renderParagraphs(project.paragraphs)}</div>
          ${
            project.people
              ? `<div class="people-line"><span>${escapeHTML(localize(project.peopleLabel))}</span><p>${renderPeople(project.people)}</p></div>`
              : ""
          }
          ${renderFigure(project.image)}
        </article>
      `,
    )
    .join("");
}

function renderPapers() {
  document.querySelector("#paper-list").innerHTML = content.papers
    .map(
      (paper) => `
        <article class="paper-entry">
          <div class="paper-meta-column">
            <span>${escapeHTML(localize(paper.period))}</span>
            <span>${escapeHTML(localize(paper.role))}</span>
          </div>
          <div>
            <p class="project-category">${escapeHTML(localize(paper.category))}</p>
            <h3>${escapeHTML(paper.title)}</h3>
            <p class="paper-status">${escapeHTML(localize(paper.status))}</p>
            <p>${escapeHTML(localize(paper.description))}</p>
            ${
              paper.people
                ? `<div class="people-line compact"><span>${escapeHTML(localize(paper.peopleLabel))}</span><p>${renderPeople(paper.people)}</p></div>`
                : ""
            }
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPlatforms() {
  document.querySelector("#platform-list").innerHTML = content.platforms
    .map(
      (platform) => `
        <article class="platform-entry">
          <div>
            <h3>${escapeHTML(platform.title)}</h3>
            ${renderStatus(platform.status, platform.role)}
          </div>
          <p>${escapeHTML(localize(platform.description))}</p>
        </article>
      `,
    )
    .join("");
}

function renderEarlierWork() {
  document.querySelector("#earlier-list").innerHTML = content.earlierWork
    .map(
      (item) => `
        <article class="compact-entry">
          <time>${escapeHTML(localize(item.period))}</time>
          <div>
            <h3>${escapeHTML(localize(item.title))}</h3>
            <p>${escapeHTML(localize(item.description))}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderBackground() {
  document.querySelector("#background-list").innerHTML = content.background
    .map(
      (item) => `
        <article class="timeline-entry">
          <time>${escapeHTML(localize(item.period))}</time>
          <div>
            <h3>${escapeHTML(localize(item.institution))}</h3>
            <p>${escapeHTML(localize(item.detail))}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAwards() {
  document.querySelector("#award-list").innerHTML = content.awards
    .map(
      (award) => `
        <article>
          <h3>${escapeHTML(localize(award.title))}</h3>
          <p>${escapeHTML(localize(award.text))}</p>
        </article>
      `,
    )
    .join("");
}

function renderFooter() {
  const contact = content.contact;
  document.querySelector("#contact-content").innerHTML = `
    <div>
      <p class="eyebrow">${escapeHTML(localize(contact.title))}</p>
      <p>${escapeHTML(localize(contact.text))} <a href="mailto:${escapeHTML(contact.email)}">${escapeHTML(contact.email)}</a>.</p>
    </div>
    <p class="last-updated">${escapeHTML(localize(content.site.lastUpdated))}</p>
  `;
}

function updateDocumentLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = localize(content.site.title);
  document.querySelector('meta[name="description"]').setAttribute("content", localize(content.site.description));
  document.querySelector(".skip-link").textContent = currentLanguage === "zh" ? "跳至主要内容" : "Skip to content";
  document.querySelector(".profile-rail").setAttribute("aria-label", currentLanguage === "zh" ? "个人资料与导航" : "Profile and navigation");
  document.querySelector("#site-nav").setAttribute("aria-label", currentLanguage === "zh" ? "主要导航" : "Primary navigation");

  document.querySelectorAll("[data-language]").forEach((button) => {
    const selected = button.dataset.language === currentLanguage;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-active", selected);
  });
}

function renderPage() {
  updateDocumentLanguage();
  renderProfile();
  renderNavigation();
  renderAbout();
  renderSectionHeading("news", "news-heading");
  renderNews();
  renderSectionHeading("featured", "featured-heading");
  renderFeaturedProject();
  renderSectionHeading("research", "research-heading");
  renderResearch();
  renderSectionHeading("papers", "papers-heading");
  renderPapers();
  renderSectionHeading("platforms", "platforms-heading");
  renderPlatforms();
  renderSectionHeading("earlier", "earlier-heading");
  renderEarlierWork();
  renderSectionHeading("background", "background-heading");
  renderBackground();
  renderSectionHeading("awards", "awards-heading");
  renderAwards();
  renderFooter();
  observeSections();
}

let sectionObserver;

function observeSections() {
  if (!("IntersectionObserver" in window)) return;
  if (sectionObserver) sectionObserver.disconnect();

  const navLinks = new Map(
    [...document.querySelectorAll("#site-nav a")].map((link) => [link.getAttribute("href").slice(1), link]),
  );

  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link, id) => {
        if (id === visible.target.id) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.2, 0.5] },
  );

  navLinks.forEach((_link, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });
}

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    const requestedLanguage = button.dataset.language;
    if (!supportedLanguages.has(requestedLanguage) || requestedLanguage === currentLanguage) return;
    currentLanguage = requestedLanguage;
    try {
      window.localStorage.setItem("homepage-language", currentLanguage);
    } catch (_error) {
      // Language switching still works when storage is unavailable.
    }
    renderPage();
  });
});

renderPage();

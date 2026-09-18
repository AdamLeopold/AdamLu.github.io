const content = window.HOMEPAGE_CONTENT;
const supportedLanguages = new Set(["en", "zh"]);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const canReveal = "IntersectionObserver" in window && !reducedMotionQuery.matches;

if (canReveal) document.documentElement.classList.add("motion-ready");

function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem("homepage-language");
    return supportedLanguages.has(stored) ? stored : "en";
  } catch (_error) {
    return "en";
  }
}

let currentLanguage = readStoredLanguage();
let sectionObserver;
let revealObserver;
let lastImageTrigger = null;

const imageViewer = document.querySelector("#image-viewer");
const imageViewerImage = document.querySelector("#image-viewer-image");
const imageViewerCaption = document.querySelector("#image-viewer-caption");
const imageViewerClose = document.querySelector(".image-viewer-close");

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

function renderFigure(image, eager = false) {
  if (!image) return "";
  const caption = localize(image.caption);
  const openLabel = currentLanguage === "zh" ? `查看大图：${caption}` : `Open larger image: ${caption}`;

  return `
    <figure class="research-figure">
      <button
        class="image-frame"
        type="button"
        data-lightbox
        data-image-src="${escapeHTML(image.src)}"
        data-image-alt="${escapeHTML(localize(image.alt))}"
        data-image-caption="${escapeHTML(caption)}"
        data-image-width="${escapeHTML(image.width)}"
        data-image-height="${escapeHTML(image.height)}"
        aria-haspopup="dialog"
        aria-controls="image-viewer"
        aria-label="${escapeHTML(openLabel)}"
      >
        <img
          src="${escapeHTML(image.src)}"
          alt="${escapeHTML(localize(image.alt))}"
          width="${escapeHTML(image.width)}"
          height="${escapeHTML(image.height)}"
          loading="${eager ? "eager" : "lazy"}"
        />
      </button>
      <figcaption>${escapeHTML(caption)}</figcaption>
    </figure>
  `;
}

function renderSectionHeading(key, containerId) {
  const heading = content.headings[key];
  const container = document.querySelector(`#${containerId}`);
  container.setAttribute("data-reveal", "");
  container.innerHTML = `
    <h2 id="${key}-title">${escapeHTML(localize(heading.title))}</h2>
    <p class="section-note">${escapeHTML(localize(heading.eyebrow))}</p>
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
      <img
        class="portrait"
        src="${escapeHTML(profile.photo.src)}"
        alt="${escapeHTML(localize(profile.photo.alt))}"
        width="1200"
        height="1600"
      />
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
  const aboutContent = document.querySelector("#about-content");
  aboutContent.setAttribute("data-reveal", "");
  aboutContent.innerHTML = `
    <h2 id="about-title" class="intro-title">${escapeHTML(localize(about.title))}</h2>
    <div class="intro-copy">${renderParagraphs(about.paragraphs.slice(0, 1))}</div>
    <p class="advisors-line">
      <strong>${escapeHTML(localize(about.advisorsLabel))}:</strong>
      ${renderPeople(about.advisors)}
    </p>
    <div class="research-focus">
      <p>${escapeHTML(localize(about.focusLabel))}:</p>
      <ul>
        ${about.focus.map((item) => `<li>${escapeHTML(localize(item))}</li>`).join("")}
      </ul>
    </div>
  `;

  const recruitment = content.recruitment;
  const recruitmentContainer = document.querySelector("#recruitment");
  recruitmentContainer.setAttribute("data-reveal", "");
  recruitmentContainer.innerHTML = `
    <aside class="recruitment-note" aria-label="${escapeHTML(localize(recruitment.label))}">
      <p>
        <strong>${escapeHTML(localize(recruitment.label))}:</strong>
        ${escapeHTML(localize(recruitment.text))}
        <a href="${escapeHTML(recruitment.url)}">${escapeHTML(localize(recruitment.action))}</a>.
      </p>
    </aside>
  `;
}

function renderNews() {
  document.querySelector("#news-list").innerHTML = content.updates
    .map(
      (item, index) => `
        <article class="news-item" data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
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

function renderSelectedResearch() {
  const projects = [content.featuredProject, ...content.projects];

  document.querySelector("#research-list").innerHTML = projects
    .map((project, index) => {
      const isPrimary = index === 0;
      const articleId = isPrimary ? "featured" : project.id;
      const marker = isPrimary
        ? `<span class="primary-marker">${escapeHTML(localize(content.headings.featured.eyebrow))}</span>`
        : "";
      const titleDetail = project.fullTitle
        ? `<p class="paper-title">${escapeHTML(localize(project.fullTitle))}</p>`
        : "";
      const people = project.people
        ? `<div class="people-line"><span>${escapeHTML(localize(project.authorsLabel || project.peopleLabel))}</span><p>${renderPeople(project.people)}</p></div>`
        : "";
      const links = project.links?.length
        ? `<div class="resource-links">${project.links.map((link) => renderLink(link, "resource-link")).join("")}</div>`
        : "";

      return `
        <article
          class="research-entry${isPrimary ? " is-primary" : ""}"
          id="${escapeHTML(articleId)}"
          data-reveal
          style="--reveal-delay: ${Math.min(index * 40, 120)}ms"
        >
          ${isPrimary ? `<span class="anchor-alias" id="${escapeHTML(project.id)}" aria-hidden="true"></span>` : ""}
          <div class="research-copy">
            <div class="project-kicker">
              <p class="project-category">${escapeHTML(localize(project.category))}</p>
              ${marker}
            </div>
            <h3>${escapeHTML(project.title)}</h3>
            ${titleDetail}
            ${renderStatus(project.status, project.role, project.period)}
            <div class="project-prose">${renderParagraphs(project.paragraphs)}</div>
            ${people}
            ${links}
          </div>
          ${renderFigure(project.image, isPrimary)}
        </article>
      `;
    })
    .join("");
}

function renderPapers() {
  document.querySelector("#paper-list").innerHTML = content.papers
    .map(
      (paper, index) => `
        <article class="paper-entry" data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
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
      (platform, index) => `
        <article class="platform-entry" data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
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
      (item, index) => `
        <article class="compact-entry" data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
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
      (item, index) => `
        <article class="timeline-entry" data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
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
      (award, index) => `
        <article data-reveal style="--reveal-delay: ${Math.min(index * 40, 120)}ms">
          <h3>${escapeHTML(localize(award.title))}</h3>
          <p>${escapeHTML(localize(award.text))}</p>
        </article>
      `,
    )
    .join("");
}

function renderFooter() {
  const contact = content.contact;
  const footer = document.querySelector("#contact-content");
  footer.setAttribute("data-reveal", "");
  footer.innerHTML = `
    <div>
      <p class="footer-title">${escapeHTML(localize(contact.title))}</p>
      <p>${escapeHTML(localize(contact.text))} <a href="mailto:${escapeHTML(contact.email)}">${escapeHTML(contact.email)}</a>.</p>
    </div>
    <p class="last-updated">${escapeHTML(localize(content.site.lastUpdated))}</p>
  `;
}

function updateDocumentLanguage() {
  const profile = content.profile;
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = localize(content.site.title);
  document.querySelector('meta[name="description"]').setAttribute("content", localize(content.site.description));
  document.querySelector(".skip-link").textContent = currentLanguage === "zh" ? "跳至主要内容" : "Skip to content";
  document.querySelector(".site-mark").textContent = currentLanguage === "zh" ? "卢宇航" : "Yuhang Lu";
  document.querySelector(".site-mark").setAttribute("aria-label", `${localize(profile.name)}, ${currentLanguage === "zh" ? "主页" : "home"}`);
  document.querySelector(".profile-rail").setAttribute("aria-label", currentLanguage === "zh" ? "个人资料" : "Profile");
  document.querySelector("#site-nav").setAttribute("aria-label", currentLanguage === "zh" ? "主要导航" : "Primary navigation");
  document.querySelector(".language-switch").setAttribute("aria-label", currentLanguage === "zh" ? "语言" : "Language");
  imageViewerClose.setAttribute("aria-label", currentLanguage === "zh" ? "关闭图片" : "Close image");

  document.querySelectorAll("[data-language]").forEach((button) => {
    const selected = button.dataset.language === currentLanguage;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-active", selected);
  });
}

function setupRevealAnimations(animateReveal) {
  if (revealObserver) revealObserver.disconnect();
  const targets = [...document.querySelectorAll("[data-reveal]")];

  if (!canReveal || !animateReveal) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  targets.forEach((target) => revealObserver.observe(target));
}

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
    { rootMargin: "-20% 0px -68% 0px", threshold: [0, 0.15, 0.4] },
  );

  navLinks.forEach((_link, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });
}

function renderPage({ animateReveal = false } = {}) {
  updateDocumentLanguage();
  renderProfile();
  renderNavigation();
  renderAbout();
  renderSectionHeading("news", "news-heading");
  renderNews();
  renderSectionHeading("research", "research-heading");
  renderSelectedResearch();
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
  setupRevealAnimations(animateReveal);
  observeSections();
}

function openImageViewer(trigger) {
  const { imageSrc, imageAlt, imageCaption, imageWidth, imageHeight } = trigger.dataset;
  if (typeof imageViewer.showModal !== "function") {
    window.open(imageSrc, "_blank", "noopener,noreferrer");
    return;
  }

  lastImageTrigger = trigger;
  imageViewerImage.src = imageSrc;
  imageViewerImage.alt = imageAlt;
  imageViewerImage.width = Number(imageWidth);
  imageViewerImage.height = Number(imageHeight);
  imageViewerCaption.textContent = imageCaption;
  document.body.classList.add("modal-open");
  imageViewer.showModal();
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-lightbox]");
  if (trigger) openImageViewer(trigger);
});

imageViewerClose.addEventListener("click", () => imageViewer.close());

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer) imageViewer.close();
});

imageViewer.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  imageViewerImage.removeAttribute("src");
  if (lastImageTrigger?.isConnected) lastImageTrigger.focus();
  lastImageTrigger = null;
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    const requestedLanguage = button.dataset.language;
    if (!supportedLanguages.has(requestedLanguage) || requestedLanguage === currentLanguage) return;
    currentLanguage = requestedLanguage;
    try {
      window.localStorage.setItem("homepage-language", currentLanguage);
    } catch (_error) {
      // The switch still works when browser storage is unavailable.
    }

    renderPage({ animateReveal: false });
    if (!reducedMotionQuery.matches) {
      document.querySelector("#main-content").animate([{ opacity: 0.78 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
    }
  });
});

renderPage({ animateReveal: true });

if (window.location.hash) {
  const targetId = decodeURIComponent(window.location.hash.slice(1));
  const target = document.getElementById(targetId);
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

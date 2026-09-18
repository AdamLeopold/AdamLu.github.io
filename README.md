# Yuhang (Adam) Lu - Academic Homepage

Static bilingual academic homepage for GitHub Pages:

- Live site: <https://adamleopold.github.io/AdamLu.github.io/>
- Default language: English
- Chinese language switch with saved browser preference
- No build step or package dependencies

## Content structure

`content.js` is the single source of truth for visible content. It contains the profile, recruitment note, news, featured project, research projects, working papers, platforms, earlier work, education, and awards in English and Chinese.

`script.js` renders that data and handles language switching. `styles.css` contains the responsive layout and visual system. Public images and the existing CV are stored under `assets/`.

Use conservative status labels. Do not publish local drafts, private data, unverified results, inferred collaborators, or inferred submission decisions.

## Local preview

```bash
python3 -m http.server 4173
```

Open <http://127.0.0.1:4173/>. Check both languages and desktop/mobile widths before publishing.

## GitHub Pages deployment

1. Keep GitHub Pages configured to use GitHub Actions.
2. Commit homepage files and push the `main` branch.
3. `.github/workflows/pages.yml` deploys the static site.
4. Confirm the workflow succeeds and the live URL returns HTTP 200.

The existing `weekly-research-homepage-update` automation reviews major research changes every Sunday at 09:00 Singapore time. It leaves the site unchanged when no material, evidence-backed update is available.

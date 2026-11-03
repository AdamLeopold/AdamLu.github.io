import MarkdownIt from '../assets/vendor/markdown-it/markdown-it.esm.min.mjs';
import createDOMPurify from '../assets/vendor/dompurify/purify.es.mjs';
import texmath from '../assets/vendor/texmath/texmath.mjs';

// Markdown-it 15.0.3, DOMPurify 3.4.17, and markdown-it-texmath 1.0.0 are local.
// Parse math before Markdown escaping; typeset only after sanitizing Markdown.
const parser = new MarkdownIt({html: false, linkify: false, typographer: false, breaks: false});
const purifiers = new WeakMap();
const safeProtocols = new Set(['http:', 'https:', 'mailto:']);

function safeLink(value) {
  const cleaned = String(value).trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (!cleaned || cleaned.startsWith('//') || cleaned.startsWith('\\')) return false;
  try {return safeProtocols.has(new URL(cleaned, 'https://markdown.invalid/').protocol);} catch {return false;}
}
parser.validateLink = safeLink;
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);

// Extend the upstream delimiter rules without replacing its Markdown integration.
texmath.rules.brackets.inline[0].rex = /\\\(([\s\S]+?)\\\)/gy;
texmath.rules.brackets.inline.push({
  name: 'math_inline_display', tag: '\\[', rex: /\\\[([\s\S]+?)\\\]/gy,
  displayMode: true, tmpl: '$1',
});
texmath.rules.beg_end.block[0].rex = /(\\begin\{((?:equation|align|alignat|gather|aligned|alignedat|cases)\*?)\}[\s\S]+?\\end\{\2\})/gmy;
texmath.rules.beg_end.inline.push({...texmath.rules.beg_end.block[0], name: 'math_inline_environment', displayMode: true});
for (const rule of [...texmath.rules.dollars.inline, ...texmath.rules.dollars.block]) {
  if (rule.tag === '$$') {
    rule.rex = rule.name === 'math_block_eqno'
      ? /\${2}((?:\\[\s\S]|(?!\$\$)[^\\])+?)\${2}\s*?\(([^)\s]+?)\)/gmy
      : /\${2}((?:\\[\s\S]|(?!\$\$)[^\\])+?)\${2}/gmy;
  }
}
const singleDollar = texmath.rules.dollars.inline.find(rule => rule.tag === '$');
singleDollar.rex = /\$((?:\\[\s\S]|[^$\\])+?)\$/gy;
singleDollar.pre = (text, outerSpace, index) => texmath.$_pre(text, outerSpace, index) && !/[\s$]/.test(text[index + 1] || ' ');
singleDollar.post = (text, outerSpace, index) => texmath.$_post(text, outerSpace, index) && !/\s/.test(text[index - 1] || ' ');
// The upstream block rule consumes the entire closing line. Keep trailing prose
// in a paragraph, where the same delimiter is handled by the inline rule.
const upstreamBlock = texmath.block;
texmath.block = rule => {
  const parse = upstreamBlock(rule);
  return (state, firstLine, lastLine, silent) => {
    const start = state.bMarks[firstLine] + state.tShift[firstLine];
    if (state.src.startsWith(rule.tag, start)) {
      rule.rex.lastIndex = start;const match = rule.rex.exec(state.src);
      if (match) {
        const end = rule.rex.lastIndex, newline = state.src.indexOf('\n', end);
        if (state.src.slice(end, newline < 0 ? state.src.length : newline).trim()) return false;
      }
    }
    return parse(state, firstLine, lastLine, silent);
  };
};
parser.use(texmath, {delimiters: ['dollars', 'brackets', 'beg_end'], engine: {renderToString: () => ''}});

function mathSource(tokens, index, display) {
  const tag = display && tokens[index].block ? 'div' : 'span';
  const value = parser.utils.escapeHtml(tokens[index].content);
  return `<${tag} class="math-source ${display ? 'math-display' : 'math-inline'}" data-math-display="${display ? 'block' : 'inline'}">${value}</${tag}>`;
}
for (const name of ['math_inline', 'math_inline_double', 'math_inline_display', 'math_inline_environment', 'math_block', 'math_block_eqno']) {
  parser.renderer.rules[name] = (tokens, index) => {
    const display = name !== 'math_inline';
    const rendered = mathSource(tokens, index, display);
    if (name !== 'math_block_eqno' || !tokens[index].info) return rendered;
    return `<div class="math-equation">${rendered}<span class="math-equation-number">(${parser.utils.escapeHtml(tokens[index].info)})</span></div>`;
  };
}
for (const name of ['th_open', 'td_open']) {
  parser.renderer.rules[name] = (tokens, index, options, env, renderer) => {
    const token = tokens[index], alignment = token.attrGet('style')?.match(/^text-align:(left|center|right)$/)?.[1];
    const styleIndex = token.attrIndex('style');
    if (styleIndex >= 0) token.attrs.splice(styleIndex, 1);
    token.attrSet('data-align', alignment || 'left');
    return renderer.renderToken(tokens, index, options);
  };
}

function translated(document, zh, en) {
  const language = document.documentElement.dataset.lang || document.documentElement.lang || 'zh';
  return language.startsWith('en') ? en : zh;
}

/** Return sanitized Markdown DOM. Call math(root) once the KaTeX core is ready. */
export function markdown(text = '') {
  const document = globalThis.document;
  if (!document?.defaultView) throw new Error('Markdown rendering requires a document');
  let purifier = purifiers.get(document);
  if (!purifier) {purifier = createDOMPurify(document.defaultView);purifiers.set(document, purifier);}
  const root = document.createElement('div');root.className = 'markdown';
  const clean = purifier.sanitize(parser.render(String(text)), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 's', 'del', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'],
    ALLOWED_ATTR: ['class', 'href', 'title', 'start', 'scope', 'data-math-display', 'data-align'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    SANITIZE_DOM: true, SANITIZE_NAMED_PROPS: true,
  });
  root.append(clean);
  for (const link of root.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    if (!href || !safeLink(href)) {link.replaceWith(...link.childNodes);continue;}
    link.setAttribute('rel', 'noopener noreferrer');
    if (/^https?:/i.test(href)) link.setAttribute('target', '_blank');
  }
  for (const cell of root.querySelectorAll('[data-align]')) {
    const alignment = cell.getAttribute('data-align');
    if (['left', 'center', 'right'].includes(alignment)) cell.style.textAlign = alignment;
    cell.removeAttribute('data-align');
  }
  for (const table of root.querySelectorAll('table')) {
    table.classList.add('result-table', 'markdown-table');
    for (const heading of table.querySelectorAll('th')) heading.scope = 'col';
    const scroll = document.createElement('div');scroll.className = 'markdown-table-scroll';
    scroll.tabIndex = 0;scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', translated(document, '可横向滚动的数据表', 'Scrollable data table'));
    scroll.style.maxWidth = '100%';scroll.style.overflowX = 'auto';
    table.replaceWith(scroll);scroll.append(table);
  }
  return root;
}

/** Typeset parsed math only; fenced/inline code and literal HTML are untouched. */
export function math(element) {
  if (!element?.querySelectorAll) return;
  const document = element.ownerDocument, engine = document?.defaultView?.katex || globalThis.katex;
  if (typeof engine?.render !== 'function') return;
  const sources = [...(element.matches?.('.math-source') ? [element] : []), ...element.querySelectorAll('.math-source')];
  for (const source of sources) {
    if (source.dataset.mathRendered || source.closest('pre,code')) continue;
    const text = source.textContent, display = source.dataset.mathDisplay === 'block';
    try {
      engine.render(text, source, {displayMode: display, throwOnError: false, trust: false, strict: 'ignore',
        output: 'htmlAndMathml', maxExpand: 1000, maxSize: 20, macros: {}});
      source.dataset.mathRendered = 'true';
    } catch {
      source.textContent = text;source.classList.add('math-error');source.dataset.mathRendered = 'error';
    }
    source.style.maxWidth = '100%';source.style.overflowX = 'auto';
    source.style.display = display ? 'block' : 'inline-block';
    if (display) {
      source.tabIndex = 0;source.setAttribute('role', 'region');
      source.setAttribute('aria-label', translated(document, '可横向滚动的数学公式', 'Scrollable math expression'));
    } else source.style.verticalAlign = 'middle';
  }
}

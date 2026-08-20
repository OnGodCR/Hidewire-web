// ---------------------------------------------------------------------------
// hidewire.org build.
//
// Copies src/ to dist/ and renders the documents in content/ into styled HTML.
// Zero dependencies on purpose: the whole site is three pages and a form, and
// a dependency tree is a supply chain you then have to trust with a page that
// promises it loads nothing from anyone.
//
//   node build.mjs
//   node build.mjs --check-only     parse and lint, write nothing
//
// Adding a page later (the POI complaint form, the what-is-this explainer)
// means adding one entry to DOCS below and one Markdown file in content/.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const CONTENT = join(ROOT, 'content');
const DIST = join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check-only');

/**
 * Every Markdown document that becomes a route.
 *
 * `title` is the browser title. `intro` is the one line under the heading that
 * belongs to the site rather than to the document, so the legal text itself is
 * never edited to make the page read better.
 */
const DOCS = [
  {
    file: 'terms.md',
    route: 'terms',
    title: 'Terms of service',
    intro: 'The rules of the game, and who is responsible for what.',
  },
  {
    file: 'privacy.md',
    route: 'privacy',
    title: 'Privacy policy',
    intro: 'What Hidewire collects, how long it keeps it, and who sees it.',
  },
];

// ---------------------------------------------------------------------------
// Markdown, the small subset these documents actually use.
//
// It throws on anything it does not recognize rather than passing it through.
// A legal document that silently loses a clause because the parser did not
// know what a list was would be worse than a build failure.
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Inline: **bold**, _italic_, and nothing else. */
function inline(text) {
  const out = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s.,)]|$)/g, '$1<em>$2</em>');
  if (/[*_`\[\]]/.test(out.replace(/<\/?(strong|em)>/g, ''))) {
    throw new Error(`Unsupported inline Markdown in: ${text}`);
  }
  return out;
}

function parseDoc(md, sourceName) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line) || line.startsWith('>') || line.startsWith('```') || line.startsWith('|')) {
      throw new Error(
        `${sourceName}: this build only understands headings and paragraphs, and found: ${line.trim()}`,
      );
    }
    paragraph.push(line.trim());
  }
  flush();

  if (!blocks.length || blocks[0].type !== 'h' || blocks[0].level !== 1) {
    throw new Error(`${sourceName}: expected the document to open with a single h1.`);
  }

  const docTitle = blocks[0].text;
  const rest = blocks.slice(1);

  // The repo convention is that both documents open with an italic line of the
  // shape "Updated YYYY-MM-DD. Draft, not yet reviewed by a lawyer." Split it
  // into a date and a standing notice. When the lawyer review happens and that
  // sentence is deleted upstream, the notice disappears from the live page on
  // the next build without anyone having to remember this file exists.
  let updated = null;
  let notice = null;
  if (rest[0]?.type === 'p') {
    const meta = /^_Updated\s+(\d{4}-\d{2}-\d{2})\.\s*(.*?)_$/.exec(rest[0].text);
    if (meta) {
      updated = meta[1];
      notice = meta[2].replace(/\.$/, '') || null;
      rest.shift();
    }
  }
  if (!updated) {
    throw new Error(`${sourceName}: could not find the "Updated YYYY-MM-DD" line. See legal/ in the app repo.`);
  }

  const sections = [];
  const html = [];
  for (const block of rest) {
    if (block.type === 'h') {
      const id = slug(block.text);
      sections.push({ id, text: block.text });
      html.push(
        // The hash is drawn by CSS rather than sitting in the markup, so
        // copying a clause out of the page does not bring a stray # with it.
        `<h${block.level} id="${id}"><a class="anchor" href="#${id}" ` +
          `aria-label="Link to this section"></a>${inline(block.text)}</h${block.level}>`,
      );
    } else {
      html.push(`<p>${inline(block.text)}</p>`);
    }
  }

  return { docTitle, updated, notice, sections, body: html.join('\n') };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const head = ({ title, description, path }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0A0C">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://hidewire.org${path}">
<link rel="canonical" href="https://hidewire.org${path}">
<link rel="icon" href="/assets/hidewire-mark.svg" type="image/svg+xml">
<link rel="alternate icon" href="/assets/favicon.png" sizes="48x48">
<link rel="preload" href="/fonts/ibm-plex-mono-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>`;

const lockup = (linked) => {
  const inner = `<span class="brackets" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wordmark">Hidewire</span>`;
  return linked
    ? `<a class="lockup" href="/">${inner}</a>`
    : `<span class="lockup">${inner}</span>`;
};

const footer = () => `<footer class="site-foot">
  <div class="foot-inner">
    <p class="foot-brand">${lockup(true)}</p>
    <nav aria-label="Footer">
      <ul class="foot-links">
        <li><a href="/">Waitlist</a></li>
        <li><a href="/terms/">Terms of service</a></li>
        <li><a href="/privacy/">Privacy policy</a></li>
        <li><a href="mailto:support@frame.game">support@frame.game</a></li>
      </ul>
    </nav>
    <p class="foot-note">Hidewire is in development. There is no public build and no launch date.</p>
  </div>
</footer>
</body>
</html>`;

function renderDoc(doc, meta) {
  const toc = doc.sections
    .map((s) => `<li><a href="#${s.id}">${inline(s.text)}</a></li>`)
    .join('\n        ');

  return `${head({
    title: `${meta.title} · Hidewire`,
    description: `${meta.intro} Updated ${doc.updated}.`,
    path: `/${meta.route}/`,
  })}
<header class="site-head">
  <div class="head-inner">${lockup(true)}<a class="head-back" href="/">Back to the waitlist</a></div>
</header>
<main id="main" class="doc">
  <h1>${inline(doc.docTitle)}</h1>
  <p class="doc-intro">${escapeHtml(meta.intro)}</p>
  <p class="doc-meta"><span class="label">Last updated</span> <time datetime="${doc.updated}">${doc.updated}</time></p>
  ${
    doc.notice
      ? `<aside class="notice" role="note">
    <p class="label">Draft</p>
    <p>${inline(doc.notice)}. It describes how Hidewire is actually built and how it actually behaves, and the wording will change before public launch. It is published in this state because publishing an unreviewed policy while implying it is settled would be worse.</p>
  </aside>`
      : ''
  }
  <nav class="toc" aria-labelledby="toc-h">
    <p class="label" id="toc-h">Contents</p>
    <ul>
        ${toc}
    </ul>
  </nav>
  <div class="prose">
${doc.body}
  </div>
</main>
${footer()}
`;
}

// ---------------------------------------------------------------------------
// House rules, checked on the built output so a violation cannot ship.
// ---------------------------------------------------------------------------

function lint(files) {
  const problems = [];
  for (const [name, text] of files) {
    if (!name.endsWith('.html') && !name.endsWith('.css') && !name.endsWith('.js')) continue;
    // Written as an escape so this file passes its own check.
    const em = text.split('\n').findIndex((l) => l.includes('\u2014'));
    if (em >= 0) problems.push(`${name}:${em + 1} contains an em-dash. See CLAUDE.md section 2.`);
    for (const host of [/https?:\/\/fonts\.googleapis/, /https?:\/\/fonts\.gstatic/, /googletagmanager/, /google-analytics/, /connect\.facebook/, /cdn\.jsdelivr/, /unpkg\.com/]) {
      if (host.test(text)) problems.push(`${name} loads a third party: ${host}. The privacy policy has to stay true.`);
    }
  }
  if (problems.length) {
    throw new Error(`Build refused:\n  ${problems.join('\n  ')}`);
  }
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push([full.slice(base.length + 1), full]);
  }
  return out;
}

// ---------------------------------------------------------------------------

const generated = [];

for (const doc of DOCS) {
  const md = readFileSync(join(CONTENT, doc.file), 'utf8');
  const parsed = parseDoc(md, doc.file);
  generated.push([`${doc.route}/index.html`, renderDoc(parsed, doc)]);
}

const staticFiles = walk(SRC).map(([rel, full]) => [
  rel,
  ['.html', '.css', '.js', '.txt', '.svg'].includes(extname(rel)) ? readFileSync(full, 'utf8') : null,
]);

lint([...generated, ...staticFiles.filter(([, text]) => text !== null)]);

if (CHECK_ONLY) {
  console.log(`checked ${generated.length} document(s) and ${staticFiles.length} static file(s), no problems`);
  process.exit(0);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(SRC, DIST, { recursive: true });

for (const [rel, html] of generated) {
  const target = join(DIST, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

let bytes = 0;
for (const [rel] of walk(DIST)) bytes += statSync(join(DIST, rel)).size;
console.log(`built ${walk(DIST).length} files into dist/, ${(bytes / 1024).toFixed(1)} KB total`);

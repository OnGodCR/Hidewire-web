// ---------------------------------------------------------------------------
// Local preview. `npm run dev` builds and then serves dist/ on port 4321.
//
// It also answers /api/waitlist so the four form states can be exercised
// without a database. That stub lives here, in a tool that is never deployed,
// rather than in the site, so there is no way for it to reach production.
//
//   a new address         added, and remembered
//   the same one again    known
//   taken@example.com     known, always
//   boom@example.com      error
//   anything unparseable  invalid
//
// "Remembered" is the important one. The real endpoint answers a repeat signup
// with `known` because a unique index rejects the insert; this keeps a small
// file of addresses so local testing behaves the same way. Delete
// .waitlist-dev.json to start over.
//
// The real endpoint is functions/api/waitlist.js. If you change one, read the
// other.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { onRequest as waitlistEndpoint } from '../functions/api/waitlist.js';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4321);

// Addresses the stub has already seen. Kept in a file, and gitignored, so a
// second signup is a duplicate across restarts too. The real endpoint gets
// this from a unique index; without it here, testing the form locally makes a
// duplicate look like a fresh success, which is exactly the bug this file
// used to have.
const LEDGER = join(ROOT, '.waitlist-dev.json');
const seen = new Set(existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []);

// With both secrets in the environment this stops being a stub and runs the
// real endpoint against the real table, which is the only way to test the
// database path before the site is deployed:
//
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<key> npm run dev
//
// Anything written that way lands in production data. That is the point, and
// it is also why it takes two explicit variables rather than a flag.
const LIVE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

async function remember(email) {
  seen.add(email);
  await writeFile(LEDGER, JSON.stringify([...seen], null, 2));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolve(pathname) {
  const candidates = [
    join(DIST, pathname),
    join(DIST, pathname, 'index.html'),
    join(DIST, `${pathname}.html`),
  ];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/waitlist') {
    if (LIVE && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await waitlistEndpoint({
        request: new Request(`http://localhost:${PORT}/api/waitlist`, {
          method: 'POST',
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json',
            Accept: req.headers.accept || 'application/json',
          },
          body: Buffer.concat(chunks),
        }),
        env: process.env,
      });
      const body = await response.text();
      res
        .writeHead(response.status, { 'Content-Type': response.headers.get('content-type') })
        .end(body);
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(303, { Location: '/#waitlist' }).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let email = '';
    let trap = '';
    try {
      if ((req.headers['content-type'] || '').includes('json')) {
        const body = JSON.parse(raw);
        email = String(body.email || '');
        trap = String(body.company || '');
      } else {
        const body = new URLSearchParams(raw);
        email = body.get('email') || '';
        trap = body.get('company') || '';
      }
    } catch {
      /* falls through to invalid */
    }
    email = email.trim().toLowerCase();
    let status = 'added';
    if (trap.trim() !== '') {
      status = 'added';
    } else if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) {
      status = 'invalid';
    } else if (email === 'boom@example.com') {
      status = 'error';
    } else if (email === 'taken@example.com' || seen.has(email)) {
      status = 'known';
    } else {
      await remember(email);
    }
    console.log(`  /api/waitlist  ${email || '(empty)'} -> ${status}`);

    const wantsJson = (req.headers.accept || '').includes('application/json');
    if (wantsJson) {
      res
        .writeHead(status === 'invalid' ? 400 : status === 'error' ? 502 : 200, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        .end(JSON.stringify({ status }));
    } else {
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${status}</title>` +
            `<link rel="stylesheet" href="/styles.css"></head><body><main class="doc">` +
            `<h1>${status}</h1><p class="doc-intro">Local stub. The deployed site returns the real page ` +
            `from functions/api/waitlist.js.</p><p><a class="btn btn-ghost" href="/">Back</a></p>` +
            `</main></body></html>`,
        );
    }
    return;
  }

  const file = await resolve(decodeURIComponent(url.pathname));
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>404</h1>');
    return;
  }
  const body = await readFile(file);
  res
    .writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    .end(body);
});

server.listen(PORT, () => {
  console.log(`hidewire.org preview on http://localhost:${PORT}`);
  console.log(
    LIVE
      ? '  /api/waitlist is LIVE: signups go to the real Supabase table'
      : '  /api/waitlist is stubbed. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use the real table.',
  );
});

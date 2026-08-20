// ---------------------------------------------------------------------------
// GET/POST /api/review?key=<REVIEW_KEY>
//
// The private carousel review page. GET renders every pending deck's slides
// with Approve and Decline buttons; POST records the decision in ig_review,
// where sync-approvals.mjs and the publisher pick it up.
//
// Auth is one long random key in the URL, held only by the reviewer's
// bookmark and the Vercel env. Wrong or missing key: a 404 with nothing to
// learn from. Decisions are idempotent upserts, so a double tap is safe.
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_KEY.
// ---------------------------------------------------------------------------

const PAGE_STYLE = `
  body { margin: 0; background: #0A0A0C; color: #F4F4F2; font: 16px system-ui, sans-serif; padding: 1rem; }
  h1 { font-size: 1.1rem; letter-spacing: 0.12em; text-transform: uppercase; color: #C8FF2E; }
  .deck { margin: 2rem 0; border-top: 1px solid #232329; padding-top: 1rem; }
  .slides { display: flex; gap: 0.5rem; overflow-x: auto; }
  .slides img { width: 220px; border-radius: 8px; }
  form { display: inline-block; margin: 1rem 0.5rem 0 0; }
  button { font: inherit; padding: 0.7rem 1.6rem; border-radius: 8px; border: none; cursor: pointer; }
  .yes { background: #C8FF2E; color: #0A0A0C; font-weight: 700; }
  .no { background: #232329; color: #F4F4F2; }
  .done { color: #9A9AA3; }
`;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.REVIEW_KEY || url.searchParams.get('key') !== env.REVIEW_KEY) {
    return new Response('not found', { status: 404 });
  }

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (request.method === 'POST') {
    const form = await request.formData();
    const deck = String(form.get('deck') || '').replace(/[^a-z0-9-]/gi, '');
    const verdict = form.get('verdict') === 'approve' ? 'approved' : 'declined';
    if (deck) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/ig_review?on_conflict=deck`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ deck, status: verdict, decided_at: new Date().toISOString(), via: 'review page' }),
      });
    }
    return new Response(null, { status: 303, headers: { Location: url.pathname + '?key=' + env.REVIEW_KEY } });
  }

  const rows = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ig_review?select=deck,status,decided_at&order=deck`,
    { headers },
  ).then((r) => r.json()).catch(() => []);

  const decks = (Array.isArray(rows) ? rows : []).map((row) => {
    const slides = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((n) => `/ig/${row.deck}/slide-0${n}.jpg`)
      .map((src) => `<img src="${src}" loading="lazy" onerror="this.remove()">`)
      .join('');
    const controls = row.status === 'pending'
      ? `<form method="post"><input type="hidden" name="deck" value="${row.deck}">
           <input type="hidden" name="verdict" value="approve"><button class="yes">Approve</button></form>
         <form method="post"><input type="hidden" name="deck" value="${row.deck}">
           <input type="hidden" name="verdict" value="decline"><button class="no">Decline</button></form>`
      : `<p class="done">${row.status} · ${row.decided_at || ''}</p>`;
    return `<div class="deck"><h2>${row.deck}</h2><div class="slides">${slides}</div>${controls}</div>`;
  }).join('');

  const html = `<!doctype html><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Deck review</title><style>${PAGE_STYLE}</style>
    <h1>Hidewire · deck review</h1>
    ${decks || '<p class="done">Nothing waiting.</p>'}`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

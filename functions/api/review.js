// ---------------------------------------------------------------------------
// GET/POST /api/review?key=<REVIEW_KEY>
//
// The private carousel review page, and the thing that publishes.
//
// Approval happens on a phone, so publishing happens here rather than on a
// laptop that may be shut: tapping "approve and post" creates the carousel
// on Instagram and records the media id, all inside this request. Nothing
// posts without that tap; there is no path in this file that publishes a
// deck a person did not approve.
//
// Credentials come from the ig_config table rather than the environment,
// because the Instagram token expires after 60 days and a serverless
// function cannot write its own env. It is read, refreshed when it is
// getting old, and written back.
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_KEY.
// ---------------------------------------------------------------------------

const GRAPH = 'https://graph.instagram.com/v23.0';
const REFRESH_AFTER_DAYS = 30;

const STYLE = `
:root {
  --bg: #0A0A0C; --surface: #121215; --surface2: #17171B; --line: #232329;
  --text: #F4F4F2; --dim: #9A9AA3; --faint: #5C5C66;
  --accent: #C8FF2E; --danger: #FF4438;
}
@font-face { font-family: 'Grotesk'; src: url('/fonts/space-grotesk-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Grotesk'; src: url('/fonts/space-grotesk-500.woff2') format('woff2'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'Grotesk'; src: url('/fonts/space-grotesk-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'PlexMono'; src: url('/fonts/ibm-plex-mono-600.woff2') format('woff2'); font-weight: 600; font-display: swap; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Grotesk', system-ui, sans-serif;
  padding-bottom: 5rem;
  /* One wash of accent at the top, the same gesture the site opens with. */
  background-image: radial-gradient(120% 40% at 50% -8%, rgba(200,255,46,0.07), transparent 70%);
  background-repeat: no-repeat;
}
.mono { font-family: 'PlexMono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.16em; }

header {
  position: sticky; top: 0; z-index: 10;
  background: rgba(10,10,12,0.86); backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
  padding: 0.85rem 1.25rem; display: flex; align-items: center; gap: 0.6rem;
}
header svg { width: 22px; height: 22px; flex: 0 0 auto; }
header .title { font-size: 0.72rem; color: var(--text); }
header .count {
  margin-left: auto; font-size: 0.6rem; color: var(--bg); background: var(--accent);
  padding: 0.3rem 0.6rem; border-radius: 999px; white-space: nowrap;
}
header .count.zero { background: transparent; color: var(--faint); border: 1px solid var(--line); }

main { padding: 1.25rem 0 0; display: grid; gap: 1.5rem; max-width: 34rem; margin: 0 auto; }
.section-label { padding: 0 1.25rem; font-size: 0.6rem; color: var(--faint); }

.deck {
  background: linear-gradient(180deg, var(--surface2), var(--surface));
  border: 1px solid var(--line); border-radius: 20px; overflow: hidden;
  margin: 0 1.25rem;
  box-shadow: 0 18px 40px -28px rgba(0,0,0,0.9);
}
.deck.is-pending { border-color: rgba(200,255,46,0.22); }

.deck-head { padding: 1.15rem 1.15rem 0.9rem; display: flex; align-items: center; gap: 0.7rem; }
.deck-n {
  font-family: 'PlexMono', monospace; font-size: 0.7rem; color: var(--faint);
  border: 1px solid var(--line); border-radius: 7px; padding: 0.28rem 0.45rem;
}
.deck-name { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
.pill {
  margin-left: auto; font-family: 'PlexMono', monospace; font-size: 0.55rem;
  text-transform: uppercase; letter-spacing: 0.14em;
  padding: 0.34rem 0.6rem; border-radius: 999px; border: 1px solid var(--line); color: var(--dim);
  display: inline-flex; align-items: center; gap: 0.35rem;
}
.pill::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.pill.pending { color: var(--accent); border-color: rgba(200,255,46,0.35); background: rgba(200,255,46,0.06); }
.pill.declined { color: var(--danger); border-color: rgba(255,68,56,0.3); }
.pill.published { color: var(--faint); }

/* Slides at their true shape, never cropped, one snapped at a time with the
   next one peeking so the swipe is discoverable without a hint. */
.strip {
  display: flex; gap: 0.7rem; overflow-x: auto; scroll-snap-type: x mandatory;
  padding: 0 1.15rem 1.15rem; scrollbar-width: none; scroll-padding-left: 1.15rem;
}
.strip::-webkit-scrollbar { display: none; }
.strip figure {
  flex: 0 0 auto; width: 68%; max-width: 14rem; scroll-snap-align: start;
  position: relative;
}
.strip img {
  width: 100%; display: block; aspect-ratio: 1080 / 1350; object-fit: contain;
  background: #000; border-radius: 12px; border: 1px solid var(--line);
}
.strip figcaption {
  position: absolute; left: 0.5rem; bottom: 0.5rem;
  font-family: 'PlexMono', monospace; font-size: 0.5rem; letter-spacing: 0.12em;
  color: var(--dim); background: rgba(10,10,12,0.75); backdrop-filter: blur(4px);
  padding: 0.2rem 0.4rem; border-radius: 5px;
}

details { border-top: 1px solid var(--line); }
summary {
  padding: 0.9rem 1.15rem; font-family: 'PlexMono', monospace; font-size: 0.58rem;
  text-transform: uppercase; letter-spacing: 0.14em; color: var(--dim);
  cursor: pointer; list-style: none; display: flex; align-items: center; gap: 0.5rem;
}
summary::-webkit-details-marker { display: none; }
summary::after { content: '+'; margin-left: auto; color: var(--faint); font-size: 0.9rem; }
details[open] summary::after { content: '-'; }
.caption {
  padding: 0 1.15rem 1.15rem; color: var(--dim); font-size: 0.9rem;
  line-height: 1.55; white-space: pre-wrap;
}

.why { padding: 1rem 1.15rem 0; border-top: 1px solid var(--line); }
.why label {
  display: block; font-family: 'PlexMono', monospace; font-size: 0.55rem;
  text-transform: uppercase; letter-spacing: 0.14em; color: var(--faint); margin-bottom: 0.55rem;
}
.why textarea {
  width: 100%; min-height: 4rem; resize: vertical; padding: 0.8rem 0.9rem;
  background: var(--bg); color: var(--text); border: 1px solid var(--line);
  border-radius: 12px; font-family: 'Grotesk', system-ui, sans-serif; font-size: 0.95rem;
  line-height: 1.45;
}
.why textarea::placeholder { color: var(--faint); }
.why textarea:focus { outline: none; border-color: rgba(200,255,46,0.5); }

.actions { display: grid; grid-template-columns: 1.35fr 1fr; gap: 0.6rem; padding: 0.9rem 1.15rem 1.15rem; }
button {
  font-family: 'PlexMono', monospace; font-size: 0.66rem; text-transform: uppercase;
  letter-spacing: 0.1em; min-height: 3.5rem; width: 100%;
  border-radius: 14px; border: none; cursor: pointer; transition: transform 0.12s ease, filter 0.12s ease;
}
button:active { transform: scale(0.985); }
.yes { background: var(--accent); color: #0A0A0C; font-weight: 600; box-shadow: 0 10px 26px -14px rgba(200,255,46,0.7); }
.no { background: transparent; color: var(--dim); border: 1px solid var(--line); }
.no:active { filter: brightness(1.4); }

.note {
  margin: 0 1.15rem 0.9rem; padding: 0.7rem 0 0.7rem 0.85rem;
  border-left: 2px solid var(--danger); color: var(--text);
  font-size: 0.88rem; line-height: 1.5;
}
.meta { padding: 0 1.15rem 1.15rem; color: var(--faint); font-size: 0.76rem; }
.meta a { color: var(--accent); text-underline-offset: 3px; }

.empty {
  margin: 0 1.25rem; padding: 3rem 1.5rem; text-align: center;
  border: 1px dashed var(--line); border-radius: 20px; color: var(--faint);
}
.empty strong { display: block; color: var(--dim); font-size: 1rem; margin-bottom: 0.4rem; font-weight: 500; }

.flash {
  margin: 1rem 1.25rem 0; padding: 0.9rem 1.05rem; border-radius: 14px;
  border: 1px solid rgba(200,255,46,0.35); background: rgba(200,255,46,0.07);
  color: var(--accent); font-size: 0.9rem; line-height: 1.45;
}
.flash.bad { border-color: rgba(255,68,56,0.35); background: rgba(255,68,56,0.07); color: var(--danger); }
.flash a { color: inherit; }

@media (min-width: 40rem) {
  .strip figure { width: 34%; }
  .deck { margin: 0; }
  main { padding: 1.5rem 1.25rem 0; }
  .section-label, .flash, .empty { padding-left: 0; padding-right: 0; margin-left: 0; margin-right: 0; }
}
`;

// "07-the-rules" reads as a filename. "07 · the rules" reads as a deck.
const pretty = (slug) => {
  const m = String(slug).match(/^(\d+)-(.*)$/);
  return m ? `${m[1]} · ${m[2].replace(/-/g, ' ')}` : String(slug).replace(/-/g, ' ');
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.REVIEW_KEY || url.searchParams.get('key') !== env.REVIEW_KEY) {
    return new Response('not found', { status: 404 });
  }

  const rest = (path, init) =>
    fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init && init.headers),
      },
    });

  if (request.method === 'POST') {
    const form = await request.formData();
    const deck = String(form.get('deck') || '').replace(/[^a-z0-9-]/gi, '');
    const approve = form.get('verdict') === 'approve';
    if (!deck) return seeOther(url, env, 'nothing to do');

    if (!approve) {
      const note = String(form.get('note') || '').trim().slice(0, 2000);
      if (!note) {
        return seeOther(url, env, `say why ${deck} is wrong, then decline again`, '', true);
      }
      await rest(`ig_review?deck=eq.${deck}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'declined', note,
          decided_at: new Date().toISOString(), via: 'review page',
        }),
      });
      return seeOther(url, env, `${deck} declined, and the reason is recorded`);
    }

    const note = String(form.get('note') || '').trim().slice(0, 2000);
    if (note) {
      await rest(`ig_review?deck=eq.${deck}`, { method: 'PATCH', body: JSON.stringify({ note }) });
    }
    try {
      const result = await publish(deck, rest);
      return seeOther(url, env, `${deck} posted to Instagram`, result.permalink);
    } catch (error) {
      // Approval is not recorded when publishing fails: a deck that did not
      // post should still read as waiting, not as done.
      return seeOther(url, env, `could not post ${deck}: ${error.message}`, '', true);
    }
  }

  const rows = await rest('ig_review?select=*&order=status,deck').then((r) => r.json()).catch(() => []);
  const decks = Array.isArray(rows) ? rows : [];
  const pending = decks.filter((d) => d.status === 'pending');
  const rest_ = decks.filter((d) => d.status !== 'pending');
  const flash = url.searchParams.get('m');
  const link = url.searchParams.get('l');
  const bad = url.searchParams.get('bad') === '1';

  const card = (d) => {
    const slides = Array.isArray(d.slides) && d.slides.length
      ? d.slides
      : ['slide-01.jpg', 'slide-02.jpg', 'slide-03.jpg', 'slide-04.jpg', 'slide-05.jpg',
         'slide-06.jpg', 'slide-07.jpg', 'slide-08.jpg', 'slide-09.jpg'];
    const imgs = slides
      .map((s, i) => `<figure><img src="/ig/${esc(d.deck)}/${esc(s)}" loading="lazy" alt=""
          onerror="this.closest('figure').remove()"><figcaption>${String(i + 1).padStart(2, '0')} / ${
        String(slides.length).padStart(2, '0')}</figcaption></figure>`)
      .join('');
    // One form, two submit buttons. The reason field belongs to both, so a
    // decline always has somewhere to say why without a second screen.
    const controls = d.status === 'pending'
      ? `<form method="post" onsubmit="return this.verdict.value !== 'approve' || confirm('Post ${esc(d.deck)} to Instagram now?')">
           <input type="hidden" name="deck" value="${esc(d.deck)}">
           <input type="hidden" name="verdict" value="">
           <div class="why">
             <label for="note-${esc(d.deck)}">Notes · required to decline</label>
             <textarea id="note-${esc(d.deck)}" name="note" placeholder="What is wrong with it? This reaches Claude Code."></textarea>
           </div>
           <div class="actions">
             <button class="yes" type="submit" onclick="this.form.verdict.value='approve'">Approve · post now</button>
             <button class="no" type="submit" onclick="this.form.verdict.value='decline'">Decline</button>
           </div>
         </form>`
      : d.status === 'published'
        ? `<p class="meta">Posted ${esc((d.published_at || '').slice(0, 10))}${
            d.permalink ? ` · <a href="${esc(d.permalink)}">see the post</a>` : ''}</p>`
        : `${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}<p class="meta">Declined ${esc((d.decided_at || '').slice(0, 10))}</p>`;
    const caption = d.caption
      ? `<details><summary>Caption</summary><p class="caption">${esc(d.caption)}</p></details>`
      : '';
    const num = (String(d.deck).match(/^(\d+)/) || [, ''])[1];
    const name = String(d.deck).replace(/^\d+-/, '').replace(/-/g, ' ');
    return `<article class="deck${d.status === 'pending' ? ' is-pending' : ''}">
      <div class="deck-head">
        ${num ? `<span class="deck-n">${esc(num)}</span>` : ''}
        <span class="deck-name">${esc(name)}</span>
        <span class="pill ${esc(d.status)} mono">${esc(d.status)}</span>
      </div>
      <div class="strip">${imgs}</div>
      ${caption}${controls}
    </article>`;
  };

  const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0A0A0C">
<title>Deck review</title>
<style>${STYLE}</style>
<header>
  <svg viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
    <g stroke="#C8FF2E" stroke-width="86" stroke-linecap="round" stroke-linejoin="round">
      <path d="M104,420 L104,104 L420,104"/><path d="M604,104 L920,104 L920,420"/>
      <path d="M920,604 L920,920 L604,920"/><path d="M420,920 L104,920 L104,604"/>
    </g>
    <path d="M608,244 L768,404 L608,564 L448,404 Z" fill="#C8FF2E"/>
  </svg>
  <span class="title mono">Review</span>
  <span class="count mono${pending.length ? '' : ' zero'}">${
    pending.length ? `${pending.length} waiting` : 'all clear'}</span>
</header>
${flash ? `<p class="flash${bad ? ' bad' : ''}">${esc(flash)}${
    link ? ` · <a href="${esc(link)}">view post</a>` : ''}</p>` : ''}
<main>
  ${pending.length
    ? pending.map(card).join('')
    : `<div class="empty"><strong>Nothing waiting.</strong>New decks land here as they are built.</div>`}
  ${rest_.length ? `<p class="section-label mono">Already decided</p>${rest_.map(card).join('')}` : ''}
</main>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function seeOther(url, env, message, link, bad) {
  const to = `${url.pathname}?key=${encodeURIComponent(env.REVIEW_KEY)}&m=${encodeURIComponent(message)}` +
    (link ? `&l=${encodeURIComponent(link)}` : '') + (bad ? '&bad=1' : '');
  return new Response(null, { status: 303, headers: { Location: to } });
}

// --- publishing -----------------------------------------------------------

async function publish(deck, rest) {
  const rows = await rest(`ig_review?deck=eq.${deck}&select=*`).then((r) => r.json());
  const row = Array.isArray(rows) && rows[0];
  if (!row) throw new Error('no such deck');
  if (row.status === 'published') throw new Error('already posted');
  if (!row.caption || !Array.isArray(row.slides) || !row.slides.length) {
    throw new Error('deck has no caption or slides recorded');
  }

  const cfg = await rest('ig_config?select=key,value,updated_at').then((r) => r.json());
  const get = (k) => (Array.isArray(cfg) ? cfg.find((c) => c.key === k) : null);
  const igUser = get('ig_user_id');
  let tokenRow = get('ig_access_token');
  if (!igUser || !tokenRow) throw new Error('instagram credentials missing');
  let token = tokenRow.value;

  // Keep the token alive without anyone remembering to.
  const age = (Date.now() - new Date(tokenRow.updated_at).getTime()) / 86400000;
  if (age > REFRESH_AFTER_DAYS) {
    const r = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    ).then((x) => x.json()).catch(() => null);
    if (r && r.access_token) {
      token = r.access_token;
      await rest('ig_config?key=eq.ig_access_token', {
        method: 'PATCH',
        body: JSON.stringify({ value: token, updated_at: new Date().toISOString() }),
      });
    }
  }

  const origin = 'https://www.hidewire.org';
  const call = async (path, params) => {
    const res = await fetch(`${GRAPH}/${path}`, {
      method: 'POST',
      body: new URLSearchParams({ ...params, access_token: token }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ? json.error.message : `graph ${res.status}`);
    return json;
  };

  const children = [];
  for (const slide of row.slides) {
    const item = await call(`${igUser.value}/media`, {
      image_url: `${origin}/ig/${deck}/${slide}`,
      is_carousel_item: 'true',
    });
    children.push(item.id);
  }
  const carousel = await call(`${igUser.value}/media`, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption: row.caption,
  });

  // Instagram assembles the carousel asynchronously; publishing early fails
  // with code 9007. Bounded wait, because this runs inside a request.
  for (let i = 0; i < 15; i++) {
    const status = await fetch(`${GRAPH}/${carousel.id}?fields=status_code&access_token=${token}`)
      .then((r) => r.json()).then((j) => j.status_code).catch(() => null);
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('instagram could not process the images');
    await new Promise((r) => setTimeout(r, 2000));
  }

  const post = await call(`${igUser.value}/media_publish`, { creation_id: carousel.id });
  let permalink = '';
  try {
    const meta = await fetch(`${GRAPH}/${post.id}?fields=permalink&access_token=${token}`).then((r) => r.json());
    permalink = meta.permalink || '';
  } catch { /* posted regardless */ }

  await rest(`ig_review?deck=eq.${deck}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'published',
      media_id: post.id,
      permalink,
      published_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
      via: 'review page',
    }),
  });
  return { permalink };
}

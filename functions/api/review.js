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
  --bg: #0A0A0C; --surface: #121215; --line: #232329;
  --text: #F4F4F2; --dim: #9A9AA3; --accent: #C8FF2E; --danger: #FF4438;
}
@font-face { font-family: 'Grotesk'; src: url('/fonts/space-grotesk-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Grotesk'; src: url('/fonts/space-grotesk-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'PlexMono'; src: url('/fonts/ibm-plex-mono-600.woff2') format('woff2'); font-weight: 600; font-display: swap; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Grotesk', system-ui, sans-serif;
  padding-bottom: 4rem;
}
header {
  position: sticky; top: 0; z-index: 10;
  background: rgba(10,10,12,0.92); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
  padding: 1rem 1.25rem; display: flex; align-items: baseline; gap: 0.75rem;
}
.mono { font-family: 'PlexMono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.16em; }
header .title { font-size: 0.8rem; color: var(--accent); }
header .count { font-size: 0.7rem; color: var(--dim); margin-left: auto; padding-right: 0.16em; white-space: nowrap; }
main { padding: 1.25rem; display: grid; gap: 1.75rem; max-width: 34rem; margin: 0 auto; }
.deck {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; overflow: hidden;
}
.deck-head { padding: 1rem 1.1rem 0.75rem; display: flex; align-items: center; gap: 0.6rem; }
.deck-name { font-size: 1.05rem; font-weight: 700; }
.pill {
  margin-left: auto; font-family: 'PlexMono', monospace; font-size: 0.6rem;
  text-transform: uppercase; letter-spacing: 0.14em;
  padding: 0.32rem 0.55rem; border-radius: 999px; border: 1px solid var(--line); color: var(--dim);
}
.pill.pending { color: var(--accent); border-color: rgba(200,255,46,0.4); }
.pill.published { color: var(--dim); }
.pill.declined { color: var(--danger); border-color: rgba(255,68,56,0.35); }
/* Horizontal filmstrip: thumb-swipeable, one slide snapped at a time. */
.strip {
  display: flex; gap: 0.6rem; overflow-x: auto; scroll-snap-type: x mandatory;
  padding: 0.4rem 1.1rem 0.9rem; scrollbar-width: none;
}
.strip::-webkit-scrollbar { display: none; }
.strip img {
  width: 62%; max-width: 15rem; flex: 0 0 auto; scroll-snap-align: center;
  border-radius: 10px; border: 1px solid var(--line); background: #000;
  aspect-ratio: 1080 / 1350; object-fit: cover;
}
details { border-top: 1px solid var(--line); }
summary {
  padding: 0.85rem 1.1rem; font-family: 'PlexMono', monospace; font-size: 0.62rem;
  text-transform: uppercase; letter-spacing: 0.14em; color: var(--dim); cursor: pointer;
}
.caption {
  padding: 0 1.1rem 1rem; color: var(--dim); font-size: 0.92rem;
  line-height: 1.5; white-space: pre-wrap;
}
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; padding: 0.9rem 1.1rem 1.1rem; border-top: 1px solid var(--line); }
.why { padding: 0.9rem 1.1rem 0; border-top: 1px solid var(--line); }
.why label {
  display: block; font-family: 'PlexMono', monospace; font-size: 0.6rem;
  text-transform: uppercase; letter-spacing: 0.14em; color: var(--dim); margin-bottom: 0.5rem;
}
.why textarea {
  width: 100%; min-height: 4.5rem; resize: vertical; padding: 0.75rem 0.85rem;
  background: var(--bg); color: var(--text); border: 1px solid var(--line);
  border-radius: 10px; font-family: 'Grotesk', system-ui, sans-serif; font-size: 1rem;
}
.why textarea:focus { outline: none; border-color: var(--accent); }
.note {
  padding: 0 1.1rem 1.1rem; color: var(--text); font-size: 0.88rem; line-height: 1.5;
  border-left: 2px solid var(--danger); margin: 0 1.1rem 1.1rem; padding: 0.5rem 0 0.5rem 0.8rem;
}
button {
  font-family: 'PlexMono', monospace; font-size: 0.72rem; text-transform: uppercase;
  letter-spacing: 0.12em; min-height: 3.4rem; width: 100%;
  border-radius: 12px; border: none; cursor: pointer;
}
.yes { background: var(--accent); color: #0A0A0C; font-weight: 600; }
.no { background: transparent; color: var(--dim); border: 1px solid var(--line); }
.meta { padding: 0 1.1rem 1.1rem; color: var(--dim); font-size: 0.78rem; }
.meta a { color: var(--accent); }
.empty { color: var(--dim); text-align: center; padding: 3rem 1rem; }
.flash {
  margin: 1.25rem 1.25rem 0; padding: 0.9rem 1.1rem; border-radius: 12px;
  border: 1px solid rgba(200,255,46,0.4); color: var(--accent);
  font-size: 0.9rem; max-width: 34rem;
}
.flash.bad { border-color: rgba(255,68,56,0.4); color: var(--danger); }
@media (min-width: 40rem) { .strip img { width: 30%; } }
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
      .map((s) => `<img src="/ig/${esc(d.deck)}/${esc(s)}" loading="lazy" alt="" onerror="this.remove();if(!this.parentNode.querySelector('img'))this.parentNode.remove()">`)
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
    return `<article class="deck">
      <div class="deck-head">
        <span class="deck-name">${esc(pretty(d.deck))}</span>
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
  <span class="title mono">Hidewire · review</span>
  <span class="count mono">${pending.length} waiting</span>
</header>
${flash ? `<p class="flash${bad ? ' bad' : ''}">${esc(flash)}${
    link ? ` · <a href="${esc(link)}" style="color:inherit">view post</a>` : ''}</p>` : ''}
<main>
  ${pending.length ? pending.map(card).join('') : '<p class="empty">Nothing waiting.</p>'}
  ${rest_.length ? rest_.map(card).join('') : ''}
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

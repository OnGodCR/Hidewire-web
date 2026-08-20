// ---------------------------------------------------------------------------
// POST /api/waitlist
//
// A Cloudflare Pages Function. It is the only server-side code on this site.
//
// The browser never talks to the database. It posts to this same-origin path,
// and this function forwards the address to Supabase using a service role key
// that only exists as a server-side secret. That is the whole reason for the
// hop: a direct browser-to-Supabase call would be a third-party request from
// the visitor's device, which is exactly what the privacy posture of this page
// rules out.
//
// What is stored: the email address, lowercased, and the time. Nothing else.
// Not the IP, not the user agent, not a referrer, not a country. Cloudflare
// sends all of those on `request.cf` and in the headers, and this function
// deliberately does not read them.
//
// Environment (set as secrets in the Pages project, never committed):
//   SUPABASE_URL                 https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role key, server side only
//   WAITLIST_TABLE               optional, defaults to waitlist_signups
//
// The table and its policies are in db/waitlist.sql.
// ---------------------------------------------------------------------------

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical maximum.

/**
 * One entry point for every method, rather than an `onRequest` plus an
 * `onRequestPost`, so there is no question about which handler wins.
 */
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    // A curious GET goes back to the form rather than showing anything.
    return Response.redirect(new URL('/#waitlist', context.request.url).toString(), 303);
  }
  return handleSignup(context);
}

async function handleSignup(context) {
  const { request, env } = context;
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');

  let email = '';
  let trap = '';

  try {
    const type = request.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const body = await request.json();
      email = typeof body.email === 'string' ? body.email : '';
      trap = typeof body.company === 'string' ? body.company : '';
    } else {
      const body = await request.formData();
      email = String(body.get('email') || '');
      trap = String(body.get('company') || '');
    }
  } catch {
    return respond(wantsJson, 400, 'invalid');
  }

  // The honeypot. A filled hidden field means a bot, and the honest answer is
  // to say nothing useful about that: report success, store nothing.
  if (trap.trim() !== '') {
    return respond(wantsJson, 200, 'added');
  }

  email = email.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !LOOKS_LIKE_EMAIL.test(email)) {
    return respond(wantsJson, 400, 'invalid');
  }

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('waitlist: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set on this deployment');
    return respond(wantsJson, 500, 'error');
  }

  const table = env.WAITLIST_TABLE || 'waitlist_signups';

  let upstream;
  try {
    upstream = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    console.error('waitlist: could not reach the database', error);
    return respond(wantsJson, 502, 'error');
  }

  if (upstream.status === 201 || upstream.status === 200 || upstream.status === 204) {
    return respond(wantsJson, 200, 'added');
  }

  const detail = await upstream.text().catch(() => '');

  // A repeat signup has to read as "already on the list", not as an error, and
  // the unique index on the address is what makes that possible. PostgREST
  // usually reports the violation as 409, but the status has moved between
  // versions, so the Postgres error code in the body is the thing actually
  // worth trusting. 23505 is unique_violation.
  if (upstream.status === 409 || detail.includes('23505') || /duplicate key/i.test(detail)) {
    return respond(wantsJson, 200, 'known');
  }

  console.error(`waitlist: database returned ${upstream.status}`, detail.slice(0, 500));
  return respond(wantsJson, 502, 'error');
}

// ---------------------------------------------------------------------------

const COPY = {
  added: {
    heading: 'You are on the list',
    body: 'We will email you once, when the beta opens. Nothing else, and nobody else gets the address.',
  },
  known: {
    heading: 'Already on the list',
    body: 'That address is on the waitlist already. There is nothing else to do.',
  },
  invalid: {
    heading: 'That address did not look right',
    body: 'Go back and check it. An email address is the only thing this page asks for.',
  },
  error: {
    heading: 'Something went wrong at our end',
    body: 'Nothing was saved. Try again in a minute, or write to support@frame.game and we will add you by hand.',
  },
};

function respond(wantsJson, code, status) {
  if (wantsJson) {
    return new Response(JSON.stringify({ status }), {
      status: code,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response(page(status), {
    status: code,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * The no-JavaScript path. A browser with scripting off does a plain form POST
 * and lands here, so the form still works and still says what happened.
 */
function page(status) {
  const copy = COPY[status] || COPY.error;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.heading} · Hidewire</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0A0C">
<link rel="icon" href="/assets/hidewire-mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-head">
  <div class="head-inner">
    <a class="lockup" href="/"><span class="brackets" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wordmark">Hidewire</span></a>
  </div>
</header>
<main id="main" class="doc">
  <h1>${copy.heading}</h1>
  <p class="doc-intro">${copy.body}</p>
  <p><a class="btn btn-ghost" href="/">Back to the site</a></p>
</main>
<footer class="site-foot">
  <div class="foot-inner">
    <nav aria-label="Footer">
      <ul class="foot-links">
        <li><a href="/terms/">Terms of service</a></li>
        <li><a href="/privacy/">Privacy policy</a></li>
        <li><a href="mailto:support@frame.game">support@frame.game</a></li>
      </ul>
    </nav>
  </div>
</footer>
</body>
</html>`;
}

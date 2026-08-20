// ---------------------------------------------------------------------------
// GET/POST /api/ig-webhook
//
// Meta's webhook for Instagram DMs to @hidewire_game. Two jobs:
//
//   GET   the one-time subscription handshake: echo hub.challenge when the
//         verify token matches.
//   POST  message events. Every sender is recorded in ig_contacts. Only a
//         contact a human has flagged is_reviewer=true can decide anything,
//         and the only words that count are "approve <deck>" or
//         "decline <deck>" (or the quick-reply payloads APPROVE:<deck> /
//         DECLINE:<deck>). Everything else is stored as last_text and
//         ignored. A stranger DMing "approve" is a row, not a decision.
//
// Signature: when META_APP_SECRET is set, X-Hub-Signature-256 is verified
// and a mismatch is rejected. Set it; the option to run without it exists
// only so the handshake can be tested before the secret is configured.
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IG_VERIFY_TOKEN,
// META_APP_SECRET.
// ---------------------------------------------------------------------------

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const ok =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === env.IG_VERIFY_TOKEN &&
      env.IG_VERIFY_TOKEN;
    return ok
      ? new Response(url.searchParams.get('hub.challenge'), { status: 200 })
      : new Response('forbidden', { status: 403 });
  }

  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await request.text();

  if (env.META_APP_SECRET) {
    const expected = request.headers.get('x-hub-signature-256') || '';
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.META_APP_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    const hex = 'sha256=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== expected) return new Response('bad signature', { status: 403 });
  }

  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Flight recorder: one row that always holds the last signed event that
  // arrived, whatever its shape. Signature-checked traffic only, service
  // role only reads it. Without this, a payload in a shape the parser does
  // not recognise is indistinguishable from no delivery at all.
  await fetch(`${env.SUPABASE_URL}/rest/v1/ig_contacts?on_conflict=igsid`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ igsid: 'debug:last-event', last_text: raw.slice(0, 200) }),
  });

  const events = [];
  for (const entry of body.entry || []) {
    for (const m of entry.messaging || []) events.push(m);
  }

  for (const ev of events) {
    const sender = ev.sender?.id;
    if (!sender || !ev.message) continue;
    const text = (ev.message.quick_reply?.payload || ev.message.text || '').trim();

    await fetch(`${env.SUPABASE_URL}/rest/v1/ig_contacts?on_conflict=igsid`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ igsid: sender, last_text: text.slice(0, 200) }),
    });

    const reviewer = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ig_contacts?igsid=eq.${sender}&is_reviewer=is.true&select=igsid`,
      { headers },
    ).then((r) => r.json()).catch(() => []);
    if (!Array.isArray(reviewer) || !reviewer.length) continue;

    const decision = text.match(/^(approve|decline)[:\s]+(\S.*)$/i);
    if (!decision) continue;

    await fetch(`${env.SUPABASE_URL}/rest/v1/ig_review?on_conflict=deck`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        deck: decision[2].trim(),
        status: decision[1].toLowerCase() === 'approve' ? 'approved' : 'declined',
        decided_at: new Date().toISOString(),
        via: 'instagram dm',
      }),
    });
  }

  return new Response('ok', { status: 200 });
}

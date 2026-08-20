// ---------------------------------------------------------------------------
// Tests for the one piece of server code on this site.
//
//   node tools/waitlist.test.mjs
//
// It stubs global fetch, so nothing here touches a real database. The point is
// the mapping from what the database says to what the visitor is told, because
// that mapping is what decides whether a duplicate signup looks like a working
// form or a broken one.
// ---------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/waitlist.js';
import vercelHandler from '../api/waitlist.js';

const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' };

let calls = [];
const upstream = (status, body) => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(body !== undefined ? body : status === 201 ? '' : 'body', { status });
  };
};

async function post({ body, type = 'application/json', accept = 'application/json', env = ENV }) {
  calls = [];
  const request = new Request('https://hidewire.org/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': type, Accept: accept },
    body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });
  const response = await onRequest({ request, env });
  const text = await response.text();
  return { code: response.status, text, type: response.headers.get('content-type') };
}

const tests = {
  async 'a new address is added'() {
    upstream(201);
    const res = await post({ body: { email: 'someone@example.com' } });
    assert.equal(res.code, 200);
    assert.deepEqual(JSON.parse(res.text), { status: 'added' });
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].init.body).email, 'someone@example.com');
  },

  async 'the address is lowercased and trimmed before it is stored'() {
    upstream(201);
    await post({ body: { email: '  Someone@Example.COM ' } });
    assert.equal(JSON.parse(calls[0].init.body).email, 'someone@example.com');
  },

  async 'a duplicate is known, not an error'() {
    upstream(409);
    const res = await post({ body: { email: 'someone@example.com' } });
    assert.equal(res.code, 200);
    assert.deepEqual(JSON.parse(res.text), { status: 'known' });
  },

  async 'a duplicate is known whatever status the database wraps it in'() {
    // PostgREST has reported unique violations as 409 and as 400 depending on
    // the version. The Postgres error code is the reliable signal, and a
    // repeat signup reading as an error is the exact bug worth a test.
    for (const status of [400, 409, 422, 500]) {
      upstream(status, JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }));
      const res = await post({ body: { email: 'someone@example.com' } });
      assert.deepEqual(JSON.parse(res.text), { status: 'known' }, `for HTTP ${status}`);
      assert.equal(res.code, 200);
    }
  },

  async 'a real failure is still an error'() {
    upstream(500, JSON.stringify({ code: '42P01', message: 'relation "waitlist_signups" does not exist' }));
    const res = await post({ body: { email: 'someone@example.com' } });
    assert.deepEqual(JSON.parse(res.text), { status: 'error' });
    assert.equal(res.code, 502);
  },

  async 'a bad address never reaches the database'() {
    upstream(201);
    for (const email of ['', 'nope', 'a@b', 'two words@example.com', `${'x'.repeat(250)}@example.com`]) {
      const res = await post({ body: { email } });
      assert.deepEqual(JSON.parse(res.text), { status: 'invalid' }, `for ${JSON.stringify(email)}`);
      assert.equal(res.code, 400);
    }
    assert.equal(calls.length, 0);
  },

  async 'the honeypot stores nothing and says nothing useful'() {
    upstream(201);
    const res = await post({ body: { email: 'bot@example.com', company: 'Acme' } });
    assert.deepEqual(JSON.parse(res.text), { status: 'added' });
    assert.equal(calls.length, 0, 'a filled honeypot must not reach the database');
  },

  async 'a missing key fails loudly rather than pretending to work'() {
    upstream(201);
    const res = await post({ body: { email: 'someone@example.com' }, env: {} });
    assert.equal(res.code, 500);
    assert.deepEqual(JSON.parse(res.text), { status: 'error' });
    assert.equal(calls.length, 0);
  },

  async 'an unexpected database status is an error, not a success'() {
    upstream(500);
    const res = await post({ body: { email: 'someone@example.com' } });
    assert.equal(res.code, 502);
    assert.deepEqual(JSON.parse(res.text), { status: 'error' });
  },

  async 'a form post without JavaScript gets a readable HTML page'() {
    upstream(201);
    const res = await post({
      body: { email: 'someone@example.com' },
      type: 'application/x-www-form-urlencoded',
      accept: 'text/html',
    });
    assert.equal(res.code, 200);
    assert.match(res.type, /text\/html/);
    assert.match(res.text, /You are on the list/);
    assert.match(res.text, /styles\.css/);
  },

  async 'a GET goes back to the form'() {
    const request = new Request('https://hidewire.org/api/waitlist', { method: 'GET' });
    const response = await onRequest({ request, env: ENV });
    assert.equal(response.status, 303);
    assert.match(response.headers.get('location'), /#waitlist$/);
  },

  async 'nothing about the visitor is sent upstream'() {
    upstream(201);
    await post({ body: { email: 'someone@example.com' } });
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(sent), ['email'], 'the only thing stored is the address');
  },

  // The Vercel adapter wraps the same endpoint, so one honeypot round trip
  // proves the wiring: it exercises the default export end to end with no
  // env vars and no network.
  async 'the vercel adapter serves the same endpoint'() {
    const request = new Request('http://site.test/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ email: 'bot@example.com', company: 'filled by a bot' }),
    });
    const response = await vercelHandler(request);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'added');
  },
};

let failed = 0;
const quiet = console.error;
console.error = () => {};
for (const [name, run] of Object.entries(tests)) {
  try {
    await run();
    quiet(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    quiet(`  FAIL  ${name}\n        ${error.message}`);
  }
}
console.error = quiet;
console.log(failed ? `${failed} failing` : `${Object.keys(tests).length} passing`);
process.exit(failed ? 1 : 0);


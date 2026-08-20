// ---------------------------------------------------------------------------
// Capture real screenshots of the app for the site.
//
// Every image on hidewire.org came out of this script. That is the point: the
// screenshots on the site are the app, not a mockup of the app.
//
// The app targets web as well as iOS and Android, so this exports it as static
// files and drives a real Chrome through an actual round. There is no server:
// Chrome asks for a URL, the script answers from the export directory. That
// keeps localStorage working (a file:// origin cannot be seeded) without
// running anything a browser could reach from outside this machine.
//
// To run it, from the app repo:
//
//   EXPO_PUBLIC_TEST_MODE=true npx expo export --platform web --dev \
//     --output-dir /tmp/appweb
//   npm i --no-save puppeteer-core
//   APP_DIR=/tmp/appweb node tools/capture-shots.mjs
//
// `--dev` matters. A production export refuses to boot with fixtures enabled
// (assertProductionSafe in the app's config.ts), and without fixtures there is
// no way to fill a party and start a round on one machine.
//
// It takes about five minutes, most of it waiting for a real check-in window,
// because the round clock runs in real time.
// ---------------------------------------------------------------------------

import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'shots');
const APP_DIR = process.env.APP_DIR || '/tmp/appweb';
const ORIGIN = 'http://hidewire.test';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the smallest element whose text matches, then its nearest pressable. */
async function tap(page, text, { timeout = 20000 } = {}) {
  const started = Date.now();
  for (;;) {
    const box = await page.evaluate((needle) => {
      const nodes = [...document.querySelectorAll('div,span,p')].filter((el) => {
        const own = (el.innerText || '').trim();
        return own === needle || own.startsWith(`${needle}\n`);
      });
      const el = nodes[nodes.length - 1];
      if (!el) return null;
      let target = el;
      for (let i = 0; i < 6 && target.parentElement; i++) {
        const style = getComputedStyle(target);
        if (target.getAttribute('tabindex') !== null || style.cursor === 'pointer') break;
        target = target.parentElement;
      }
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text);
    if (box) {
      await page.mouse.click(box.x, box.y);
      return;
    }
    if (Date.now() - started > timeout) throw new Error(`never found "${text}"`);
    await sleep(400);
  }
}

/**
 * Tap something, and keep tapping until the screen proves it landed.
 *
 * A single tap is not reliable here: the lobby is a long scrolling view with a
 * sticky footer, and a tap issued while it is still settling lands on whatever
 * used to be at those coordinates. Rather than sprinkling longer sleeps
 * around, every step that has to work says what it expects to see afterwards.
 */
async function tapUntil(page, text, expect, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await scrollToEnd(page);
    try {
      await tap(page, text, { timeout: 6000 });
    } catch {
      /* the control may already be gone because the tap landed */
    }
    await sleep(1200);
    const there = await page.evaluate((n) => document.body.innerText.includes(n), expect);
    if (there) return;
  }
  const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
  throw new Error(`tapped "${text}" ${tries} times and never saw "${expect}". On screen:\n${body}`);
}

/** Wait for text to appear anywhere on screen. */
async function waitForText(page, text, timeout = 60000) {
  const started = Date.now();
  for (;;) {
    const seen = await page.evaluate((n) => document.body.innerText.includes(n), text);
    if (seen) return true;
    if (Date.now() - started > timeout) {
      // The screen that is actually up is the only useful thing to say here.
      const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
      throw new Error(`timed out waiting for "${text}". On screen instead:\n${body}`);
    }
    await sleep(500);
  }
}

/** Scroll every scrollable region to the bottom. React Native Web nests them. */
async function scrollToEnd(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('div')
      .forEach((d) => {
        if (d.scrollHeight > d.clientHeight + 20) d.scrollTop = d.scrollHeight;
      });
  });
  await sleep(600);
}

async function scrollToTop(page) {
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((d) => {
      if (d.scrollHeight > d.clientHeight + 20) d.scrollTop = 0;
    });
  });
  await sleep(600);
}

async function shot(page, name) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  saved ${name}.png`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
  args: [
    // The check-in screen is a live viewfinder. Without a fake device it would
    // capture a permission error instead of the capture UI.
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--hide-scrollbars',
  ],
});

const page = await browser.newPage();

// Serve the export straight out of the filesystem. Anything the page asks for
// that is not in the export (a dev-server websocket, say) is refused rather
// than allowed out to the network.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.origin !== ORIGIN) return req.abort();
  let path = decodeURIComponent(url.pathname);
  if (path === '/' || path === '') path = '/index.html';
  try {
    const body = readFileSync(join(APP_DIR, path));
    const ext = path.slice(path.lastIndexOf('.'));
    req.respond({ status: 200, contentType: TYPES[ext] || 'application/octet-stream', body });
  } catch {
    req.respond({ status: 404, contentType: 'text/plain', body: 'not in the export' });
  }
});

console.log('loading the app');
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(4000);

// Walk the funnel rather than seeding around it. The splash always routes into
// onboarding, so a seeded account does not skip anything, and driving it for
// real means these screenshots come from a genuine cold start.
console.log('walking the onboarding funnel');
await waitForText(page, 'ENTER');
await tap(page, 'ENTER');

await waitForText(page, 'SET YOUR AGE', 20000);
// The age slider runs 1 to 80, so a third of the way along is the mid twenties.
// It is the 44 pixel tall strip directly above the hint text.
const slider = await page.evaluate(() => {
  // Last match, not first: every ancestor contains the text, and the one that
  // is only the text is the one with a useful position.
  const hints = [...document.querySelectorAll('div,span')].filter((el) =>
    (el.innerText || '').includes('SET YOUR AGE'),
  );
  const hint = hints[hints.length - 1];
  if (!hint) return null;
  const hintTop = hint.getBoundingClientRect().top;
  const bands = [...document.querySelectorAll('div')]
    .map((d) => ({ d, r: d.getBoundingClientRect() }))
    .filter(({ r }) => Math.round(r.height) === 44 && r.width > 200 && r.bottom <= hintTop + 4);
  const band = bands[bands.length - 1];
  if (!band) return null;
  return { x: band.r.x, y: band.r.y + band.r.height / 2, w: band.r.width };
});
if (!slider) throw new Error('could not find the age slider');
// A tap, not a click. The slider is built on the React Native responder
// system, which listens for touches on a device that reports touch support.
await page.touchscreen.tap(slider.x + slider.w * 0.3, slider.y);
await sleep(800);
await tap(page, 'CONTINUE');

await waitForText(page, 'Before you make an account', 20000);
await sleep(600);
await scrollToEnd(page);
await tap(page, 'I AGREE');

await waitForText(page, 'CONTINUE AS TEST ACCOUNT', 20000);
await tap(page, 'CONTINUE AS TEST ACCOUNT');

await waitForText(page, 'Pick a handle', 20000);
await page.evaluate(() => document.querySelector('input')?.focus());
await page.keyboard.type('NORTHFIELD');
await sleep(400);
await tap(page, 'CONTINUE');

// The tutorial is four beats that each need an action. Skip it: the screens it
// teaches are the ones being captured anyway.
await sleep(1200);
try {
  await tap(page, 'SKIP', { timeout: 8000 });
} catch {
  console.log('  no tutorial to skip');
}

await waitForText(page, 'HOST A ROUND', 30000);

// Two sequences. The tabs are reachable in seconds; a round costs five minutes
// of real time waiting for a check-in window, so it is opt out.
//   SHOTS=tabs   just the tab screens
//   SHOTS=round  just the round screens
//   unset        both
const WANT = process.env.SHOTS || 'all';

if (WANT === 'all' || WANT === 'tabs') {
  console.log('the leaderboard');
  await tap(page, 'SOCIAL');
  await sleep(1500);
  // The tab opens on FRIENDS, which is full of fixture friend codes. RANKS is
  // the one worth photographing.
  await tapUntil(page, 'RANKS', 'GLOBAL', 4);
  await sleep(1800);
  await scrollToTop(page);
  await shot(page, '06-leaderboard');

  console.log('the nearby tab');
  await tap(page, 'NEARBY');
  await sleep(1500);
  // Off by default and 18+, which is the whole design. Turning it on is what
  // the screenshot is of.
  const toggled = await page.evaluate(() => {
    const box = document.querySelector('input[type="checkbox"]');
    if (!box) return false;
    box.click();
    return true;
  });
  await sleep(1800);
  if (!toggled) console.log('  no switch found, capturing the tab as it is');
  await scrollToTop(page);
  await shot(page, '07-nearby');

  await tap(page, 'GAME');
  await sleep(1200);
  await waitForText(page, 'HOST A ROUND', 20000);
}

if (WANT === 'tabs') {
  await browser.close();
  console.log('done');
  process.exit(0);
}

console.log('opening the lobby');
await tap(page, 'HOST A ROUND');
await waitForText(page, 'INVITE CODE');
await sleep(1500);
await scrollToTop(page);

// ADD TEST PLAYERS only exists because TEST_MODE is on. It is not in a
// shipping build, so leaving it in a marketing screenshot would show people a
// control they will never see. Hidden for the frame, restored straight after,
// because the script still needs it to fill a party on one machine.
const unhide = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('div')].filter((el) =>
    (el.innerText || '').trim().startsWith('ADD TEST PLAYERS'),
  );
  const el = nodes[nodes.length - 1];
  if (!el) return false;
  let box = el;
  for (let i = 0; i < 4 && box.parentElement; i++) {
    if (getComputedStyle(box).borderStyle.includes('dashed')) break;
    box = box.parentElement;
  }
  box.setAttribute('data-capture-hidden', '1');
  box.style.visibility = 'hidden';
  return true;
});
await sleep(400);
await shot(page, '01-lobby');
if (unhide) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-capture-hidden]');
    if (el) el.style.visibility = '';
  });
}

console.log('filling the party and starting');
await tap(page, 'ADD TEST PLAYERS');
await sleep(1000);
await tapUntil(page, 'READ SAFETY CARD', 'I UNDERSTAND');
await tapUntil(page, 'I UNDERSTAND', 'ACKNOWLEDGED');
// The role reveal is a few seconds of full-screen type between the lobby and
// the map. "HIDE" on its own is not a safe thing to wait for, because the round
// screen that follows says "HIDING"; the seeker's name is unambiguous.
// The role reveal is only up for a few seconds, so this cannot poll on the
// same slow cadence as everything else: tap once, then watch closely enough to
// catch it, and carry on if it has already gone.
let started = false;
for (let attempt = 0; attempt < 5 && !started; attempt++) {
  await scrollToEnd(page);
  try {
    await tap(page, 'START ROUND', { timeout: 6000 });
  } catch {
    /* already tapped */
  }
  for (let i = 0; i < 30; i++) {
    const seen = await page.evaluate(() => {
      const t = document.body.innerText;
      return { reveal: t.includes('IS SEEKING'), round: t.includes('NEXT CHECK-IN') };
    });
    if (seen.reveal) {
      await shot(page, '02-hide');
      started = true;
      break;
    }
    if (seen.round) {
      console.log('  missed the role reveal, it is only up for a moment');
      started = true;
      break;
    }
    await sleep(200);
  }
}
if (!started) throw new Error('the round never started');

console.log('the round is running');
await waitForText(page, 'NEXT CHECK-IN', 40000);
await sleep(2500);
await shot(page, '03-round');

// A landmark, opened from the map. Tapping the label rather than the diamond:
// the marker is a shape with no text of its own, and the label sits right on
// top of it.
console.log('a landmark');
try {
  await tap(page, 'MUSEUM OF ILLUSIONS', { timeout: 8000 });
  await sleep(1800);
  await shot(page, '08-poi');
} catch {
  console.log('  could not open a landmark sheet');
}

if (WANT === 'poi') {
  await browser.close();
  console.log('done');
  process.exit(0);
}

// Then wait out a real check-in window. Nothing here can hurry it: the round
// clock is real time, which is the whole point of the mechanic.
//
// The capture screen itself is deliberately not photographed. On web the
// viewfinder is a procedural stand-in (see CameraStage in the app repo), so a
// screenshot of it would put an invented photo on a marketing page. What this
// waits for instead is what happens to a player who does nothing: the window
// opens, sixty seconds pass, and the round says so. That screen is real, it is
// pure typography, and it is the one everybody screenshots anyway.
console.log('waiting out a check-in window, up to seven minutes');
await waitForText(page, 'WORSE THAN BEING TAGGED', 440000);
await sleep(1500);
await shot(page, '04-blackout');

console.log('the results');
await tapUntil(page, 'SEE RESULTS', 'ROUND', 4);
await sleep(2000);
await shot(page, '05-results');

await browser.close();
console.log('done');

# hidewire.org

The public site for Hidewire. Three routes, one job: collect waitlist signups
without promising anything the product cannot do.

```
/            the waitlist page
/terms       the Terms of Service
/privacy     the Privacy Policy
/api/waitlist   the only server-side code on the site
```

Static HTML, CSS, and one small script. No framework, no build dependencies,
nothing installed from npm. `node build.mjs` copies `src/` into `dist/` and
renders the Markdown in `content/` into styled pages.

## Running it

```bash
npm run dev
```

Builds and serves on <http://localhost:4321>. The preview server stubs
`/api/waitlist` so the form's states can be exercised without a database. It
**remembers addresses**, in `.waitlist-dev.json`, so signing up twice locally
answers "already on the list" the way the real endpoint does. It used to be
stateless, which made a duplicate look like a fresh success and made the form
look broken when it was not. `taken@example.com` is always known,
`boom@example.com` is always an error, anything unparseable is invalid. Delete
`.waitlist-dev.json` to start over. The stub is in `tools/serve.mjs` and is
never deployed.

```bash
npm test
```

Tests the real endpoint in `functions/api/waitlist.js` against a stubbed
database.

```bash
npm run check
```

Parses both legal documents and lints the output without writing anything.

## The screenshots are the app

`src/assets/shots/` holds real captures, not mockups. `tools/capture-shots.mjs`
exports the app as a static web build, drives a real Chrome through the whole
onboarding funnel, hosts a round, fills the party, starts it, and then waits
out a real five minute check-in window. Read the header of that file to run it
again.

Three things follow, and all of them are deliberate:

- **The screenshots go stale when the app changes.** Rerunning the script is
  the fix, not editing an image.
- **The check-in screen is not photographed.** On web the viewfinder is a
  procedural stand-in (`CameraStage` in the app repo), so a screenshot of it
  would put an invented photograph on a marketing page and present it as
  somebody's real check-in. What the page shows instead is what happens to a
  player who lets the window close: `BLACKED OUT`. Real screen, real round, no
  invented photo. A real capture screen has to come off a phone.
- **One element is hidden for one frame.** `ADD TEST PLAYERS` exists only
  because `TEST_MODE` is on and is not in a shipping build, so the script hides
  it for the lobby shot and restores it immediately. That makes the screenshot
  more representative of the real app, not less, but it is still a doctored
  screenshot and worth knowing. Nothing else in any image is touched. If a
  capture ever includes one of the app's `TEST` tags, crop it or reshoot: a
  fixture must never look like a person on a marketing page.

## The scroller

The page is one long scroll with a **sticky phone**: the device stays put in
the middle of the screen while four copy panels move past it, and the screen
inside it changes at each step. `src/motion.js` runs it.

There is no scroll arithmetic. Each panel's copy reports when it crosses a band
of the viewport and the stage follows, which is shorter and much harder to get
subtly wrong than mapping scroll offsets to frames. Two details that are easy
to break:

- **The observer watches `.panel-copy`, not `.panel`.** A panel is a whole
  screen tall, so it enters the band long before its words do, and the screen
  behind would change while the previous step was still being read.
- **The band moves with the phone.** On a wide screen the phone is centered, so
  the band is the middle of the viewport. On a narrow one the phone is pinned
  to the top and the copy sits underneath it, so the band moves down to match.
  On narrow screens the inactive copy is fully transparent rather than dimmed,
  because a half-faded paragraph crossing a screenshot reads as a rendering
  fault rather than a transition.

### The ambient layer

Behind the phone, purely cosmetic, and borrowed from the app rather than
invented: the dashed play zone ring, the diamonds the map marks landmarks with,
and a reveal ping that fires once on every step change. It is markup in the
stage plus CSS keyframes, no canvas and no library.

Two rules it stays inside:

- **Nothing above 12 percent opacity**, because the accent is supposed to mean
  "this is the thing to act on" and there is a live Join button on the page. If
  it ever reads as decoration competing with the form, it is too bright.
- **It all stops under reduced motion.** The rings hold still, the diamonds are
  not drawn at all, and the ping never fires. Verified by emulating the media
  feature: zero running animations.

On top of that, **each step has one signature effect of its own**, keyed off
`data-step` on the stage, and only one is ever visible:

| Step | Signature | The phone |
|---|---|---|
| 01 the lobby | rings and drifting landmarks | centred |
| 02 the drop | twelve trails firing outward | leans left, tilts |
| 03 the check-in | red bands sweeping down, layer dims | steps right, grows |
| 04 the hunt | a radar sweep, zone ring contracts | leans left, tilts back |
| 05 around you | landmarks in orbit | steps right, shrinks |
| 06 the ladder | bars rising along the floor | leans left |

The device moving is the part you notice first, and it always leans away from
whichever side the copy is on. The screens also arrive three different ways,
cycling: scale, rise, and a wipe that stays opaque and is hidden by its own
clip, which is what makes it read as a reveal rather than a fade.

**Only the live layer animates.** Five of the six are invisible at any moment
and an invisible layer still burns frames, so the rest are paused. The rule
that does it has to sit *after* every `animation:` shorthand in the file: the
shorthand resets play-state to running, so writing it earlier silently undoes
it. Running animations at rest went from 47 to 17 when that was fixed.

### The lane the phone sits in

`.panel` is a three column grid on desktop and **the middle column is empty and
exactly the width of the phone**. That is not decoration. With a single column
and a centred device, the copy reaches the phone at any window narrower than
about 1200 and overlaps it below 1050, which is most laptops. Measured before
the fix: 42 pixels of overlap at 1024, 13 pixels of clearance at 1180. After:
56 pixels at 1024, 124 at 1440 and up.

The breakpoint is **64rem**, not 60. At 60 the reserved lane leaves the copy
columns around 280 pixels wide with 16 pixels of clearance, which is the same
crowding one size down. If you change it, change it in `styles.css` and in
`motion.js`, which uses the same query to decide where the live band sits.

`motion.js` is loaded in the `<head>` **without `defer`**, which looks wrong and
is not. Every CSS rule that hides an element is scoped to `.js-motion`, a class
this script sets before the first paint. No script, an old browser, or reduced
motion means the class is never set, nothing is hidden, and the page is a
static one: the phone still sticks, the first screen stays up, and all four
panels read in order. Get that backwards and the page is **blank** rather than
static, which is what the first draft did.

## Type and the mark

Space Grotesk carries the page, 400 for body and 700 for headings. IBM Plex
Mono is kept for one job, the letterspaced caps label, which is the most
recognizable part of the app's look.

An earlier version set everything in mono to match `theme.ts`, where the app
made mono its base face. At paragraph length on a wide screen it was hard to
read, which is the whole reason a display face and a text face are different
things. **The site and the app disagree about this on purpose.**

The mark in the header and footer is `brand/frame-mark.svg` from the app repo
with its background plate removed, so it works on any surface. Its viewfinder
brackets are part of the artwork, which is why nothing draws a second set
around the wordmark.

## The numbers on the page

Every figure in the scroller copy is the app's own default, checked against
`mobile/src/screens/JoinLobby.tsx` (`DEFAULT_SETTINGS` and `SETTING_DEFS`) and
`PRD.md`, not written from memory:

| On the page | Where it comes from |
|---|---|
| Party 3 to 20 | PRD 4.1 |
| Round 20 to 120 min, 30 by default | `SETTING_DEFS.round`, CITY preset |
| Zone 1 km across | CITY preset |
| Seeker held 5 min | The role reveal screen |
| Check-in every 3, 5, or 10 min | `SETTING_DEFS.checkin` |
| 60 second window, two photos | PRD 4.4 |
| Reveal 30 s, every 10 min | `SETTING_DEFS.visible` and `.reveal` |
| Zone shrinks in the last third | PRD 4.6 |
| Cache, beacon, waystation | PRD 6 |

**One thing that was wrong and is now fixed:** the page used to say the zone
was "a square kilometer of city". The app's default zone is a circle a
kilometer across, which is about 0.79 square kilometers. It now says "a zone
about a kilometer across".

**The "eighteen and over" in step 05 is load bearing**, not a detail. It is
what makes describing nearby games defensible at all. See `LEGAL-GAPS.md` 1b.

**Buffs are described as earned, never bought.** Items come from walking to a
cache; the paid track is cosmetics only, and that is a hard constraint in
PRD 8, not a preference. Any copy that implies an item can be purchased
contradicts the Terms published on this same site.

## The rules this site is built to

Read `marketing/BRIEF.md` in the app repo, especially section 9, before
changing any copy. The short version, because these are legal lines rather
than style preferences:

- **Never imply the app recognizes faces or identifies people.** It measures
  brightness, blur, entropy, and edge detail on the whole image. Implying
  otherwise invites a biometric privacy claim under BIPA and its equivalents.
- **Never imply you can play with strangers.**
- **Never depict or suggest** trespassing, hiding on private property, hiding
  near roads or tracks, or playing in a vehicle.
- **Never imply anything purchasable helps you win.**
- **Never promise the photos are private.** They go to the Seeker. What can be
  promised is that they are deleted 24 hours after the round.
- **No launch date**, because there is not one.
- **No em-dashes**, anywhere. `build.mjs` fails the build if one reaches the
  output.

### What the page deliberately does not say

An earlier version carried a "what it is not" section: invite codes only, no
face recognition, photos deleted after 24 hours, nothing purchasable helps you
win. **It was removed on purpose.** The page should not make commitments about
how the product will behave at launch, and every one of those lines was a
commitment.

Two things follow. First, if it goes back, it goes back as statements about
what the app does today, checked against the app. Second, the rules below are
unaffected: they are prohibitions on what may be claimed, not requirements to
claim anything, so saying less is always safe and saying more is what needs
checking.

The one forward-looking promise the page does make is the launch-day reward.
See `LEGAL-GAPS.md` section 1a for what has to be true for it to be kept.

### No third parties, and why it is enforced rather than intended

There is no analytics, no tracking pixel, no embed, no ad tag, and no cookie
banner, because there are no cookies to consent to. The audience includes 13 to
17 year olds, which is what turns this from a taste question into a legal one.

Two things keep it that way after everyone has forgotten this paragraph:

- The Content Security Policy in `src/_headers` is `default-src 'none'` with
  `'self'` for everything the site actually uses. A pasted-in analytics snippet
  is refused by the browser.
- `build.mjs` fails the build if the output references a font CDN, Google
  Analytics, Tag Manager, Facebook, jsDelivr, or unpkg.

The fonts are self-hosted for the same reason: a font CDN logs the visitor's IP
on every page view, which would make the privacy policy untrue.

## The form

One field. Email only. Every extra field is data that has to be justified in
the policy and protected forever.

It posts to `/api/waitlist` on the same origin. The browser never talks to the
database: the Pages Function forwards the address to Supabase with a service
role key that only exists as a server-side secret. What gets stored is the
address and the time. Not the IP, not the user agent, not a referrer.

**The table exists.** `waitlist_signups` was created on the live project on
2026-08-02 by migration `0012_waitlist.sql` in the app repo. See `db/README.md`.
Nothing is deployed yet, so the only thing missing is the key.

The form works with JavaScript off. It is a real `POST`, and the endpoint
answers a non-JSON request with a full HTML page saying what happened.
`waitlist.js` upgrades that to an inline message so the page does not navigate.

Counting signups is `select count(*) from waitlist_signups`.

## Deploying

The endpoint is written against standard `Request` and `Response`, so hosting
is a question of adapters, not rewrites. Two hosts are wired up; deploy to
exactly one:

**Vercel** (the current target). `api/waitlist.js` is an Edge Function that
wraps the shared endpoint, and `vercel.json` carries the build settings and
every header from `src/_headers`, because Vercel does not read that file.

1. The table already exists, from migration `0012_waitlist.sql` in the app
   repo, and was verified live on 2026-08-20. Nothing to run.
2. Push this repo to GitHub and import it at vercel.com. Framework preset
   "Other"; build command and output directory come from `vercel.json`.
3. Set two environment variables, marked Sensitive, on production and
   preview: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. See
   `.env.example`. The service role key bypasses row-level security, so it
   belongs nowhere except here.
4. Add `hidewire.org` under Domains and set the records it prescribes at the
   registrar.

**Cloudflare Pages** (the original target, still works). It runs
`functions/api/waitlist.js` directly and reads `src/_headers` natively. Same
four steps, in a Pages project instead.

If the variables are missing, the form reports an error and logs one, rather
than silently dropping signups. Whichever host serves production, the CSP in
`src/_headers` and `vercel.json` must stay identical: a header change is not
done until it is made in both files.

## Adding the two pages that are coming

Both are Apple App Review requirements before the app can ship, and the site is
shaped so neither needs a redesign:

- **A POI complaint form**, where a business or property owner can ask for a
  location to be removed, with the 15 day commitment the privacy policy already
  makes.
- **A public explainer**, `/what-is-this`, that a player stopped by a police
  officer or a security guard can show. The app has an offline version of this
  in `mobile/src/components/RoundChrome.tsx` and the web version should say the
  same thing.

For a text page: add the Markdown to `content/`, add one entry to `DOCS` in
`build.mjs`, and add the link to the footer. For the complaint form: add a
second function next to the waitlist one (both hosts, like the first), and give it the same treatment,
same origin, minimum fields, no third parties.

## Layout

```
build.mjs             the whole build
content/*.md          verbatim copies of legal/ from the app repo
src/                  everything that ships as-is
src/_headers          CSP and caching, Cloudflare Pages format
vercel.json           the same headers plus build settings, Vercel format
functions/api/        the waitlist endpoint, host-neutral
api/waitlist.js       Vercel edge adapter around it
db/waitlist.sql       the table, run once
tools/                preview server and tests, never deployed
LEGAL-GAPS.md         what a human still has to decide
```

Brand values come from `mobile/src/theme.ts` in the app repo. Do not invent
colors here. If the app changes, change it there first.

The fonts are subsets of IBM Plex Mono and Space Grotesk, both under the SIL
Open Font License, cut down to Latin at build time from the copies in the app's
`node_modules`. The licenses ship alongside them in `src/fonts/`.

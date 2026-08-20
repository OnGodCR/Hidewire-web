# What a human still has to decide

Nothing in this file has been changed in the published documents. The brief for
this site said not to rewrite the substance of `legal/TERMS.md` or
`legal/PRIVACY.md`, and it has not been rewritten: `content/terms.md` and
`content/privacy.md` are byte-for-byte copies of the app repo's versions.

These are the things that came up while converting them. They need Angad or a
lawyer, not an engineer.

---

## 1. The privacy policy does not describe the waitlist. This one blocks launch.

**This is the gap that matters.** The policy describes email addresses
collected through Google or Apple sign-in inside the app. It says nothing about
an address typed into a website before the app exists. That is a different
collection, for a different purpose, held in a different table.

The site does not paper over it: the sentence next to the signup button says
what the address is for, that it is not sold or shared, and how to have it
deleted. That is honest but it is not a privacy policy.

Proposed clause, to be pasted into `legal/PRIVACY.md` under **What we collect**
after a human has read it:

> Waitlist: if you give us your email address at hidewire.org, we store that
> address and the date you gave it, and nothing else. We do not store your IP
> address, your device, or where you came from. We use it once, to tell you
> when the beta opens. It is deleted when the beta opens, or sooner if you ask
> us at hidewiresupport@gmail.com.

If that last sentence is adopted, **something has to actually delete the rows**
when the beta opens. A retention promise with no job behind it is worse than
no promise.

## 1a. The page promises a launch-day reward

The hero says every address on the list gets a link to an exclusive in-game
reward when the game drops. That is a commitment to people who give you an
email address, so two things have to be true when the day comes:

- **Something has to exist to send.** Ideally a cosmetic that is only ever
  granted to waitlist addresses and is not in the shop or the pass afterwards.
- **The list has to still be reachable.** Which is the same retention question
  as section 1: a policy that deletes the addresses at launch and a promise to
  email them at launch cannot both be kept unless the email goes first.

**The page used to say "Cosmetic, one time, and never offered again" and no
longer does.** Angad removed it on 2026-08-02 as clutter, which is his call.
Recording it here because the constraint it described has not gone anywhere:
`marketing/BRIEF.md` section 9 rules out anything that hands out an advantage,
and a waitlist reward that affects a round is an advantage handed out for an
email address, the same problem as selling FILM. The page no longer says the
reward is cosmetic, so **the reward itself has to be**, and nobody reading the
site will be able to tell the difference until launch.

## 1b. The site now describes games with people you have not met

Panel 05 says: *"Adults can also see games starting nearby and ask to join one.
That is off until you turn it on, and it never shows anyone where you are."*

`marketing/BRIEF.md` section 9 says never imply you can play with strangers.
`CLAUDE.md` section 3 records that the NEARBY tab crosses that line knowingly:
18+ only, opt in, off by default, coarse distance buckets rather than
positions, requests rather than messaging, report and block on every row.

Until now the site stayed on the safe side of that by saying nothing. It no
longer does, at Angad's request, so the supersession is now **public** rather
than internal. The sentence was written to carry the guardrails with it, and
the screenshot beside it shows them: the off-by-default switch, the "under 500
m" buckets, ASK TO JOIN, and REPORT BLOCK on every row.

Two things follow:

- **If NEARBY ever widens** (exact positions, messaging, matchmaking, or under
  18s), this sentence becomes false and has to change before the app ships,
  not after.
- **The 18+ part is not decoration.** It is the reason the feature is
  defensible, and it should stay next to any mention of nearby games in any
  marketing, not just here.

## 2. The contact address, resolved 2026-08-20

Both documents pointed at `support@frame.game`, a domain that matched neither
the product nor the site. Angad picked `hidewiresupport@gmail.com`, and it is
now in both legal documents (changed upstream in the app repo, so the site's
verbatim copies stay verbatim), the site footer, and the form's error message.

Still open from the same family: the in-round explainer card in the app
(`mobile/src/components/RoundChrome.tsx`) shows `frame.game/what-is-this`.
That should become `hidewire.org/what-is-this` once that page exists, and the
page is one of the two pre-launch pages this file already lists.

## 3. Section 7 of the Terms says it will change

The limitation of liability section says outright that it has not been reviewed
and will change before public launch. Publishing that is defensible for a
waitlist page. It is not defensible on the day the app ships.

## 4. Both documents are written in British spelling

"personalised", "recognises", "behavioural", "metres". The site's own copy is
American, per the brief. The legal text was left exactly as written, so the two
voices sit next to each other. Cosmetic, and only worth a pass if someone is
editing the documents for another reason anyway.

## 5. The Terms say the round is 45 minutes, the app says 30

Not in the legal documents themselves, but worth recording here because it is
the same class of drift: `PRD.md` says 45, `marketing/BRIEF.md` says 45, and the
product decision recorded in `CLAUDE.md` section 3 says 30. **The site says 30**,
because that is what the app does. If the product moves back, the copy in
`src/index.html` has to move with it.

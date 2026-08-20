// ---------------------------------------------------------------------------
// The waitlist form.
//
// The form works without this file: it is a real POST to /api/waitlist, and the
// endpoint answers a non-JSON request with a full HTML confirmation page. This
// script only upgrades that to an inline result so the page does not navigate.
//
// It talks to one same-origin endpoint and nothing else. No analytics, no
// pixels, no cookies, no storage. If you are about to add any of those, read
// the privacy section of the brief again first: the audience includes 13 to 17
// year olds, and that is what makes it a real problem rather than a taste one.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  var form = document.getElementById('waitlist-form');
  if (!form || typeof window.fetch !== 'function') return;

  var input = document.getElementById('email');
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');

  // Deliberately loose. Real address validity is decided by whether the mail
  // arrives, not by a regular expression, and an over-strict pattern rejecting
  // a valid address is a signup lost for no reason.
  var LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

  var MESSAGES = {
    empty: 'Enter an email address first.',
    invalid: 'That does not look like an email address. Check it and try again.',
    ok: 'You are on the list. We will email you once, when the beta opens.',
    known: 'That address is already on the list. Nothing else to do.',
    error: 'Something went wrong at our end. Try again, or email hidewiresupport@gmail.com.',
  };

  function say(state, message) {
    status.textContent = message;
    status.setAttribute('data-state', state);
  }

  function busy(on) {
    button.disabled = on;
    button.textContent = on ? 'Sending' : 'Join';
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var email = input.value.trim();
    if (!email) {
      say('error', MESSAGES.empty);
      input.focus();
      return;
    }
    if (!LOOKS_LIKE_EMAIL.test(email)) {
      say('error', MESSAGES.invalid);
      input.focus();
      return;
    }

    busy(true);
    say('', 'Sending.');

    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: email, company: form.elements.company.value }),
    })
      .then(function (response) {
        return response.json().catch(function () {
          return { status: 'error' };
        });
      })
      .then(function (body) {
        var state = body && body.status;
        if (state === 'added') {
          say('ok', MESSAGES.ok);
          form.reset();
        } else if (state === 'known') {
          say('known', MESSAGES.known);
        } else if (state === 'invalid') {
          say('error', MESSAGES.invalid);
        } else {
          say('error', MESSAGES.error);
        }
      })
      .catch(function () {
        say('error', MESSAGES.error);
      })
      .then(function () {
        busy(false);
      });
  });
})();

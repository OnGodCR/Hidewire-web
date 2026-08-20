// ---------------------------------------------------------------------------
// The scroller, and the countdown.
//
// Loaded in the head without `defer`, on purpose. The first thing it does is
// mark the document, and every CSS rule that hides something hangs off that
// mark. With JavaScript off nothing is ever hidden: the phone sticks with its
// first screen up and all four panels read in order. Set the mark later and
// the page would flash its hidden state instead.
//
// There is no scroll maths here. Each panel reports when it crosses the middle
// band of the screen and the stage follows, which is both shorter and much
// harder to get subtly wrong than mapping scroll offsets to frames.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  var still =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;

  if (canObserve) document.documentElement.className += ' js-motion';

  function start() {
    if (!canObserve) return;

    // ---- the scroller -----------------------------------------------------
    var panels = [].slice.call(document.querySelectorAll('.panel'));
    var screens = [].slice.call(document.querySelectorAll('.phone-stage .screen'));
    var steps = [].slice.call(document.querySelectorAll('.steps li'));
    var ping = document.getElementById('ping');
    var stage = document.querySelector('.stage');
    var live = -1;

    function show(index) {
      if (index === live || index < 0) return;
      live = index;
      for (var i = 0; i < screens.length; i++) {
        screens[i].classList.toggle('is-live', i === index);
      }
      for (var j = 0; j < steps.length; j++) {
        steps[j].classList.toggle('is-live', j === index);
      }
      for (var k = 0; k < panels.length; k++) {
        panels[k].classList.toggle('is-live', k === index);
      }

      // The step number on the stage is what the ambient layer keys off, so
      // each step can behave differently without any of it living in here.
      if (stage) stage.setAttribute('data-step', String(index));

      // A reveal tick on every step change. Removing the class and reading a
      // layout property before adding it back is what restarts the animation;
      // without the read the browser coalesces both changes into no change.
      if (ping && !still) {
        ping.classList.remove('is-firing');
        void ping.offsetWidth;
        ping.classList.add('is-firing');
      }
    }

    if (panels.length) {
      show(0);

      // Only the panel crossing the middle of the screen counts as current, so
      // the swap happens once, at a predictable point, rather than twice on
      // the way past.
      // Where the "current" band sits depends on where the phone is. On a wide
      // screen the phone is centred, so the band is the middle. On a narrow
      // one the phone is pinned to the top and the copy lives underneath it,
      // so the band has to move down with it.
      var narrow = window.matchMedia('(max-width: 63.999rem)').matches;
      var margin = narrow ? '-58% 0px -6% 0px' : '-45% 0px -45% 0px';

      // Watch the copy, not the panel. A panel is a whole screen tall, so it
      // enters the band long before the words do, and the screen behind it
      // would change while the previous step was still the thing being read.
      var band = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var panel = entry.target.closest('.panel');
            var index = panel ? Number(panel.getAttribute('data-panel')) : NaN;
            if (!isNaN(index)) show(index);
          });
        },
        { rootMargin: margin, threshold: 0 },
      );
      panels.forEach(function (panel) {
        var copy = panel.querySelector('.panel-copy');
        if (copy) band.observe(copy);
      });
    }

    // ---- anything that fades in on its way up -----------------------------
    var reveals = document.querySelectorAll('[data-reveal]');
    if (reveals.length) {
      var seen = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            seen.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
      );
      for (var r = 0; r < reveals.length; r++) seen.observe(reveals[r]);

      // A tab that is never composited never fires an intersection callback,
      // so anything still hidden shortly after load is shown anyway. Better a
      // missed animation than an invisible page.
      window.setTimeout(function () {
        for (var s = 0; s < reveals.length; s++) reveals[s].classList.add('is-in');
      }, 2500);
    }

    // ---- the check-in countdown -------------------------------------------
    // Sixty seconds is the real window, so the number on the page is the
    // number the game gives you.
    var tick = document.getElementById('tick');
    if (!tick || still) return;

    var seconds = 60;
    var timer = null;

    function step() {
      seconds = seconds > 0 ? seconds - 1 : 60;
      tick.textContent = '00:' + (seconds < 10 ? '0' : '') + seconds;
    }

    function run(on) {
      if (on && !timer) timer = window.setInterval(step, 1000);
      if (!on && timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    new IntersectionObserver(
      function (entries) {
        run(entries[0].isIntersecting && !document.hidden);
      },
      { threshold: 0.4 },
    ).observe(tick);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) run(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

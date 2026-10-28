/* Gleam: cookie choices banner.
   Drives Wix's consent policy (loaded by the Wix site script), so Wix Analytics and any
   Google Analytics / Tag Manager connected in the Wix dashboard follow the visitor's choice. */
(function () {
  var KEY = 'gleam-consent';
  var VERSION = 1;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && v.version === VERSION ? v : null;
    } catch (e) { return null; }
  }
  function write(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, version: VERSION, at: new Date().toISOString() })); } catch (e) {}
  }
  function applyToWix(choice) {
    var on = choice === 'all';
    var policy = { functional: on, analytics: on, advertising: on, dataToThirdParty: on };
    function go() {
      try { window.consentPolicyManager.setConsentPolicy(policy); } catch (e) {}
    }
    if (window.consentPolicyManager) go();
    else window.addEventListener('consentPolicyManagerReady', go, { once: true });
  }

  var css =
    '.gc{position:fixed;z-index:96;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));max-width:30rem;padding:20px;border:1px solid rgba(243,241,234,0.22);border-radius:10px;background:#111114;color:#f3f1ea;font-family:"Onest",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;box-shadow:0 18px 50px rgba(0,0,0,0.55);transform:translateY(calc(100% + 32px));opacity:0;transition:transform 420ms cubic-bezier(0.16,1,0.3,1),opacity 300ms ease-out}' +
    '.gc.on{transform:none;opacity:1}' +
    '.gc h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;margin:0 0 8px}' +
    '.gc p{margin:0;color:#d6d4cd}' +
    '.gc a{color:#f3f1ea;text-decoration:underline;text-underline-offset:3px;text-decoration-color:#ff3b1d}' +
    '.gc-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}' +
    '.gc button{flex:1 1 9rem;min-height:44px;padding:0 18px;border-radius:9999px;font:inherit;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;cursor:pointer;transition:background-color 200ms ease-out,border-color 200ms ease-out}' +
    '.gc .gc-yes{background:#ff3b1d;color:#08080a;border:1px solid #ff3b1d}' +
    '.gc .gc-yes:hover{background:#ff6a3d;border-color:#ff6a3d}' +
    '.gc .gc-no{background:transparent;color:#f3f1ea;border:1px solid rgba(243,241,234,0.32)}' +
    '.gc .gc-no:hover{border-color:#f3f1ea}' +
    '.gc button:focus-visible{outline:2px solid #ff3b1d;outline-offset:3px}' +
    '@media (prefers-reduced-motion:reduce){.gc{transition:none}}' +
    '@media (min-width:768px){.gc{right:auto}}' +
    'body:has(#wixheadless-banner-container) .gc{bottom:calc(76px + env(safe-area-inset-bottom,0px))}';

  var box = null;
  function build() {
    if (box) return box;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    box = document.createElement('section');
    box.className = 'gc';
    box.setAttribute('aria-label', 'Cookie choices');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      '<h2>Your privacy</h2>' +
      '<p>We use essential storage to run bookings, and analytics to see how the site is used. You choose whether analytics runs. Read our <a href="/privacy.html#cookies">Privacy Policy</a>.</p>' +
      '<div class="gc-actions"><button type="button" class="gc-yes">Accept all</button><button type="button" class="gc-no">Essential only</button></div>';
    box.querySelector('.gc-yes').addEventListener('click', function () { choose('all'); });
    box.querySelector('.gc-no').addEventListener('click', function () { choose('essential'); });
    document.body.appendChild(box);
    return box;
  }
  function show(focus) {
    var b = build();
    b.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { b.classList.add('on'); }); });
    if (focus) setTimeout(function () { b.querySelector('.gc-yes').focus(); }, 60);
  }
  function hide() {
    if (!box) return;
    box.classList.remove('on');
    setTimeout(function () { if (box && !box.classList.contains('on')) box.hidden = true; }, 450);
  }
  function choose(choice) {
    write(choice);
    applyToWix(choice);
    hide();
  }

  window.gleamConsent = { open: function () { show(true); }, get: function () { var v = read(); return v ? v.choice : null; } };

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (t) { e.preventDefault(); show(true); }
  });

  function start() {
    var saved = read();
    if (saved) { applyToWix(saved.choice); return; }
    // Honor the browser's Global Privacy Control signal as an opt-out, without asking.
    if (navigator.globalPrivacyControl === true) { write('essential'); applyToWix('essential'); return; }
    setTimeout(function () { show(false); }, 1800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* Gleam: appearance menu (Light, Dark, Match my device). Dark is the default; the choice is remembered on this device. */
(function () {
  var KEY = 'gleam-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  var OPTIONS = [
    { id: 'light', label: 'Light', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
    { id: 'dark', label: 'Dark', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>' },
    { id: 'auto', label: 'Match my device', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>' }
  ];
  var CHECK = '<svg class="tm-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function saved() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    return v === 'light' || v === 'auto' ? v : 'dark';
  }
  function resolve(mode) {
    if (mode === 'auto') return mq && mq.matches ? 'light' : 'dark';
    return mode;
  }
  function paint(mode, animate) {
    var theme = resolve(mode);
    if (animate) root.classList.add('theme-anim');
    if (theme === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#08080a');
    var name = mode === 'auto' ? 'matching your device' : mode;
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].removeAttribute('aria-pressed');
      btns[i].setAttribute('aria-haspopup', 'menu');
      btns[i].setAttribute('aria-label', 'Appearance: ' + name);
      btns[i].setAttribute('title', 'Appearance');
    }
    if (menu) {
      var items = menu.querySelectorAll('[data-mode]');
      for (var j = 0; j < items.length; j++) items[j].setAttribute('aria-checked', items[j].getAttribute('data-mode') === mode ? 'true' : 'false');
    }
    if (animate) { clearTimeout(paint._t); paint._t = setTimeout(function () { root.classList.remove('theme-anim'); }, 500); }
  }
  function set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    paint(mode, true);
  }

  var menu = null, opener = null;
  function build() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Appearance');
    menu.hidden = true;
    var html = '<p class="tm-title">Appearance</p>';
    for (var i = 0; i < OPTIONS.length; i++) {
      var o = OPTIONS[i];
      html += '<button type="button" role="menuitemradio" aria-checked="false" data-mode="' + o.id + '"><span class="tm-icon">' + o.icon + '</span><span class="tm-label">' + o.label + '</span>' + CHECK + '</button>';
    }
    menu.innerHTML = html;
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      set(b.getAttribute('data-mode'));
      close(true);
    });
    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('[data-mode]'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') { close(false); }
    });
    document.body.appendChild(menu);
    paint(saved(), false);
    return menu;
  }
  function place() {
    if (!menu || menu.hidden || !opener) return;
    var r = opener.getBoundingClientRect();
    var w = menu.offsetWidth;
    var left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
    menu.style.left = left + 'px';
    menu.style.top = (r.bottom + 10) + 'px';
  }
  function open(btn) {
    build();
    opener = btn;
    menu.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { menu.classList.add('on'); });
    var cur = menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-mode]');
    setTimeout(function () { cur.focus({ preventScroll: true }); }, 30);
  }
  function close(refocus) {
    if (!menu || menu.hidden) return;
    menu.classList.remove('on');
    menu.hidden = true;
    if (opener) {
      opener.setAttribute('aria-expanded', 'false');
      if (refocus) opener.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (b) {
      e.preventDefault();
      if (menu && !menu.hidden && opener === b) close(false); else { close(false); open(b); }
      return;
    }
    if (menu && !menu.hidden && !menu.contains(e.target)) close(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu && !menu.hidden) close(true); });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', function () { close(false); }, { passive: true });
  if (mq) {
    var onChange = function () { if (saved() === 'auto') paint('auto', true); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  window.gleamTheme = { set: set, get: saved };
  function start() {
    paint(saved(), false);
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-expanded', 'false');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
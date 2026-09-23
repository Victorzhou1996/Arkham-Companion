/* Share every feature page; only the classic playing table uses the pinned UI. */
(function () {
  'use strict';
  var key = 'arkham-ui-version';
  var legacyPath = '/legacy-ui-20260923.1/';
  var here = new URL(window.location.href);
  var legacy = /^\/legacy-ui-[^/]+\//.test(here.pathname);
  function gamePage(url) { return /^#\/games\/[^/?#]+(?:\/|\?|$)/.test(url.hash); }
  var requested = here.searchParams.get('ui');
  var preferred;
  try { preferred = localStorage.getItem(key); } catch (_) {}
  if (preferred !== 'legacy' && preferred !== 'current') {
    preferred = requested === 'legacy' || requested === 'current' ? requested : legacy ? 'legacy' : 'current';
    try { localStorage.setItem(key, preferred); } catch (_) {}
  }
  function navigate(mode) {
    var next = new URL(window.location.href);
    next.pathname = mode === 'legacy' && gamePage(next) ? legacyPath : '/';
    next.searchParams.set('ui', mode);
    window.location.replace(next.href);
  }
  window.arkhamSwitchUi = function (mode) {
    if (!/^#\/settings(?:\?|$)/.test(window.location.hash) || (mode !== 'legacy' && mode !== 'current')) return;
    try { localStorage.setItem(key, mode); } catch (_) {}
    navigate(mode);
  };
  // Stale bookmarks must not change an explicit preference.
  if (requested !== preferred) {
    here.searchParams.set('ui', preferred);
    window.history.replaceState(window.history.state, '', here.href);
  }
  if (!gamePage(here) && (preferred === 'legacy' || (legacy && preferred !== 'current'))) {
    if (legacy) { navigate('legacy'); return; }
    document.documentElement.dataset.ui = 'legacy-editor';
    return;
  }
  if (preferred === 'legacy' && (!legacy || here.pathname !== legacyPath)) { navigate('legacy'); return; }
  if (legacy && preferred === 'current') { navigate('current'); return; }
  if (!legacy) return;
  window.addEventListener('hashchange', function () {
    if (!gamePage(new URL(window.location.href))) navigate('legacy');
  });
})();

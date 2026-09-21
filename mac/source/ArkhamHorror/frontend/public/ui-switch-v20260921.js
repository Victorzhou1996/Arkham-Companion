/* Isolated game UIs share one card editor, API and authenticated origin. */
(function () {
  'use strict';
  var key = 'arkham-ui-version';
  var legacyPath = '/legacy-ui-20260921.1/';
  var here = new URL(window.location.href);
  var legacy = /^\/legacy-ui-[^/]+\//.test(here.pathname);
  var cardPage = /^#\/(card-builder|card-marketplace)(\/|\?|$)/.test(here.hash);
  var requested = here.searchParams.get('ui');
  var preferred = requested === 'legacy' || requested === 'current' ? requested : null;
  try { preferred = preferred || localStorage.getItem(key); } catch (_) {}
  function switchMode(mode) {
    var next = new URL(window.location.href);
    next.pathname = mode === 'legacy' && !cardPage ? legacyPath : '/';
    next.searchParams.set('ui', mode);
    try { localStorage.setItem(key, mode); } catch (_) {}
    window.location.assign(next.href);
  }
  window.arkhamSwitchUi = switchMode;
  if (cardPage && preferred === 'legacy') {
    if (legacy) { switchMode('legacy'); return; }
    document.documentElement.dataset.ui = 'legacy-editor';
    return;
  }
  if (!legacy && preferred === 'legacy') { switchMode('legacy'); return; }
  if (legacy && preferred === 'current') { switchMode('current'); return; }
  if (!legacy) return;
  function mount() {
    if (document.getElementById('legacy-ui-return')) return;
    var button = document.createElement('button');
    button.id = 'legacy-ui-return'; button.type = 'button';
    button.textContent = '切换新版 UI';
    button.title = '切换到新版界面，保留当前游戏地址';
    button.style.cssText = 'position:fixed;right:140px;top:3px;z-index:100000;padding:5px 10px;border:1px solid #bca878;border-radius:5px;background:#17362a;color:#f1e5bf;font:13px sans-serif;cursor:pointer;max-width:40vw';
    button.onclick = function () { switchMode('current'); };
    document.body.appendChild(button);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();

(function () {
  'use strict';

  var BUNDLE_FORMAT = 'arkham-horror-local-deck-bundle';
  var SINGLE_FORMAT = 'arkham-horror-local-deck';
  var API_ROOT = '/api/v1/arkham/decks';
  var state = { decks: [], selected: new Set(), busy: false };

  function token() { return localStorage.getItem('arkham-token') || ''; }
  function randomId() {
    return crypto && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function safeName(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }

  async function api(path, options) {
    var request = options || {};
    var headers = Object.assign({}, request.headers || {}, { Accept: 'application/json' });
    if (token()) headers.Authorization = 'Token ' + token();
    if (request.body && !(request.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    request.headers = headers;
    var response = await fetch(API_ROOT + path, request);
    var text = await response.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (_error) { data = text; } }
    if (!response.ok) {
      var message = data && (data.message || data.error || data.errorMsg);
      throw new Error(message || (typeof data === 'string' && data) || ('HTTP ' + response.status));
    }
    return data;
  }

  function deckListOf(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.list && typeof value.list === 'object') return value.list;
    if (value.deckList && typeof value.deckList === 'object') return value.deckList;
    if (value.deck && typeof value.deck === 'object') return deckListOf(value.deck);
    if (value.data && typeof value.data === 'object') return deckListOf(value.data);
    if (value.slots && typeof value.slots === 'object' && (value.investigator_code || value.investigator)) return value;
    return null;
  }

  function normalizeDeck(value) {
    var list = deckListOf(value);
    if (!list) throw new Error('JSON 中没有找到 investigator_code 和 slots');
    var wrapper = value && value.deck && typeof value.deck === 'object' ? value.deck : value;
    var investigator = list.investigator_code || list.investigator || list.investigator_name || 'Unknown investigator';
    return {
      deckId: String((wrapper && wrapper.id) || list.id || randomId()),
      deckName: safeName(wrapper && wrapper.name, safeName(list.name || list.decklist_name, String(investigator))),
      deckUrl: (wrapper && wrapper.url) || list.url || null,
      deckList: list,
    };
  }

  function collectDecks(value) {
    if (Array.isArray(value)) return value.flatMap(collectDecks);
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.decks)) return value.decks.flatMap(collectDecks);
    try { return [normalizeDeck(value)]; } catch (_error) { return []; }
  }

  function normalizeExternalUrl(raw) {
    var text = String(raw || '').trim().replace(/[),.;\]}>，。；）】》]+$/g, '');
    if (/^\d+$/.test(text)) return 'https://arkhamdb.com/api/public/decklist/' + text;
    var parsed;
    try { parsed = new URL(text); } catch (_error) { return null; }
    var host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    var parts = parsed.pathname.split('/').filter(Boolean);
    var id;
    if (host === 'arkham.build') {
      if (parts[0] === 'decklist') return text;
      if ((parts[0] === 'deck' && parts[1] === 'view') || parts[0] === 'share') {
        id = parts[parts[0] === 'share' ? 1 : 2];
        return id ? 'https://api.arkham.build/v1/public/share/' + encodeURIComponent(id) : null;
      }
    }
    if (host === 'api.arkham.build') return text;
    if (host === 'arkhamdb.com') {
      if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'decklist') return text;
      if (parts[0] === 'decklist' && (parts[1] === 'view' || /^\d+$/.test(parts[1] || ''))) {
        id = parts[1] === 'view' ? parts[2] : parts[1];
        return id ? 'https://arkhamdb.com/api/public/decklist/' + encodeURIComponent(id) : null;
      }
    }
    return null;
  }

  function extractExternalUrls(text) {
    var candidates = String(text || '').match(/https?:\/\/[^\s<>'"，。；]+/gi) || [];
    String(text || '').split(/[\s,，;；]+/).forEach(function (part) {
      if (/^\d+$/.test(part.trim())) candidates.push(part.trim());
    });
    return Array.from(new Set(candidates.map(normalizeExternalUrl).filter(Boolean)));
  }

  function sortedObject(value) {
    if (Array.isArray(value)) return value.map(sortedObject);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce(function (result, key) {
      result[key] = sortedObject(value[key]); return result;
    }, {});
  }

  function deckFingerprint(value) {
    var normalized = normalizeDeck(value);
    var list = normalized.deckList;
    return JSON.stringify(sortedObject({
      name: normalized.deckName,
      investigator: list.investigator_code || list.investigator,
      taboo: list.taboo_id || null,
      slots: list.slots || {},
      sideSlots: list.sideSlots || list.side_slots || {},
    }));
  }

  function filenamePart(value) { return safeName(value, 'deck').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80); }
  function downloadJson(name, value) {
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = href; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
  }
  function log(message, kind) {
    var output = document.getElementById('arkham-bulk-log');
    if (!output) return;
    var line = document.createElement('div');
    line.className = 'arkham-bulk-log-line ' + (kind || 'info');
    line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
    output.appendChild(line); output.scrollTop = output.scrollHeight;
  }
  function setBusy(value) {
    state.busy = value;
    document.querySelectorAll('[data-bulk-action]').forEach(function (element) { element.disabled = value; });
  }
  function deckLabel(deck) {
    var list = deck.list || {};
    return safeName(deck.name, safeName(list.name, safeName(deck.investigatorName || list.investigator_name, '未命名牌组')));
  }

  function renderDecks() {
    var list = document.getElementById('arkham-bulk-deck-list');
    var count = document.getElementById('arkham-bulk-count');
    if (!list || !count) return;
    count.textContent = String(state.decks.length); list.replaceChildren();
    if (!state.decks.length) { var empty = document.createElement('p'); empty.className = 'arkham-bulk-empty'; empty.textContent = '当前账号还没有保存牌组。'; list.appendChild(empty); return; }
    state.decks.forEach(function (deck) {
      var row = document.createElement('div'); row.className = 'arkham-bulk-deck-row';
      var check = document.createElement('input'); check.type = 'checkbox'; check.checked = state.selected.has(deck.id);
      check.addEventListener('change', function () { if (check.checked) state.selected.add(deck.id); else state.selected.delete(deck.id); });
      var text = document.createElement('div'); text.className = 'arkham-bulk-deck-name';
      var strong = document.createElement('strong'); strong.textContent = deckLabel(deck);
      var small = document.createElement('small'); small.textContent = safeName(deck.investigatorName || (deck.list && deck.list.investigator_name) || (deck.list && deck.list.investigator_code), '未知调查员');
      text.append(strong, small);
      var exportOne = document.createElement('button'); exportOne.type = 'button'; exportOne.className = 'arkham-bulk-small'; exportOne.textContent = '单独导出';
      exportOne.addEventListener('click', function () { downloadJson(filenamePart(deckLabel(deck)) + '.json', { format: SINGLE_FORMAT, version: 1, exportedAt: new Date().toISOString(), deck: deck }); });
      row.append(check, text, exportOne); list.appendChild(row);
    });
  }

  async function refreshDecks() {
    if (!token()) throw new Error('没有检测到登录信息，请先回到游戏首页登录');
    var result = await api('', { method: 'GET' }); state.decks = Array.isArray(result) ? result : [];
    var validIds = new Set(state.decks.map(function (deck) { return deck.id; }));
    state.selected.forEach(function (id) { if (!validIds.has(id)) state.selected.delete(id); });
    renderDecks(); return state.decks;
  }

  async function saveDeck(normalized, fingerprints, skipDuplicates) {
    if (skipDuplicates) { var fingerprint = deckFingerprint(normalized); if (fingerprints.has(fingerprint)) return { skipped: true, name: normalized.deckName }; }
    var created = await api('', { method: 'POST', body: JSON.stringify(normalized) });
    if (skipDuplicates) fingerprints.add(deckFingerprint(created || normalized));
    return { skipped: false, name: normalized.deckName };
  }

  async function importNormalizedDecks(decks, sourceLabel) {
    var skipDuplicates = document.getElementById('arkham-bulk-skip-duplicates').checked;
    var fingerprints = new Set();
    state.decks.forEach(function (deck) { try { fingerprints.add(deckFingerprint(deck)); } catch (_error) {} });
    var success = 0, skipped = 0, failed = 0;
    for (var index = 0; index < decks.length; index += 1) {
      var item = decks[index];
      try {
        var outcome = await saveDeck(item, fingerprints, skipDuplicates);
        if (outcome.skipped) { skipped += 1; log('跳过重复牌组：' + outcome.name, 'warn'); }
        else { success += 1; log('已导入：' + outcome.name, 'ok'); }
      } catch (error) { failed += 1; log('导入失败（' + (item.deckName || (index + 1)) + '）：' + error.message, 'error'); }
    }
    log(sourceLabel + '完成：成功 ' + success + '，跳过 ' + skipped + '，失败 ' + failed, failed ? 'warn' : 'ok');
    await refreshDecks();
  }

  async function importLinks() {
    var urls = extractExternalUrls(document.getElementById('arkham-bulk-links').value);
    if (!urls.length) throw new Error('没有识别到 arkham.build / ArkhamDB 链接或 ArkhamDB 数字 ID');
    log('识别到 ' + urls.length + ' 个链接，开始获取…');
    var decks = [];
    for (var index = 0; index < urls.length; index += 1) {
      var url = urls[index];
      try {
        var deckList = await api('/fetch', { method: 'POST', body: JSON.stringify({ url: url }) });
        decks.push(normalizeDeck({ id: deckList.id || randomId(), name: deckList.name || deckList.decklist_name || deckList.investigator_name, url: deckList.url || url, list: deckList }));
        log('已读取链接 ' + (index + 1) + '/' + urls.length + '：' + url, 'ok');
      } catch (error) { log('链接读取失败：' + url + '（' + error.message + '）', 'error'); }
    }
    if (!decks.length) throw new Error('所有链接都读取失败');
    await importNormalizedDecks(decks, '链接批量导入');
  }

  async function importFiles(files) {
    if (!files.length) throw new Error('请先选择一个或多个 JSON 文件');
    var decks = [];
    for (var index = 0; index < files.length; index += 1) {
      var file = files[index];
      try { var found = collectDecks(JSON.parse(await file.text())); if (!found.length) throw new Error('没有找到可导入的牌组'); decks.push.apply(decks, found); log(file.name + '：读取到 ' + found.length + ' 个牌组', 'ok'); }
      catch (error) { log(file.name + '：' + error.message, 'error'); }
    }
    if (!decks.length) throw new Error('所选文件中没有可导入的牌组');
    await importNormalizedDecks(decks, '文件批量导入');
  }

  function exportSelected() {
    var selectedDecks = state.decks.filter(function (deck) { return state.selected.has(deck.id); });
    if (!selectedDecks.length) throw new Error('请至少选择一个牌组');
    var day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadJson('ArkhamHorror-decks-' + day + '.json', { format: BUNDLE_FORMAT, version: 1, exportedAt: new Date().toISOString(), deckCount: selectedDecks.length, decks: selectedDecks });
    log('已导出 ' + selectedDecks.length + ' 个牌组。', 'ok');
  }
  function runAction(action) {
    if (state.busy) return; setBusy(true);
    Promise.resolve().then(action).catch(function (error) { log(error.message || String(error), 'error'); }).finally(function () { setBusy(false); });
  }
  function makeElement(tag, attributes, text) {
    var element = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (key) { if (key === 'class') element.className = attributes[key]; else element.setAttribute(key, attributes[key]); });
    if (text) element.textContent = text; return element;
  }

  function buildUi() {
    if (document.getElementById('arkham-local-bulk-button')) return;
    var style = document.createElement('style');
    style.textContent = [
      '#arkham-local-bulk-button{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:1px solid #9fc36a;background:#73933f;color:#fff;border-radius:999px;padding:11px 17px;font:700 14px system-ui;box-shadow:0 8px 28px #0008;cursor:pointer}',
      '#arkham-local-bulk-overlay{position:fixed;inset:0;z-index:2147483001;background:#090c10dd;display:none;align-items:center;justify-content:center;padding:18px;font-family:system-ui;color:#eef2e8}#arkham-local-bulk-overlay.open{display:flex}',
      '.arkham-bulk-modal{width:min(1060px,100%);max-height:94vh;overflow:auto;background:#20262f;border:1px solid #ffffff20;border-radius:14px;box-shadow:0 24px 80px #000c}.arkham-bulk-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#20262ff2;border-bottom:1px solid #ffffff16}.arkham-bulk-head h2{margin:0;font-size:20px}.arkham-bulk-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer}',
      '.arkham-bulk-body{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:18px}.arkham-bulk-panel{background:#151a21;border:1px solid #ffffff12;border-radius:10px;padding:16px;min-width:0}.arkham-bulk-panel h3{margin:0 0 7px;font-size:16px}.arkham-bulk-panel p{margin:0 0 12px;color:#aeb7a8;font-size:13px;line-height:1.5}.arkham-bulk-panel textarea{box-sizing:border-box;width:100%;min-height:142px;resize:vertical;border:1px solid #ffffff20;border-radius:7px;background:#0e1217;color:#eef2e8;padding:10px;font:13px ui-monospace,monospace}',
      '.arkham-bulk-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.arkham-bulk-actions button,.arkham-bulk-file{border:0;border-radius:6px;background:#73933f;color:#fff;padding:9px 13px;font-weight:700;cursor:pointer;font-size:13px}.arkham-bulk-actions button.secondary{background:#343c47}.arkham-bulk-actions button:disabled{opacity:.5}.arkham-bulk-file input{display:none}.arkham-bulk-option{display:flex;align-items:center;gap:7px;margin-top:12px;color:#cbd2c4;font-size:13px}',
      '#arkham-bulk-deck-list{max-height:300px;overflow:auto;border:1px solid #ffffff12;border-radius:7px}.arkham-bulk-deck-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:9px;border-bottom:1px solid #ffffff0e}.arkham-bulk-deck-name{min-width:0}.arkham-bulk-deck-name strong,.arkham-bulk-deck-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arkham-bulk-deck-name small{color:#919b8c}.arkham-bulk-small{border:1px solid #ffffff20;background:transparent;color:#dfe5d8;border-radius:5px;padding:5px 8px;cursor:pointer}',
      '#arkham-bulk-log{grid-column:1/-1;max-height:170px;overflow:auto;background:#0d1116;border-radius:8px;padding:10px;font:12px ui-monospace,monospace}.arkham-bulk-log-line{padding:2px 0;color:#bbc4b4}.arkham-bulk-log-line.ok{color:#9bd266}.arkham-bulk-log-line.warn{color:#f0c56c}.arkham-bulk-log-line.error{color:#ff8178}.arkham-bulk-empty{padding:14px!important;margin:0!important}',
      '@media(max-width:760px){.arkham-bulk-body{grid-template-columns:1fr}.arkham-bulk-modal{max-height:100vh}#arkham-local-bulk-button{right:10px;bottom:10px}}'
    ].join('');
    document.head.appendChild(style);
    var openButton = makeElement('button', { id: 'arkham-local-bulk-button', type: 'button' }, '批量工具');
    var overlay = makeElement('div', { id: 'arkham-local-bulk-overlay' });
    overlay.innerHTML = '<div class="arkham-bulk-modal" role="dialog" aria-modal="true"><div class="arkham-bulk-head"><div><h2>Build 批量导入与导出</h2><small>当前账号牌组：<span id="arkham-bulk-count">0</span></small></div><button class="arkham-bulk-close" type="button">×</button></div><div class="arkham-bulk-body">'
      + '<section class="arkham-bulk-panel"><h3>从链接批量导入</h3><p>可整段粘贴，自动提取 arkham.build、ArkhamDB 链接或独立的 ArkhamDB 数字 ID。</p><textarea id="arkham-bulk-links" placeholder="把链接列表或整段文字粘贴到这里…"></textarea><div class="arkham-bulk-actions"><button id="arkham-bulk-import-links" data-bulk-action type="button">导入识别到的链接</button></div><label class="arkham-bulk-option"><input id="arkham-bulk-skip-duplicates" type="checkbox" checked> 跳过当前账号中完全相同的牌组</label></section>'
      + '<section class="arkham-bulk-panel"><h3>从 JSON 文件批量导入</h3><p>支持多选单牌组 JSON、批量包，以及个人存档备份中的牌组。</p><div class="arkham-bulk-actions"><label class="arkham-bulk-file"><input id="arkham-bulk-files" type="file" accept=".json,application/json" multiple>选择多个 JSON 文件</label><button id="arkham-bulk-import-files" data-bulk-action class="secondary" type="button">导入已选文件</button></div><p id="arkham-bulk-file-count">尚未选择文件</p></section>'
      + '<section class="arkham-bulk-panel" style="grid-column:1/-1"><h3>选择并导出牌组</h3><p>单独导出一个 JSON，或勾选多个牌组后合并导出为可再次批量导入的 JSON 包。</p><div class="arkham-bulk-actions"><button id="arkham-bulk-select-all" data-bulk-action class="secondary">全选</button><button id="arkham-bulk-select-none" data-bulk-action class="secondary">清空选择</button><button id="arkham-bulk-refresh" data-bulk-action class="secondary">刷新列表</button><button id="arkham-bulk-export" data-bulk-action>导出所选牌组</button></div><div id="arkham-bulk-deck-list"></div></section><div id="arkham-bulk-log" aria-live="polite"></div></div></div>';
    document.body.append(openButton, overlay);
    function open() { overlay.classList.add('open'); runAction(function () { return refreshDecks().then(function () { log('牌组列表已刷新。', 'ok'); }); }); }
    function close() { overlay.classList.remove('open'); }
    openButton.addEventListener('click', open); overlay.querySelector('.arkham-bulk-close').addEventListener('click', close);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); }); document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
    document.getElementById('arkham-bulk-import-links').addEventListener('click', function () { runAction(importLinks); });
    document.getElementById('arkham-bulk-import-files').addEventListener('click', function () { var input = document.getElementById('arkham-bulk-files'); runAction(function () { return importFiles(Array.from(input.files || [])); }); });
    document.getElementById('arkham-bulk-files').addEventListener('change', function (event) { var count = event.target.files ? event.target.files.length : 0; document.getElementById('arkham-bulk-file-count').textContent = count ? ('已选择 ' + count + ' 个文件') : '尚未选择文件'; });
    document.getElementById('arkham-bulk-select-all').addEventListener('click', function () { state.decks.forEach(function (deck) { state.selected.add(deck.id); }); renderDecks(); });
    document.getElementById('arkham-bulk-select-none').addEventListener('click', function () { state.selected.clear(); renderDecks(); });
    document.getElementById('arkham-bulk-refresh').addEventListener('click', function () { runAction(refreshDecks); });
    document.getElementById('arkham-bulk-export').addEventListener('click', function () { try { exportSelected(); } catch (error) { log(error.message, 'error'); } });
    if (new URLSearchParams(location.search).get('arkham-bulk') === '1') setTimeout(open, 200);
  }

  window.ArkhamLocalBulkTools = { extractExternalUrls: extractExternalUrls, normalizeExternalUrl: normalizeExternalUrl, normalizeDeck: normalizeDeck, collectDecks: collectDecks, deckFingerprint: deckFingerprint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi); else buildUi();
})();

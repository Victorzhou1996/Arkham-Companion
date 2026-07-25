(function () {
  var map = null
  var mapLoadAttempted = false

  function currentLanguage() {
    try {
      var stored = window.localStorage.getItem('language')
      if (stored) return stored.toLowerCase()
    } catch (_) {}

    return String(window.navigator.language || 'en').toLowerCase()
  }

  function isChinese() {
    return currentLanguage().startsWith('zh')
  }

  function normalize(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80)
      .toLowerCase()
  }

  function loadMap() {
    if (mapLoadAttempted) return map
    mapLoadAttempted = true

    try {
      var request = new XMLHttpRequest()
      request.open('GET', '/basic_entry_zh_map.min.json', false)
      request.send(null)
      if (request.status >= 200 && request.status < 300) {
        map = JSON.parse(request.responseText)
      }
    } catch (_) {
      map = null
    }

    return map
  }

  window.__translateBasicEntryZh = function (text) {
    if (!isChinese()) return text

    var translations = loadMap()
    if (!translations) return text

    return translations[normalize(text)] || text
  }
})()

<script setup lang="ts">
function legacy() {
  const url = new URL(window.location.href)
  url.pathname = '/legacy-ui-20260918.1/'
  url.searchParams.set('ui', 'legacy')
  try { localStorage.setItem('arkham-ui-version', 'legacy') } catch { /* explicit URL still works */ }
  window.location.assign(url.href)
}
</script>
<template><button type="button" class="ui-mode-switch" title="刷新并切换到 2026-08-26.3 原始 UI，保留当前游戏地址" @click="legacy">原始 UI</button></template>
<style scoped>.ui-mode-switch { padding: 2px 6px; min-height: 0; height: 22px; box-sizing: border-box; border: 1px solid #8f855f; border-radius: 4px; background: #17362a; color: #ecdfba; font: 11px/16px sans-serif; white-space: nowrap; cursor: pointer; }.ui-mode-switch:focus-visible { outline: 2px solid #efd397; outline-offset: 2px; }</style>

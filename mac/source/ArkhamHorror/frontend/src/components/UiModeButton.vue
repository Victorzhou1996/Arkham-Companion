<script setup lang="ts">
import { isLegacyEditor, LEGACY_UI_PATH } from '@/legacy/editorMode'
const legacyEditor = isLegacyEditor()
function legacy() {
  const url = new URL(window.location.href)
  const mode = legacyEditor ? 'current' : 'legacy'
  url.pathname = legacyEditor ? '/' : LEGACY_UI_PATH
  url.searchParams.set('ui', mode)
  try { localStorage.setItem('arkham-ui-version', mode) } catch { /* explicit URL still works */ }
  window.location.assign(url.href)
}
</script>
<template><button type="button" class="ui-mode-switch" title="切换界面，保留当前页面地址" @click="legacy">{{ legacyEditor ? '新版 UI' : '原始 UI' }}</button></template>
<style scoped>.ui-mode-switch { padding: 2px 6px; min-height: 0; height: 22px; box-sizing: border-box; border: 1px solid #8f855f; border-radius: 4px; background: #17362a; color: #ecdfba; font: 11px/16px sans-serif; white-space: nowrap; cursor: pointer; }.ui-mode-switch:focus-visible { outline: 2px solid #efd397; outline-offset: 2px; }</style>

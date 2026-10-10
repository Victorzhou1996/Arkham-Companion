<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isLegacyEditor } from '@/legacy/editorMode'
const { locale } = useI18n()
const current = isLegacyEditor() ? 'legacy' : 'current'
function apply(mode: 'legacy' | 'current') {
  const change = (window as unknown as { arkhamSwitchUi?: (mode: string) => void }).arkhamSwitchUi
  if (mode !== current) change?.(mode)
}
</script>
<template>
  <section class="box column">
    <h3>{{ locale.startsWith('zh') ? '游戏界面' : 'Game interface' }}</h3>
    <div class="ui-mode-options" role="group" :aria-label="locale.startsWith('zh') ? '游戏界面' : 'Game interface'">
      <button type="button" :aria-pressed="current === 'legacy'" :disabled="current === 'legacy'" @click="apply('legacy')">{{ locale.startsWith('zh') ? '传统 UI' : 'Classic UI' }}</button>
      <button type="button" :aria-pressed="current === 'current'" :disabled="current === 'current'" @click="apply('current')">{{ locale.startsWith('zh') ? '新版 UI' : 'Current UI' }}</button>
    </div>
  </section>
</template>
<style scoped>
.ui-mode-options { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ui-mode-options button { min-height: 40px; padding: 8px 16px; border: 1px solid var(--archive-line, #718777); border-radius: 4px; }
#app .ui-mode-options button[aria-pressed='true'] { background: #e5e2d6; color: #213c30; opacity: 1; cursor: default; }
</style>

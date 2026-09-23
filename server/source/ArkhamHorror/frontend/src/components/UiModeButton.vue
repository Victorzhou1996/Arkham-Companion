<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLegacyEditor } from '@/legacy/editorMode'
const { locale } = useI18n()
const current = isLegacyEditor() ? 'legacy' : 'current'
const selected = ref(current)
function apply() {
  const change = (window as unknown as { arkhamSwitchUi?: (mode: string) => void }).arkhamSwitchUi
  if (selected.value !== current) change?.(selected.value)
}
</script>
<template>
  <section class="box column">
    <h3>{{ locale.startsWith('zh') ? '游戏界面' : 'Game interface' }}</h3>
    <div class="ui-mode-options">
      <label><input v-model="selected" type="radio" name="ui-mode" value="legacy" />{{ locale.startsWith('zh') ? '传统 UI' : 'Classic UI' }}</label>
      <label><input v-model="selected" type="radio" name="ui-mode" value="current" />{{ locale.startsWith('zh') ? '新版 UI' : 'Current UI' }}</label>
      <button type="button" :disabled="selected === current" @click="apply">{{ locale.startsWith('zh') ? '应用并重新加载' : 'Apply and reload' }}</button>
    </div>
  </section>
</template>
<style scoped>
.ui-mode-options { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.ui-mode-options label { display: inline-flex; align-items: center; gap: 6px; }
</style>

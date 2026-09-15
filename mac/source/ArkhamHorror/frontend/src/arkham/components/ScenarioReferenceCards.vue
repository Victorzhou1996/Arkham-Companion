<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useTabletopLabels } from '@/arkham/composables/useTabletopLabels'
const props = defineProps<{ cards: string[]; enabled: boolean; spentKeys?: string; depth?: number | null }>()
const labels = useTabletopLabels()
const root = ref<HTMLElement | null>(null)
const expanded = ref(false)
const selected = ref(0)
const many = computed(() => props.enabled && props.cards.length > 1)
const open = computed(() => many.value && expanded.value)
function pick(index: number) { selected.value = index; expanded.value = true }
function close() { expanded.value = false }
onClickOutside(root, close)
watch(() => props.cards.length, () => { selected.value = Math.min(selected.value, Math.max(0, props.cards.length - 1)) })
</script>

<template>
  <div ref="root" class="reference-cards" :class="{ 'reference-cards--stack': many, 'reference-cards--expanded': open }"
    :style="{ '--reference-count': cards.length }" @keydown.esc.stop="close" @pointerdown.stop @dblclick.stop>
    <button v-if="many" type="button" class="reference-cards-toggle" :aria-expanded="open"
      @click.stop="expanded = !expanded">{{ labels.reference }} · {{ cards.length }} <span aria-hidden="true">{{ open ? '−' : '+' }}</span></button>
    <div class="reference-cards-list">
      <template v-for="(card, index) in cards" :key="`${index}-${card}`">
        <button v-if="many" type="button" class="reference-card-choice" :class="{ 'reference-card-choice--selected': selected === index }"
          :style="{ '--reference-index': selected === index ? 0 : index + 1, zIndex: open ? undefined : selected === index ? cards.length + 1 : cards.length - index }"
          :aria-label="`${labels.reference} ${index + 1}`" :aria-pressed="selected === index" @click.stop="pick(index)">
          <img class="card" :src="card" :alt="`${labels.reference} ${index + 1}`"
            :data-spent-keys="index === 0 ? spentKeys : undefined" :data-depth="index === 0 ? depth : undefined" />
        </button>
        <img v-else class="card" :src="card" :alt="`${labels.reference} ${index + 1}`"
          :data-spent-keys="index === 0 ? spentKeys : undefined" :data-depth="index === 0 ? depth : undefined" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.reference-cards, .reference-cards-list { display: contents; }
.reference-cards-list > img.card { width: var(--card-width); height: auto; max-height: var(--card-height); object-fit: contain; }
.reference-cards--stack { display: flex; flex-direction: column; gap: 4px; width: max-content; max-width: 100%; }
.reference-cards-toggle { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; margin: 0; border: 0; border-radius: 0; background: #10281ff2; color: #e0ca82; font-size: 11px; cursor: pointer; }
.reference-cards--stack .reference-cards-list { display: grid; grid-template: 1fr / 1fr; padding: 0 18px 18px 0; }
.reference-card-choice { grid-area: 1 / 1; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; cursor: pointer; width: var(--card-width); transform: translate(calc(min(var(--reference-index), 3) * 6px), calc(min(var(--reference-index), 3) * 6px)); }
.reference-card-choice > img.card { width: 100%; height: auto; margin: 0 !important; display: block; }
.reference-cards--expanded { --card-width: clamp(80px, 9vw, 160px); padding: 6px; background: #0c211bf5; border: 1px solid var(--tabletop-line); box-shadow: 0 4px 18px #0008; }
.reference-cards--expanded .reference-cards-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px; max-height: min(55dvh, calc(100cqh - 80px), 480px); overflow: auto; }
.reference-cards--expanded .reference-card-choice { transform: none; flex: 0 0 var(--card-width); align-self: start; }
.reference-cards--expanded .reference-card-choice--selected { outline: 2px solid var(--select); outline-offset: 1px; }
@media (prefers-reduced-motion: no-preference) { .reference-card-choice { transition: transform .18s ease; } }
</style>

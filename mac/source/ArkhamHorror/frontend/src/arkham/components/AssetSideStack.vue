<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Dropdown } from 'floating-vue'
import { SCENE_EXPAND_DELAY, scenePreviewSurfaces } from '@/arkham/sceneDrawer'

const props = defineProps<{ side: 'left' | 'right'; images: string[]; label: string }>()
const root = ref<HTMLElement | null>(null)
const dropdown = ref<{ onResize?: () => void } | null>(null)
const shown = ref(false)
const pinned = ref(false)
let expand: ReturnType<typeof setTimeout> | undefined
let leave: ReturnType<typeof setTimeout> | undefined
function clearTimers() { clearTimeout(expand); clearTimeout(leave); expand = leave = undefined }
function dismiss() { clearTimers(); shown.value = false; pinned.value = false }
function enter() {
  clearTimeout(leave)
  if (pinned.value || expand !== undefined) return
  shown.value = true
  expand = setTimeout(() => { expand = undefined; pinned.value = true; nextTick(() => dropdown.value?.onResize?.()) }, SCENE_EXPAND_DELAY)
}
function exit() {
  clearTimeout(leave)
  clearTimeout(expand); expand = undefined
  if (!pinned.value) leave = setTimeout(dismiss, 180)
}
function pin() { clearTimers(); shown.value = true; pinned.value = true }
function outside(event: MouseEvent) {
  if (!shown.value || !root.value || !(event.target instanceof Node)) return
  if (event.target instanceof Element && event.target.closest('.abilities, .mobile-card-preview, .card-overlay')) return
  // Follow owned popovers too, so clicking an attached card's ability does not close its stack.
  if (!scenePreviewSurfaces(root.value).some(surface => surface.contains(event.target as Node))) dismiss()
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape') dismiss() }
watch(() => props.images.length, count => { if (!count) dismiss(); else nextTick(() => dropdown.value?.onResize?.()) })
onMounted(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', escape) })
onBeforeUnmount(() => { clearTimers(); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', escape) })
</script>

<template>
  <div ref="root" class="asset-side-stack" :class="`asset-side-stack--${side}`" :data-pinned="pinned">
    <Dropdown ref="dropdown" :shown="shown" :triggers="[]" :auto-hide="false" :placement="side" :distance="4" theme="cards-under-popover">
      <button type="button" class="asset-side-stack__tab" data-mobile-direct :aria-label="`${label} (${images.length})`" :aria-expanded="shown"
        @pointerenter="enter" @pointerleave="exit" @focus="enter" @click.stop="pin">
        <span class="asset-side-stack__backs" aria-hidden="true">
          <img v-for="(image, index) in images" :key="index" :src="image" :style="{ '--stack-index': index % 5 }" />
        </span>
        <span class="asset-side-stack__count">{{ images.length }}</span>
      </button>
      <template #popper>
        <div class="asset-side-stack__panel" :class="{ 'asset-side-stack__panel--pinned': pinned }" :aria-label="label"
          @pointerenter="enter" @pointerleave="exit" @focusin="pin">
          <div class="asset-side-stack__cards"><slot /></div>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<style scoped>
.asset-side-stack { position: absolute; top: 4px; width: 22px; height: calc(var(--card-width) * 1.3); z-index: 2; }
.asset-side-stack--left { right: calc(100% - 2px); }
.asset-side-stack--right { left: calc(100% - 2px); }
.asset-side-stack__tab { display: block; position: relative; width: 22px; height: calc(var(--card-width) * 1.3); padding: 0; border: 0; background: transparent; cursor: pointer; }
.asset-side-stack__tab:focus-visible { outline: 2px solid var(--select); }
.asset-side-stack__backs { position: absolute; inset: 0; overflow: hidden; }
.asset-side-stack__backs img { position: absolute; top: 0; left: calc(var(--stack-index) * 3px); width: var(--card-width); max-width: none; height: 100%; object-fit: cover; border: 1px solid #b3af9c; border-radius: 3px; }
.asset-side-stack--right .asset-side-stack__backs img { left: auto; right: calc(var(--stack-index) * 3px); }
.asset-side-stack__count { position: absolute; bottom: 0; left: 0; width: 22px; line-height: 20px; font-size: 11px; color: white; background: #152e24; border: 1px solid #a19b72; border-radius: 3px; }
.asset-side-stack__panel { --card-width: 100px; padding: 12px; max-width: min(140px, calc(100vw - 32px)); overflow: auto; max-height: min(65dvh, 500px); }
.asset-side-stack__panel--pinned { max-width: min(680px, calc(100vw - 32px)); }
.asset-side-stack__cards { display: flex; gap: 24px; align-items: flex-start; width: max-content; padding: 12px; }
.asset-side-stack__cards > :deep(*) { flex: 0 0 auto; margin-top: 0 !important; }
</style>

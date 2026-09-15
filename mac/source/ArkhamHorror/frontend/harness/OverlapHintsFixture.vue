<script setup lang="ts">
// Isolated rendering fixture: no account, network game actions or save access.
import { nextTick, ref } from 'vue'
import AdaptiveHand from '../src/arkham/components/AdaptiveHand.vue'
import MobileCard from '../src/arkham/mobile/MobileCard.vue'
import { provideMobileBoard } from '../src/arkham/mobile/context'
import { useMobileActionHints } from '../src/arkham/mobile/useMobileActionHints'
const device = ref({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, screenWidth: 402, screenHeight: 874, coarsePointer: true })
const board = provideMobileBoard(ref(true), device)
const root = ref<HTMLElement | null>(null), count = ref(7), width = ref(402), status = ref('未出牌'), result = ref('')
const mixedActions = ref(false)
useMobileActionHints(root, board)
function measure() {
  const row = root.value!.querySelector('.adaptive-hand-row')!
  const cards = Array.from(row.children) as HTMLElement[]
  const frames = cards.map((card, i) => {
    const owner = card.querySelector('.mobile-card') as HTMLElement | null
    if (!owner) return { i, phone: false }
    const r = owner.getBoundingClientRect(), s = getComputedStyle(owner, '::after')
    const next = cards[i + 1]?.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + 12, r.top + 50)?.closest('[data-card]')?.getAttribute('data-card')
    return { i, x: r.x, cardWidth: r.width, exposed: next ? next.left - r.left : r.width,
      frameWidth: parseFloat(s.width), right: r.left + parseFloat(s.left) + parseFloat(s.width),
      next: next?.left, radius: s.borderRadius, border: s.borderTopWidth, pointer: s.pointerEvents,
      isolation: getComputedStyle(card).isolation, transform: s.transform, hit, actionable: owner.dataset.mobileHasAction === 'true' }
  })
  const tab = root.value!.querySelector('.tab--lead-player')!, t = tab.getBoundingClientRect(), ts = getComputedStyle(tab, '::after')
  result.value = JSON.stringify({ count: count.value, phone: board.enabled.value, touch: board.touchEnabled.value, frames,
    tab: { width: t.width, height: t.height, frameWidth: ts.width, frameHeight: ts.height, margin: ts.margin },
    runningAnimations: document.getAnimations().filter(a => a.playState === 'running').length })
}
async function hold() {
  const target = root.value!.querySelector('.adaptive-hand-row img') as HTMLElement
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, pointerType: 'touch', clientX: 20, clientY: 200, button: 0 }))
  await new Promise(resolve => setTimeout(resolve, 480))
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 77, pointerType: 'touch', clientX: 20, clientY: 200, button: 0 }))
  target.click()
  await nextTick()
}
async function inspectPulse(peak: boolean) {
  for (const animation of document.getAnimations().filter(a => (a as CSSAnimation).animationName === 'mobile-action-frame-scale')) {
    if (peak) { animation.pause(); animation.currentTime = 800 }
    else animation.finish()
  }
  await nextTick()
  measure()
}
function presentation(kind: string) {
  device.value = kind === 'phone' ? { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, screenWidth: 402, screenHeight: 874, coarsePointer: true }
    : { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: kind === 'tablet' ? 5 : 0, screenWidth: 1024, screenHeight: 768, coarsePointer: kind === 'tablet' }
}
</script>
<template>
  <main id="game" ref="root" :class="{ 'mobile-game': board.enabled.value, 'touch-game': board.touchEnabled.value }" class="overlap-fixture">
    <h1>叠放提示框隔离验证</h1>
    <div class="fixture-controls">
      <button v-for="n in [1, 7, 15]" :key="n" @click="count = n">{{ n }} 张牌</button>
      <button v-for="n in [320, 402, 600]" :key="n" @click="width = n">{{ n }}px</button>
      <button v-for="kind in ['phone', 'tablet', 'desktop']" :key="kind" @click="presentation(kind)">{{ kind }}</button>
      <button @click="hold">长按第一张</button><button @click="measure">检查边框</button>
      <button @click="mixedActions = !mixedActions">{{ mixedActions ? '全部可互动' : '部分可互动' }}</button>
      <button @click="inspectPulse(true)">检查动效峰值</button><button @click="inspectPulse(false)">结束动效</button>
    </div>
    <output role="status">{{ status }}</output>
    <section :style="{ width: `min(100%, ${width}px)` }">
      <ul class="tabs__header"><li class="tab--lead-player tab--has-actions">队长标签</li><li class="mobile-zone-action">其他人物</li></ul>
      <AdaptiveHand :inert="!!board.preview.value">
        <div class="adaptive-hand-row">
          <div v-for="i in count" :key="i" class="card-container" :data-card="i">
            <MobileCard><img class="card" :class="{ 'card--can-interact': !mixedActions || i % 2 === 1 }" :src="`/img/arkham/backs/back_player.jpg`" :alt="`测试卡 ${i}`" @click="status = `打出 ${i}`" />
              <div v-if="!mixedActions || i % 2 === 1" class="ability-trigger-modes"><button class="ability-trigger-mode" @click.stop="status = `模式 ${i}`">常</button></div>
            </MobileCard>
          </div>
        </div>
      </AdaptiveHand>
    </section>
    <pre data-testid="geometry">{{ result }}</pre>
  </main>
</template>
<style>
body { margin: 0; background: #102c21; }
#game.overlap-fixture { display: block; padding: 12px; overflow: auto; }
.overlap-fixture h1 { font-size: 16px; }
.fixture-controls { display: flex; flex-wrap: wrap; gap: 4px; }
.fixture-controls button { padding: 6px; }
.overlap-fixture .tabs__header { display: flex; padding: 0; margin-top: 24px; }
.overlap-fixture .tabs__header li { flex: 1; height: 44px; list-style: none; background: #315340; }
/* Match the legacy leader badge geometry which shares ::after with hints. */
.overlap-fixture .tab--lead-player::after { position: absolute; content: ''; inset: 0; top: -5px; margin-inline: auto; transform: translateY(-100%); width: 25px; height: 25px; }
.overlap-fixture .card-container { --card-width: 100px; width: 100px; }
.overlap-fixture img.card { display: block; width: 100px; height: 140px; }
/* Match the real mode toggle's absolute wrapper, not an extra row below cards. */
.overlap-fixture .ability-trigger-modes { position: absolute; top: 3px; right: 3px; z-index: 12; }
.overlap-fixture pre { white-space: pre-wrap; font-size: 10px; }
</style>

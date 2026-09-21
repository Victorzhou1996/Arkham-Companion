<script lang="ts" setup>
import { watch, ref, computed, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { logCategory, type LogCategory } from '@/arkham/logPresentation';
import { Game } from '@/arkham/types/Game';
import GameMessage from '@/arkham/components/GameMessage.vue';
import { useTabletopLabels } from '@/arkham/composables/useTabletopLabels';
const tabletop = useTabletopLabels();

const props = defineProps<{
  game: Game
  gameLog: readonly string[]
}>()

const emit = defineEmits<{
  undo: []
}>()

const messages = ref<Element | null>(null)
const { locale } = useI18n()
const zh = computed(() => locale.value.toLowerCase().startsWith('zh'))
const category = ref<LogCategory>('all')
const limit = ref(60)
const atEnd = ref(true)
const unseen = ref(false)
const filters: [LogCategory, string, string][] = [['all', '全部', 'All'], ['cards', '卡牌', 'Cards'], ['locations', '地点', 'Locations'], ['tokens', '标记', 'Tokens'], ['other', '其他', 'Other']]
const filtered = computed(() => props.gameLog.map((msg, index) => ({ msg, index })).filter(({ msg }) => category.value === 'all' || logCategory(msg) === category.value))
const truncatedGameLog = computed(() => filtered.value.slice(-limit.value))
function onScroll() {
  const el = messages.value
  if (!el) return
  atEnd.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  if (atEnd.value) unseen.value = false
}
async function latest() {
  await nextTick()
  const el = messages.value
  if (el) el.scrollTop = el.scrollHeight
  atEnd.value = true
  unseen.value = false
}
async function earlier() {
  const el = messages.value
  const before = el?.scrollHeight ?? 0
  const top = el?.scrollTop ?? 0
  limit.value += 60
  await nextTick()
  if (el) el.scrollTop = top + el.scrollHeight - before
}
watch(category, () => { limit.value = 60; latest() })

onMounted(async () => {
  const el = messages.value
  if (el) {
    const child = el.lastElementChild
    if (child) {
      await nextTick()
      el.scrollTop = el.scrollHeight;
    }
  }
})

watch(() => props.gameLog, async () => {
  if (!atEnd.value) { unseen.value = true; return }
  const el = messages.value
  if (el) {
    const child = el.lastElementChild
    if (child) {
      await nextTick()
      el.scrollTop = el.scrollHeight;
    }
  }
})

</script>

<template>
  <div class="game-log">
    <h2 class="tabletop-log-heading">{{tabletop.log}}</h2>
    <nav class="log-filters" :aria-label="zh ? '日志分类' : 'Log filters'">
      <button v-for="[key, cn, en] in filters" :key="key" type="button" :aria-pressed="category === key" @click="category = key">{{ zh ? cn : en }}</button>
    </nav>
    <button v-if="unseen" class="log-latest" type="button" @click="latest">{{ zh ? '有新记录 · 查看最新 ↓' : 'New entries · Latest ↓' }}</button>
    <ul ref="messages" @scroll.passive="onScroll">
      <li v-if="filtered.length > limit" class="log-more"><button type="button" @click="earlier">{{ zh ? '查看更早记录' : 'Earlier entries' }}</button></li>
      <li class="log-entry" v-for="{ msg, index } in truncatedGameLog" :key="index"><GameMessage :game="game" :msg="msg" /></li>
      <li v-if="!filtered.length" class="log-empty">{{ zh ? '暂无此类记录' : 'No entries in this category' }}</li>
    </ul>
  </div>
</template>

<style scoped>
.tabletop-log-heading { display: none; }
.game-log {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--neutral-dark);
  width: calc(100% - 20px);
  border-radius: 5px;
  margin: 10px;
  height: calc(100vh - 60px);
  padding: 10px 10px;
  flex: 1 1 50%;
  overflow-x: hidden;
  ul {
    flex: 1;
    min-height: 0;
    list-style: none;
    margin: 0;
    padding: 0;
    height: calc(100% - 2em);
    overflow-y: auto;
    overflow-x: hidden;
  }
}
.log-filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0; }
.log-filters button, .log-more button, .log-latest { border: 1px solid #68765f; border-radius: 5px; padding: 5px 7px; background: #142f26; color: #e1e6d9; font: inherit; cursor: pointer; }
.log-filters button[aria-pressed="true"] { text-decoration: underline; text-underline-offset: 4px; border-color: #d8c58e; }
.log-more, .log-empty { padding: 10px 0; color: #c8d1c1; text-align: center; }
.log-latest { margin-bottom: 5px; }

.log-entry {
  background: rgba(0, 0, 0, 0.3);
  padding: 10px;
  margin: 10px 0;
  border-radius: 5px;
  color: white;
  font-weight: 700;
  font-size: 0.8em;
}
</style>

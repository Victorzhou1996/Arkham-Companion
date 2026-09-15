<script lang="ts" setup>
import { watch, ref, computed, nextTick, onMounted } from 'vue';
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
const truncatedGameLog = computed(() => props.gameLog.slice(-10))

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

watch(truncatedGameLog, async () => {
  const el = messages.value
  if (el) {
    const child = el.lastElementChild
    if (child) {
      await nextTick()
      el.scrollTop = el.scrollHeight;
    }
  }
}, { deep: true })

</script>

<template>
  <div class="game-log">
    <h2 class="tabletop-log-heading">{{tabletop.log}}</h2>
    <ul ref="messages">
      <li class="log-entry" v-for="(msg, i) in truncatedGameLog" :key="i"><GameMessage :game="game" :msg="msg" /></li>
    </ul>
  </div>
</template>

<style scoped>
.tabletop-log-heading { display: none; }
.game-log {
  background: var(--neutral-dark);
  width: calc(100% - 20px);
  border-radius: 5px;
  margin: 10px;
  height: calc(100vh - 60px);
  padding: 10px 10px;
  flex: 1 1 50%;
  overflow-x: hidden;
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    height: calc(100% - 2em);
    overflow-y: auto;
    overflow-x: hidden;
  }
}

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

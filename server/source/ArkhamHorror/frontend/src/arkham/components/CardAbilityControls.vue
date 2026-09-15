<script setup lang="ts">
import { computed, ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import AbilityButton from './AbilityButton.vue'
import AbilitiesMenu from './AbilitiesMenu.vue'
import { useMobileBoard, mobileCardKey } from '@/arkham/mobile/context'
import type { AbilityMessage } from '@/arkham/types/Message'
import type { Game } from '@/arkham/types/Game'

const props = defineProps<{ game: Game; abilities: AbilityMessage[]; frame: HTMLElement | null; image: string }>()
const emit = defineEmits<{ choose: [index: number] }>()
const board = useMobileBoard()
const card = inject(mobileCardKey, null)
const touch = computed(() => !!board?.touchEnabled.value && !!card)
const shown = ref(false)
const { locale } = useI18n()
const label = computed(() => locale.value.startsWith('zh') ? '查看卡牌能力' : 'Card abilities')
function activate() {
  if (!props.abilities.length) return
  if (touch.value) card?.open()
  else if (props.abilities.length === 1) emit('choose', props.abilities[0].index)
  else shown.value = true
}
defineExpose({ activate })
</script>

<template>
  <!-- Controls stay on the card, not below a clipped hand/threat viewport. -->
  <div v-if="!touch && abilities.length" class="card-ability-controls">
    <AbilityButton v-if="abilities.length === 1" :game="game" :ability="abilities[0].contents"
      :data-image="image" @click.stop="emit('choose', abilities[0].index)" />
    <button v-else type="button" class="card-ability-picker" data-game-actionable="true"
      :aria-label="label" @click.stop="shown = true">⚡ {{ abilities.length }}</button>
  </div>
  <AbilitiesMenu v-if="touch || abilities.length > 1" v-model="shown" :game="game"
    :abilities="abilities" :frame="frame" position="top" @choose="emit('choose', $event)" />
</template>

<style scoped>
.card-ability-controls { position: absolute; bottom: 3px; left: 3px; right: 3px; z-index: 15; display: flex; justify-content: flex-start; pointer-events: auto; }
.card-ability-controls :deep(button) { margin: 0; max-width: 100%; min-height: 26px; border: 1px solid #cbb477; border-radius: 5px; background: #183b30f5; color: #fff0c5; }
.card-ability-controls :deep(.button-label) { padding: 3px 5px; }
.card-ability-picker { padding: 3px 8px; cursor: pointer; }
</style>

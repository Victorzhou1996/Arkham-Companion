<script lang="ts" setup>
import MobileCard from '@/arkham/mobile/MobileCard.vue'
import { computed, ref } from 'vue';
import MissingCardBadge from '@/arkham/components/MissingCardBadge.vue';
import { Game } from '@/arkham/types/Game';
import Token from '@/arkham/components/Token.vue';
import * as ArkhamGame from '@/arkham/types/Game';
import { AbilityLabel, AbilityMessage, Message, MessageType } from '@/arkham/types/Message';
import { cardImg } from '@/arkham/helpers';
import CardAbilityControls from '@/arkham/components/CardAbilityControls.vue'
import AbilityTriggerModeToggle from '@/arkham/components/AbilityTriggerModeToggle.vue'
import { triggerModeAbilitiesForCard } from '@/arkham/abilityTriggerModeEligibility'
import * as Arkham from '@/arkham/types/Skill';

export interface Props {
  game: Game
  skill: Arkham.Skill
  playerId: string
  attached?: boolean
}

const props = withDefaults(defineProps<Props>(), { attached: false })
const cardFrame = ref<HTMLElement | null>(null)
const abilityControls = ref<InstanceType<typeof CardAbilityControls> | null>(null)

const emits = defineEmits<{
  choose: [value: number]
}>()

const id = computed(() => props.skill.id)
const ownedByCurrentPlayer = computed(() =>
  props.game.investigators[props.skill.owner]?.playerId === props.playerId
)

const cardCode = computed(() => props.skill.cardCode)
const image = computed(() => {
  const mutated = props.skill.mutated ? `_${props.skill.mutated}` : ''
  return cardImg(`${cardCode.value.replace(/^c/, '')}${mutated}`)
})
const choices = computed(() => ArkhamGame.choices(props.game, props.playerId))

function canInteract(c: Message): boolean {
  if (c.tag === MessageType.TARGET_LABEL) {
    return c.target.contents === id.value || c.target.contents === props.skill.cardId
  }
  return false
}

const cardAction = computed(() => choices.value.findIndex(canInteract))

function isAbility(v: Message): v is AbilityLabel {
  if (v.tag !== MessageType.ABILITY_LABEL) {
    return false
  }

  const { source } = v.ability;

  if (source.sourceTag === 'ProxySource') {
    if("contents" in source.source) {
      return source.source.contents === id.value
    }
  } else if (source.tag === 'SkillSource') {
    return source.contents === id.value
  }

  return false
}

const abilities = computed(() => {
  return choices.value
    .reduce<AbilityMessage[]>((acc, v, i) => {
      if (isAbility(v)) {
        return [...acc, { contents: v, displayAsAction: false, index: i }];
      }

      return acc;
    }, []);
})

const triggerModeAbilities = computed(() =>
  triggerModeAbilitiesForCard(choices.value, cardCode.value, props.skill.owner),
)

const hasPool = computed(() => {
  const { sealedChaosTokens } = props.skill;

  return sealedChaosTokens.length > 0
})

const choose = (index: number) => emits('choose', index)
</script>

<template>
  <div class="skill" :class="{ attached }">
    <MobileCard>
    <MissingCardBadge :card-code="cardCode" />
    <img
      :src="image"
      ref="cardFrame"
      :class="{ 'skill--can-interact': cardAction !== -1 || abilities.length > 0 }"
      class="card skill"
      @click="cardAction !== -1 ? choose(cardAction) : abilityControls?.activate()"
      :data-customizations="JSON.stringify(skill.customizations)"
    />
    <div v-if="hasPool" class="pool">
      <Token v-for="(sealedToken, index) in skill.sealedChaosTokens" :key="index" :token="sealedToken" :playerId="playerId" :game="game" @choose="choose" />
    </div>
    <CardAbilityControls ref="abilityControls" :game="game" :abilities="abilities"
      :frame="cardFrame" :image="image" @choose="choose" />
    <AbilityTriggerModeToggle
      v-if="ownedByCurrentPlayer"
      :game="game"
      :player-id="playerId"
      :investigator-id="skill.owner"
      :card-code="cardCode"
      :abilities="triggerModeAbilities"
    />
    </MobileCard>
  </div>
</template>

<style scoped>
.card {
  width: var(--card-width);
  max-width: var(--card-width);
  border-radius: 5px;
}

.skill {
  display: flex;
  flex-direction: column;
  position: relative;
}

.skill--can-interact {
  border: 2px solid var(--select);
  cursor:pointer;
}

.button{
  margin-top: 2px;
  border: 0;
  color: #fff;
  border-radius: 4px;
  border: 1px solid var(--select);
}

:deep(.token) {
  width: 40px;
}

.pool {
  position: absolute;
  top: 50%;
  align-items: center;
  display: flex;
  align-self: flex-start;
  align-items: flex-end;
  z-index: var(--z-index-1);
  pointer-events: none;
  & :deep(.token-container) {
    width: unset;
  }
  & :deep(img) {
    width: var(--card-token-width);
    height: auto;
  }
}

.attached .card {
  object-fit: cover;
  object-position: left bottom;
  height: calc(var(--card-width)*0.6);
}

</style>

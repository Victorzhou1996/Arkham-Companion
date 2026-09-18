<script setup>
import { ref } from 'vue'
import Act from '../../src/arkham/components/Act.vue'
import Agenda from '../../src/arkham/components/Agenda.vue'
import EdgeTabletopControls from '../../src/arkham/components/EdgeTabletopControls.vue'
const { game } = defineProps(['game'])
const root = ref(null)
const chosen = ref(-1)
const playerId = Object.values(game.investigators)[0].playerId
const act = Object.values(game.acts)[0], agenda = Object.values(game.agendas)[0]
const sample = game.question[playerId].choices.find(c => c.tag === 'AbilityLabel')
const choices = []
for (const [tag, entity] of [['ActSource', act], ['AgendaSource', agenda]]) {
  for (const type of ['ReactionAbility', 'FastAbility']) {
    const choice = structuredClone(sample)
    choice.ability.source = { sourceTag: 'OtherSource', tag, contents: entity.id }
    choice.ability.index = choices.length + 1
    choice.ability.type = { tag: type, cost: { tag: 'Free' } }
    choices.push(choice)
  }
}
game.question[playerId] = { tag: 'ChooseOne', choices }
</script>
<template>
  <div id="game" ref="root" class="tabletop-game edge-tabletop scene-qa">
    <output id="chosen">{{ chosen }}</output>
    <button class="qa-outside" @click="chosen = -1">Outside</button>
    <div class="edge-scene-shelf">
      <div class="edge-scene-group">
        <div class="scenario-decks">
          <Agenda :agenda="agenda" :game="game" :playerId="playerId" :cardsUnder="[]" :cardsNextTo="[]" :remainingStack="[]" :completedStack="[]" @choose="chosen = $event" />
          <Act :act="act" :game="game" :playerId="playerId" :cardsUnder="[]" :cardsNextTo="[]" :remainingStack="[]" :completedStack="[]" @choose="chosen = $event" />
        </div>
      </div>
    </div>
    <EdgeTabletopControls :root="root" :game="game" />
  </div>
</template>
<style>
html, body { margin: 0; background: #132a23; }
#game.scene-qa { display: block; position: relative; height: 100dvh; overflow: clip; }
.qa-outside { position: absolute; top: 60px; left: 30px; }
</style>

<script setup>
import { ref } from 'vue'
import Asset from '../../src/arkham/components/Asset.vue'
import Location from '../../src/arkham/components/Location.vue'
import AdaptiveHand from '../../src/arkham/components/AdaptiveHand.vue'
import Enemy from '../../src/arkham/components/Enemy.vue'
import Card from '../../src/arkham/components/Card.vue'
const props = defineProps(['game'])
const game = props.game
const inv = Object.values(game.investigators)[0], playerId = inv.playerId
const parent = Object.values(game.assets)[0]
parent.cardsUnderneath = inv.hand.slice(0, 3)
parent.assets = ['child-one', 'child-two', 'child-three']
for (const id of parent.assets) game.assets[id] = { ...parent, id, cardId: id, cardCode: 'c01030', cardsUnderneath: [], assets: [], placement: { tag: 'AttachedToAsset', contents: [parent.id, null] } }
const location = Object.values(game.locations)[0]
const enemy = { ...parent, id: 'qa-enemy', cardCode: 'c01116', assignedDamage: 0, tokens: {}, engagedInvestigators: [], stories: [], skills: [], referenceCards: [], asSelfLocation: null, fight: null, evade: null, healthDamage: 1, sanityDamage: 1, health: null, cardsUnderneath: [], assets: [] }
game.enemies[enemy.id] = enemy
const messages = [
  { tag: 'TargetLabel', target: { tag: 'AssetTarget', contents: 'child-one' }, messages: [] },
  { tag: 'TargetLabel', target: { tag: 'EnemyTarget', contents: enemy.id }, messages: [] },
  { tag: 'TargetLabel', target: { tag: 'CardIdTarget', contents: parent.cardsUnderneath[0].contents.id }, messages: [] },
  ...game.question[playerId].choices.filter(c => c.tag === 'AbilityLabel'),
]
game.question[playerId] = { tag: 'ChooseOne', choices: messages }
const locationAbility = messages.find(c => c.tag === 'AbilityLabel')
function addReaction(target, tag, index) {
  const choice = structuredClone(locationAbility)
  choice.ability.source = { sourceTag: 'OtherSource', tag, contents: target }
  choice.ability.index = index
  choice.ability.type = { tag: 'ReactionAbility', cost: { tag: 'Free' } }
  messages.push(choice)
}
addReaction(location.id, 'LocationSource', 104)
addReaction('child-two', 'AssetSource', 1)
addReaction('child-two', 'AssetSource', 2)
const chosen = ref(-1)
</script>
<template>
  <div id="game" class="tabletop-game edge-tabletop qa-board">
    <output id="chosen">{{ chosen }}</output>
    <div class="location-cards qa-location"><Location :game="game" :location="location" :playerId="playerId" @choose="chosen = $event" /></div>
    <section class="qa-equipment"><Asset :game="game" :asset="parent" :playerId="playerId" @choose="chosen = $event" /></section>
    <section class="qa-enemy"><Enemy :game="game" :enemy="enemy" :playerId="playerId" @choose="chosen = $event" /></section>
    <section class="qa-hand"><AdaptiveHand><div class="adaptive-hand-row"><Card v-for="(card,i) in [...inv.hand,...inv.hand,...inv.hand]" :key="i" :game="game" :card="card" :playerId="playerId" @choose="chosen = $event" /></div></AdaptiveHand></section>
    <button class="qa-blank" @click="chosen = -1">Outside</button>
  </div>
</template>
<style>
html, body { margin: 0; min-height: 100%; background: #132a23; }
#game.qa-board { display: block; position: relative; padding: 60px 30px; min-height: 900px; height: auto; --card-width: 100px; --card-aspect: .714; }
.qa-equipment { position: absolute; top: 350px; left: 45%; width: 100px; }
.qa-enemy { position: absolute; top: 350px; left: 75%; width: 100px; }
.qa-hand { position: absolute; top: 600px; left: 5%; width: 80%; }
.qa-location { width: 300px; margin: 10px 0 0 100px; }
.qa-blank { position: absolute; top: 820px; left: 30px; }
@media (max-width: 600px) { .qa-location { margin-left: 0; } .qa-enemy { left: 5%; } }
</style>

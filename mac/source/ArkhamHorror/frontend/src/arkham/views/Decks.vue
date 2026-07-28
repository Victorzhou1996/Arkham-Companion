<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as Arkham from '@/arkham/types/Deck'
import Prompt from '@/components/Prompt.vue'
import { fetchDecks, deleteDeck, syncDeck } from '@/arkham/api'
import NewDeck from '@/arkham/components/NewDeck.vue';
import Deck from '@/arkham/components/DeckRow.vue';
import DeckToolbar from '@/arkham/components/DeckToolbar.vue';
import PrimaryButton from '@/components/PrimaryButton.vue';
import { useToast } from "vue-toastification";
import { useI18n } from 'vue-i18n'
import type { InvestigatorClass } from '@/arkham/helpers'

const { t } = useI18n()

const allDecks = ref<Arkham.Deck[]>([])
const deleteId = ref<string | null>(null)
const toast = useToast()
const showNewDeck = ref(false)
const searchText = ref('')
const sortBy = ref<'name' | 'class'>('name')
const filterClasses = ref<InvestigatorClass[]>([])
const recentDeckId = ref<string | null>(null)
let deckLoad: Promise<void> | null = null

const CLASS_ORDER: Record<string, number> = {
  guardian: 0, seeker: 1, rogue: 2, mystic: 3, survivor: 4, neutral: 5
}
const allClasses: InvestigatorClass[] = ["guardian", "seeker", "rogue", "mystic", "survivor", "neutral"]

async function addDeck(d: Arkham.Deck) {
  allDecks.value.push(d)
  recentDeckId.value = d.id
  showNewDeck.value = false
}

async function deleteDeckEvent() {
  const { value } = deleteId
  if (value) {
    deleteDeck(value).then(() => {
      allDecks.value = allDecks.value.filter((deck) => deck.id !== value)
      deleteId.value = null
    })
  }
}

function loadDecks(): Promise<void> {
  if (deckLoad) return deckLoad

  deckLoad = fetchDecks()
    .then((response) => {
      const previousIds = new Set(allDecks.value.map((deck) => deck.id))
      const addedDecks = response.filter((deck) => !previousIds.has(deck.id))
      allDecks.value = response

      if (addedDecks.length > 0) {
        recentDeckId.value = addedDecks[addedDecks.length - 1].id
      } else if (!recentDeckId.value && response.length > 0) {
        recentDeckId.value = response[response.length - 1].id
      }
    })
    .finally(() => {
      deckLoad = null
    })

  return deckLoad
}

function refreshDecks() {
  void loadDecks()
}

function refreshVisibleDecks() {
  if (document.visibilityState === 'visible') refreshDecks()
}

onMounted(() => {
  refreshDecks()
  window.addEventListener('focus', refreshDecks)
  window.addEventListener('pageshow', refreshDecks)
  document.addEventListener('visibilitychange', refreshVisibleDecks)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshDecks)
  window.removeEventListener('pageshow', refreshDecks)
  document.removeEventListener('visibilitychange', refreshVisibleDecks)
})

const decks = computed(() => {
  let result = allDecks.value.filter((deck) => {
    const matchesClass = filterClasses.value.length === 0 ||
      filterClasses.value.some((k) => Arkham.deckClass(deck)[k])
    const matchesSearch = !searchText.value ||
      deck.name.toLowerCase().includes(searchText.value.toLowerCase())
    return matchesClass && matchesSearch
  })

  if (sortBy.value === 'name') {
    result = [...result].sort((a, b) => {
      if (a.id === recentDeckId.value) return -1
      if (b.id === recentDeckId.value) return 1
      return a.name.localeCompare(b.name)
    })
  } else if (sortBy.value === 'class') {
    result = [...result].sort((a, b) => {
      if (a.id === recentDeckId.value) return -1
      if (b.id === recentDeckId.value) return 1
      const classObj = (d: Arkham.Deck) => Arkham.deckClass(d)
      const ca = allClasses.find(k => classObj(a)[k]) ?? 'neutral'
      const cb = allClasses.find(k => classObj(b)[k]) ?? 'neutral'
      return (CLASS_ORDER[ca] ?? 5) - (CLASS_ORDER[cb] ?? 5)
    })
  }

  return result
})

async function sync(deck: Arkham.Deck) {
  syncDeck(deck.id).then(() => {
    toast.success(t('deckSyncedSuccessfully'), { timeout: 3000 })
  })
}
</script>

<template>
  <div class="page-container">
    <div id="decks">
      <header class="decks-header">
        <h2>{{ $t('decks') }}</h2>
        <PrimaryButton :label="showNewDeck ? t('cancel') : t('deckList.newDeck')" :danger="showNewDeck" @click="showNewDeck = !showNewDeck" />
      </header>

      <div v-if="showNewDeck" class="new-deck-panel">
        <NewDeck always-save @new-deck="addDeck" />
      </div>

      <DeckToolbar
        v-model:search="searchText"
        v-model:filterClasses="filterClasses"
        v-model:sortBy="sortBy"
        class="toolbar"
      />

      <div v-if="decks.length === 0" class="empty-state">
        <p>{{ $t('noDecksMatchFilters') }}</p>
      </div>
      <div v-else class="deck-grid">
        <Deck
          v-for="deck in decks"
          :key="deck.id"
          :deck="deck"
          :markDelete="() => deleteId = deck.id"
          :sync="() => sync(deck)"
        />
      </div>

      <Prompt
        v-if="deleteId"
        :prompt="t('areYouSureDeleteDeck')"
        :yes="deleteDeckEvent"
        :no="() => deleteId = null"
      />
    </div>
  </div>
</template>

<style scoped>
#decks {
  width: 70vw;
  max-width: 98vw;
  min-width: 60vw;
  margin: 0 auto;
  padding: 0 20px;
  @media (max-width: 768px) {
    width: 100%;
    min-width: unset;
    padding: 0 12px;
    box-sizing: border-box;
  }
}

.decks-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;

  h2 {
    flex: 1;
    color: var(--title);
    font-size: 2em;
    text-transform: uppercase;
    font-family: teutonic, sans-serif;
    margin: 0;
  }

  @media (max-width: 768px) {
    flex-wrap: wrap;
    gap: 8px;
  }
}

.new-deck-panel {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.toolbar {
  margin-bottom: 20px;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--button);
  font-size: 0.9rem;
}

.deck-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

</style>

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '../src/styles/index.css'
import '../src/styles/tabletopInteraction.css'
import '../src/styles/mobileGame.css'
import Fixture from './OverlapHintsFixture.vue'
createApp(Fixture).use(createPinia()).mount('#app')

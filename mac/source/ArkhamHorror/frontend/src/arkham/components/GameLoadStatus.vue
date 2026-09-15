<script setup lang="ts">
import type { GameLoadFailure } from '@/arkham/gameLoadState'
defineProps<{ failure: GameLoadFailure | null; nextUrl: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="game-load-status" :role="failure ? 'alert' : 'status'" aria-live="polite">
    <h1>{{ $t(failure ? 'gameLoad.failed' : 'gameLoad.loading') }}</h1>
    <p>{{ $t(failure ? `gameLoad.${failure}` : 'gameLoad.wait') }}</p>
    <div v-if="failure" class="game-load-actions">
      <router-link v-if="failure === 'signedOut'" :to="{ path: '/sign-in', query: { nextUrl } }">{{ $t('logIn') }}</router-link>
      <button v-else type="button" @click="$emit('retry')">{{ $t('gameLoad.retry') }}</button>
      <router-link to="/">{{ $t('nav.home') }}</router-link>
    </div>
  </section>
</template>

<style scoped>
.game-load-status {
  box-sizing: border-box;
  width: min(34rem, calc(100% - 2rem));
  margin: clamp(2rem, 12vh, 8rem) auto;
  padding: 1.5rem;
  border: 1px solid #81764d;
  border-radius: 12px;
  background: #102c23;
  color: #ece9d7;
  text-align: center;
}
h1 { margin: 0 0 1rem; font-size: 1.4rem; }
p { line-height: 1.6; }
.game-load-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem; }
.game-load-actions :is(a, button) {
  padding: .65rem 1rem; border: 1px solid #b5a975; border-radius: 6px;
  color: inherit; background: #254638; font: inherit; cursor: pointer; text-decoration: none;
}
</style>

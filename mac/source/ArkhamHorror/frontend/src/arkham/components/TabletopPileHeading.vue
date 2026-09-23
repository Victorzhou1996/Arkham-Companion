<script setup lang="ts">
import { ArchiveBoxIcon, Square3Stack3DIcon } from '@heroicons/vue/24/outline'
defineProps<{ label: string; count?: number; discard?: boolean }>()
</script>

<template>
  <h3 class="tabletop-pile-heading" :title="`${label}${count === undefined ? '' : ` ${count}`}`">
    <ArchiveBoxIcon v-if="discard" aria-hidden="true" />
    <Square3Stack3DIcon v-else aria-hidden="true" />
    <span class="tabletop-pile-heading__text" tabindex="0">{{ `${label}${count === undefined ? '' : ` ${count}`}` }}</span>
  </h3>
</template>

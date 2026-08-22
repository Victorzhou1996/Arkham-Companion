<script lang="ts" setup>
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'
import type { User } from '@/types'
import api from '@/api'
import SettingsForm from '@/components/SettingsForm.vue'

const store = useUserStore()
const { currentUser } = storeToRefs(store)

const updateReleaseChannels = async (beta: boolean, dev: boolean) => {
  await api.put<User>('settings', { beta, dev })
  await store.setCurrentUser()
}
</script>

<template>
  <SettingsForm
    v-if="currentUser"
    :user="currentUser"
    :updateReleaseChannels="updateReleaseChannels"
  />
</template>

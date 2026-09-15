import { onBeforeUnmount, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { accountPanelPreferences, type PanelPatch } from '@/arkham/accountPanelPreferences'
import { panelDefaults, persistentPanels } from '@/arkham/tabletopPanels'

export function useAccountPanels() {
  const user = useUserStore()
  const saved = ref(persistentPanels(panelDefaults))
  let session: ReturnType<typeof accountPanelPreferences> | undefined
  const stop = watch(() => [user.currentUser?.email, user.token] as const, ([email, token]) => {
    session?.dispose()
    session = undefined
    saved.value = persistentPanels(panelDefaults)
    if (!email || !token) return
    const key = `arkham-account-panels-v1:${encodeURIComponent(email.toLowerCase())}`
    // Capture credentials: an old in-flight save can never target the next account.
    const endpoint = `${import.meta.env.VITE_API_HOST || ''}/api/v1/account/tabletop-layout`
    const request = async (patch?: PanelPatch, keepalive = false) => {
      const response = await fetch(endpoint, {
        method: patch ? 'PUT' : 'GET', keepalive, cache: 'no-store',
        headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
        ...(patch ? { body: JSON.stringify(patch) } : {}),
      })
      if (!response.ok) throw new Error(`Layout preferences: ${response.status}`)
      return (await response.json()).panels
    }
    session = accountPanelPreferences({
      read: () => JSON.parse(localStorage.getItem(key) || '{}'),
      cache: value => localStorage.setItem(key, JSON.stringify(value)),
      load: () => request(), save: (patch, keepalive) => request(patch, keepalive),
      render: value => { saved.value = { ...persistentPanels(panelDefaults), ...value } },
    })
  }, { immediate: true })
  const flush = () => { void session?.flush(true) }
  const hidden = () => { if (document.hidden) flush() }
  window.addEventListener('pagehide', flush)
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', hidden)
  onBeforeUnmount(() => {
    stop(); session?.dispose()
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('online', flush)
    document.removeEventListener('visibilitychange', hidden)
  })
  return { saved, save: (patch: PanelPatch) => session?.change(patch), flush }
}

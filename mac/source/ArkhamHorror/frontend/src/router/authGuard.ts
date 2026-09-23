import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

interface SessionStore {
  token: string | null
  isAdmin: boolean
  loadUserFromStorage(): Promise<void>
}

// Resolve authentication before loading a protected lazy route. Checking the
// current route from a background promise misses the initial navigation: it is
// still START_LOCATION while the game chunk is downloading.
export async function authNavigation(
  to: RouteLocationNormalized,
  store: SessionStore,
): Promise<true | RouteLocationRaw> {
  await store.loadUserFromStorage()
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  if (requiresAuth && !store.token) {
    return { path: '/sign-in', query: { nextUrl: to.fullPath } }
  }
  if (requiresAuth && to.matched.some(record => record.meta.requiresAdmin) && !store.isAdmin) {
    return { path: '/' }
  }
  if (to.matched.some(record => record.meta.guest) && store.token) return { path: '/' }
  return true
}

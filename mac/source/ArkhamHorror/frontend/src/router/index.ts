import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { authNavigation } from './authGuard'
import { routeLoadFailed } from './loadState'
import baseRoutes from '@/routes';
import arkhamRoutes from '@/arkham/routes';
import { isLegacyEditor, isLegacyGameRoute, legacyPageUrl } from '@/legacy/editorMode'

const routes: Array<RouteRecordRaw> = [
  ...baseRoutes,
  ...arkhamRoutes
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})


router.beforeEach(async to => {
  if (isLegacyEditor() && isLegacyGameRoute(to.path)) {
    window.location.assign(legacyPageUrl(to.fullPath))
    return false
  }
  routeLoadFailed.value = false
  const destination = await authNavigation(to, useUserStore())
  if (destination === true && to.meta.title) document.title = String(to.meta.title)
  return destination
});

// A missing/blocked lazy chunk must leave a recoverable page, not just the
// navigation bar and background. Do not weaken CSP to work around a load error.
router.onError(() => { routeLoadFailed.value = true })

export default router

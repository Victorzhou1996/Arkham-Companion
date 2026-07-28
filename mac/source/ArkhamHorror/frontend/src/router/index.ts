import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import baseRoutes from '@/routes';
import arkhamRoutes from '@/arkham/routes';

const routes: Array<RouteRecordRaw> = [
  ...baseRoutes,
  ...arkhamRoutes
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})


router.beforeEach(async (to, _from, next) => {
  const store = useUserStore()
  const restoreUser = store.loadUserFromStorage()

  if (to.matched.some((record) => record.meta && record.meta.requiresAuth)) {
    if (localStorage.getItem('arkham-token') === null) {
      next({ path: '/sign-in', query: { nextUrl: to.fullPath } });
    } else {
      if (to.matched.some((record) => record.meta && record.meta.requiresAdmin)) {
        await restoreUser
        if (store.isAdmin) {
          document.title = `${to.meta.title}`
          next();
        } else {
          next({ path: '/' })
        }
      } else {
        document.title = `${to.meta.title}`
        next();
        void restoreUser
          .then(() => {
            if (!store.token && router.currentRoute.value.meta.requiresAuth) {
              void router.replace({
                path: '/sign-in',
                query: { nextUrl: router.currentRoute.value.fullPath },
              })
            }
          })
          .catch((error) => console.warn('Could not restore the signed-in user', error))
      }
    }
  } else if (to.matched.some((record) => record.meta && record.meta.guest)) {
    await restoreUser
    if (localStorage.getItem('arkham-token') === null) {
      document.title = `${to.meta.title}`
      next();
    } else {
      next({ path: '/' });
    }
  } else {
    next();
  }
});

export default router

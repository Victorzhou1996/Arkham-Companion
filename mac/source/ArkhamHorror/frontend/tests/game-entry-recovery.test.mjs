import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createMemoryHistory, createRouter } from 'vue-router'

test('game entry never silently drops expired sessions or failed loads', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  t.after(() => server.close())
  const { authNavigation } = await server.ssrLoadModule('/src/router/authGuard.ts')
  const { createGameLoader, gameLoadFailure } = await server.ssrLoadModule('/src/arkham/gameLoadState.ts')

  function makeRouter(store) {
    let gameLoads = 0
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: {}, meta: { requiresAuth: true } },
      { path: '/sign-in', component: {}, meta: { guest: true } },
      { path: '/games/:id', component: () => { gameLoads++; return Promise.resolve({}) }, meta: { requiresAuth: true } },
      { path: '/admin', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    ] })
    router.beforeEach(to => authNavigation(to, store))
    return { router, loads: () => gameLoads }
  }

  await t.test('expired stored token is resolved before a protected lazy game import', async () => {
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const store = { token: 'expired-fixture-token', isAdmin: false, async loadUserFromStorage() { await pending; this.token = null } }
    const { router, loads } = makeRouter(store)
    const navigation = router.push('/games/old-save?event=fixture')
    await Promise.resolve()
    assert.equal(loads(), 0)
    finish()
    await navigation
    assert.equal(loads(), 0)
    assert.equal(router.currentRoute.value.path, '/sign-in')
    assert.equal(router.currentRoute.value.query.nextUrl, '/games/old-save?event=fixture')
  })
  await t.test('valid sessions, guests, and admin restrictions retain their routes', async () => {
    const store = { token: 'valid-fixture-token', isAdmin: false, async loadUserFromStorage() {} }
    const { router, loads } = makeRouter(store)
    await router.push('/games/fixture')
    assert.equal(loads(), 1)
    await router.push('/admin')
    assert.equal(router.currentRoute.value.path, '/')
    await router.push('/sign-in')
    assert.equal(router.currentRoute.value.path, '/')
    store.token = null
    await router.push('/games/fixture')
    assert.equal(router.currentRoute.value.path, '/sign-in')
  })
  await t.test('every load failure has a user-facing recovery category', () => {
    for (const [status, expected] of [[401,'signedOut'],[403,'forbidden'],[404,'missing'],[410,'missing'],[500,'unavailable'],[503,'unavailable']]) {
      assert.equal(gameLoadFailure({ response: { status } }), expected)
    }
    assert.equal(gameLoadFailure({ isAxiosError: true }), 'unavailable')
    assert.equal(gameLoadFailure({ code: 'ECONNABORTED' }), 'unavailable')
    assert.equal(gameLoadFailure(new Error('decoder failed')), 'invalid')
  })
  await t.test('failed requests are caught and can be retried successfully', async () => {
    const events = []
    const loader = createGameLoader({ loading: () => events.push('loading'), loaded: x => events.push(x), failed: x => events.push(x) })
    await loader.load(async () => { throw { response: { status: 404 } } })
    await loader.load(async () => 'game')
    assert.deepEqual(events, ['loading', 'missing', 'loading', 'game'])
  })
  await t.test('stale responses and unmounted errors cannot replace the current game', async () => {
    const events = []
    const loader = createGameLoader({ loading() {}, loaded: x => events.push(x), failed: x => events.push(x) })
    let finish
    const first = loader.load(() => new Promise(resolve => { finish = resolve }))
    await loader.load(async () => 'latest-game')
    finish('old-game')
    await first
    let reject
    const leaving = loader.load(() => new Promise((_resolve, fail) => { reject = fail }))
    loader.cancel()
    reject(new Error('late error'))
    await leaving
    assert.deepEqual(events, ['latest-game'])
  })
})

export type CardImagePreloadStatus = 'idle' | 'scanning' | 'running' | 'complete' | 'error'

export type CardImagePreloadState = {
  status: CardImagePreloadStatus
  completed: number
  total: number
  failed: number
  updatedAt: number
}

const CACHE_NAME = 'arkham-card-images-v1'
const STATE_KEY = 'arkham-card-image-preload-state-v2'
const EVENT_NAME = 'arkham-card-image-preload-state-v2'
const LOCK_NAME = 'arkham-card-image-preload-v2'
const ACTIVE_MAX_AGE = 30_000
const REQUEST_TIMEOUT = 20_000

const emptyState = (): CardImagePreloadState => ({
  status: 'idle',
  completed: 0,
  total: 0,
  failed: 0,
  updatedAt: 0,
})

const normalizeUrls = (urls: string[]) => [
  ...new Set(urls.map((url) => new URL(url, window.location.href).href)),
]

const isActive = (state: CardImagePreloadState) =>
  (state.status === 'scanning' || state.status === 'running') &&
  Date.now() - state.updatedAt < ACTIVE_MAX_AGE

export function readCardImagePreloadState(): CardImagePreloadState {
  try {
    return {
      ...emptyState(),
      ...JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}'),
    }
  } catch {
    return emptyState()
  }
}

function publish(state: Omit<CardImagePreloadState, 'updatedAt'>) {
  const next = { ...state, updatedAt: Date.now() }
  localStorage.setItem(STATE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
  return next
}

export function subscribeToCardImagePreload(listener: (state: CardImagePreloadState) => void) {
  const onCustom = (event: Event) => listener((event as CustomEvent<CardImagePreloadState>).detail)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STATE_KEY) listener(readCardImagePreloadState())
  }

  window.addEventListener(EVENT_NAME, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

async function cachedUrls(cache: Cache, urls: string[]) {
  const expected = new Set(urls)
  const requests = await cache.keys()
  return new Set(requests.map((request) => request.url).filter((url) => expected.has(url)))
}

export async function inspectCardImageCache(urls: string[]) {
  const normalized = normalizeUrls(urls)
  const current = readCardImagePreloadState()
  if (isActive(current)) return current

  publish({ status: 'scanning', completed: 0, total: normalized.length, failed: 0 })
  if (!('caches' in window)) {
    if (current.status === 'complete' && current.total === normalized.length) return current
    return publish({ status: 'idle', completed: 0, total: normalized.length, failed: 0 })
  }

  const cache = await caches.open(CACHE_NAME)
  const existing = await cachedUrls(cache, normalized)
  return publish({
    status: existing.size === normalized.length ? 'complete' : 'idle',
    completed: existing.size,
    total: normalized.length,
    failed: 0,
  })
}

async function runPreload(urls: string[]) {
  const cache = await caches.open(CACHE_NAME)
  const existing = await cachedUrls(cache, urls)
  const missing = urls.filter((url) => !existing.has(url))

  if (!missing.length) {
    return publish({ status: 'complete', completed: urls.length, total: urls.length, failed: 0 })
  }

  let cursor = 0
  let processed = 0
  let completed = existing.size
  let failed = 0
  publish({ status: 'running', completed, total: urls.length, failed })

  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= missing.length) return

      try {
        const request = new Request(missing[index])
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
        const response = await fetch(request, { signal: controller.signal }).finally(() =>
          window.clearTimeout(timeout),
        )
        if (!response.ok) throw new Error(String(response.status))
        await cache.put(request, response.clone())
        completed += 1
      } catch {
        failed += 1
      } finally {
        processed += 1
        if (processed % 5 === 0 || processed === missing.length) {
          publish({ status: 'running', completed, total: urls.length, failed })
        }
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker))
  const finalCount = (await cachedUrls(cache, urls)).size
  return publish({
    status: finalCount === urls.length ? 'complete' : 'error',
    completed: finalCount,
    total: urls.length,
    failed: urls.length - finalCount,
  })
}

async function runPreloadWithoutCache(urls: string[]) {
  let cursor = 0
  let completed = 0
  let failed = 0
  publish({ status: 'running', completed, total: urls.length, failed })

  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= urls.length) return

      try {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
        const response = await fetch(urls[index], { signal: controller.signal }).finally(() =>
          window.clearTimeout(timeout),
        )
        if (!response.ok) throw new Error(String(response.status))
        completed += 1
      } catch {
        failed += 1
      } finally {
        if ((completed + failed) % 5 === 0 || completed + failed === urls.length) {
          publish({ status: 'running', completed, total: urls.length, failed })
        }
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker))
  return publish({
    status: failed ? 'error' : 'complete',
    completed,
    total: urls.length,
    failed,
  })
}

export async function preloadCardImages(urls: string[]) {
  const normalized = normalizeUrls(urls)
  if (!normalized.length) return inspectCardImageCache(normalized)
  if (!('caches' in window)) return runPreloadWithoutCache(normalized)

  const current = readCardImagePreloadState()
  if (isActive(current)) return current

  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) return runPreload(normalized)

  let result = current
  await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (lock) result = await runPreload(normalized)
  })
  return result
}

export type GameLoadFailure = 'signedOut' | 'forbidden' | 'missing' | 'unavailable' | 'invalid' | 'pageUnavailable'

export function gameLoadFailure(error: unknown): GameLoadFailure {
  const failure = error as { response?: { status?: number }; code?: string; isAxiosError?: boolean } | null
  const status = failure?.response?.status
  if (status === 401) return 'signedOut'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'missing'
  if ((status && status >= 500) || failure?.isAxiosError || failure?.code === 'ECONNABORTED') return 'unavailable'
  return 'invalid'
}

// A later route/seat change owns the result. A slow response from the previous
// game must not replace it, nor show an obsolete error after leaving the page.
export function createGameLoader<T>(callbacks: {
  loading(): void
  loaded(value: T): void
  failed(reason: GameLoadFailure): void
}) {
  let generation = 0
  return {
    cancel() { generation += 1 },
    async load(fetch: () => Promise<T>) {
      const request = ++generation
      callbacks.loading()
      try {
        const value = await fetch()
        if (request === generation) callbacks.loaded(value)
      } catch (error) {
        if (request === generation) callbacks.failed(gameLoadFailure(error))
      }
    },
  }
}

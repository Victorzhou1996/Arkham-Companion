import { normalizePanels, persistentPanels, type PanelLayout } from './tabletopPanels'

export type SavedPanels = ReturnType<typeof persistentPanels>
export type PanelPatch = Partial<SavedPanels>
export function panelPatch(input: unknown): PanelPatch {
  if (!input || typeof input !== 'object') return {}
  const normalized = persistentPanels(normalizePanels(input))
  return Object.fromEntries(Object.entries(normalized).filter(([key]) =>
    Object.hasOwn(input, key) && typeof (input as Record<string, unknown>)[key] === 'number'
    && Number.isFinite((input as Record<string, number>)[key])))
}

// One instance per authenticated account, never per game or shared anonymous key.
export function accountPanelPreferences(deps: {
  read: () => { panels?: unknown; pending?: unknown }
  cache: (value: { panels: PanelPatch; pending: PanelPatch }) => void
  load: () => Promise<unknown>
  save: (patch: PanelPatch, keepalive: boolean) => Promise<unknown>
  render: (panels: Partial<PanelLayout>) => void
}) {
  let initial: ReturnType<typeof deps.read> = {}
  try { initial = deps.read() } catch { /* Broken/unavailable storage is optional. */ }
  let panels = panelPatch(initial.panels), pending = panelPatch(initial.pending)
  let loaded = false, disposed = false, inFlight = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const cache = () => { try { deps.cache({ panels, pending }) } catch { /* Private mode/quota. */ } }
  const render = () => { if (!disposed) deps.render(panels) }
  render()
  function schedule() {
    clearTimeout(timer)
    if (!disposed) timer = setTimeout(() => { void flush() }, 450)
  }
  async function flush(keepalive = false): Promise<void> {
    clearTimeout(timer)
    if (!loaded || inFlight || !Object.keys(pending).length) return
    const sent = { ...pending }
    inFlight = true
    let success = false
    try {
      await deps.save(sent, keepalive)
      for (const key of Object.keys(sent) as (keyof SavedPanels)[]) {
        if (pending[key] === sent[key]) delete pending[key]
      }
      success = true
      cache()
    } catch { /* Keep unsent edits in the account cache; retry on next interaction/online. */ }
    finally {
      inFlight = false
      if (success && Object.keys(pending).length) {
        if (disposed || keepalive) void flush(true)
        else schedule()
      }
    }
  }
  const ready = (async () => {
    try { panels = { ...panelPatch(await deps.load()), ...pending } }
    catch { panels = { ...panels, ...pending } }
    loaded = true
    cache()
    render()
    if (Object.keys(pending).length) void flush(disposed)
  })()
  return {
    ready, flush,
    change(input: PanelPatch) {
      const patch = panelPatch(input)
      panels = { ...panels, ...patch }
      pending = { ...pending, ...patch }
      cache(); render(); schedule()
    },
    dispose() { disposed = true; clearTimeout(timer); void flush(true) },
  }
}

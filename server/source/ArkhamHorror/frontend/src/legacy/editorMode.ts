export const LEGACY_UI_PATH = '/legacy-ui-20260921.1/'
export const isSharedCardRoute = (path: string) => /^\/(card-builder|card-marketplace)(\/|\?|$)/.test(path)

export function isLegacyEditor(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.ui === 'legacy-editor'
}

export function legacyPageUrl(path: string): string {
  const url = new URL(window.location.href)
  url.pathname = LEGACY_UI_PATH
  url.searchParams.set('ui', 'legacy')
  url.hash = `#${path}`
  return url.href
}

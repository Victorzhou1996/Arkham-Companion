export const CARD_HOVER_ZOOM_KEY = 'arkham_card_hover_zoom'
export const CDN_BADGE_KEY = 'arkham_show_cdn_badge'
export const CARD_HOVER_ZOOM_DEFAULT = 40
export const CARD_HOVER_ZOOM_OPTIONS = [0, 10, 15, 20, 30, 40, 50, 70] as const

export function cardHoverScale(zoom: number): number {
  return zoom > 0 ? 1 + zoom / 100 : 1
}

export function applyCardHoverZoom(
  zoom = Number(localStorage.getItem(CARD_HOVER_ZOOM_KEY) ?? CARD_HOVER_ZOOM_DEFAULT),
) {
  document.documentElement.style.setProperty('--card-hover-zoom', String(cardHoverScale(zoom)))
}

export function cardCodeFromImagePath(path: string): string | null {
  return path.match(/\/img\/arkham\/(?:[^/]+\/)?cards\/([^/.]+)/)?.[1] ?? null
}

export function initializeCardImagePreferences() {
  applyCardHoverZoom()

  const cdnPaths = new Set<string>()
  const pathOf = (url: string) => new URL(url, window.location.href).pathname
  const enabled = () => localStorage.getItem(CDN_BADGE_KEY) === '1'

  window.addEventListener(
    'error',
    (event) => {
      if (!(event.target instanceof HTMLImageElement)) return
      const image = event.target
      const current = new URL(image.currentSrc || image.src, window.location.href)
      const fallback = current.searchParams.get('fallback')
      if (!fallback || fallback === image.dataset.cardImageFallback) return
      image.dataset.cardImageFallback = fallback
      image.src = fallback
    },
    true,
  )

  const addBadge = (img: HTMLImageElement, path: string) => {
    if (!enabled() || img.dataset.cdnBadged) return
    const code = cardCodeFromImagePath(path)
    if (!code || !img.parentNode) return

    img.dataset.cdnBadged = '1'
    const wrapper = document.createElement('span')
    wrapper.className = 'cdn-card-image'
    img.parentNode.insertBefore(wrapper, img)
    wrapper.appendChild(img)

    const badge = document.createElement('button')
    badge.className = 'cdn-card-image__badge'
    badge.type = 'button'
    badge.title = 'CDN image - ArkhamDB'
    badge.setAttribute('aria-label', badge.title)
    badge.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>'
    badge.addEventListener('click', (event) => {
      event.stopPropagation()
      const host = (localStorage.getItem('language') || '').toLowerCase().startsWith('zh')
        ? 'https://zh.arkhamdb.com'
        : 'https://arkhamdb.com'
      window.open(`${host}/card/${code}`, '_blank', 'noopener')
    })
    wrapper.appendChild(badge)
  }

  const scan = (root: ParentNode = document) => {
    if (!enabled()) return
    root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const path = pathOf(img.currentSrc || img.src)
      if (cdnPaths.has(path)) addBadge(img, path)
    })
  }

  const removeBadges = () => {
    document.querySelectorAll<HTMLImageElement>('img[data-cdn-badged]').forEach((img) => {
      const wrapper = img.parentElement
      if (wrapper?.classList.contains('cdn-card-image') && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(img, wrapper)
        wrapper.remove()
      }
      delete img.dataset.cdnBadged
    })
  }

  const style = document.createElement('style')
  style.textContent = `
    .cdn-card-image { display: inline-block; line-height: 0; position: relative; vertical-align: inherit; }
    .cdn-card-image__badge { align-items: center; background: rgba(255,255,255,.84); border: 0; border-radius: 4px; color: #555; cursor: pointer; display: flex; height: 22px; justify-content: center; padding: 4px; position: absolute; right: 4px; top: 4px; width: 22px; z-index: 100; }
    .cdn-card-image__badge svg { fill: none; height: 14px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; width: 14px; }
  `
  document.head.appendChild(style)

  window.addEventListener('cdn-badge-toggle', () => (enabled() ? scan() : removeBadges()))

  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry instanceof PerformanceResourceTiming)) continue
          if (!entry.serverTiming.some(({ name }) => name === 'cdn')) continue
          cdnPaths.add(pathOf(entry.name))
        }
        scan()
      }).observe({ type: 'resource', buffered: true })
    } catch {
      // Server Timing observation is optional in older browsers.
    }
  }

  new MutationObserver((mutations) => {
    if (!enabled()) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLImageElement) {
          const path = pathOf(node.currentSrc || node.src)
          if (cdnPaths.has(path)) addBadge(node, path)
        } else if (node instanceof Element) {
          scan(node)
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true })
}

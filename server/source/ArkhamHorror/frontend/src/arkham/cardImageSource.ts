const chineseCardPattern = /^cards\/[^/]+\.avif$/i

function absoluteUrl(url: string) {
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).href
}

function withFallback(url: string, fallback: string) {
  const target = new URL(absoluteUrl(url))
  target.searchParams.set('fallback', absoluteUrl(fallback))
  return target.href
}

export function cardImageSource(
  path: string,
  serverFallback: string,
  companionHost: string,
  cdnHost: string,
  language: string,
) {
  if (language !== 'zh' || !chineseCardPattern.test(path)) return serverFallback

  const filename = path.slice(path.lastIndexOf('/') + 1)
  const cdnSource = cdnHost
    ? withFallback(`${cdnHost.replace(/\/+$/, '')}/img/arkham/zh/cards/${filename}`, serverFallback)
    : serverFallback

  if (!companionHost) return cdnSource

  return withFallback(
    `${companionHost.replace(/\/+$/, '')}/img/arkham/zh/cards/${filename}`,
    cdnSource,
  )
}

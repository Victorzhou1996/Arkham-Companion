import { defineStore } from 'pinia'
import api from '@/api';

export interface SiteSettings {
  assetHost: string
  companionAssetHost: string
}

const cdnUrl = "https://assets.arkhamhorror.app"
const companionUrl = "http://127.0.0.1:8688"
const companionProbeTimeout = 600

async function detectCompanion() {
  if (typeof window === 'undefined') return ''

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), companionProbeTimeout)
  try {
    const response = await fetch(`${companionUrl}/health`, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      signal: controller.signal,
    })
    if (!response.ok) return ''
    const result = await response.json()
    return result?.ok === true && result?.service === 'Arkham Companion' ? companionUrl : ''
  } catch {
    return ''
  } finally {
    window.clearTimeout(timeout)
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
  if (host.endsWith('.local') || host.endsWith('.lan')) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true
  return false
}

function shouldPreferLocalAssets(assetHost: string) {
  if (typeof window === 'undefined') return false

  const currentHost = window.location.hostname
  if (!currentHost) return false

  try {
    const cdnHost = new URL(cdnUrl).host
    const resolvedHost = new URL(assetHost || '', window.location.origin).host

    // 只要当前页面不是官方 CDN 域名，就优先走当前站点的 /img/arkham/...。
    // 这样本地、局域网、以及 Sakura/FRP 这类公网穿透域名都会先命中本地 nginx，
    // 再由 nginx 决定本地读取还是回源 CDN。
    if (window.location.host !== cdnHost && (!resolvedHost || resolvedHost === cdnHost)) {
      return true
    }
  } catch {
    if (window.location.host !== new URL(cdnUrl).host && !assetHost) {
      return true
    }
  }

  const localInstall = isPrivateHost(currentHost)
  if (!localInstall) return false

  try {
    return new URL(assetHost, window.location.origin).host === new URL(cdnUrl).host
  } catch {
    return assetHost === cdnUrl
  }
}

function resolveAssetHost(assetHost?: string | null) {
  const resolved = assetHost ?? baseUrl
  if (shouldPreferLocalAssets(resolved)) return ''
  return resolved
}

export const baseUrl = import.meta.env.VITE_ASSET_HOST !== undefined ? import.meta.env.VITE_ASSET_HOST : cdnUrl

export const useSiteSettingsStore = defineStore("site_settings", {
  state: () => ({
    assetHost: resolveAssetHost(baseUrl),
    companionAssetHost: '',
  } as SiteSettings),

  getters: {
    getAssetHost(state) {
      return state.assetHost
    }
  },

  actions: {
    async init() {
      //const assetHost = localStorage.getItem('asset-host');
      // if (assetHost !== null && assetHost !== undefined) {
      //   this.assetHost = assetHost
      // } else {
        const result = await api.get('/site-settings')
        if (result.status === 200) {
          this.assetHost = resolveAssetHost(result.data.assetHost)
          //localStorage.setItem('asset-host', this.assetHost)
        } else {
          this.assetHost = resolveAssetHost(baseUrl)
          //localStorage.setItem('asset-host', baseUrl)
        }
        this.companionAssetHost = await detectCompanion()
      //}
    }
  }
})

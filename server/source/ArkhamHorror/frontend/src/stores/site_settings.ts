import { defineStore } from 'pinia'
import api from '@/api';

export interface SiteSettings {
  assetHost: string
  companionAssetHost: string
  cardImageCdnHost: string
}

export const baseUrl = import.meta.env.VITE_ASSET_HOST ?? ''
const cardImageCdnHost = import.meta.env.VITE_CARD_IMAGE_CDN_HOST ?? ''
const companionUrl = 'https://localhost:8688'
const companionProbeTimeout = 2500

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

export const useSiteSettingsStore = defineStore("site_settings", {
  state: () => ({
    assetHost: baseUrl,
    companionAssetHost: '',
    cardImageCdnHost,
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
        try {
          const result = await api.get('/site-settings')
          if (result.status === 200) {
            this.assetHost = result.data.assetHost || baseUrl
            //localStorage.setItem('asset-host', this.assetHost)
          } else {
            this.assetHost = baseUrl
          }
        } catch {
          this.assetHost = baseUrl
        } finally {
          this.companionAssetHost = await detectCompanion()
        }
        //localStorage.setItem('asset-host', baseUrl)
      //}
    }
  }
})

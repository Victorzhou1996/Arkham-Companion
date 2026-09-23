import { useI18n } from 'vue-i18n'
import chinese from '@/locales/zh/customCardEditor.json'

const translations: Record<string, string> = chinese

// Display text only: schema tags, bindings and exported card definitions stay intact.
export function customCardText(text: string | null | undefined, locale: string): string {
  const value = text ?? ''
  if (locale !== 'zh' && !locale.startsWith('zh-')) return value
  const key = value.replace(/\s+/g, ' ').trim()
  if (translations[key]) return translations[key]
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  if (translations[words]) return translations[words]
  const numbered = /^(.*) (\d+)$/.exec(key)
  if (numbered && translations[numbered[1]]) return `${translations[numbered[1]]} ${numbered[2]}`
  const context = /^the (.+) (window|message)$/.exec(key)
  if (context) return `${customCardText(context[1], locale)}${context[2] === 'window' ? '时机' : '消息'}`
  return value
}

export function useCustomCardText() {
  const { locale } = useI18n()
  return (text: string | null | undefined, params: Record<string, string | number> = {}) =>
    customCardText(text, locale.value).replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match))
}

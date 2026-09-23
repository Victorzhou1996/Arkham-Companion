import campaigns from '@/arkham/data/campaigns.json'
import scenarios from '@/arkham/data/scenarios'
import { scenarioIdToI18n } from '@/arkham/types/Scenario'
import type { GameDetails } from '@/arkham/types/Game'

const campaignChinese: Record<string, string> = {
  '01': '狂热之夜', '02': '敦威治遗产', '03': '卡尔克萨之路',
  '04': '遗忘年代', '05': '万象无终', '06': '食梦者',
  '07': '印斯茅斯阴谋', '08': '地球边缘', '09': '猩红密钥',
  '10': '铁杉谷盛宴', '11': '淹没之城', '12': '灰烬兄弟会', '13': '鲜血之子',
  '83': '深渊守卫',
}

// Use scenario metadata, never the player's freely editable save name, for the chapter.
export function gameSummary(game: GameDetails, translateChinese: (key: string) => string | undefined) {
  const scenarioId = game.scenario?.id.replace(/^c(?!:)/, '')
  const scenario = scenarioId ? scenarios.find(s => s.id === scenarioId || s.returnTo === scenarioId || s.scenarios?.some(part => part.id === scenarioId)) : undefined
  const campaignId = game.campaign?.id ?? scenario?.campaign
  const campaign = campaignId ? campaigns.find(c => c.id === campaignId || c.returnTo?.id === campaignId) : undefined
  const returning = !!campaign?.returnTo && campaign.returnTo.id === campaignId
  const campaignEn = campaign ? `${returning ? 'Return to ' : ''}${campaign.name}` : (game.campaign ? game.name : '')
  const campaignZh = campaignChinese[campaign?.id ?? campaignId ?? '']
  const cycleZh = campaignZh ? `${returning ? '重返' : ''}${campaignZh}` : campaignEn
  const scenarioEn = game.scenario?.name.title ?? ''
  let scenarioZh = scenarioEn
  if (scenarioId) {
    try {
      const title = translateChinese(`${scenarioIdToI18n(scenarioId)}.intro.title`)
      if (title) scenarioZh = title.replace(/^(?:剧本|冒险|场景|序章|Scenario)\s*[^:：]*[:：]\s*/i, '')
    } catch { /* Unknown custom scenarios keep their original title. */ }
  }
  return {
    zh: [cycleZh, scenarioZh].filter(Boolean).join(' - ') || game.name,
    en: [campaignEn, scenarioEn].filter(Boolean).join(' - ') || game.name,
  }
}

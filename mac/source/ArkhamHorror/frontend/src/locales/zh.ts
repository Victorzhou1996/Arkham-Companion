import base from '@/locales/zh/base.json'
import log from '@/locales/zh/log.json'
import cards from '@/locales/zh/cards.json'
import label from '@/locales/zh/label.json'
import investigators from '@/locales/zh/investigators.json'
import campaignLog from '@/locales/zh/campaignLog.json'
import nightOfTheZealot from '@/locales/zh/nightOfTheZealot'
import theDunwichLegacy from '@/locales/zh/theDunwichLegacy'
import thePathToCarcosa from '@/locales/zh/thePathToCarcosa'
import theForgottenAge from '@/locales/zh/theForgottenAge'
import theCircleUndone from '@/locales/zh/theCircleUndone'
import theDreamEaters from '@/locales/zh/theDreamEaters'
import theInnsmouthConspiracy from '@/locales/zh/theInnsmouthConspiracy'
import edgeOfTheEarth from '@/locales/zh/edgeOfTheEarth'
import theScarletKeys from '@/locales/zh/theScarletKeys'
import theFeastOfHemlockVale from '@/locales/zh/theFeastOfHemlockVale'
import theDrownedCity from '@/locales/zh/theDrownedCity'
import brethrenOfAsh from '@/locales/zh/brethrenOfAsh'
import standalone from '@/locales/zh/standalone'
import gameBoard from '@/locales/zh/gameBoard/gameBoard'
import xp from '@/locales/zh/xp.json'
import customCardSets from '@/locales/zh/customCardSets.json'

export default 
{ ...base,
  customCardSets,
  nav: { ...base.nav, cardBuilder: '自定义卡牌' },
  settingsForm: {
    ...base.settingsForm,
    customCards: '自定义卡牌',
    customCardsWarning: '实验性功能：可能导致游戏无法继续，也可能随时变更或移除。卡牌是否正确运行取决于其规则定义；编辑器允许定义的行为不一定符合实体卡牌规则。',
    customCardsHelp: '启用后，菜单中会出现自定义卡牌编辑器。可从调试菜单将卡牌加入游戏，也可通过牌组上的 {icon} 按钮替换调查员及其专属卡牌、增减卡牌。在牌组页面设置的调整会一直保留，直到手动移除；选取开局牌组时设置的调整仅适用于本次游戏。',
    openCardBuilder: '打开卡牌编辑器',
    phaseTransitionNotifications: '阶段切换提醒',
    phaseTransitionNotificationsHelp: '进入新阶段时显示全屏提示。',
  },
  ...campaignLog, 
  ...gameBoard, 
  cards,
  investigators,
  label: { ...label, cards: cards["label"] },
  log,
  xp,
  nightOfTheZealot, 
  theDunwichLegacy, 
  thePathToCarcosa, 
  theForgottenAge, 
  returnToTheForgottenAge: theForgottenAge,
  theCircleUndone, 
  theDreamEaters, 
  theInnsmouthConspiracy, 
  edgeOfTheEarth, 
  theScarletKeys, 
  theFeastOfHemlockVale,
  theDrownedCity,
  brethrenOfAsh, 
  standalone
}

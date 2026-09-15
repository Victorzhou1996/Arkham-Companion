import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const en = { agenda: 'Agenda', act: 'Act', threat: 'Threat area', equipment: 'Assets / support', log: 'Game log', reference: 'Scenario reference', deck: 'Draw pile', encounter: 'Encounter deck', spectral: 'Spectral', discard: 'Discard pile', tools: 'Game menu', hand: 'Hand', closeLog: 'Close game log', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoom: 'Map zoom', unlock: 'Unlock locations to drag', lock: 'Lock locations', reset: 'Reset', resetMap: 'Reset location positions', expand: 'Expand map', collapse: 'Exit fullscreen map' }
const zh: typeof en = { agenda: '密谋', act: '场景', threat: '威胁区', equipment: '装备 / 支援', log: '战役日志', reference: '场景参考', deck: '抽牌堆', encounter: '遭遇牌', spectral: '幽灵牌', discard: '弃牌堆', tools: '游戏菜单', hand: '手牌', closeLog: '关闭战役日志', zoomIn: '放大地图', zoomOut: '缩小地图', zoom: '地图缩放', unlock: '解锁地点拖动', lock: '锁定地点', reset: '复位', resetMap: '重置地点位置', expand: '全屏地图', collapse: '退出全屏地图' }
export function useTabletopLabels() {
  const { locale } = useI18n()
  return computed(() => locale.value.toLowerCase().startsWith('zh')
    ? { ...zh, currentPerspective: '当前视角', switchPerspective: '切换视角' }
    : { ...en, currentPerspective: 'Current perspective', switchPerspective: 'Switch perspective' })
}

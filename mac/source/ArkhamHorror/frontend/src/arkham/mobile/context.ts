import { computed, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch, type InjectionKey, type Ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { isPhoneDevice, isTabletDevice, readDeviceInfo, type DeviceInfo } from './devicePresentation'
import { emptyActionHints, type MobileActionHints } from './actionHints'

export type MobileZone = 'hand' | 'threats' | 'equipment' | 'investigator'
export interface MobileBoard {
  enabled: Ref<boolean>
  tablet: Ref<boolean>
  touchEnabled: Ref<boolean>
  zone: Ref<MobileZone>
  scenarioZone: Ref<'scene' | 'encounter' | 'reference' | 'other'>
  scenarioActions: Ref<Record<string, boolean>>
  tools: Ref<boolean>
  topCollapsed: Ref<boolean>
  bottomCollapsed: Ref<boolean>
  actions: Ref<MobileActionHints>
  preview: Ref<{ id: symbol; close: () => void } | null>
  viewport: Ref<Record<string, string>>
}
const mobileKey: InjectionKey<MobileBoard> = Symbol('mobile-board')
export const deviceInfoKey: InjectionKey<Ref<DeviceInfo>> = Symbol('device-info')
export const mobileCardKey: InjectionKey<{ preview: Ref<boolean>; open: () => void }> = Symbol('mobile-card')
export function useMobileBoard() { return inject(mobileKey, null) }
export function provideMobileBoard(actualScenario: Ref<boolean>, device: Ref<DeviceInfo> = inject(deviceInfoKey, ref(readDeviceInfo()))) {
  // A phone stays a phone in landscape; a resized desktop can preview this UI.
  const narrow = useMediaQuery('(max-width: 800px)')
  const touchLandscape = useMediaQuery('(pointer: coarse) and (max-height: 600px) and (max-width: 1000px)')
  const tablet = computed(() => isTabletDevice(device.value))
  const phone = computed(() => isPhoneDevice(device.value))
  const enabled = computed(() => actualScenario.value && !tablet.value && (phone.value || narrow.value || touchLandscape.value))
  const touchEnabled = computed(() => actualScenario.value && (enabled.value || tablet.value))
  const board: MobileBoard = { enabled, tablet, touchEnabled, zone: ref('hand'), scenarioZone: ref('scene'), scenarioActions: ref({}), tools: ref(false), topCollapsed: ref(false), bottomCollapsed: ref(false), actions: ref(emptyActionHints()), preview: shallowRef(null), viewport: ref({}) }
  provide(mobileKey, board)
  const updateViewport = () => {
    const viewport = window.visualViewport
    board.viewport.value = {
      '--mobile-vh': `${viewport?.height ?? window.innerHeight}px`,
      '--mobile-top': `${viewport?.offsetTop ?? 0}px`,
    }
  }
  onMounted(() => {
    updateViewport()
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
  })
  onBeforeUnmount(() => {
    board.preview.value?.close()
    window.visualViewport?.removeEventListener('resize', updateViewport)
    window.visualViewport?.removeEventListener('scroll', updateViewport)
    window.removeEventListener('resize', updateViewport)
  })
  watch([enabled, touchEnabled], () => { board.preview.value?.close(); board.tools.value = false })
  return board
}

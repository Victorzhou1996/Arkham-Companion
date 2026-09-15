export interface DeviceInfo {
  userAgent: string
  platform: string
  maxTouchPoints: number
  screenWidth: number
  screenHeight: number
  coarsePointer: boolean
}

export function isTabletDevice(device: DeviceInfo) {
  // iPhone/iPod UAs contain "like Mac OS X": never treat that as a Mac.
  if (/iPhone|iPod/i.test(`${device.platform} ${device.userAgent}`)) return false
  // iPadOS Safari normally identifies itself as a Mac, including in portrait
  // and Split View. Screen dimensions are stable when the keyboard opens.
  if (/iPad/i.test(`${device.platform} ${device.userAgent}`)) return true
  const tabletScreen = Math.min(device.screenWidth, device.screenHeight) >= 600
  const desktopMacIdentity = /^MacIntel$/i.test(device.platform) || /\bMacintosh\b/i.test(device.userAgent)
  // Screen (not viewport) keeps iPad Split View on desktop layout, without
  // moving phone-sized devices requesting a desktop site into tablet layout.
  if (desktopMacIdentity && device.maxTouchPoints > 1) return tabletScreen
  return device.coarsePointer && device.maxTouchPoints > 0 && tabletScreen
}

export function phonePresentation(width: number, height: number, device: DeviceInfo) {
  if (isTabletDevice(device)) return false
  return isPhoneDevice(device) || width <= 800 || (device.coarsePointer && width <= 1000 && height <= 600)
}

export function isPhoneDevice(device: DeviceInfo) {
  if (/iPhone|iPod/i.test(`${device.platform} ${device.userAgent}`)) return true
  if (isTabletDevice(device)) return false
  const shortScreen = Math.min(device.screenWidth, device.screenHeight)
  // Request Desktop Website can replace the UA and widen the layout viewport
  // to 980px. A touch handset's screen stays phone-sized in either mode.
  return device.maxTouchPoints > 0 && shortScreen > 0 && shortScreen < 600
}

export function readDeviceInfo(): DeviceInfo {
  return { userAgent: navigator.userAgent, platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints, screenWidth: screen.width,
    screenHeight: screen.height, coarsePointer: matchMedia('(pointer: coarse)').matches }
}

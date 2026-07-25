export function randomId(): string {
  const browserCrypto = globalThis.crypto
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID()

  if (typeof browserCrypto?.getRandomValues === 'function') {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

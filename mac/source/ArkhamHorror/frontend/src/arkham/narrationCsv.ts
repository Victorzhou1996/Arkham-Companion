import { reactive, readonly } from 'vue'
import type { NarrationCategory, NarrationItem, NarrationSegment } from '@/arkham/narration'

type CardFace = {
  name: string
  subname: string
  traits: string
  text: string
  flavor: string
}

type CardTextRow = {
  code: string
  front: CardFace
  back: CardFace
}

type ResolvedCardText = {
  row: CardTextRow
  face: CardFace
  isBack: boolean
}

const CSV_URL = '/narration/zh-card-text.csv'
const EMPTY_FACE: CardFace = { name: '', subname: '', traits: '', text: '', flavor: '' }

const state = reactive({
  loading: false,
  loaded: false,
  rows: 0,
  source: CSV_URL,
  error: '',
})

let database = new Map<string, CardTextRow>()
let loadingPromise: Promise<Map<string, CardTextRow>> | null = null

const parseCsv = (content: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]
    if (char === '"' && quoted && content[i + 1] === '"') {
      field += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && content[i + 1] === '\n') i += 1
      if (field || row.length) {
        row.push(field.trim())
        rows.push(row)
        row = []
        field = ''
      }
    } else {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field.trim())
    rows.push(row)
  }
  return rows
}

const faceFrom = (columns: string[], offset: number): CardFace => ({
  name: columns[offset] ?? '',
  subname: columns[offset + 1] ?? '',
  traits: columns[offset + 2] ?? '',
  text: columns[offset + 3] ?? '',
  flavor: columns[offset + 4] ?? '',
})

const normalizeCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^c/, '')
    .replace(/\?.*$/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/_.*$/, '')

const codeVariants = (value: string): string[] => {
  const code = normalizeCode(value)
  if (!code) return []
  const withoutLeadingZeroes = code.replace(/^0+(?=\d)/, '')
  const numeric = code.match(/^(\d+)(.*)$/)
  const padded = numeric ? `${numeric[1].padStart(5, '0')}${numeric[2]}` : code
  return [...new Set([code, withoutLeadingZeroes, padded])]
}

const findRow = (value: string): CardTextRow | null => {
  for (const variant of codeVariants(value)) {
    const row = database.get(variant)
    if (row) return row
  }
  return null
}

const hasContent = (face: CardFace) =>
  Object.values(face).some((value) => value && value.toLowerCase() !== 'nan')

const resolveCardText = (imageCode: string, declaredCode?: string | null): ResolvedCardText | null => {
  const exactImage = findRow(imageCode)
  if (exactImage) return { row: exactImage, face: exactImage.front, isBack: false }

  const normalizedImage = normalizeCode(imageCode)
  if (normalizedImage.endsWith('b')) {
    const base = findRow(normalizedImage.slice(0, -1))
    if (base && hasContent(base.back)) {
      return { row: base, face: base.back, isBack: true }
    }
  }

  if (declaredCode) {
    const declared = findRow(declaredCode)
    if (declared) {
      const imageIsBack =
        normalizedImage !== normalizeCode(declaredCode) && normalizedImage.endsWith('b')
      if (imageIsBack && hasContent(declared.back)) {
        return { row: declared, face: declared.back, isBack: true }
      }
      return { row: declared, face: declared.front, isBack: false }
    }
  }

  return null
}

const buildDatabase = (content: string) => {
  const rows = parseCsv(content.replace(/^\uFEFF/, ''))
  const next = new Map<string, CardTextRow>()
  for (const columns of rows.slice(1)) {
    const code = normalizeCode(columns[0] ?? '')
    if (!code) continue
    next.set(code, {
      code,
      front: faceFrom(columns, 1),
      back: faceFrom(columns, 6),
    })
  }
  return next
}

export const loadCardNarrationCsv = async (force = false) => {
  if (!force && database.size) return database
  if (!force && loadingPromise) return loadingPromise

  state.loading = true
  state.error = ''
  loadingPromise = fetch(CSV_URL, { cache: force ? 'reload' : 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      database = buildDatabase(await response.text())
      state.loaded = true
      state.rows = database.size
      return database
    })
    .catch((error: unknown) => {
      state.loaded = false
      state.rows = 0
      state.error = error instanceof Error ? error.message : String(error)
      return database
    })
    .finally(() => {
      state.loading = false
      loadingPromise = null
    })

  return loadingPromise
}

export const reloadCardNarrationCsv = () => loadCardNarrationCsv(true)

export const cardNarrationFromCsv = async (
  declaredCode: string | null,
  imageCode: string,
  category: NarrationCategory,
): Promise<NarrationItem | null> => {
  await loadCardNarrationCsv()
  const resolved = resolveCardText(imageCode, declaredCode)
  if (!resolved) return null

  const { face, isBack, row } = resolved
  const segments: NarrationSegment[] = [
    { category: 'cardName', text: face.name },
    { category: 'cardSubname', text: face.subname },
    { category: 'cardTraits', text: face.traits },
    { category: 'cardText', text: face.text },
    { category: 'cardFlavor', text: face.flavor },
  ]

  return {
    id: `csv-card:${row.code}:${isBack ? 'back' : 'front'}:${JSON.stringify(segments)}`,
    category,
    segments,
  }
}

export const cardNarrationCsvState = readonly(state)

// Exposed for focused browser tests without coupling tests to Vue components.
export const __narrationCsvTest = {
  parseCsv,
  buildDatabase,
  normalizeCode,
  resolveCardText,
  emptyFace: EMPTY_FACE,
}

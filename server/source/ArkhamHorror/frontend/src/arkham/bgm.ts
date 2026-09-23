import { computed, reactive, ref, watch } from 'vue'
import manifest from './data/bgm.json'

const key = 'arkham:music:v1'
export const musicTracks = manifest.tracks
const validId = (id: unknown): id is string => typeof id === 'string' && musicTracks.some(t => t.id === id)
const initial = { autoplay: false, loop: true, volume: 0.25, overrides: {} as Record<string, string> }
try {
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}')
  if (typeof saved.autoplay === 'boolean') initial.autoplay = saved.autoplay
  if (typeof saved.loop === 'boolean') initial.loop = saved.loop
  if (Number.isFinite(saved.volume)) initial.volume = Math.max(0, Math.min(1, saved.volume))
  if (saved.overrides && typeof saved.overrides === 'object') for (const [code, id] of Object.entries(saved.overrides)) {
    if (validId(id)) initial.overrides[code] = id
  }
} catch { /* Keep offline defaults when browser storage is unavailable. */ }

const preferences = reactive(initial)
const scenario = ref('')
const playing = ref(false)
const error = ref<'blocked' | 'load' | null>(null)
const selected = computed(() => preferences.overrides[scenario.value] ?? (manifest.scenarios as Record<string, string>)[scenario.value] ?? '')
const track = computed(() => musicTracks.find(t => t.id === selected.value))
let audio: HTMLAudioElement | null = null
let session = ''
let generation = 0

function player() {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'none'
    audio.addEventListener('playing', () => { playing.value = true; error.value = null })
    audio.addEventListener('pause', () => { playing.value = false })
    audio.addEventListener('ended', () => { playing.value = false })
    audio.addEventListener('error', () => { playing.value = false; error.value = 'load' })
  }
  audio.loop = preferences.loop
  audio.volume = preferences.volume
  return audio
}

async function play() {
  if (!session || !track.value) return
  const token = ++generation
  const element = player()
  const url = new URL(track.value.url, window.location.origin).href
  if (element.src !== url) element.src = url
  error.value = null
  try { await element.play() } catch (cause) {
    if (token !== generation) return
    playing.value = false
    error.value = cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'blocked' : 'load'
  }
}
function pause() { generation++; audio?.pause(); playing.value = false }
function stop() { pause(); if (audio) audio.currentTime = 0; error.value = null }

export function setMusicScenario(gameId: string | null, scenarioId: string | null) {
  const code = scenarioId?.replace(/^c/, '') ?? ''
  const next = gameId && code ? `${gameId}:${code}` : ''
  if (session === next) return
  stop()
  session = next
  scenario.value = code
  if (session && preferences.autoplay) void play()
}
function select(id: string) {
  if (!scenario.value || (id && !validId(id))) return
  const resume = playing.value
  stop()
  if (id) preferences.overrides[scenario.value] = id
  else delete preferences.overrides[scenario.value]
  if (resume) void play()
}
watch(preferences, () => {
  try { localStorage.setItem(key, JSON.stringify(preferences)) } catch { /* Playback still works. */ }
  if (audio) { audio.loop = preferences.loop; audio.volume = preferences.volume }
}, { deep: true, flush: 'sync' })
watch(() => preferences.autoplay, enabled => { if (enabled) void play() }, { flush: 'sync' })
if (typeof window !== 'undefined') window.addEventListener('pagehide', stop)

export const music = { preferences, scenario, playing, error, selected, track, play, pause, stop, select }

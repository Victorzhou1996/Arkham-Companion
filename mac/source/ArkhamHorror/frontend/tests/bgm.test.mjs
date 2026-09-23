import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

let sequence = 0
async function setup(t, saved = {}) {
  const previous = Object.fromEntries(['window', 'localStorage', 'Audio'].map(key => [key, globalThis[key]]))
  const store = new Map([['arkham:music:v1', JSON.stringify(saved)]])
  const players = []
  const events = {}
  class FakeAudio extends EventTarget {
    src = ''; currentTime = 0; calls = 0; paused = true; rejection = null
    constructor() { super(); players.push(this) }
    async play() {
      this.calls++
      if (this.rejection) throw this.rejection
      this.paused = false
      this.dispatchEvent(new Event('playing'))
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  }
  globalThis.Audio = FakeAudio
  globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }
  globalThis.window = { location: { origin: 'https://test.invalid' }, addEventListener: (name, fn) => { events[name] = fn } }
  const manifest = await readFile('src/arkham/data/bgm.json', 'utf8')
  const source = (await readFile('src/arkham/bgm.ts', 'utf8')).replace("import manifest from './data/bgm.json'", `const manifest = ${manifest}`)
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } })
  const code = outputText.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${++sequence}`)
  t.after(() => { module.music.stop(); Object.assign(globalThis, previous) })
  return { ...module, players, events, store }
}

test('music is opt-in and manual play, pause, loop, volume and stop match playback', async t => {
  const { music: m, setMusicScenario, players, store } = await setup(t)
  setMusicScenario('game-1', 'c01104')
  assert.equal(players.length, 0)
  await m.play()
  const a = players[0]
  assert.equal(a.src, 'https://test.invalid' + m.track.value.url)
  assert.equal(a.loop, true)
  assert.equal(a.volume, 0.25)
  m.preferences.volume = 0.6
  m.preferences.loop = false
  assert.equal(a.volume, 0.6)
  assert.equal(a.loop, false)
  a.currentTime = 42
  m.pause()
  assert.equal(a.currentTime, 42)
  assert.equal(m.playing.value, false)
  await m.play()
  assert.equal(m.playing.value, true)
  m.stop()
  assert.equal(a.currentTime, 0)
  assert.equal(a.paused, true)
  assert.equal(JSON.parse(store.get('arkham:music:v1')).volume, 0.6)
})

test('game updates do not restart music; new scenarios and leaving games stop the old track', async t => {
  const { music: m, setMusicScenario, players, events } = await setup(t, { autoplay: true })
  setMusicScenario('game-1', 'c01104')
  const a = players[0]
  const first = a.src
  a.currentTime = 42
  setMusicScenario('game-1', 'c01104')
  assert.equal(a.calls, 1)
  assert.equal(a.currentTime, 42)
  setMusicScenario('game-1', 'c01120')
  assert.notEqual(a.src, first)
  assert.equal(a.calls, 2)
  assert.equal(a.currentTime, 0)
  setMusicScenario(null, null)
  assert.equal(a.paused, true)
  await m.play()
  assert.equal(a.calls, 2)
  setMusicScenario('game-2', 'c01120')
  events.pagehide()
  assert.equal(a.paused, true)
})

test('manual overrides persist per scenario, unknown scenarios stay quiet, blocked autoplay remains recoverable', async t => {
  const { music: m, musicTracks, setMusicScenario, players, store } = await setup(t, { volume: 2, overrides: { '01104': 'invalid' } })
  assert.equal(m.preferences.volume, 1)
  setMusicScenario('game', 'c99999')
  await m.play()
  assert.equal(players.length, 0)
  m.select(musicTracks[0].id)
  await m.play()
  const a = players[0]
  assert.equal(m.playing.value, true)
  assert.equal(JSON.parse(store.get('arkham:music:v1')).overrides['99999'], musicTracks[0].id)
  setMusicScenario('game', 'c01104')
  a.rejection = new DOMException('Blocked', 'NotAllowedError')
  await m.play()
  assert.equal(m.error.value, 'blocked')
  a.rejection = null
  await m.play()
  assert.equal(m.error.value, null)
  assert.equal(m.playing.value, true)
  const id = m.selected.value
  m.select('invalid')
  assert.equal(m.selected.value, id)
  m.select(musicTracks[1].id)
  assert.equal(m.playing.value, true)
  m.select('')
  assert.equal(m.selected.value, id)
})

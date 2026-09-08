import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

let importId = 0
async function load(path) {
  const source = await readFile(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  })
  const code = outputText.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${++importId}`)
}

async function setup(t) {
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'SpeechSynthesisUtterance'].map(k => [k, globalThis[k]]))
  const spoken = []
  const timers = new Map()
  let nextTimer = 0
  const engine = {
    speaking: false, pending: false, paused: false, cancels: 0,
    getVoices: () => [], addEventListener() {},
    speak(utterance) { this.speaking = true; spoken.push(utterance) },
    cancel() { this.speaking = false; this.paused = false; this.cancels++ },
    pause() { this.paused = true }, resume() { this.paused = false },
  }
  globalThis.window = {
    speechSynthesis: engine,
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer },
    clearTimeout(id) { timers.delete(id) },
  }
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.document = {
    documentElement: { lang: 'zh-CN' },
    createElement: () => ({ innerHTML: '', get textContent() { return this.innerHTML.replace(/<[^>]+>/g, '') } }),
  }
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  const module = await load('src/arkham/narration.ts')
  t.after(() => { module.stopNarration(); Object.assign(globalThis, previous) })
  return {
    ...module, ...module.useNarration(), spoken, engine, timers,
    flush() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn() },
  }
}

const card = {
  id: 'card-1', category: 'encounter', segments: [
    { category: 'cardName', text: 'Card name' },
    { category: 'cardText', text: 'Rules text' },
    { category: 'cardFlavor', text: 'Flavor text' },
  ],
}

test('card category and field checkboxes both gate actual speech', async t => {
  const n = await setup(t)
  n.preferences.enabled.cardName = false
  n.read(card)
  assert.deepEqual(n.spoken.map(x => x.text), ['Rules text'])
  n.preferences.enabled.encounter = false
  assert.equal(n.speaking.value, false)
  assert.equal(n.engine.speaking, false)
  n.read(card)
  assert.equal(n.spoken.length, 1)
})

test('unchecking a field stops old queued audio immediately', async t => {
  const n = await setup(t)
  n.read(card)
  const stale = n.spoken[0]
  n.preferences.enabled.cardText = false
  assert.equal(n.speaking.value, false)
  stale.onend()
  assert.equal(n.spoken.length, 1)
  n.read(card)
  assert.equal(n.spoken.at(-1).text, 'Card name')
})

test('turning off auto-read cancels automatic speech but allows manual reading', async t => {
  const n = await setup(t)
  n.preferences.autoRead = true
  n.setCurrentNarration(card)
  assert.equal(n.spoken.length, 1)
  n.preferences.autoRead = false
  assert.equal(n.engine.speaking, false)
  n.setCurrentNarration({ ...card, id: 'card-2' })
  assert.equal(n.spoken.length, 1)
  n.read()
  assert.equal(n.spoken.length, 2)
})

test('unchecking while a restart is pending cannot start stale speech', async t => {
  const n = await setup(t)
  n.read(card)
  n.read({ ...card, id: 'card-2' })
  assert.equal(n.timers.size, 1)
  n.preferences.enabled.encounter = false
  n.flush()
  assert.equal(n.timers.size, 0)
  assert.equal(n.spoken.length, 1)
  assert.equal(n.speaking.value, false)
})

test('rapid restarts keep only the newest request, ignoring stale speech events', async t => {
  const n = await setup(t)
  n.read(card)
  const old = n.spoken[0]
  n.read({ ...card, id: 'second' })
  n.read({ id: 'latest', category: 'story', segments: [{ category: 'story', text: 'Latest story' }] })
  n.flush()
  old.onerror()
  old.onend()
  assert.deepEqual(n.spoken.map(x => x.text), ['Card name。Rules text', 'Latest story'])
  assert.equal(n.speaking.value, true)
})

test('disabled hover categories do not interrupt an allowed story', async t => {
  const n = await setup(t)
  n.preferences.autoRead = true
  n.preferences.enabled.encounter = false
  n.setCurrentNarration({ id: 'story', category: 'story', segments: [{ category: 'story', text: 'Story' }] })
  n.setCurrentNarration(card)
  assert.equal(n.spoken.length, 1)
  assert.equal(n.engine.speaking, true)
})

test('database categories work for vertical acts, encounter assets and player weaknesses', async () => {
  const { cardNarrationCategory: category } = await load('src/arkham/narrationCategory.ts')
  for (const type_code of ['act', 'agenda']) assert.equal(category({ type_code }), 'actAgenda')
  for (const type_code of ['location', 'enemy']) assert.equal(category({ type_code }), 'locationEnemy')
  assert.equal(category({ type_code: 'asset', encounter_code: 'set' }), 'encounter')
  assert.equal(category({ type_code: 'treachery', encounter_code: 'set' }), 'encounter')
  assert.equal(category({ type_code: 'treachery', encounter_code: null }), 'playerCard')
  assert.equal(category(null, { closest: s => s === '.treachery' } ), 'encounter')
})

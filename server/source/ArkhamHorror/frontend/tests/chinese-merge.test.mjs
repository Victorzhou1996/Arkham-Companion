import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('both Chinese language choices preserve reviewed Chinese without restoring English placeholders', async () => {
  const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  try {
    const { mergeChineseMessages: merge, loadLocaleMessages } = await server.ssrLoadModule('/src/locales/messages.ts')
    assert.deepEqual(merge({ title: '中文', body: '原文' }, { title: 'English placeholder', body: '审核中文' }), { title: '中文', body: '审核中文' })
    assert.equal(merge('中文', '@:other.key'), '@:other.key')
    assert.equal(merge('中文', ''), '')
    assert.deepEqual(merge([{ title: '规则一', body: '正文一' }, { title: '规则二' }], [{ title: 'Rule one', body: '审核正文' }]), [{ title: '规则一', body: '审核正文' }, { title: '规则二' }])
    const en = (await loadLocaleMessages('en')).messages
    assert.equal(en.theCircleUndone.interludes[1], 'A Record of Those Lost')
    for (const lang of ['zh', 'zh-cn']) {
      const { messages } = await loadLocaleMessages(lang)
      const cycle = messages.theCircleUndone
      assert.equal(cycle.interludes[1], '失踪人口纪录')
      assert.equal(cycle.unionAndDisillusion.label.lightTheBrazier, '点燃火盆')
      assert.match(cycle.forTheGreaterGood.tooltips.lobbyWeveBeenExpectingYou.parley, /守卫认出你来自梅格庄园/)
      assert.match(cycle.theWitchingHour.setup.gatherSets, /巫异时刻/)
    }
  } finally { await server.close() }
})

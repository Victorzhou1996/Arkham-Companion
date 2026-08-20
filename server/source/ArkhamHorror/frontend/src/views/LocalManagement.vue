<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import { fetchFullGameExport, fetchGames } from '@/arkham/api'
import { useUserStore } from '@/stores/user'

type RuntimeInfo = {
  packageVersion?: string
  serverCommit?: string
  generatedAt?: string
  localUrl?: string
  lanUrl?: string | null
  frontendPort?: number | string
  apiPort?: number | string
  services?: Record<string, string | boolean | number>
}

type BackupGame = {
  id?: string
  name?: string
  data: unknown
}

type BackupDeck = {
  id?: string
  name?: string
  url?: string | null
  list?: Record<string, unknown>
  investigator_code?: string
  slots?: Record<string, number>
  [key: string]: unknown
}

type UserBackup = {
  format: 'arkham-horror-local-user-backup'
  version: 1
  exportedAt: string
  username?: string
  games: BackupGame[]
  decks: BackupDeck[]
}

const userStore = useUserStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordBusy = ref(false)
const passwordMessage = ref('')
const backupBusy = ref(false)
const restoreBusy = ref(false)
const restoreInput = ref<HTMLInputElement | null>(null)
const backupMessage = ref('')
const runtime = ref<RuntimeInfo | null>(null)
const healthOk = ref(false)
const healthMessage = ref('正在检查…')
const statusCheckedAt = ref('')

const appBase = import.meta.env.BASE_URL.replace(/\/$/, '')
const buildBulkHref = `${appBase}/build/?arkham-bulk=1`
const displayVersion = computed(() => runtime.value?.packageVersion || 'GitHub Server 源码版')
const lanAddress = computed(() => runtime.value?.lanUrl || '当前环境未提供局域网地址')

function errorText(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response
    const data = response?.data
    if (typeof data === 'string' && data.trim()) return data
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>
      for (const key of ['message', 'error', 'errorMsg']) {
        if (typeof record[key] === 'string') return record[key] as string
      }
    }
    if (response?.status) return `请求失败（HTTP ${response.status}）`
  }
  return error instanceof Error ? error.message : String(error)
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

async function refreshStatus() {
  const runtimeUrl = `${appBase || ''}/local-runtime.json?t=${Date.now()}`
  const [healthResult, runtimeResult] = await Promise.allSettled([
    fetch(`${appBase || ''}/health`, { cache: 'no-store' }),
    fetch(runtimeUrl, { cache: 'no-store' }),
  ])

  healthOk.value = healthResult.status === 'fulfilled' && healthResult.value.ok
  healthMessage.value = healthOk.value ? '游戏服务运行正常' : '游戏服务未响应'
  if (runtimeResult.status === 'fulfilled' && runtimeResult.value.ok) {
    try {
      runtime.value = await runtimeResult.value.json() as RuntimeInfo
    } catch {
      runtime.value = null
    }
  } else {
    runtime.value = null
  }
  statusCheckedAt.value = new Date().toLocaleString()
}

async function changePassword() {
  passwordMessage.value = ''
  if (newPassword.value.length < 6) {
    passwordMessage.value = '新密码至少需要 6 个字符。'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordMessage.value = '两次输入的新密码不一致。'
    return
  }

  passwordBusy.value = true
  try {
    await api.put('account', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordMessage.value = '密码已修改。下次登录请使用新密码。'
  } catch (error) {
    passwordMessage.value = `修改失败：${errorText(error)}`
  } finally {
    passwordBusy.value = false
  }
}

async function backupMyData() {
  backupBusy.value = true
  backupMessage.value = '正在读取游戏存档和牌组…'
  try {
    const [games, decksResponse] = await Promise.all([
      fetchGames(),
      api.get<BackupDeck[]>('arkham/decks'),
    ])
    const exportedGames: BackupGame[] = []
    for (let index = 0; index < games.length; index += 1) {
      const game = games[index]
      if (game.tag !== 'game') continue
      backupMessage.value = `正在导出游戏存档 ${index + 1}/${games.length}：${game.name}`
      const blob = await fetchFullGameExport(game.id)
      exportedGames.push({ id: game.id, name: game.name, data: JSON.parse(await blob.text()) })
    }

    const bundle: UserBackup = {
      format: 'arkham-horror-local-user-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      username: userStore.currentUser?.username,
      games: exportedGames,
      decks: decksResponse.data,
    }
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    downloadJson(`ArkhamHorror-user-backup-${day}.json`, bundle)
    backupMessage.value = `备份完成：${exportedGames.length} 个游戏存档，${decksResponse.data.length} 个牌组。`
  } catch (error) {
    backupMessage.value = `备份失败：${errorText(error)}`
  } finally {
    backupBusy.value = false
  }
}

function normalizeBackup(value: unknown): UserBackup {
  if (typeof value !== 'object' || value === null) throw new Error('文件不是有效的 JSON 对象')
  const record = value as Record<string, unknown>
  if (record.format === 'arkham-horror-local-user-backup') {
    if (!Array.isArray(record.games) || !Array.isArray(record.decks)) throw new Error('备份文件结构不完整')
    return record as unknown as UserBackup
  }
  if ('campaignData' in record) {
    return {
      format: 'arkham-horror-local-user-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      games: [{ data: record }],
      decks: [],
    }
  }
  if ('slots' in record && 'investigator_code' in record) {
    return {
      format: 'arkham-horror-local-user-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      games: [],
      decks: [record as BackupDeck],
    }
  }
  throw new Error('不支持的备份格式')
}

async function importGame(game: BackupGame) {
  const formData = new FormData()
  const filename = `arkham-game-${game.id || crypto.randomUUID()}.json`
  formData.append('file', new File([JSON.stringify(game.data)], filename, { type: 'application/json' }))
  await api.post('arkham/games/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

async function importDeck(deck: BackupDeck) {
  const list = (deck.list || deck) as Record<string, unknown>
  const name = String(deck.name || list.name || list.investigator_name || 'Imported deck')
  await api.post('arkham/decks', {
    deckId: String(deck.id || list.id || crypto.randomUUID()),
    deckName: name,
    deckUrl: deck.url ?? list.url ?? null,
    deckList: list,
  })
}

async function restoreMyData(file: File) {
  restoreBusy.value = true
  backupMessage.value = '正在检查备份文件…'
  try {
    const bundle = normalizeBackup(JSON.parse(await file.text()))
    let restoredGames = 0
    let restoredDecks = 0
    const failures: string[] = []

    for (let index = 0; index < bundle.games.length; index += 1) {
      const game = bundle.games[index]
      backupMessage.value = `正在恢复游戏存档 ${index + 1}/${bundle.games.length}…`
      try {
        await importGame(game)
        restoredGames += 1
      } catch (error) {
        failures.push(`游戏“${game.name || game.id || index + 1}”：${errorText(error)}`)
      }
    }

    for (let index = 0; index < bundle.decks.length; index += 1) {
      const deck = bundle.decks[index]
      backupMessage.value = `正在恢复牌组 ${index + 1}/${bundle.decks.length}…`
      try {
        await importDeck(deck)
        restoredDecks += 1
      } catch (error) {
        failures.push(`牌组“${deck.name || deck.id || index + 1}”：${errorText(error)}`)
      }
    }

    backupMessage.value = `恢复完成：${restoredGames} 个游戏存档，${restoredDecks} 个牌组。${failures.length ? `失败 ${failures.length} 项：${failures.join('；')}` : ''}`
  } catch (error) {
    backupMessage.value = `恢复失败：${errorText(error)}`
  } finally {
    restoreBusy.value = false
    if (restoreInput.value) restoreInput.value.value = ''
  }
}

async function onRestoreFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await restoreMyData(file)
}

async function downloadDiagnostics() {
  const resources = [
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map((item) => item.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((item) => item.href),
  ].filter((url) => url.startsWith(window.location.origin))

  const resourceChecks = []
  for (const url of resources.slice(0, 20)) {
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
      resourceChecks.push({ url, status: response.status, contentType: response.headers.get('content-type') })
    } catch (error) {
      resourceChecks.push({ url, error: errorText(error) })
    }
  }

  let storage: StorageEstimate | null = null
  try {
    storage = await navigator.storage?.estimate?.() || null
  } catch {
    storage = null
  }

  downloadJson(`ArkhamHorror-diagnostics-${new Date().toISOString().replaceAll(':', '').slice(0, 15)}.json`, {
    format: 'arkham-horror-local-diagnostics',
    generatedAt: new Date().toISOString(),
    page: { origin: window.location.origin, href: window.location.href },
    user: { username: userStore.currentUser?.username || null },
    browser: { userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine },
    runtime: runtime.value,
    health: { ok: healthOk.value, message: healthMessage.value, checkedAt: statusCheckedAt.value },
    storage,
    resources: resourceChecks,
    note: 'Authentication tokens and passwords are intentionally excluded.',
  })
}

onMounted(refreshStatus)
</script>

<template>
  <main class="local-management">
    <div class="page-heading">
      <div>
        <p class="eyebrow">WINDOWS LOCAL</p>
        <h1>本地管理</h1>
        <p>这里只提供当前账号自己的数据操作和只读运行信息。服务管理与全局数据维护仍在外部管理工具中。</p>
      </div>
      <button class="secondary" type="button" @click="refreshStatus">刷新状态</button>
    </div>

    <section class="status-grid">
      <article class="status-card">
        <span>版本</span>
        <strong>{{ displayVersion }}</strong>
        <small v-if="runtime?.serverCommit">Server {{ runtime.serverCommit }}</small>
      </article>
      <article class="status-card">
        <span>运行状态</span>
        <strong :class="healthOk ? 'healthy' : 'unhealthy'">{{ healthMessage }}</strong>
        <small>{{ statusCheckedAt || '尚未检查' }}</small>
      </article>
      <article class="status-card wide">
        <span>局域网地址</span>
        <strong class="address">{{ lanAddress }}</strong>
        <small v-if="runtime?.localUrl">本机：{{ runtime.localUrl }}</small>
      </article>
    </section>

    <div class="tool-grid">
      <section class="panel">
        <h2>修改自己的密码</h2>
        <p>修改后，现有登录不会被强制退出；下次登录使用新密码。</p>
        <form class="stack" @submit.prevent="changePassword">
          <label>当前密码<input v-model="currentPassword" type="password" autocomplete="current-password" required></label>
          <label>新密码<input v-model="newPassword" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>确认新密码<input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="6" required></label>
          <button type="submit" :disabled="passwordBusy">{{ passwordBusy ? '正在修改…' : '修改密码' }}</button>
          <p v-if="passwordMessage" class="message">{{ passwordMessage }}</p>
        </form>
      </section>

      <section class="panel">
        <h2>备份与恢复自己的存档</h2>
        <p>一个 JSON 文件包含当前账号的全部游戏存档和已保存牌组。恢复会新增副本，不会覆盖或删除现有数据。</p>
        <div class="actions">
          <button type="button" :disabled="backupBusy || restoreBusy" @click="backupMyData">{{ backupBusy ? '正在备份…' : '下载个人备份' }}</button>
          <label class="file-button" :class="{ disabled: backupBusy || restoreBusy }">
            {{ restoreBusy ? '正在恢复…' : '选择备份并恢复' }}
            <input ref="restoreInput" type="file" accept=".json,application/json" :disabled="backupBusy || restoreBusy" @change="onRestoreFile">
          </label>
        </div>
        <p v-if="backupMessage" class="message">{{ backupMessage }}</p>
      </section>

      <section class="panel">
        <h2>Build 批量导入与导出</h2>
        <p>进入 Build 后使用“批量工具”：可粘贴整段 arkham.build / ArkhamDB 链接、多选 JSON 文件，并批量勾选导出牌组。</p>
        <a class="button-link" :href="buildBulkHref">打开 Build 批量工具</a>
      </section>

      <section class="panel">
        <h2>诊断报告</h2>
        <p>下载运行状态、浏览器信息和关键前端资源检查结果，方便定位白屏和资源加载问题。报告不包含密码或登录令牌。</p>
        <button type="button" @click="downloadDiagnostics">下载诊断报告</button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.local-management {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 36px 0 72px;
  color: #eef1e8;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.page-heading h1 { margin: 2px 0 8px; font-size: clamp(2rem, 4vw, 3rem); }
.page-heading p { margin: 0; color: #aeb6a6; max-width: 760px; line-height: 1.6; }
.eyebrow { color: var(--spooky-green) !important; letter-spacing: .18em; font-size: .75rem; font-weight: 800; }

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr;
  gap: 14px;
  margin-bottom: 18px;
}

.status-card, .panel {
  background: color-mix(in srgb, var(--background-dark) 90%, #fff 2%);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18);
}

.status-card { padding: 18px; min-width: 0; }
.status-card span, .status-card small { display: block; color: #969f90; }
.status-card strong { display: block; margin: 8px 0 4px; font-size: 1.05rem; overflow-wrap: anywhere; }
.status-card small { font-size: .75rem; }
.healthy { color: #91c95b; }
.unhealthy { color: #f27b72; }
.address { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }

.tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.panel { padding: 22px; }
.panel h2 { margin: 0 0 8px; font-size: 1.2rem; }
.panel > p { margin: 0 0 18px; color: #aeb6a6; line-height: 1.6; }
.stack { display: grid; gap: 12px; }
.stack label { display: grid; gap: 6px; color: #c8cec2; font-size: .86rem; }
input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  color: #f5f6f2;
  background: #181c22;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 7px;
}
input:focus { outline: 2px solid color-mix(in srgb, var(--spooky-green) 55%, transparent); border-color: var(--spooky-green); }

button, .button-link, .file-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 40px;
  padding: 9px 16px;
  color: #11170d;
  background: var(--spooky-green);
  border: 0;
  border-radius: 7px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}
button:hover, .button-link:hover, .file-button:hover { filter: brightness(1.08); }
button:disabled, .disabled { opacity: .55; cursor: not-allowed; }
.secondary { color: #d9ded3; background: transparent; border: 1px solid rgba(255,255,255,.16); white-space: nowrap; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.file-button input { display: none; }
.message { margin: 14px 0 0 !important; color: #d9ded3 !important; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (max-width: 850px) {
  .status-grid, .tool-grid { grid-template-columns: 1fr; }
  .page-heading { flex-direction: column; }
  .status-card.wide { grid-column: auto; }
}
</style>

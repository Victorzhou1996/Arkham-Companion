<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { BugReport } from '@/arkham/api'
import {
  deleteBugReport,
  exportBugReports,
  fetchBugReports,
  loginBugAdmin,
  updateBugReport,
} from '@/arkham/api'

const PAGE_SIZE = 10
const reports = ref<BugReport[]>([])
const loading = ref(true)
const adminPassword = ref(sessionStorage.getItem('arkham-bug-admin-password') ?? '')
const adminAuthed = ref(adminPassword.value.length > 0)
const exporting = ref(false)
const error = ref('')
const notice = ref('')
const editingId = ref<string | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const currentPage = ref(1)
const pageContainer = ref<HTMLElement | null>(null)

const sortedReports = computed(() =>
  [...reports.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)
const pageCount = computed(() => Math.max(1, Math.ceil(sortedReports.value.length / PAGE_SIZE)))
const paginatedReports = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedReports.value.slice(start, start + PAGE_SIZE)
})

watch(pageCount, (count) => {
  if (currentPage.value > count) currentPage.value = count
})

onMounted(() => {
  void loadReports()
})

async function loadReports() {
  loading.value = true
  error.value = ''
  try {
    reports.value = await fetchBugReports()
  } catch {
    error.value = '读取Bug列表失败'
  } finally {
    loading.value = false
  }
}

async function loginAdmin() {
  error.value = ''
  const ok = await loginBugAdmin(adminPassword.value)
  if (!ok) {
    error.value = '管理员密码错误'
    return
  }
  adminAuthed.value = true
  sessionStorage.setItem('arkham-bug-admin-password', adminPassword.value)
}

function logoutAdmin() {
  adminAuthed.value = false
  adminPassword.value = ''
  sessionStorage.removeItem('arkham-bug-admin-password')
  cancelEdit()
  notice.value = '已退出管理员模式'
  error.value = ''
}

async function downloadBugArchive() {
  exporting.value = true
  error.value = ''
  notice.value = ''
  try {
    const archive = await exportBugReports(adminPassword.value)
    const url = URL.createObjectURL(archive)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.href = url
    link.download = `arkham-bugs-${stamp}.zip`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notice.value = 'Bug压缩包已生成'
  } catch {
    error.value = '导出失败，请重新登录管理员模式后再试'
  } finally {
    exporting.value = false
  }
}

function beginEdit(report: BugReport) {
  editingId.value = report.id
  editTitle.value = report.title
  editDescription.value = report.description
  notice.value = ''
  error.value = ''
}

function cancelEdit() {
  editingId.value = null
  editTitle.value = ''
  editDescription.value = ''
}

async function saveEdit(report: BugReport) {
  error.value = ''
  try {
    const updated = await updateBugReport(report.id, adminPassword.value, editTitle.value, editDescription.value)
    reports.value = reports.value.map((item) => item.id === updated.id ? updated : item)
    notice.value = '已保存修改'
    cancelEdit()
  } catch {
    error.value = '保存失败'
  }
}

async function removeReport(report: BugReport) {
  if (!confirm(`删除这个Bug报告？\n${report.title}`)) return
  error.value = ''
  try {
    await deleteBugReport(report.id, adminPassword.value)
    reports.value = reports.value.filter((item) => item.id !== report.id)
    notice.value = '已删除'
  } catch {
    error.value = '删除失败'
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function changePage(page: number) {
  currentPage.value = Math.min(Math.max(page, 1), pageCount.value)
  requestAnimationFrame(() => {
    if (pageContainer.value) pageContainer.value.scrollTop = 0
  })
}
</script>

<template>
  <main ref="pageContainer" class="bugs-page">
    <header class="bugs-header">
      <div>
        <h1>Bug列表</h1>
        <p>这里显示提交到当前服务器实例的错误报告。</p>
      </div>
      <button class="secondary" :disabled="loading" @click="loadReports">刷新</button>
    </header>

    <section class="admin-panel">
      <div>
        <h2>管理员入口</h2>
        <p>登录后可修改或删除已有报告。</p>
      </div>
      <form v-if="!adminAuthed" class="admin-form" @submit.prevent="loginAdmin">
        <input v-model="adminPassword" type="password" placeholder="管理员密码" autocomplete="current-password" />
        <button type="submit">登录</button>
      </form>
      <div v-else class="admin-actions">
        <strong>已进入管理员模式</strong>
        <button :disabled="exporting" @click="downloadBugArchive">
          {{ exporting ? '正在导出...' : '导出Bug压缩包' }}
        </button>
        <button class="secondary" @click="logoutAdmin">退出管理</button>
      </div>
    </section>

    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">读取中...</p>
    <p v-else-if="sortedReports.length === 0" class="muted">还没有提交的Bug报告。</p>

    <section v-else class="bug-list">
      <article v-for="report in paginatedReports" :key="report.id" class="bug-card">
        <div class="bug-meta">
          <span>{{ formatDate(report.createdAt) }}</span>
          <span>游戏 {{ report.gameId }}</span>
          <span>提交者 {{ report.submitterUsername }} / {{ report.submitterUserId }}</span>
        </div>

        <template v-if="editingId === report.id">
          <input v-model="editTitle" class="edit-title" />
          <textarea v-model="editDescription" class="edit-description"></textarea>
          <div class="actions">
            <button @click="saveEdit(report)">保存</button>
            <button class="secondary" @click="cancelEdit">取消</button>
          </div>
        </template>

        <template v-else>
          <h2>{{ report.title }}</h2>
          <p class="description">{{ report.description }}</p>
          <div class="bug-links">
            <a
              v-if="report.pageUrl && report.canOpenPage"
              :href="report.pageUrl"
              target="_blank"
              rel="noreferrer"
            >
              打开提交页面
            </a>
            <span v-else-if="report.pageUrl">提交页面仅该游戏的参与者可访问</span>
            <span>文本 {{ report.textFile }}</span>
            <span v-if="report.hasSnapshot">已附带最近 {{ report.snapshotStepCount ?? 30 }} 步存档</span>
            <span v-else>暂无提交时存档；管理员导出时将尝试补录</span>
          </div>
          <div v-if="adminAuthed" class="actions">
            <button @click="beginEdit(report)">修改</button>
            <button class="danger" @click="removeReport(report)">删除</button>
          </div>
        </template>
      </article>

      <nav v-if="pageCount > 1" class="pagination" aria-label="Bug列表分页">
        <button class="secondary" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">上一页</button>
        <span>第 {{ currentPage }} / {{ pageCount }} 页，共 {{ sortedReports.length }} 条</span>
        <button class="secondary" :disabled="currentPage === pageCount" @click="changePage(currentPage + 1)">下一页</button>
      </nav>
    </section>
  </main>
</template>

<style scoped>
.bugs-page {
  box-sizing: border-box;
  max-height: calc(100vh - 84px);
  overflow-y: auto;
  padding-bottom: 48px;
  scrollbar-gutter: stable;
  width: min(1120px, calc(100vw - 32px));
  margin: 36px auto;
  color: #e7e9ee;
}

.bugs-header,
.admin-panel,
.bug-card {
  background: color-mix(in srgb, var(--background-dark) 88%, white);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}

.bugs-header,
.admin-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  margin-bottom: 14px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 1.55rem;
}

.bugs-header p,
.admin-panel p,
.muted,
.bug-meta,
.bug-links {
  color: rgba(231, 233, 238, 0.68);
}

.admin-form {
  display: flex;
  gap: 8px;
}

.admin-actions,
.pagination {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

input,
textarea {
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #f4f6fa;
  padding: 10px 12px;
}

textarea {
  resize: vertical;
}

button {
  background: var(--spooky-green);
  border: 0;
  border-radius: 6px;
  color: #10151b;
  cursor: pointer;
  font-weight: 700;
  padding: 10px 14px;
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

button.secondary {
  background: rgba(255, 255, 255, 0.12);
  color: #edf1f5;
}

button.danger {
  background: #b64852;
  color: #fff;
}

.notice,
.error,
.muted {
  margin: 16px 0;
}

.notice {
  color: #a9d46f;
}

.error {
  color: #ff9aa6;
}

.bug-list {
  display: grid;
  gap: 14px;
}

.pagination {
  justify-content: center;
  padding: 8px 0 20px;
}

.bug-card {
  padding: 16px;
}

.bug-meta,
.bug-links,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.bug-meta {
  font-size: 0.82rem;
  margin-bottom: 10px;
}

.bug-card h2 {
  font-size: 1.1rem;
  margin-bottom: 10px;
}

.description {
  white-space: pre-wrap;
  line-height: 1.55;
}

.bug-links {
  font-size: 0.84rem;
  margin-top: 12px;
}

.bug-links a {
  color: var(--spooky-green);
}

.actions {
  margin-top: 14px;
}

.edit-title,
.edit-description {
  box-sizing: border-box;
  display: block;
  margin-bottom: 10px;
  width: 100%;
}

.edit-description {
  min-height: 160px;
}

@media (max-width: 720px) {
  .bugs-header,
  .admin-panel,
  .admin-form {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

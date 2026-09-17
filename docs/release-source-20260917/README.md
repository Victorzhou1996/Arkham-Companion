# 2026-09-17 前端更新与 Windows 打包交接

## 来源与范围

- PR 目标：`Server`；工作分支：`agent/card-interactions-portraits-20260917`。
- 基线：`2860d764d343c3baa3f7a20c7304e05c10df29e0`。
- 当前前端版本：`2026.09.17-scene-actions`。
- 源码：`server/source/ArkhamHorror/frontend/`，与本次已部署到 Kaho、Online 的 Server 前端实现一致。
- 本次只更新前端源码、测试、人物图片及交接文档。没有 Haskell、数据库结构、Windows 管理器或启动器修改，也不带 Mac 专用运行时。
- `server/release/` 仍是 9 月 15 日预编译快照，其清单和验证脚本仅证明该旧快照完整。不能把它当成本次新版，也不能直接用于普通 Windows 本地包。

## 包含的更新

1. 地图调查员头像缩小 25%，位于线索和可互动按钮下方；空头像列不截获点击。
2. 装备的“附着在”卡牌紧凑叠放在左侧，“压在下面”卡牌叠放在右侧；悬停约 650ms 展开并固定，点击支持触屏，点击外部或 Escape 收回。
3. 取消非右下角场景/密谋卡的上浮位移；手牌悬停仅提高显示层级，不移动能力按钮。
4. 右下角场景/密谋保留上浮展开方式，能力按钮至少 44px 高，文字可换行；菜单优先向上展开并保持在视口内，移入菜单不会让抽屉收回。
5. 内置 214 张调查员人物小卡（JPG），合计 29,583,683 字节。从同源 `/img/arkham/portraits/` 加载，不再依赖原作者 CDN；开发服务器也不再将这些请求转发给后端。

## Windows Codex 操作步骤

1. 在独立工作目录检出本 PR 分支，或合并后检出 `Server`。保留已有 Windows 工作区改动，先比较差异，不整目录覆盖。
2. 拉取 Git LFS 资源，检查 Linux/WSL 后端和卡图库不是 LFS 指针。Windows 分发仍使用 `server/windows/` 的管理器、BAT、PowerShell、WSL 启动层。
3. 在 `server/source/ArkhamHorror/frontend` 执行下面的 PowerShell 命令。保留现有 Windows 本地布局接口和启动配置，不引入 Mac 的 `VITE_LOCAL_LAYOUT_ONLY` / `VITE_DISABLE_COMPANION` 专用构建参数。确认构建环境及 `.env*` 没有残留 Mac 或运营站专用覆盖值。

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
npm run tc
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
npm test
if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed" }
$env:VITE_ONLINE_MODE = "false"
$env:VITE_API_HOST = ""
$env:VITE_ASSET_HOST = ""
$env:VITE_CARD_IMAGE_CDN_HOST = ""
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
if ((Get-ChildItem .\dist\img\arkham\portraits\*.jpg).Count -ne 214) {
    throw "Bundled portraits are incomplete"
}
```

4. 将新构建的 `dist` 装入干净包的 `game/frontend/dist`。保留配套 Build、中文卡图、字体、静态资源与同源路由；Vite 构建不会替你补齐所有被 Git 忽略的完整卡图库。
5. 本次增量不要求重新编译 Haskell。若 Windows 已使用 9 月 13 日匹配规则版本，可以保留已验证的 Linux/WSL 后端；仓库基线后端 SHA-256 为 `70ddafe1dc30f412ff75c1d7dbda52aca99efa1dcf8fbfa9754f466a41bb5993`。若本机更旧或另有后端修改，先核对版本，不能仅凭前端日期认定兼容。绝不能复制 Mac 二进制到 Windows 包。
6. 干净分发包不得包含现用数据库、玩家存档、密钥、会话、日志或个人配置。安装升级保留旧数据；任何迁移先备份，禁止以空库覆盖现用库。

## Windows 验收

- 管理器 `-SelfTest`、启动/关闭/重启、局域网入口及 Build 可用，旧存档可以继续读取。
- 首页版本为 `2026.09.17-scene-actions`，人物图片由本机提供；禁用外网后检查人物小卡仍可显示。
- 调查员不挡线索/反应按钮，装备两侧附属卡可展开、固定和收回。
- 手牌/怪物操作按钮不因悬停位移；右下角能力菜单可点击，窗口较矮或浏览器缩放后仍可见。
- 同时验证桌面、窄屏，以及真实 Windows 浏览器；只通过源码测试不等于 Windows 整包验证完成。

## 已有验证与边界

- 本次发布源码重新运行 310 项前端测试及类型检查通过。
- 发布工作区的 1,071 个实现/测试/脚本文件与已部署 Server 的来源逐字节一致；另在 macOS 上验证 Windows 所需的 false-mode 前端构建通过，构建产物中 214 张人物图与源码全部哈希一致。这不是 Windows 整包测试。
- 原 Server 与 Mac 生产前端构建通过；原组件浏览器测试覆盖 1440x900、1024x600、768x1024、390x844、1440x600，含锚点定位和回退菜单。
- Kaho、Online 已部署这套 Server 前端；两站各校验 113 个入口/构建资源及 220 个静态资源，包含全部 214 张人物图。登录页桌面/窄屏验证无 JavaScript 错误。
- 部署未更换后端、重启服务或写入玩家存档。本次 PR 不再部署服务器。
- 尚未在 Windows 上重新打包或执行新包验收；这一步由 Windows 工作环境完成。

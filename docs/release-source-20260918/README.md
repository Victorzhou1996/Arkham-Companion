# 2026-09-18 汉化修复与 Windows 打包交接

## 本次增量

- 最新前端版本：`2026.09.18-community-zh`。
- 源码：`server/source/ArkhamHorror/frontend/`；在本 PR 的 9 月 17 日卡牌交互、能力按钮和 214 张本地人物图片更新上追加，不替换那些功能。
- 补齐第 5 循环《食梦者》、第 9 循环《铁杉谷盛宴》、第 10 循环《淹没之城》的剧情、幕间、结局、选项和规则文本。对照当前英文源共 3,124 条：648 / 1,462 / 1,014。
- 修复原因：新版使用国际化键读取文本，旧版整段匹配汉化不能覆盖所有新键。此次修复原始中文 JSON，并同步新版和经典界面。
- 经典界面构建时从 `../legacy-ui-v20260826.3/prepared` 生成 `public/legacy-ui-20260918.2`，深度合并中文内容并保留历史专用键；新路径避免旧缓存覆盖修复。不要删除原始 prepared 目录，也不要跳过 prebuild。
- 本次没有 Haskell、数据库结构或 Windows 启动器修改。无需因这次汉化重编后端，前提是已有后端与本分支规则版本匹配。
- 汉化来源为本次已部署 Server 源码；对应 Mac 汉化提交 `a3703b762d`，但没有导入 Mac 专用运行时或构建开关。

## Windows 打包步骤

沿用 [9 月 17 日交接](../release-source-20260917/README.md) 的 Windows 管理器、WSL、卡图库和旧数据保护步骤。优先在干净工作区检出本 PR 的最新提交；不要直接覆盖玩家安装目录。

`server/release/` 仍是旧的 9 月 15 日预编译快照，不包含此次修复。必须用这里的新源码重建前端，不能只给旧产物改版本号。

在 `server/source/ArkhamHorror/frontend` 执行：

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
Remove-Item Env:VITE_LOCAL_LAYOUT_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:VITE_DISABLE_COMPANION -ErrorAction SilentlyContinue
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
if (!(Test-Path .\dist\legacy-ui-20260918.2\index.html)) {
    throw "Updated classic UI is missing"
}
if ((Get-ChildItem .\dist\img\arkham\portraits\*.jpg).Count -ne 214) {
    throw "Bundled portraits are incomplete"
}
```

同时检查 `.env*` 等配置没有残留 Mac 专用覆盖值。将完整新 `dist` 装入干净包的 `game/frontend/dist`，包括经典界面和切换脚本；保留配套 Build、中文卡图库、场景图片和字体。Vite 不会自动补齐 Git 忽略的大型素材。分发包不要带玩家数据库、存档、密钥或个人配置。

匹配规则版本的 Linux/WSL 后端 SHA-256 为 `70ddafe1dc30f412ff75c1d7dbda52aca99efa1dcf8fbfa9754f466a41bb5993`。如果 Windows 当前后端更旧或另有改动，先核对兼容性，不要仅按前端日期判断，也不要复制 Mac 二进制。

## 验收重点与现有证据

- 当前 Server 源码的 312 项测试、类型检查、生产前端构建已通过。此次新增测试会检查源键、参数、图片引用、残留英文以及 `zh` / `zh-cn` 的实际解析；测试路径使用跨平台路径接口。
- GitHub 发布工作区重新通过 312 项测试、类型检查及 `VITE_ONLINE_MODE=false` 构建；31 个战役中文源文件与已部署 Server 逐字节一致，214 张人物图在产物中哈希一致，经典界面中文合并和新版切换脚本均已确认打入。这是在 macOS 上验证 Windows 所需前端配置，不等于 Windows 原生整包测试。
- Mac 已打包验证，Kaho、Online 已部署。两站各验证 428 项入口和静态资源；未替换后端或改写玩家存档。
- 全部 3,145 条当前中文文本（含历史保留项）完成浏览器渲染检查；三个战役的真实开场分别验证了新版和经典界面。没有宣称人工通关所有分支。
- Windows 打包后仍须实际验收：版本号为 `2026.09.18-community-zh`，中文/简体中文设置下，5/9/10 循环新开局、已有存档、幕间、选项和结局显示中文；切换经典界面后也应一致。
- 继续验收管理工具、局域网、Build、本地人物图片及本 PR 之前的卡牌交互。安装更新前备份旧数据，禁止以空库覆盖现用库。
- Windows 原生整包尚未在本次 macOS 环境验证，交由 Windows 上的打包任务完成。

## 同日追加：群友汉化与新版界面兼容

- 在上述 campaign-zh 更新之上追加，不回退之前的剧情汉化、卡牌交互或本地图片支持。
- 群友 `zh-DAG2tbjn.js` 经静态解析，与已有中文内容比较没有改写旧项，新增 62 个规则文本项，其中 52 个独立项、10 个重返遗忘时代共享项。只合并到中文源 JSON，不直接替换不同版本的编译文件。
- 补充弃牌数量、发现线索数量、11 类猩红钥匙记录的标点变体、Reaction，以及暗中交易幕 2 设置的 9 项文本。地点和敌人名称优先使用现有卡牌库的中文译名。
- 游戏行动选项补充 Discover Clue at、Damage、Establish Motive、Lie in Wait。只改变显示文字，不修改选择索引、消息、规则或存档。
- 新版与经典界面共用日志/选项翻译函数；经典构建脚本按已知锚点补丁并在不匹配时停止，避免静默生成无效文件。英文模式仍使用英文。
- 本次前端版本切换脚本是 `ui-switch-v20260918b.js`。应分发完整 dist；不要只替换 zh JS，也不要遗漏 gzip/Brotli 和新版经典界面目录。
- 新增 `communityLocalization.test.mjs`，Mac 源码 317 项、Server/GitHub 源码 314 项测试通过；另外验证 zh、zh-cn、en，以及桌面和窄屏下的真实 Vue 组件。
- 这两份群友补丁不包含新图片。现有本地素材沿用，简易陷阱的 `customizations/09100.jpg` 仍是英文原图，不应误称已经补齐中文版。
- 配套 Linux/WSL 后端仍是上述 `70ddafe1...`，本次无需重编后端。新包和旧包都不能覆盖玩家数据目录；升级前保留管理工具备份。
- 本次 Mac DMG 实际启动通过：5/9/10 循环开场、新版/经典界面的动态日志与行动选项、幕 2 文本、管理工具入口、预组卡组以及新旧格式备份恢复均已验证。专项文案使用浏览器响应夹具，不改写玩家存档；不是完整战役通关测试。
- Kaho 和 Online 已增量部署并保留旧入口备份，后端进程没有重启。Online 另修正 `img/arkham/zh/customizations`、`img/arkham/zh/tarot` 两个公共图片目录的权限（0700 → 0755）；66 张图片内容未变。Linux 分发时公共素材目录应可由服务用户遍历，图片应可读，不要用 root 专用权限封住这些目录。

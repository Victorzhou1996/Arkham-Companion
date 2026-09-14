# 深绿桌面前端 · 2026-09-14（Windows / Server / Mac 接续）

这是已经在 Windows 本地预览和 kaho 验证的新前端源代码，不是效果图，也不是完整安装包。代码位于 `server/source/ArkhamHorror/frontend/`。

本分支基于 PR #9 的 `7ecfa973813585bb865c4ddde0b780b542587527`。它包含 PR #9 的来源历史；本次新增提交只改前端、对应素材和测试，不改 Haskell 后端或数据库。PR #8 / #9 尚未合并时，请先对齐 9 月 13 日运行版本，不能把新前端直接配给更旧的后端。

## 更新内容

- 深绿地图桌面和织物纹理、古金边框；首页、游戏列表和登录页采用同一风格。
- 密谋／场景完整高度适配，左栏无需上下滚动；特殊牌堆、胜利区、冒险参考牌横排，多参考牌可展开选择。
- 装备／支援测量完整内容后适配可用高度，包含附属牌、计数和按钮，只保留必要的横向滚动。
- 威胁区在手牌左侧，共用底部宽度、可拖动分隔；卡多时叠放，悬停／键盘聚焦展开。触屏先展开再交给原操作。
- 右下四宫格刷新恢复 50/50，仍能临时拖动；其他面板尺寸偏好继续保存。
- 保留顶部工具栏、朗读、查看／撤回／调试信息导出、当前调查员指示和眼睛按钮，不用新版布局替换原有游戏事件处理。
- 专家存档模式只通过前端隐藏调试与撤回入口；不新增后端调试禁令，调试信息导出仍保留。
- 金色可交互边框呼吸提示；尊重减少动态效果偏好。调查员职业色保持原有含义。
- 极端行动／资源／牌数下的准确计数与布局降级，响应式小屏和键盘控制。

## Mac 端接续

1. 先在 Mac 的工作分支合入或对齐 PR #8（`c8dc2b6b4008dc99953635f5c3280834c2a10275`）的完整运行版本，保留自己的未提交改动。
2. 获取 `agent/tabletop-ui-20260914` 分支。只移植 `server/source/ArkhamHorror/frontend/` 下的增量到 `mac/source/ArkhamHorror/frontend/`；不要覆盖 Mac 的启动脚本、应用外壳、数据库、端口或安装签名配置。
3. 在干净的 Mac 工作区，可以从仓库根目录导出仅前端的二进制补丁，先检查再应用：

```sh
git fetch origin agent/tabletop-ui-20260914
git diff --binary 7ecfa973813585bb865c4ddde0b780b542587527 origin/agent/tabletop-ui-20260914 -- server/source/ArkhamHorror/frontend > /tmp/arkham-tabletop-ui.patch
git apply --check -p5 --directory=mac/source/ArkhamHorror/frontend /tmp/arkham-tabletop-ui.patch
git apply -p5 --directory=mac/source/ArkhamHorror/frontend /tmp/arkham-tabletop-ui.patch
```

如果检查冲突，让 AI 按文件合并，不要强制覆盖。重点核对 `Game.vue`、`Scenario.vue`、`Player.vue`、`PlayerTabs.vue`、`main.ts` 和新增 tabletop 样式／组件。补丁包含新增图片；不要只拷贝 Vue 文件。

4. 前端目录中执行 `npm ci`、`npm run tc`、`npm test`，然后按该 Mac 应用已有流程构建和替换 frontend dist。此次验证环境是 Node 24.13.0 / npm 11.6.2；至少满足现有 Vite / 锁文件的 Node 要求。
5. 本地版通常保持 `VITE_ONLINE_MODE=false`，API 与卡图地址保持该平台原有的同源配置。online 公网部署使用 `VITE_ONLINE_MODE=true` 以保留邮件验证码等线上流程；不要直接拿 online 编译产物替换 Mac 本地版。
6. 前端代码本身不要求重新编译后端；前提是平台后端已经是对应的 9 月 13 日版本。Mac 原生可执行文件必须使用 Mac 版本，不能复制 Linux / Windows 包里的后端。

### 必须同时携带的素材

`public/img/arkham/` 下：

- `tabletop-map-20260914-v3.png`：依据用户效果图生成的独立地图背景。
- `tabletop-felt-20260914-v2.png`：生成的独立绿色织物背景。
- `tabletop-frame.svg`、`tabletop-slot.svg`：代码绘制的边框与卡位。

素材不包含游戏按钮／文字，也未生成或覆盖任何卡牌图。无需上传之前废弃的背景版本。

## 验证与发布注意

本版前端类型检查、生产构建及 132 项自动测试通过；桌面／手机宽度、参考牌能力回调、装备完整高度、四宫格刷新、首页入口已验证。已有隔离测试覆盖普通行动、撤回、回合推进、遭遇揭示、双调查员和技能检定，另测 30 张手牌、22 张支援、12 张威胁等极端布局。未声称逐一通关所有战役或完成 Mac 原生封装测试。

`harness/*.html` / `*.ts` 是只用于开发的布局夹具，默认生产构建不会收录。没有提交 Windows 专用造数脚本、测试登录凭据、会话、个人存档、服务器私钥或环境文件。

服务器部署先备份和核对后端版本；增量上传静态依赖后最后切换入口，保留旧哈希资源供已打开页面和回退使用，避免新旧入口混用。不要从本分支复制数据库或重建用户数据。GitHub 本次交付的是可在 Mac 上继续修改的源码，不含重新制作的 Mac 安装包。

# 最新源码增量 · 2026-09-15

本次继续追加到 `agent/tabletop-ui-20260914` / PR #10，基于此前已发布的 `4cc742a610d109609ab056c852b8caa100eb1740`。交付源码、测试及平台工具，不上传完整安装包、编译 dist、运行时数据库、账号、存档、密钥、个人配置或测试会话。Mac 分支没有改动。

## 当前前端

源码：`server/source/ArkhamHorror/frontend/`，对应截至 2026-09-15 12:14 的修改。

- iPhone 独立布局；iPad 保持 PC 布局并支持长按卡牌和拖动把手。手机横屏侧栏、场景分类页签，常显区域不互相遮挡。
- 点按直接执行出牌/抽牌等主要操作；长按预览后使用细小能力按钮，包括“停／常／己”。人物实际操作视角与仅查看卡牌仍有区别。
- 隐藏卡组/页签/折叠区域的可交互提示；橙红色粗圆角矩形，100%→104%→100%，1.6秒×3次后静止。手牌保持完整边框并随卡牌叠放，后牌遮住前牌边框，不把框压窄到可见条带。
- 移除持续高成本阴影/绘制循环，合并提示扫描，阻止重复尺寸写入与卡名请求重试风暴。不是所有真实设备发热都已验收。
- 地图平滑指针中心滚轮缩放、双指缩放、手机独立位置记忆；上下左右独立分隔线、窄日志自动折叠。
- 面板尺寸按账号保存；右下四宫格内部每次刷新仍均分。牌堆数字、装备高度和调查员卡比例修正。
- 非 Build 页面统一绿色纹理；Build 系统界面保持原样。
- U 键、手机/平板撤回入口，以及 online 初次进入进行中游戏时卡在归档检查的问题已修复。专家和归档限制不变。
- 等待会话恢复后进入受保护页面，加载/权限/网络/缺失页面文件错误提供可见恢复提示，不再只剩背景；异步旧响应不能覆盖新游戏。

## Mac 接续（不覆盖 Mac 系统层）

先对齐 PR #9 的 2026-09-13 规则版本和 Mac 原生运行时，再按现有 Mac 分支合并。只迁移前端路径，不复制 Linux 二进制或 Windows/WSL 管理器。

若 Mac 已经移植了 PR #10 的初始提交，在干净或已备份的工作区导出后续增量：

```sh
git fetch origin agent/tabletop-ui-20260914
git diff --binary 4cc742a610d109609ab056c852b8caa100eb1740 origin/agent/tabletop-ui-20260914 -- server/source/ArkhamHorror/frontend > /tmp/arkham-ui-20260915.patch
git apply --check -p5 --directory=mac/source/ArkhamHorror/frontend /tmp/arkham-ui-20260915.patch
git apply -p5 --directory=mac/source/ArkhamHorror/frontend /tmp/arkham-ui-20260915.patch
```

尚未移植初版的情况见[原迁移指南](../tabletop-ui-20260914/README.md)，以 PR #9 的提交为前端补丁基线。发生冲突请逐文件合并，不强制覆盖 Mac 自有改动。

在目标前端目录执行 `npm ci`、`npm run tc`、`npm test`，按 Mac 既有流程构建。保留 Mac 的同源 API、资源及启动参数，本地通常使用 `VITE_ONLINE_MODE=false`；不能照搬 online 的 true-mode 编译产物。若要跨设备账号布局记忆，需要在 Mac 原有后端旁适配相同的授权偏好接口；不要整套复制 WSL 启动器。接口不可用时前端有本地缓存降级。

## Windows 与 Linux 源码映射

- `server/windows/`：Windows v20260915.5 管理工具、唯一入口及辅助启动脚本，44项管理功能保留。`start.sh` 组包时放到 `game/start.sh`，`tools/` 放到 `game/tools/`，其他根文件与 support 保持相对结构。
- `server/linux/self-hosted/`：Linux v20260915.3 分发层。把该目录内容作为包骨架，合入对应 Linux amd64 游戏运行时、卡图、原 Build 和重新编译的前端。它本身不含二进制。仅支持 Ubuntu24.04/glibc2.39+ x86-64；组 tar 时保留 sh、game/bin、game/pgsql/bin 的执行权限。
- 两种普通自托管包均使用 false-mode，不附带 online 专属邮件/Bug/归档 sidecar。游戏运行时和1949项 Build文件未变。
- `server/sidecar/` 是另行部署的 online 扩展，新增按账号布局接口，数据独立存储。平台的 stdlib 本地 layout_preferences.py 与线上 aiohttp 版本不可混用。
- 原 `server/packaging/build-server-package.sh` 是旧运营站打包流程，不能用它覆盖本次普通 self-hosted 包或自动复制旧 runtime 数据。最新组包须从干净清单拷贝，game/data仅setup.sql，Windows backup为空；绝不递归复制使用过的数据库/密钥/日志目录。

## 已生成包与校验值（包本体不上传 Git）

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ArkhamHorrorLocal-Windows-v20260915.5.zip | 1338485776 | a4d74541dcfd3c628844082dc82ca82027194241b0217fcabce42f630e5be29d |
| ArkhamHorror-Server-Linux-amd64-v20260915.3.tar.gz | 1337852613 | 08cb6439d70dbab590361287a0f8f21da14c33165d53b4efc5ba96a672e97c87 |

原发布源完成232项前端测试、类型检查/生产构建和113项HTTP资源校验。Windows管理器SelfTest、44函数兼容和4项文字清理测试通过；Linux原生非root依赖检查及11项隔离状态/备份安全测试通过。ZIP13634、Linux tar13636成员全hash核验，Linux执行权限及两包最终纯净检查通过。

本次分发包没有初始化或启动游戏服务，避免产生存档污染；字节相同运行时的完整开局/备份恢复测试是历史基线。真实 iPhone/iPad/Mac、systemd开机和目标云环境仍需验收。此次 Git 同步不会部署服务器或更换正在运行的包。

Git发布工作区另验：1036项实现/测试/脚本文件与发布源逐字节一致，重新构建的113个前端文件与纯净包构建逐字节一致；类型检查、25项近期回归、11项Linux状态测试及3项本地布局接口测试通过。提交前按文件白名单排除编译目录/安装包/运行数据，并扫描私钥及常见令牌模式。

# Arkham Horror 固定手动重编译流程

这套流程把“修改代码”和“等待编译”分开：Codex 负责修改、合并冲突和准备测试；你负责双击一个固定入口完成编译。这样长时间等待编译不占用对话 token，也不会因为对话中断丢失构建状态。

## 你需要做什么

1. 等 Codex 明确说明源码修改已经完成，并给出当前检查点。
2. 双击源码根目录里的 `manual-rebuild.command`。默认一次完成前端、Mac 本地后端和 Linux 服务器后端，并组装完整本地版。
3. 确认窗口显示的源码和输出位置，然后输入 `y` 开始。
4. 等待进度到 100%。Haskell 编译时间较长时，窗口会持续显示阶段百分比、已用时间和最新日志。
5. 把窗口最后显示的 `REPORT.md` 路径发给 Codex。

脚本显示的是按阶段加权的总体进度，不是假装精确的 Haskell 模块百分比。完整日志会保存在同一产物目录的 `logs/` 中。

Linux 后端必须在 Linux amd64 环境中生成。脚本会在进入该阶段时自动打开 Docker Desktop；Mac 后端已经完成后，Docker 中出现的模块编号属于另一种系统架构，并不是重新编译 Mac 版本。

## 脚本会生成什么

- `frontend/`：本地版和服务器版共用的前端产物。
- `macos-arm64/arkham-api`：Mac 本地部署使用的后端。
- `linux-amd64/arkham-api`：Unkai 服务器使用的后端。
- `local-update-macos-arm64.tar.gz`：便于更新 Mac 本地部署的压缩包。
- `ArkhamHorror-macos-arm64/`：已包含前端、后端、PostgreSQL、Nginx 和双击启动入口的完整本地可运行目录。
- `ArkhamHorror-macos-arm64-complete.tar.gz`：上述完整本地版的可分发压缩包，不包含现有存档和运行日志。
- `server-update-linux-amd64.tar.gz`：便于上传服务器的压缩包。
- `SHA256SUMS`：全部关键产物的校验值。
- `REPORT.md`：源码版本、测试结果、编译结果和关键哈希。
- `source-state.txt`、`git-status.txt`、`working-tree.patch`：用于追溯本次构建对应的源码状态。

## 安全边界

脚本默认不会：

- 替换正在使用的本地部署版；
- 登录或更新 Unkai / Online；
- 启动、停止服务器服务；
- 修改数据库、账号或游戏存档；
- 删除 Docker 镜像或编译缓存。

部署始终是后续的独立步骤。Codex 先读取 `REPORT.md` 和校验值，得到你的明确许可后，才更新本地实例或 Unkai。

## 常用命令行选项

通常直接双击即可。排查环境时也可以在终端中运行：

```bash
./manual-rebuild.command --preflight-only
```

其他可选参数：

- `--skip-tests`：跳过前端测试和类型检查，不建议用于正式产物。
- `--skip-mac`：只构建前端和 Linux 服务器后端。
- `--skip-linux`：只构建前端和 Mac 本地后端，不启动 Docker。
- `--yes`：不询问确认，适合自动化调用。

## 固定协作方式

以后每次需要后端重编译，可以固定为：

1. Codex 读取需求、修改源码并处理上游冲突。
2. Codex 运行轻量静态检查，建立 Git 检查点。
3. 你双击脚本完成正式重编译。
4. Codex 检查报告和产物哈希。
5. 你确认部署范围，例如“只更新本地和 Unkai”。
6. Codex 先备份目标运行环境，再部署并做功能验证。

脚本负责可重复的机械工作；卡牌规则判断、冲突取舍和上线验证仍由 Codex 处理。

# Arkham Horror · Linux 服务器纯净版 v20260924.1

> 本仓库目录保存启动层源码和说明，不是可直接启动的完整文件夹。请先下载 [完整 tar.gz 及校验文件](../../packages/README.md)，以下命令在完整包内执行。

本次与 Windows v20260923.2 精简完整版的游戏内容逐文件对齐：包含合并 PR #12/#13 后的规则、汉化、新旧界面、7 套预组卡组、52 首音乐、8,928 张主卡图及 214 张人物头像。保留全部音乐和卡图，不是增量补丁。

用于给其他用户部署独立游戏服务器。游戏基于固定提交 `67b8f2a1aae9cf4e2b4c64f8895dd4fc20743e0c`，界面版本 `2026.09.23.3-investigator-alignment`，经典界面 `legacy-ui-20260923.1`。无个人账号、存档、密钥、测试数据、Windows 工具或 WSL/Ubuntu 安装镜像。

相较 Linux v20260919.1，后端、迁移、前端及 Build 均已同步更新；八项数据库迁移有执行记录保护，升级前自动导出逻辑备份。原有非 root 启动、SCRAM 数据库认证、外部数据目录、systemd 入口和停服互斥保护保留。系统需提供 `flock`（Ubuntu 24.04 的 util-linux 提供）。

精简内容：移除 419 个与新版完全相同的旧 Build 文件，以及三套过期经典界面。旧 Build URL 内部兼容到新版资源；旧经典入口跳转到最新经典界面。当前新旧界面均保留。必须解压到新目录，不要覆盖旧目录，否则旧冗余文件仍会留下。其他带旧日期的更新说明仅供历史参考，以本文件和 PACKAGE-INFO.txt 为准。

## 环境与版本

- **Ubuntu 24.04 LTS，x86-64 / amd64，glibc 2.39 或以上**；ARM64、树莓派、Alpine/musl 不适用。不要通过替换系统 libc 解决兼容问题。
- 建议至少 2 核、4 GB 内存，预留至少 10 GB 磁盘并给存档/备份留出额外空间。这是部署建议，不是高并发容量承诺。
- 游戏后端、PostgreSQL 14、内部 nginx 和编译好的前端已经包含，不依赖系统 PostgreSQL 服务。需要系统提供 `bash`、`python3`（3.11+，Ubuntu 24.04 自带版本满足）、`curl`、`tar`、`gzip`、`coreutils`、`iproute2`；开机自启需要 systemd。
- 基础依赖可由管理员运行 `sudo apt update && sudo apt install python3 curl ca-certificates iproute2` 安装。安装脚本不会自动修改防火墙、系统 nginx 或其他网站。
- 本包是**普通自托管模式**（与本地包一致，`VITE_ONLINE_MODE=false`），可多人注册、导入卡组和开局。不包含公网运营站专用的邮件验证码、Bug 工单及归档 Sidecar；这些需要另外配置邮件服务和权限，不能直接套用原服务器的密钥。没有默认测试账号，注册后会建立七个预组卡组；已有玩家可添加缺失预组，不覆盖已编辑卡组。
- 这是已编译的固定版本包，不要为了部署而自动拉取上游最新版替换本包。

## 1. 解压与核验

把 tar.gz 上传到**你自己的目标服务器**，在 Linux 上解压，保留执行权限。不要把测试运行过的目录直接给其他人。

```bash
# 先在压缩包所在目录校验随包的 .sha256 文件
sha256sum -c ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz.sha256
sudo mkdir -p /opt/arkham-releases
sudo tar -xzf ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz -C /opt/arkham-releases
cd /opt/arkham-releases/ArkhamHorror-Server-Linux-amd64-v20260924.1
sha256sum -c SHA256SUMS
```

## 2. 全新服务器：安装后台服务

先确认 4000、4002、5433 端口空闲，没有同名实例；已有服务器更新请看 UPDATE.md，**不要重复运行安装器**。

```bash
sudo bash install-service.sh
systemctl status arkham-horror-server --no-pager
curl -fsS http://127.0.0.1:4000/health
```

默认创建专用非 root 用户 `arkham-server`，环境文件 `/etc/arkham-horror-server/server.env`，数据目录 `/var/lib/arkham-horror-server`。开启后台运行/开机自启；断开 SSH 不会停止游戏。主要子进程异常退出时，后台主进程会报错退出，由 systemd 限速重启。

已有目录、账号、同名服务或端口冲突时，安装器会拒绝覆盖。使用自定义端口/服务名时，按下节手工配置后由 AI/管理员据 `bash install-service.sh --dry-run` 输出生成独立 unit，不能直接覆盖现有实例。

## 3. 不使用 systemd：手工运行

先使用专用 Linux 非 root 用户，把整个应用目录交给该用户；数据库不能在 Windows 挂载盘或网络共享上。

```bash
cp server.env.example server.env
chmod 600 server.env
# 修改 ARKHAM_SERVER_DATA 为该用户可写、位于应用目录外的绝对路径；三个端口互不相同
nano server.env
./server.sh check
./server.sh run
```

手工 `run` 是前台进程；若要 SSH 退出后继续运行，交给 systemd 或你自己的进程管理器，不要直接关终端。不要以 root 启动游戏，也不要同时从两个版本目录启动同一数据目录。

## 4. 对外访问（HTTPS）

**默认全部绑定 127.0.0.1**：网页 4000、规则 API 4002、数据库 5433。只给外层反向代理开放 80/443，不要把 API/数据库端口开放到公网。

- `deploy/nginx-site.conf.example` 是独立域名 HTTPS 模板；替换示例域名和证书路径后再使用。需先拥有有效证书，不能直接带占位路径启动。
- 可用现有 nginx、Caddy 或面板代理至 `http://127.0.0.1:4000`，需要保留 WebSocket、Host 和转发协议头。
- 使用现有 nginx 时必须先 `sudo nginx -t`，通过后才 `sudo systemctl reload nginx`；不要覆盖其他站点或停止整个 nginx。
- DNS、云安全组、证书和公网连通性需在你的实际服务器验证。没配置反向代理时，可先建立 `ssh -L 4000:127.0.0.1:4000 你的用户@服务器`，浏览器打开 `http://127.0.0.1:4000` 验证。

WebSocket 配置参考 [nginx 官方说明](https://nginx.org/en/docs/http/websocket.html)；后台进程配置参考 [systemd 官方说明](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)。本包使用主进程前台守护，不依赖伪终端。

## 管理与数据

```bash
sudo systemctl stop arkham-horror-server
sudo systemctl start arkham-horror-server
sudo systemctl restart arkham-horror-server
sudo journalctl -u arkham-horror-server -n 100 --no-pager
sudo -u arkham-server env ARKHAM_SERVER_CONFIG=/etc/arkham-horror-server/server.env ./server.sh status
```

数据目录中：`pgdata/` 为数据库，`secrets/` 为随机生成的 JWT/数据库密码/会话密钥，`custom-card-art/` 为上传卡图，`tabletop-layout.sqlite3` 为按账号保存的分隔线，`run/` 为运行配置/日志，`backups/` 为正常停机时导出的数据库逻辑备份。每个新实例使用不同的随机密钥。不要打印、分享或提交这些文件。

数据库 TCP 使用 SCRAM 密码认证，仅监听本机；私有 Unix socket 目录和权限限制为服务用户。不要删除 secrets 后让旧数据库“重新初始化”，这会导致认证不一致，入口会拒绝这样启动。

## 备份

完整备份须短暂停服，以保持数据库、自制卡图和布局一致。该命令遇到运行中的进程会拒绝，不会静默中断玩家。

```bash
sudo systemctl stop arkham-horror-server
sudo install -d -m 700 -o arkham-server -g arkham-server /var/backups/arkham-horror-server
sudo -u arkham-server env ARKHAM_SERVER_CONFIG=/etc/arkham-horror-server/server.env \
  ./server.sh backup /var/backups/arkham-horror-server/state-20260915.tar.gz
sudo systemctl start arkham-horror-server
```

备份含数据库、密钥、自制图、布局及停机逻辑备份；只允许管理员读取，不要当作游戏分发包。另行备份 `/etc/arkham-horror-server/server.env` 和外层 nginx/证书配置。新备份文件名不能与已有文件相同。恢复和更新见 UPDATE.md。

## 验证清单

注册/登录、创建测试游戏、刷新后进度、多人 WebSocket、Build 卡组、中文卡图、人物视角、停/常/己、撤回、分隔线记忆。确认 `/health` 正常、网页没有 MIME/404 错误、4002/5433 不对公网监听。服务器外网 HTTPS/证书和实际多人容量需要部署后验证。

可以把本包的 AI-DEPLOYMENT.md 和服务器连接信息交给 AI 协助部署；私钥只用于认证，不能打进包或传到服务器。

前端与 Windows v20260923.2 字节相同，沿用已完成的 345 项测试、类型检查和构建验证；这不代表本次重新运行了前端测试。Linux 发行验证使用本机 Ubuntu 24.04 / WSL2 的原生 Linux 文件系统和独立测试账号，实际结果随交付记录公布。真实云服务器开机自启、域名/证书、公网多人连通及容量仍需在部署时验收，不宣称完整战役通关。分发目录本身未启动过，不含测试数据。

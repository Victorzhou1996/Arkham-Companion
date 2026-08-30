# Arkham Companion Server：AI 部署指南

这份文件是给 AI 编程助手或服务器运维助手使用的部署约束。用户可以把本文件链接连同服务器连接方式交给 AI，让 AI 先审计、再部署、最后给出可复核的报告。

> 本指南只适用于本仓库的 `Server` 分支。不要把上游 `halogenandtoast/ArkhamHorror` 的安装脚本或镜像当成 Arkham Companion Server 成品。

## 用户先填写

把下面这段复制给 AI，并补全能够确定的项目；不知道的项目可以写“请检测”。密码、私钥和数据库连接串不要贴进聊天，应该由 AI 在服务器上交互式读取或写入权限为 `600` 的环境文件。

```text
仓库：https://github.com/Victorzhou1996/Arkham-Companion
分支：Server
部署类型：新装 / 更新现有实例
服务器系统与架构：请检测
目标实例：测试 / unkai / online / 其他
安装根目录：请检测或使用 /opt/arkham-companion
持久数据目录：请检测或使用 /var/lib/arkham-companion
配置目录：请检测或使用 /etc/arkham-companion
公网域名或服务器 IP：
对外 HTTP/HTTPS 端口：
允许停机时段：
是否启用注册验证、Bug 报告和存档归档 Sidecar：是 / 否
是否需要完整中文卡图库：是（默认）

请完整阅读 server/AI-DEPLOYMENT.md，先只做只读审计并提交部署计划。计划必须列出实际路径、服务名、端口、数据库备份位置、当前提交、目标提交、回滚方法和预计影响。确认没有覆盖现有存档、账号、密钥或其他 Arkham 实例后再执行。完成后按本文“交付报告”格式汇报。
```

## 仓库中的部署来源

AI 必须先执行 `git fetch`，并以远端 `origin/Server` 为准，不能只相信 README 中的日期。

| 路径 | 用途 | 注意事项 |
| --- | --- | --- |
| `server/source/ArkhamHorror/` | 当前 Arkham Companion 游戏源码 | 需要最新后端行为时从这里构建 |
| `server/release/frontend-dist/` | 已验证的游戏前端 | 服务器更新前端时优先使用这里 |
| `server/release/build/` | Arkham Build 前端产物 | 与游戏前端分开部署或挂载 |
| `shared/cards/` | 完整中文 AVIF 卡图库 | 必须执行 Git LFS 拉取；部署到游戏的 `/img/arkham/zh/cards/` |
| `server/release/bin/arkham-api` | Linux x86-64 预编译后端 | 查看同级发布说明确认源码日期；需要最新后端改动时必须重编译 |
| `server/sidecar/` | 注册验证、Bug 报告、存档归档等附加 API | 与主后端共用 JWT；数据库授权必须最小化 |
| `server/deploy/` | Nginx、Systemd 和数据库角色参考配置 | 文件含现有实例名称和路径，只能作为模板，不能盲目覆盖 |
| `server/packaging/build-server-package.sh` | Linux 发布包生成脚本 | 生成的是发布材料，不会替用户配置数据库和密钥 |

当前发布说明明确指出：`server/release/bin/arkham-api` 是先前验证过的 Linux x86-64 后端，而 `server/source/ArkhamHorror/` 可能更新。AI 必须比较发布说明和 Git 提交；如果目标是“部署分支全部功能”，应从当前源码构建后端，不能把旧预编译文件描述成最新后端。

## AI 必须遵守的安全边界

1. 先审计、后备份、再部署；检查失败立即停止，不带病切流。
2. 不得执行 `git reset --hard`、`docker compose down -v`，不得删除数据库卷、数据目录、备份或用户上传文件。
3. 不得用 `rsync --delete` 对持久数据目录操作。不得把仓库里的空目录同步到数据库、存档或配置目录上。
4. 数据库、用户存档、账号、Bug 报告、归档、密钥、日志和备份必须放在版本目录之外。
5. 不得覆盖现有 `.env`、Systemd `EnvironmentFile`、证书或 Nginx 站点；先复制、脱敏比较，再生成候选配置。
6. 不得在终端输出、聊天、提交记录或诊断报告中显示密码、JWT、邮件令牌、私钥和完整数据库连接串。
7. PostgreSQL 只监听本机或私有网络，不向公网开放。主后端、Sidecar 和内部静态服务也应默认绑定 `127.0.0.1`，只由 Nginx 对外暴露。
8. 更新现有实例时，必须从 Systemd、进程参数、Nginx 实际配置和监听端口反向确认真实路径；本文中的 `/opt/...` 和端口只是建议值。
9. 同一服务器上如有多个 Arkham 实例，逐一标记服务、端口、数据库和目录，不得跨实例复制数据库或配置。
10. 项目发布顺序为先测试实例，再由用户验证；只有得到用户明确许可，才能更新正式 `online` 实例。
11. 不运行上游一键安装命令，也不直接 `docker compose pull`。仓库的 Compose 文件包含上游镜像名，直接拉取可能得到不含本分支功能的上游版本。
12. `server/deploy/setup-arkham-sidecar-role.sql` 假定相关业务表已经存在。执行前逐表检查；缺表时停止，不猜测表结构，不跳过错误继续部署。

## 阶段一：只读审计

### 1. 获取正确分支和大文件

新服务器可使用：

```bash
git clone --branch Server --single-branch https://github.com/Victorzhou1996/Arkham-Companion.git
cd Arkham-Companion
git lfs install
git lfs pull
git fetch origin Server
git status --short --branch
git rev-parse HEAD
git rev-parse origin/Server
git lfs fsck
```

只有 `HEAD` 与计划部署的 `origin/Server` 提交一致、工作树无意外修改、LFS 校验通过时才能继续。检查 `shared/cards/*.avif` 的文件头应为 AVIF，而不是 Git LFS 指针文本。

### 2. 识别服务器环境

AI 至少检查并记录：

```bash
uname -a
uname -m
ldd --version | head -1
df -h
free -h
systemctl --no-pager --type=service --state=running | grep -Ei 'arkham|nginx|postgres' || true
ss -ltnp
nginx -T 2>/dev/null | grep -E 'server_name|listen|proxy_pass|root|alias' || true
```

还要读取所有相关 Systemd 单元的 `ExecStart`、`WorkingDirectory`、`EnvironmentFile` 和运行用户，并确认：

- 哪个端口是主后端，哪个端口是游戏前端，哪个端口是 Sidecar；
- PostgreSQL 是宿主机服务、容器还是随包运行，数据库名和数据目录分别在哪里；
- 现有前端、Build、中文卡图、Bug 报告和归档目录在哪里；
- Nginx 是否承载其他网站或 Arkham 实例；
- 当前版本目录、`current` 链接和最近一次可回滚版本是否存在。

### 3. 检查二进制兼容性

如果计划使用预编译后端，必须在目标服务器上检查：

```bash
file server/release/bin/arkham-api
readelf --version-info server/release/bin/arkham-api \
  | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail
ldd server/release/bin/arkham-api | grep 'not found' || true
```

当前文件是 Linux x86-64 动态链接程序。目标系统必须满足它实际显示的 GLIBC 版本，并提供 `libpq.so.5`、`libpcre.so.3`、`libz.so.1`、`libgmp.so.10` 等依赖。不要用软链接伪造不兼容的 GLIBC。若不兼容，优先在与目标运行环境兼容的容器中从当前源码构建。

## 阶段二：生成部署计划

AI 在执行写操作前必须把以下内容发给用户确认：

- 当前 Git 提交和目标 Git 提交；
- 新装或更新；仅前端/卡图更新，还是包含后端；
- 实际服务名、运行用户、端口、域名和目录；
- 数据库逻辑备份命令、输出路径及验证命令；
- 新版本暂存目录和切流方式；
- Nginx/Systemd 候选配置与现有配置的差异；
- 健康检查、功能验证和回滚命令；
- 是否会短暂停机，以及预计时长。

如果用户只要求前端或卡图更新，不得顺带替换后端、执行数据库 SQL 或重建数据库。

## 阶段三：备份与暂存

使用带 UTC 时间戳和 Git 短提交号的只读版本目录，例如：

```text
/opt/arkham-companion/releases/20260830T120000Z-a9bc80a9/
/opt/arkham-companion/current -> releases/20260830T120000Z-a9bc80a9/
/var/lib/arkham-companion/          # 永久数据，不放进 releases
/etc/arkham-companion/              # 环境变量和本机配置，不提交 Git
/var/backups/arkham-companion/      # 数据库和配置备份
```

更新现有实例前至少完成：

1. 使用 `pg_dump --format=custom` 生成数据库逻辑备份；
2. 用 `pg_restore --list` 验证备份能够读取；
3. 复制当前后端、前端、Build、Nginx、Systemd 和环境文件到带时间戳的备份目录；
4. 记录当前符号链接目标、文件 SHA-256、服务状态和端口；
5. 确认备份不在即将替换的版本目录内。

部署文件先写入全新的暂存目录。推荐的映射是：

```text
server/release/frontend-dist/  -> <新版本>/game/frontend/dist/
shared/cards/*.avif            -> <新版本>/game/frontend/dist/img/arkham/zh/cards/
server/release/build/          -> <新版本>/build/
server/sidecar/                -> <新版本>/online-api/
```

复制完成后检查 `index.html` 引用的 JS/CSS 均存在，卡图索引存在，中文卡图库不是 LFS 指针，并把目录权限设为服务用户可读：目录通常为 `755`、普通文件通常为 `644`、可执行后端为 `755`。密钥文件保持 `600`。

## 阶段四：选择部署方式

### 方式 A：更新已有实例（推荐）

保持现有经过验证的服务拓扑，只替换本次范围内的版本目录：

1. 在新目录中准备前端、Build、卡图库和后端候选文件；
2. 使用现有环境文件，不把密钥复制进版本目录；
3. 在未对外的候选端口启动，完成 `/health`、静态资源和数据库只读检查；
4. 原子切换 `current` 链接或 Nginx 上游；
5. `nginx -t` 通过后才 reload；
6. 只重启实际变化的服务；
7. 观察日志和错误率，验证完成前保留旧进程或旧版本目录。

部署当前分支的全部后端功能时，从源码构建：

```bash
docker build \
  --target api-artifact \
  --output type=local,dest=/tmp/arkham-api-artifact \
  server/source/ArkhamHorror
```

从 `/tmp/arkham-api-artifact/arkham-api` 取得候选后端，检查架构、依赖和 SHA-256 后再放入新版本目录。不要在构建成功后自动覆盖线上二进制。

### 方式 B：新服务器使用容器

新装时可从 `server/source/ArkhamHorror/` 构建镜像，但 AI 必须生成本机专用 Compose 配置，至少满足：

- 镜像从当前 `Server` 分支源码构建，并使用 Git 提交号作为 tag；
- Web 仅绑定 `127.0.0.1:<内部端口>:3000`，由宿主机 Nginx 对外代理；
- PostgreSQL 使用独立持久卷，端口不向公网发布；
- `JWT_SECRET` 和数据库密码来自 Docker secret 或权限为 `600` 的环境文件；
- 把 `server/release/frontend-dist/` 挂载到容器的 `/opt/arkham/src/frontend/dist/`；
- 把 `shared/cards/` 只读挂载到 `/opt/arkham/src/frontend/dist/img/arkham/zh/cards/`；
- 初始化数据库时仅对全新空数据库执行 `server/source/ArkhamHorror/setup.sql`；
- 已有数据库绝不重新执行完整初始化文件。

不要执行仓库 `install.sh` 中指向上游仓库的下载逻辑，也不要拉取 `halogenandtoast/arkham-horror:latest` 代替本地构建。

## Sidecar 配置

只有在需要注册验证、Bug 报告、存档归档等功能时启用。参考 `server/sidecar/README.md` 和与目标目录匹配的 Systemd 模板，但要先替换模板中的实例名、路径和数据目录。

环境文件至少检查这些键：

```text
JWT_SECRET=                 # 必填，必须与主后端完全一致
ARKHAM_BACKEND=             # 主后端本机地址
PUBLIC_BASE_URL=            # 用户实际访问的外部地址
MAILTRAP_API_TOKEN=         # 启用邮件验证时需要
REQUIRE_EMAIL_VERIFICATION=true
MAIL_FROM=
ARKHAM_PG_ROOT=/usr         # 系统 psql 通常在 /usr/bin/psql；按实际位置调整
ARKHAM_PG_SOCKET=127.0.0.1  # 也可使用实际 Unix socket 目录
ARKHAM_PG_PORT=5432
ARKHAM_PG_USER=arkham_sidecar
ARKHAM_PG_PASSWORD=
ARKHAM_PG_DATABASE=arkham-horror-backend
ARKHAM_BUG_REPORTS_DIR=/var/lib/arkham-companion/bug-reports
ARKHAM_ARCHIVE_DIR=/var/lib/arkham-companion/archives
BUG_ADMIN_PASSWORD=         # 必须显式设置强随机值，不能使用源码默认值
ONLINE_API_PORT=39103
```

应用 `server/deploy/setup-arkham-sidecar-role.sql` 前，AI 必须检查脚本引用的每张表都已存在，并通过 `psql` 变量传入随机生成的 `sidecar_password`。Sidecar 数据库用户只保留脚本所需的最小权限。完成后把环境文件设为 `root:root 600`，服务以非 root 用户运行。

## Nginx 与静态资源

`server/deploy/*.nginx.conf` 是现有站点参考文件，包含特定域名、证书路径、端口和 `/opt` 路径。AI 必须生成新候选文件并与 `nginx -T` 的现状比较，不能直接覆盖。

必须保留：

- `/api` 和 WebSocket 的 Upgrade/Connection 转发；
- SPA 路由回退到 `index.html`；
- `.js` 返回 JavaScript MIME、`.css` 返回 CSS MIME、`.avif` 返回 `image/avif`；
- HTML 和带哈希的 JS/CSS 使用不会造成新旧前端混用的缓存策略；
- `/img/arkham/zh/cards/` 指向完整 `shared/cards/` 部署副本或只读挂载；
- 主后端和 Sidecar 的路由边界与 `server/deploy/arkham-horror.online.nginx.conf` 一致。

每次切换前运行：

```bash
nginx -t
```

只有语法检查通过才允许 reload。Nginx 承载其他站点时，不得停止整个服务。

## 阶段五：验证

### 自动检查

至少验证：

```bash
curl -fsS http://127.0.0.1:<内部端口>/health
curl -fsSI http://127.0.0.1:<内部端口>/
curl -fsSI http://127.0.0.1:<内部端口>/img/arkham/zh/cards/01001.avif
```

然后从 `index.html` 解析实际入口 JS/CSS 路径，逐个请求并检查状态码、`Content-Type` 和非零长度。卡图应返回 `image/avif`，不能是 1 KB 左右的 Git LFS 指针或 HTML 错误页。

检查服务没有重启循环，最近日志没有数据库认证、缺少动态库、MIME、WebSocket、权限或路径错误。外部域名还需验证 TLS 证书、HTTP 到 HTTPS 跳转和公网访问。

### 用户功能冒烟测试

使用专门的测试账号和测试游戏，依次验证：

1. 首页、登录、注册或邮件验证；
2. 存档列表、创建游戏、进入游戏、执行一步、刷新后继续；
3. WebSocket 断线重连和多人状态同步；
4. Build 页面、卡组读取以及单个中文卡图和历史 Taboo 卡图；
5. Bug 列表、存档导出/归档（启用 Sidecar 时）；
6. 浏览器强制刷新后不出现白屏、旧资源 404 或错误 MIME。

不得用真实用户存档做破坏性测试。

## 回滚

任何健康检查或核心功能失败时停止继续发布：

1. 把 `current` 链接或 Nginx 上游切回上一版本；
2. 恢复上一版后端、前端和 Build；
3. `nginx -t` 后 reload，重启受影响的 Arkham 服务；
4. 再次验证 `/health`、登录、存档和 WebSocket；
5. 只有数据库结构或数据确实被本次部署修改且用户明确同意时才恢复数据库备份。普通前端/后端回滚不要覆盖更新期间产生的用户数据。

## 交付报告

AI 完成后必须给用户一份脱敏报告：

```text
部署结果：成功 / 已回滚 / 未执行
目标实例：
Git 分支与提交：
部署时间：
版本目录与 current 指向：
持久数据目录：
服务与监听端口：
数据库备份位置及验证结果：
前端 / Build / 后端 / 卡图库 / Sidecar 更新情况：
自动检查结果：
用户功能检查结果：
回滚入口：
仍需用户确认的事项：
```

报告只写密钥文件的位置和权限，不写密钥内容。

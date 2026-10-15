# 在 Mac 上重编译 v20261015.1

目标：把 Server 分支本次发布的规则引擎、前端和汉化带到 macOS，而不是重新打包 Mac 分支的旧引擎。此次只发布 Windows/Linux 完整包与对应源码，未生成或验证 Mac 安装包；Mac、Companion 分支保持原样。

## 1. 取对版本

从 Server 分支 `server/packages/v20261015.1/` 获取：

- `ArkhamHorror-Sources-v20261015.1.tar.gz`：当前 backend、Vue frontend、独立 Build、启动器/迁移材料及逐文件校验清单。
- `ArkhamHorror-Server-Linux-amd64-v20261015.1.tar.gz`：同版完整网页、卡图、字体、音乐和其他静态资源。只复用平台无关资源，不运行其中的 Linux 程序。
- 两个文件对应的 `.sha256`。

Git 克隆应使用 Git LFS，仓库 Download ZIP 不等于完整包：

```bash
git lfs pull --include='server/packages/v20261015.1/*' --exclude=''
cd server/packages/v20261015.1
shasum -a 256 -c ArkhamHorror-Sources-v20261015.1.tar.gz.sha256
shasum -a 256 -c ArkhamHorror-Server-Linux-amd64-v20261015.1.tar.gz.sha256
tar -xzf ArkhamHorror-Sources-v20261015.1.tar.gz
tar -xzf ArkhamHorror-Server-Linux-amd64-v20261015.1.tar.gz
```

`server/source/` 与 `server/release/` 是历史快照，不能拿来当最新版源码。Mac 分支当前也不是 v20261015.1；在独立工作目录使用它的原生启动/打包框架，保留原分支和已有用户数据。

## 2. 编译原生后端

本版上游固定为 `f6ed09bec346ebc505ade739d34a7aea3305fa5c`。后端与10月9日相同，本次主要变更是前端。进入解压源码的 `backend/`：

```bash
stack build arkham-api:exe:arkham-api --jobs 2 --no-terminal --system-ghc
```

`stack.yaml` 要求 Stack >=3.7.1、GHC 9.14.1，且 `install-ghc: false`，需先在 Mac 上准备兼容的原生工具链、libpq 等系统依赖。这里未验证这些依赖在特定 macOS/芯片上的安装可用性。按目标架构编译并检查产物为正确的 Mach-O；不能把 Linux ELF 后端、PostgreSQL、nginx 或动态库塞进 Mac 包。Apple Silicon 与 Intel 如均需支持，应分别构建验证。

必须保留 `backend/arkham-api/data/community-starter-decks.json`。注册入口只加载五套社区预组，旧账号牌组不应被删除。五个预组ID：`JNRlG71XJ9yr7eQ`、`F0jKu1kMY1CBx1z`、`jxRBqU4GdO7IRav`、`QoFuCbmJEY8mzqX`、`svJ95CGV9FGvFZm`。

## 3. 复用或重编译网页

最直接的方式是复用同版 Linux 完整包的 `game/frontend/dist/` 和 `game/build/` 中的平台无关网页资源；Build 服务端需要原生 Node 环境及其依赖，不能盲目复制 Linux 原生扩展。完整保留各资源目录及URL层次，特别是 homebrew、定制表、塔罗牌、小卡和封面。

如需重新编译，建议 Node 24，在源码 `frontend/` 执行 `npm ci`，在 `build/` 执行 `npm ci`，然后回到源码根目录：

```bash
node release-tools/build-web.mjs current
node release-tools/build-web.mjs build
```

生成 `compiled-current-local/` 和 `compiled-build-local/`，已有同名目录时拒绝覆盖。工具只构建入口资源，不包含完整 public 卡图/字体/音乐；需以同版完整静态树为底，再替换各自产物。当前界面使用本地模式并禁用 Companion。经典界面应保留归档中已经固定的 `frontend/public/legacy-ui-20261009.1/`（目录名沿用10月9日，但内容已更新），以及 `legacy-custom-cards-v20261013.js`、`ui-switch-v20261013.js`、共享主题与导航清单。

汉化必须配套保留 `localization-packs`、`l10n/runtime-v1.mjs`、`translation-icons` 和卡图索引，不能只复制中文JSON。`release-tools/records/` 是原 Windows 构建记录，含机器路径，不是 Mac 一键打包脚本。

## 4. 适配旧 Mac 打包框架后再打 DMG

检查 Mac 分支 `mac/packaging/build-local-macos-dmg.sh`，不要直接使用旧默认值：

- `BACKEND_BIN` 改为本次原生编译结果，运行时、数据库和库必须匹配目标 Mac 架构。
- 旧脚本用两个已退役预组ID做验收，需改成上述五套预组目录的校验，不能为通过检查重新加入旧预组。
- 旧脚本把 `shared/cards` 同步到中文卡图目录并带 `--delete`，可能覆盖新图；改用同版完整资源树，禁止用旧扁平卡图覆盖最新结构。
- 合并最新版启动器的备份门槛与七项受保护迁移；保留外置用户数据库。禁止将空库 `setup.sql` 覆盖已有数据。
- 核对 `/build`、`/build-api`、`/api`、`/img/arkham`、语言包等路由及新的原生自制卡/卡库接口；旧 Mac 桥接服务不一定实现这些接口。
- 使用新版本号和独立输出目录；不要覆盖已有 App、DMG 或用户运行目录。

卡图可能共享硬链接。更新图片需写独立临时文件再原子替换，不要就地覆盖共享实体。

## 5. Mac 验收后才作为 Mac 版发布

至少验证全新安装/注册/五套预组、旧账号游戏与牌组升级并重启保留、新旧UI切换刷新、六项导航与共享设置、Build自制卡与规则编辑器、中文与英文模式隔离、暗物质卡牌、完整卡图离线读取；再检查原生依赖、签名和 DMG 安装。Safari、原生 Mac 安装与完整战役尚未在本次 Windows/Linux验证中覆盖，不能沿用其通过结论。

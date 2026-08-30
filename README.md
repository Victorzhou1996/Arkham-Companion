# Arkham Companion

Arkham Horror: The Card Game 的中文本地化、服务器版与 macOS 卡图伴随程序。

Arkham Companion is a Chinese-localized distribution of Arkham Horror: The Card Game, including the server build, macOS local build materials, and a card-image companion app.

## 分支 / Branches

| 分支 | 内容 |
| --- | --- |
| `Companion` | macOS Arkham Companion 源码、当前 App 包与内置卡图 |
| `Mac` | 本地部署源码、启动配置与可运行资源 |
| `Server` | 当前服务器源码、前端/Build 产物、后端可执行文件与部署配置 |

The default branch is `Companion`. The `Mac` and `Server` branches are complete snapshots for their respective environments.

Current Server source and game frontend snapshot: **2026-08-25**. It includes
the selected upstream rules and content updates, current The Drowned City
development content, complete Chinese standalone-scenario localization,
searchable Chinese Foresight choices, completed-campaign deck upgrades and
trauma inheritance, two starter decks for new accounts, and the current manual
rebuild workflow. Packaging and verification details are in
[`server/RELEASE-20260825.md`](server/RELEASE-20260825.md).

发布与跨平台打包请先阅读 [新版本产物流程](docs/NEW-RELEASE-ARTIFACT-WORKFLOW.md)
和 [2026-08-25 Server 发布说明](server/RELEASE-20260825.md)。

需要让 AI 协助新装或更新 Linux 服务器时，请先阅读
[Server AI 部署指南](server/AI-DEPLOYMENT.md)。该指南包含分支与 Git LFS
校验、数据库备份、版本化切换、Sidecar、Nginx、验证和回滚的安全边界。

For releases and cross-platform packaging, start with the
[release artifact workflow](docs/NEW-RELEASE-ARTIFACT-WORKFLOW.md) and the
[2026-08-25 Server release notes](server/RELEASE-20260825.md).

## 主要特性 / Main Features

- 中文界面、卡牌与剧本本地化，包含循环 9 的恢复翻译与循环 10 开发版入口。
  Chinese UI, cards, and scenario localization, including restored Cycle 9 translations and the Cycle 10 developer channel.
- 支持单机、多人联机、存档同步、卡组创建、升级与本地卡组管理。
  Supports solo play, multiplayer sessions, synchronized saves, deck creation, upgrades, and local deck management.
- 提供标准、完整、轻量、硬核与专家回溯模式。
  Provides Standard, Full, Lightweight, Hardcore, and Expert undo-history modes.
- 使用 AVIF 卡图降低传输体积，并支持卡图勘误与用户替换。
  Uses compact AVIF card images and supports errata fixes and user image overrides.
- macOS Companion 将卡图放在本地，通过 `127.0.0.1:8688` 提供图片服务；游戏账号、联机状态和存档仍由远程网页服务器处理。
  The macOS Companion serves card images locally through `127.0.0.1:8688`; accounts, multiplayer state, and saves remain on the remote web server.
- Build 页面提供本地卡组、外部卡组链接与热门卡组推荐入口。
  The Build interface supports local decks, external deck URLs, and popular-deck recommendations.
- 支持开发版内容、Bug 反馈列表和服务器端缓存。
  Includes developer content, bug reports, and server-side caching.

## 卡图 / Card Images

共享卡图库位于 `shared/cards/`，当前使用 AVIF 格式。Companion App 的 `Contents/Resources/CardImages` 中也包含可直接运行的内置卡图。

The shared card library is stored in `shared/cards/` as AVIF files. The Companion App also contains a self-contained copy in `Contents/Resources/CardImages`.

## 安全说明 / Security

本仓库只包含可发布源码、构建产物和卡图，不包含线上数据库、用户存档、账号密码、会话密钥、访问日志或服务器备份。部署时请通过环境变量、Docker secrets 或本机配置文件提供数据库连接信息。

This repository intentionally excludes live databases, user saves, credentials, session keys, access logs, and server backups. Provide database settings through environment variables, Docker secrets, or a local configuration file when deploying.

## 致谢 / Credits

感谢原作者 [halogenandtoast/ArkhamHorror](https://github.com/halogenandtoast/ArkhamHorror) 提供开源项目与游戏逻辑基础。Arkham Companion 是在其基础上的中文本地化、服务器部署、卡图优化与 Companion 扩展项目。

Thanks to [halogenandtoast/ArkhamHorror](https://github.com/halogenandtoast/ArkhamHorror) for the open-source project and game-logic foundation. Arkham Companion is a Chinese localization and distribution with server, card-image, and Companion improvements.

Arkham Horror: The Card Game and related content are © Fantasy Flight Games. This project is unofficial and is not produced, endorsed, or affiliated with Fantasy Flight Games.

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

## 2026-07-28 版本更新 / Release Update

> 更新范围：自加入 Build 组牌功能以来至 2026-07-28。以下内容将本项目新增功能与原作者上游更新分开列出。

### 本项目新增与改进

#### 组牌与牌组流程

- 集成 `arkham.build` 风格的 Build 组牌页面，支持创建、编辑和升级牌组。
- 支持从 ArkhamDB、arkham.build 链接和 JSON 文件导入牌组。
- 修复升级牌组无法保存、保存后不出现在“我的牌组”及新游戏选牌列表的问题。
- 幕间升级改为在新标签页打开；保存牌组后自动通知游戏页面更新，无需手动刷新。
- 修复多人游戏幕间升级顺序、重复生成剧本专用牌组及升级牌组识别问题。
- 热门卡组改为跳转外部 arkham.build 对应页面，避免服务器承担额外查询压力。

#### 中文化与内容

- 恢复并补全第五循环《食梦者》和第九循环《铁杉谷盛宴》的引言、幕间、结局及关内剧情汉化。
- 整理并保存第五、第九循环的中文文本源文件，避免后续同步上游时再次丢失。
- 修正多处卡名、关卡名、官方译名、游戏记录和按钮文本。
- 加入第十循环开发版开关；仅在账号启用“加入开发版”后显示，并标注 `DEV`。

#### 卡图与加载

- 更新高清中文 AVIF 卡图库，修正《全速恐惧》等剧本的地点正反面与缺失卡图。
- 对第二章及新调查员扩展的高清扫描图进行无损观感下的体积优化。
- 修复悬停放大图偶发不显示、Token 图片透明、双面卡翻面和本地牌组按钮兼容问题。
- 移除已经不再需要的“预加载所有卡图”功能。
- 建立 Companion → 服务器中文卡图 → CDN/原图的后备顺序。

#### Companion 与本地运行

- 制作 macOS Companion，本机通过 `127.0.0.1:8688` 提供卡图，账号、联机和存档仍由服务器处理。
- Companion 支持内置卡图、用户替换卡图、浏览器入口及带关闭按钮的多标签页。
- 修复非 Safari 默认浏览器无法打开网页、不同浏览器无法优先读取本地卡图的问题。
- 新增完整 macOS ARM64 本地部署 App：内置前端、Haskell 后端、PostgreSQL、Nginx 和中文卡图，不依赖服务器或 Docker。

#### 游戏界面与操作

- Token 选择区改为自动换行，修复长列表只能横向滚动的问题。
- 增加调查员响应状态条，直观显示当前回合玩家和仍在等待操作的玩家。
- 玩家快速能力增加 `己／常／停` 三档提示模式，并修复模式设置影响手动“跳过能力”的问题。
- 模式按钮移动到卡牌右上角，横置后仍保持正确位置；仅对相关快速能力显示。
- 专家模式隐藏调试入口；不同回溯模式在游戏列表中显示对应标识。
- 优化卡牌动效框、移动端布局、导航入口及 Build 新窗口体验。

#### 存档、回溯与多人

- 新增标准、完整、轻量、硬核和专家五种回溯模式。
- 标准模式在进入幕间前建立新存档边界；轻量模式保留最近 30 步。
- 硬核模式仅保留最近 1 步，随机动作后清除更早记录；专家模式不允许回溯。
- 修复多人响应窗口、WebSocket 重连、牌组选择屏障和游戏创建失败问题。
- 优化首页存档列表加载速度，并完善退出时自动备份和 JSON 导入导出。

#### Bug、成就与辅助功能

- 将失效的原作者错误报告入口替换为本服务器 Bug 列表和文本存储。
- Bug 页面支持管理员登录/退出、编辑、删除、每页 10 条及 ZIP 导出；导出包包含说明和最近 30 步存档。
- 恢复重返狂热之夜、重返敦威治遗产和重返卡尔克萨之路的成就分类。
- 加入顶部朗读菜单，可选择剧情、场景、地点和卡牌文本；支持暂停、继续、停止、语速及音量。
- 朗读使用可维护的 CSV/本地化文本索引，修正标点误读和关内文本无法朗读的问题。

### 从原作者上游合入

#### 新内容

- 合入官方独立剧本 `Machinations Through Time`，保留 Public Alpha 标识和四种难度。
- 合入第十循环 `The Drowned City` 的十个剧本模块、符文资源、战役步骤和相关界面，继续作为开发版内容。
- 合入 FAQ 2.5 的 11 种 Boons 与 19 种 Ultimatums 可选规则及中文翻译。

#### 规则与稳定性修复

- 合入牌组附件元数据、升级牌组、外部牌组导入及 Build 随机弱点池等修复。
- 合入伤害、闪避、技能检定、混沌标记、封印费用、遭遇卡和地点规则相关修复。
- 合入多张玩家卡、调查员、敌人与剧本卡的规则勘误。
- 修复“庄严圣约”归还祝福标记后无法触发黛安娜·史丹利反应能力的问题。
- 修复多人牌组选择、延迟问题、目标解码及部分重复触发或崩溃问题。
- 保留本项目的中文文本、卡图路径、Companion、Build、Bug 系统和回溯模式，没有直接覆盖式合并上游主分支。

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

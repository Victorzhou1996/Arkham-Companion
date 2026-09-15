# Mac 本地桌面版 2026.09.15

## 范围

- 只制作 Apple Silicon macOS 本地部署 DMG，包含游戏启动器与独立管理工具入口。
- 不制作 Companion，不自动删除用户已有应用，不部署 Kaho 或 Online。
- 游戏规则后端、Build、卡图库、Mac 启动和管理工具基于已验证的 2026-09-13 cardfix 包复用。
- 前端移植 Server `5cc3061809ae63c06ff11d8e80ca774b4a55e22e` 相对 `7ecfa973813585bb865c4ddde0b780b542587527` 的前端增量。
- Mac 集成源提交：`29fd34da68`，原始基线 `3a35d32fa7`。没有合入原作者后续 10 个规则提交，也没有运行 GHC/Stack 后端编译。

## 内容

绿色桌面、独立面板调整、地图缩放和记忆、重叠手牌与威胁区、装备高度适配、有限动画提示、手机布局、加载失败恢复和撤回入口修复。保留原 Build、预组卡组、汉化、9 月 13 日修正卡图和五种存档模式。

Mac 特定处理：布局偏好按账号保存在当前浏览器本地；不请求账号布局接口，不承诺跨设备同步。关闭 Companion 8688 端口探测。

## 重现构建

在集成源 `frontend` 目录执行：

```sh
npm test
npm run tc
VITE_ONLINE_MODE=false VITE_LOCAL_LAYOUT_ONLY=true VITE_DISABLE_COMPANION=true VITE_API_HOST='' VITE_ASSET_HOST='' VITE_CARD_IMAGE_CDN_HOST='' npm run build
```

本工作区打包入口为 `tools/package-mac-tabletop-20260915.sh`。脚本复用旧包已重定位的 Mac 运行时，并对新旧规则后端逐字节比较；仅前端重新构建。

## 验证记录

- `frontend-tests.log`：234 项前端测试通过，包含本地偏好无 HTTP 请求和关闭 Companion 探测的两项回归。
- `frontend-types.log`：类型检查通过。
- `frontend-build.log`：生产构建及预压缩通过。
- 最终 DMG 完整性检查通过；SHA-256：`ba40b21614864b7c4de222a56d8b5462124aabfd760353457eda50dac925d189`。
- 全新安装和旧数据副本升级两轮通过；原玩家表内容指纹不变，预组卡组、管理工具两个入口及不同图标、定制图片备份恢复、旧备份兼容性、危险备份拒绝均通过。
- 两轮均逐一校验 1,177 张修正图像的 HTTP 内容及哈希。
- 两轮均新建五种存档模式且启用成就；核心开场依次完成选牌、初始创伤分配、战役继续和阅读选择，进入调查阶段。桌面 1440px 与手机模拟 390px 均正常渲染，可见 32/13 张图片全部加载，无横向溢出或未捕获错误。
- 桌面面板调整后刷新，本地账号偏好保持；没有账号布局服务或 Companion 8688 请求。
- 规则后端新旧 SHA-256 均为 `b6ee888e6a4b0d99d5894eaab3fa2e871da322c131a6ca96552815b71a550912`。
- 浏览器采用后台 Chromium，不操控用户正在使用的浏览器；测试使用隔离 HOME 和数据库，不操作个人原存档。

## 安装

先使用旧管理工具备份存档并停止旧服务，再把 DMG 中两个应用拖入“应用程序”替换旧版。先启动一次游戏完成运行环境更新，再打开管理工具。存档仍使用原用户数据目录。

本次为开发者本地签名，不是 Apple 公证发布；真实 Safari、Intel Mac 和完整逐战役通关不属于本次自动验证范围。

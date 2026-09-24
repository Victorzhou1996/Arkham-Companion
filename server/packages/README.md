# 独立 Linux 服务器完整包

当前版本：**v20260924.1**，游戏内容与 Windows **v20260923.2 去重完整版**一致。

- [下载完整 tar.gz](https://media.githubusercontent.com/media/Victorzhou1996/Arkham-Companion/Server/server/packages/v20260924.1/ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz)
- [SHA-256 校验文件](v20260924.1/ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz.sha256)
- [部署说明](../linux/self-hosted/README.md) · [升级/备份/回滚](../linux/self-hosted/UPDATE.md)

这是可独立运行的已编译完整包，不是源码压缩包或增量补丁。包含 Linux amd64 后端、PostgreSQL、内部 nginx、同源前端、最新经典界面、Build、完整卡图和 52 首音乐。不含个人账号、存档、密钥或 Windows 管理工具。

支持 Ubuntu 24.04 x86-64 / glibc 2.39+，非 root 服务用户运行，持久数据在包外，内部端口只监听 127.0.0.1。公网部署需自行配置 HTTPS 反向代理。

包采用普通自托管模式（online=false），不含运营站专用邮件验证、Bug/归档 Sidecar。`server/release/` 仍保留既有 online 专用产物，二者不能无条件互换。

## 下载和校验

在仓库根目录也可执行 `python3 server/packaging/verify-self-hosted-package.py server/packages/v20260924.1/PACKAGE.json`；它只读校验压缩包、每个文件哈希、权限和纯净状态，不解压或启动服务。

优先点击上面的完整包下载链接。GitHub 的 “Download ZIP” 是仓库快照，不等于此部署包。若克隆仓库，仅取此包可运行：

```bash
git lfs pull --include='server/packages/v20260924.1/*.tar.gz' --exclude=''
cd server/packages/v20260924.1
sha256sum -c ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz.sha256
tar -xzf ArkhamHorror-Server-Linux-amd64-v20260924.1.tar.gz
cd ArkhamHorror-Server-Linux-amd64-v20260924.1
sha256sum -c SHA256SUMS
```

若下载文件只有百余字节且内容包含 `version https://git-lfs.github.com/spec/v1`，那是 LFS 指针，不是包；请重新通过完整包链接或 Git LFS 下载。

必须解压到新目录，不能覆盖旧目录。更新已有实例先停服并验证完整冷备，保留旧版本及原配置，详见 UPDATE.md。发布本包不会自动部署或重启任何现有服务器。

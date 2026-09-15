# Linux 存档操作记录查看器

独立 Linux 服务器分发层现位于 [self-hosted/](self-hosted/README.md)，对应 v20260915.3。该目录保存安装、启动、备份和升级脚本源码，不包含规则二进制、数据库或编译后的前端；组包映射见[源码交接](../../docs/release-source-20260915/README.md)。下面的只读存档查看器仍保留。

这个工具只读取导出的 Arkham JSON 存档，不修改存档，也不需要重新编译后端。

## 使用

```bash
./open-save-history.sh /path/to/arkham-save.json
```

如果运行目录不是仓库中的 `server/release`，可传入第二个参数，或设置 `ARKHAM_RUNTIME_ROOT`：

```bash
ARKHAM_RUNTIME_ROOT=/opt/arkham ./open-save-history.sh /path/to/arkham-save.json.gz
```

- 桌面 Linux 会尝试在默认浏览器打开只读操作记录页面。
- NAS 或纯服务器环境会打印生成的 HTML 路径，可下载后查看。
- 若本机 PostgreSQL 可访问，工具会优先补充数据库中的完整操作日志。
- 若只有独立 JSON 文件，则显示存档内可恢复的操作摘要。

数据库连接可用以下环境变量覆盖：`ARKHAM_PG_HOST`、`ARKHAM_PG_PORT`、`ARKHAM_PG_USER`、`ARKHAM_DB`。

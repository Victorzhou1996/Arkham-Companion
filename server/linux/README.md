# Linux 存档操作记录查看器

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

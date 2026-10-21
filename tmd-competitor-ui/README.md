# TMD Competitor 展示界面交接

本包提供当前展示界面的 React 前端、FastAPI 后端、展示所需的 PostgreSQL schema，以及银行公开来源清单。它不含数据库内容、任何真实连接串、Supabase / Google Cloud / GitHub 凭据、爬虫、入库程序或 AI 摘要生成程序。

## 运行前提

- Python 3.13 或兼容版本、Node.js 20 或更新版本。
- 一个由接收方自行管理的 PostgreSQL 数据库，已有或将导入 `banks`、`rate_snapshots`、`bid_rate_hkd`、`ai_summaries` 表，并建立 dashboard 物化视图。
- 后端只使用 `DATABASE_URL`。不要把旧项目的 `.env` 或个人云端认证文件复制到本包。

## 后端

在项目根目录建立 `.env`，从 `.env.example` 复制后填写接收方自己的连接串。示例中所有方括号内容都只是占位符，不能直接使用。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001
```

健康检查：`http://127.0.0.1:8001/health`；接口文档：`http://127.0.0.1:8001/docs`。

如由另一台机器或域名提供前端，请在运行环境设置 `CORS_ORIGINS` 为该前端地址的 JSON 数组，例如 `CORS_ORIGINS=["https://dashboard.example.com"]`。

## 前端

```sh
cd frontend
npm ci
VITE_API_TARGET=http://127.0.0.1:8001 npm run dev
```

开发服务器默认为 `http://127.0.0.1:5173`，通过 Vite 代理请求 `/api` 和 `/health`。生产部署时，应由反向代理把同源的 `/api`、`/health` 转发至后端，或相应修改前端 API 配置与后端 CORS 设置。

## 数据库 schema

按文件名前缀顺序执行 `database/sql/` 内的 SQL。`005_dashboard_materialized_views.sql` 创建展示历史图表所依赖的物化视图。每次导入或更新 `rate_snapshots` 后，需刷新这些物化视图，展示页面才会反映新数据。

本包没有导入历史数据，也没有包含爬虫输出 CSV。接收方需要从已交付的爬虫流程或自己的数据迁移流程写入数据库。

## 包含内容

- `frontend/`：当前 React/Vite 展示界面；不含 `node_modules` 和构建产物。
- `backend/`：当前 FastAPI 查询 API；不含备份文件和摘要生成/入库脚本。
- `database/sql/`：展示 API 所需的数据库表与物化视图定义。
- `input/Source Registry 20260417.csv`：展示历史图表所需的银行公开页面链接映射。

## 安全与范围

前端不会读取或保存 token。浏览器本地存储只保存侧边栏展开状态，接口请求不附带认证头。后端以数据库连接串访问数据；连接串必须仅存在于接收方部署环境，不得提交到版本库或嵌入前端构建产物。

保留的 `ai_summary_service.py` 只读取已经写入 `ai_summaries` 表的摘要，不会调用 Vertex AI。若没有该表或摘要记录，页面会正常返回空摘要。

# 项目结构与 Windows 启动说明

核验日期：2026-09-05。

## 1. 项目根目录

实际仓库位于外层工作目录中的同名子目录：

```powershell
Set-Location 'C:\Users\15192\Downloads\interview-guide-master\interview-guide-master'
```

后文所有命令均从这里执行，前端命令另行标明。

## 2. 代码地图

主应用由 Spring Boot 后端、React 前端、PostgreSQL、Redis 和 S3 兼容对象存储组成。
Python 研究目录是独立的命令行实验工具，不参与 Web 应用启动。

| 位置 | 内容与入口 |
| --- | --- |
| `app/src/main/java/interview/guide/App.java` | 后端入口；启用 Spring Boot、定时任务，配置中启用 Java 21 虚拟线程 |
| `common/` | 配置、统一响应和异常、限流、LLM Provider 注册、结构化输出重试、Redis Stream 模板 |
| `infrastructure/` | Tika 文档解析、S3 文件存储、存储桶初始化、PDF 导出、MapStruct 映射、Redis 访问 |
| `modules/resume/` | 简历上传、文件去重、解析和保存、异步 AI 分析、简历详情与导出 |
| `modules/interview/` | 技能模板、JD 解析、文字面试会话、出题、答题、追问、异步评估和报告 |
| `modules/knowledgebase/` | 文档上传、分块与向量化、pgvector 检索、RAG 问答、流式回答、聊天记录 |
| `modules/interviewschedule/` | 面试日程增删改查、邀约规则/AI 解析、日程状态更新 |
| `modules/voiceinterview/` | 语音会话、WebSocket、DashScope ASR/TTS、面试阶段管理、实时与最终评估 |
| `app/src/main/resources/` | `application.yml`、Prompt 模板、技能模板、Lua 限流脚本、语音开场配置 |
| `frontend/src/App.tsx` | React Router 路由；首页、简历、文字/语音/视频面试、日程、知识库 |
| `frontend/src/api/` | Axios 请求封装和各业务 API；统一解包 `code=200` 的响应 |
| `frontend/src/pages/` | 页面和交互编排；视频页面包含摄像头预览并复用语音面试流程 |
| `frontend/src/components/` | 上传、音频、面试对话、图表、日历等组件 |
| `research/personality-multiagent-misinformation/` | 人格方案生成、问卷验证、校准、方案/模型比较、实验报告 |
| `docker/postgres/init.sql` | 首次初始化 PostgreSQL 的 pgvector 扩展 |

后端有 157 个 Java 源文件，业务遵循 Controller → Service → Repository。
三个 Redis Stream 消费管道分别处理简历分析、知识库向量化和面试评估。
知识库使用 1024 维向量和余弦距离检索；文件原件保存在 MinIO，业务记录保存在 PostgreSQL。

前端 HTTP 请求使用 `/api`；语音连接使用 `/ws/voice-interview/{sessionId}`。
Docker 模式由 Nginx 代理，开发模式由 Vite 代理。

## 3. 本机运行环境

| 组件 | 已定位环境 |
| --- | --- |
| Java | Temurin JDK 21；`C:\Users\15192\AppData\Local\Programs\DevTools\temurin-jdk-21\jdk-21.0.10+7` |
| Gradle | 仓库自带 Wrapper，8.14；使用 `gradlew.bat`，无需额外安装 Gradle |
| Node.js | 已安装 Node 24；前端 Docker 构建使用 Node 20 |
| 前端依赖 | `frontend/node_modules`；项目声明的包管理器为 pnpm 10.26.2，同时提供 npm 锁文件 |
| Python | `C:\Users\15192\AppData\Local\Programs\Python\Python312\python.exe`，3.12.10 |
| Python 虚拟环境 | 本次新建 `.venv`；解释器 `.venv\Scripts\python.exe` |
| Docker | Docker Desktop，Linux 容器，`desktop-linux` context；Engine 28.5.1，Compose 2.40.0 |
| Docker 程序 | `C:\Program Files\Docker\Docker\resources\bin\docker.exe` |

未找到原有的项目专用 venv。系统登记的 Anaconda 和 NPTI Conda 环境属于其他用途。
研究目录的 21 个 Python 文件仅导入标准库和项目自己的模块，因此新建环境无需安装第三方包。
Java 的“虚拟线程”不是 Python 虚拟环境；主应用不需要激活 `.venv`。

`.env` 已存在，包含 DashScope 与基础服务配置。实际密钥只保留在本机文件中。
`bootRun` 由 `app/build.gradle` 显式加载根目录 `.env`；Docker Compose 将所需变量注入容器。
直接执行 `java -jar` 不会自动加载 `.env`。

## 4. Docker 启动与访问

本机使用 `FRONTEND_PORT=8088`，因为 80 端口已被 Dify 使用。

| 服务 | 容器/访问入口 |
| --- | --- |
| 前端 | `interview-frontend`；http://localhost:8088 |
| 后端 | `interview-app`；http://localhost:8080 |
| API 文档 | http://localhost:8080/swagger-ui/index.html |
| 健康接口 | http://localhost:8080/api/resumes/health |
| PostgreSQL | `interview-postgres`；localhost:5432；数据库 `interview_guide` |
| Redis | `interview-redis`；localhost:6379 |
| MinIO API | `interview-minio`；http://localhost:9000 |
| MinIO 控制台 | http://localhost:9001 |

日常重新启动已有镜像：

```powershell
docker desktop start
docker compose up -d --no-build --wait --wait-timeout 180
docker compose ps
```

正常从源码构建并启动：

```powershell
docker compose up -d --build --wait --wait-timeout 180
```

如果 Docker 的 Gradle 基础镜像下载失败，本机可先用 JDK/Gradle Wrapper 打包，再制作运行镜像。
本次后端采用以下方式；前端已通过 Docker 源码构建：

```powershell
.\gradlew.bat :app:bootJar --no-daemon --console=plain
docker build -f app/Dockerfile.runtime -t interview-guide-master-app app/build/libs
docker compose build frontend
docker compose up -d --no-build --wait --wait-timeout 180
```

`Dockerfile.runtime` 的上下文只有 `app/build/libs`，使用当前 `bootJar` 产物，不会打包 `.env`。
当前 JAR 文件名与 `app/build.gradle` 的版本对应；修改应用版本后需同步更新该 Dockerfile。

查看日志或停止本项目：

```powershell
docker compose logs --tail 100 app frontend
docker compose stop
```

数据卷为 `interview-guide-master_postgres_data`、`interview-guide-master_redis_data`、
`interview-guide-master_minio_data`。本次复用了原有数据；日常停止不需要删除数据卷。

## 5. 本地开发与 Python 研究

Java/React 本地开发使用同一组 Docker 基础服务。切换前先停止占用 8080 的 Docker 后端：

```powershell
docker compose stop frontend app
docker compose -f docker-compose.dev.yml up -d
.\gradlew.bat :app:bootRun --no-daemon
```

另开一个 PowerShell 终端启动前端：

```powershell
Set-Location 'C:\Users\15192\Downloads\interview-guide-master\interview-guide-master\frontend'
npm.cmd run dev
```

开发入口为 http://localhost:5173。已有 `node_modules` 可直接使用；缺少依赖时，
从前端目录执行 `corepack pnpm install --frozen-lockfile`，或者使用现有 npm 锁文件执行 `npm.cmd ci`。
前端构建命令为 `npm.cmd run build`。结束本地前后端进程后，再执行 Docker 日常启动命令即可切回容器运行。

研究脚本可直接调用虚拟环境解释器，无需调整 PowerShell 执行策略：

```powershell
.\.venv\Scripts\python.exe research\personality-multiagent-misinformation\run_persona_validation.py --profile-id careful_verifier --seeds 1 --dry-run --output-dir build\startup-verification\personality-dry-run
```

`--dry-run` 使用模拟回答验证流程。真实模型实验移除该参数，并先确认实验规模；
批量 benchmark 与模型对比会产生多次远程模型调用。

## 6. 本次修复与验证范围

已调整启动配置：

- Docker 前端端口可由 `FRONTEND_PORT` 配置，本机为 8088。
- 开发 Compose 复用完整版的 PostgreSQL、Redis、MinIO 和初始化服务，避免 RustFS/MinIO 配置与数据卷不一致。
- Vite 增加 WebSocket 代理和固定端口检查。
- 后端增加健康检查，前端等待后端健康后启动。
- MinIO 初始化采用可重复执行的建桶命令，并在失败时返回失败状态。
- 新增从本机 JAR 构建后端运行镜像的入口。
- 新建 `.venv` 并忽略 Python 环境和字节码，避免进入 Git 与 Docker 构建上下文。

已验证主程序编译/打包、前端构建、PostgreSQL pgvector 0.8.2、Redis PING、MinIO、
核心业务查询 API、前端路由与代理、WebSocket 101 握手、真实 DashScope 邀约解析，
以及 Python 人格验证离线流程。浏览器已确认首页、面试入口及知识库页面可渲染并加载数据。
后端启动日志也记录了 TTS 开场音频预热成功。

最终 Docker 模式 20 项运行检查、Vite 开发模式 19 项运行检查均通过。
临时 Vite 验收进程已经停止，当前保留五个 Docker 服务运行。
容器内 `/app/app.jar` 与本机打包产物 SHA-256 一致：
`5c7ce663b4de3739911793bf8d62dce66c65d3f065227483634cfba05c499fe8`。

核验记录位于 `build/startup-verification/`：

- `backend-package.log`：可运行 JAR 打包结果。
- `backend-build.log`：包含测试编译失败的完整构建记录。
- `smoke-results.json`：运行检查结果。
- `smoke-dev-results.json`：Vite 开发模式的运行检查结果。
- `personality-dry-run/`：Python 离线验证报告。

现有完整 Java 测试套件未通过 `compileTestJava`：主要是语音模块测试仍引用已移除的
`VoiceInterviewPromptService.RolePrompt`、`getRolePrompt()`、`init()`，以及 ASR/TTS/LLM 服务的旧构造参数。
这是现有测试与实现不一致的问题；`bootJar` 和应用启动可以独立完成。本次没有跳过或改写这些测试来制造通过结果。

前端构建仍有原有 CSS 滚动条选择器和较大 bundle 的警告，构建正常完成。
本次没有采集真实麦克风/摄像头，也没有执行完整真人语音/视频面试；WebSocket 握手通过不等同于全流程媒体验收。

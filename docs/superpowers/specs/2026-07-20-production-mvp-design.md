# snxq.cc 正式开发最小闭环设计

- 日期：2026-07-20
- 状态：已确认
- 首个闭环命令：`about`
- 目标：在本地开发环境中打通 Astro/SolidJS、ConnectRPC、Go、Bun 和 SQLite，并构建一个内嵌前端资源与迁移文件的 Go 单二进制；正式环境切换至 PostgreSQL。

## 1. 技术栈

### 1.1 前端

- Astro 6：静态 HTML、SEO、内容路由和零 JavaScript 默认输出。
- SolidJS：仅作为命令输入、历史和页面内窗口的交互 Island，使用细粒度响应式，不采用整站 SPA。
- TypeScript：前端业务类型与生成的 Protobuf 类型。
- Connect-ES：浏览器 RPC 客户端。
- Protobuf-ES：浏览器与 TypeScript 的 Protobuf 实现。
- Vite：Astro 本地开发与构建基础。
- pnpm：前端包管理。

### 1.2 协议

- Protobuf：前后端唯一 RPC 契约。
- Buf：协议校验、代码生成和 Breaking Change 检查。
- Protovalidate：请求消息校验。
- 浏览器优先使用 Connect Protocol 与 Protobuf 二进制编码。
- Go 服务同时支持 Connect、gRPC 和 gRPC-Web。

### 1.3 后端

- Go。
- Connect-Go。
- Bun：SQL-first 数据访问层，建立在 `database/sql` 上。
- `log/slog`：结构化日志。
- `go:embed`：内嵌 Astro 静态产物、数据库迁移与 Seed。

### 1.4 数据库

- MVP、本地开发和早期单实例运行：SQLite，使用纯 Go Driver，避免 CGO。
- 正式环境：PostgreSQL。
- SQLite 与 PostgreSQL 分别维护版本化 SQL Migration。
- 不使用 `AutoMigrate`。
- Repository 接口隔离数据库方言差异。

### 1.5 生产环境

- 自有 Linux 服务器。
- 单个 Go 应用二进制。
- Caddy 负责 TLS 和反向代理。
- systemd 管理 Go 服务。
- 不要求 Node.js 生产运行时。
- 不使用 Envoy、Docker 或 Kubernetes 作为首版部署前提。

## 2. 总体架构

### 2.1 本地开发

```text
Browser
   │
   ▼
Astro / Vite :4321
├── 静态页面与 SolidJS HMR
└── RPC 请求代理
          │
          ▼
    Go Server :8080
    ├── ConnectRPC
    ├── Bun
    └── SQLite
```

本地开发规则：

- Astro 保留 HMR。
- Go 独立运行，并可由 `air` 或统一任务命令自动重启。
- Vite 将 RPC 路径代理至 `localhost:8080`。
- 前后端使用 Buf 生成的同一套 Protobuf 类型。
- SQLite 文件默认位于 `.data/snxq.db`。
- 自动测试使用内存 SQLite 或临时数据库文件。

### 2.2 生产构建

```text
buf lint
→ buf generate
→ pnpm --dir web install --frozen-lockfile
→ pnpm --dir web test
→ pnpm --dir web build
→ 同步 web/dist 至 internal/web/dist
→ go test ./...
→ go build ./cmd/snxq-server
→ snxq-server
```

Go 二进制内嵌：

```text
snxq-server
├── Astro 静态资源
├── SQLite Migration
├── PostgreSQL Migration
└── About Seed
```

数据库本身不嵌入二进制：SQLite 使用外部持久化文件，PostgreSQL 使用外部数据库服务。

### 2.3 生产运行

```text
Internet
   │ HTTPS
   ▼
Caddy
   │ HTTP/2 或 HTTP/1.1
   ▼
snxq-server :8080
├── ConnectRPC
├── embedded Astro files
└── PostgreSQL
```

Caddy 只负责 TLS、HTTPS、反向代理及可选压缩。Go 服务负责 RPC、静态资源、HTML 路由、缓存头、健康检查、Migration、Seed 和数据库访问。

## 3. 仓库结构

项目以 Go 为根，Astro 工程直接位于 `web/`，不增加 `frontend/` 子目录。

```text
snxq.cc/
├── cmd/
│   └── snxq-server/
│       └── main.go
├── internal/
│   ├── app/
│   │   ├── app.go
│   │   └── config.go
│   ├── command/
│   │   ├── service.go
│   │   ├── parser.go
│   │   └── model.go
│   ├── content/
│   │   ├── repository.go
│   │   ├── service.go
│   │   └── model.go
│   ├── rpc/
│   │   ├── command_handler.go
│   │   ├── error.go
│   │   └── interceptor.go
│   ├── storage/
│   │   ├── database.go
│   │   ├── bun.go
│   │   ├── sqlite/
│   │   └── postgres/
│   └── web/
│       ├── handler.go
│       ├── embed.go
│       └── dist/
├── proto/
│   └── snxq/
│       └── v1/
│           ├── command.proto
│           └── content.proto
├── gen/
│   ├── go/
│   └── es/
├── migrations/
│   ├── sqlite/
│   └── postgres/
├── seed/
│   └── about.json
├── web/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── islands/
│   │   ├── layouts/
│   │   ├── lib/
│   │   ├── pages/
│   │   └── styles/
│   ├── astro.config.mjs
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── tsconfig.json
├── tests/
│   └── integration/
├── buf.yaml
├── buf.gen.yaml
├── go.mod
├── go.sum
├── Taskfile.yml
└── README.md
```

`internal/web/dist/` 是构建产物，不由人工维护，推荐不提交版本控制。

## 4. Go 模块边界

### 4.1 `cmd/snxq-server`

只负责进程入口：

1. 读取并校验配置。
2. 初始化日志。
3. 初始化数据库。
4. 执行 Migration 和 Seed。
5. 创建应用。
6. 启动 HTTP Server。
7. 处理优雅退出。

不包含命令解析、数据库查询或 HTTP 业务逻辑。

### 4.2 `internal/app`

负责组装依赖和应用生命周期：

```go
type App struct {
    Handler http.Handler
    Close   func(context.Context) error
}
```

连接 Bun 数据库、Content Repository、Command Service、ConnectRPC Handler 和静态资源 Handler。

### 4.3 `internal/command`

负责规范命令、别名、输入归一化、隐藏命令策略、有效命令数量以及命令到内容查询的映射。

首期只实现：

```text
about
关于
关于你
你是谁
```

以上输入都归一化为 `about`，命令数量按规范命令统计。

### 4.4 `internal/content`

定义与存储无关的领域模型和接口：

```go
type Repository interface {
    GetAbout(context.Context) (*About, error)
}
```

该层不知道 Bun、SQLite、PostgreSQL 或 Protobuf。

### 4.5 `internal/storage`

负责：

- 打开 SQLite/PostgreSQL。
- 配置连接池。
- 创建 Bun DB。
- 执行 Migration。
- 执行 Seed。
- 实现 `content.Repository`。

SQLite 与 PostgreSQL共享领域接口，但允许分别维护查询和迁移。

### 4.6 `internal/rpc`

负责协议适配：

```text
Protobuf Request
→ Command Service
→ Domain Result
→ Protobuf Response
```

该层不直接查询 Bun，也不实现命令别名规则。

### 4.7 `internal/web`

负责内嵌并服务 Astro 静态产物：

- 指纹资源使用长期缓存。
- HTML 使用 `no-cache`。
- 已存在文件直接返回。
- 目录路由查找对应 `index.html`。
- 找不到时返回 Astro 的 `404.html`。
- RPC 和健康检查路径不进入静态回退。

## 5. 前端模块边界

### 5.1 `web/src/pages`

Astro 静态路由：

```text
/                 命令入口首页
/content/about/   可索引的 About 页面
```

重要内容必须具有真实 URL，以支持 SEO、无 JavaScript 访问、分享和搜索引擎索引。

### 5.2 `web/src/islands/CommandConsole.tsx`

主要交互 Island，负责：

- 命令输入。
- 请求状态。
- 会话历史。
- 页面内内容窗口。
- 列表和详情导航。
- 焦点管理。

首期只渲染 About 窗口，但保留后续模板注册入口。

### 5.3 `web/src/components`

默认使用 Astro 静态组件，例如 Logo、背景、SEO、静态 About 页面和无 JavaScript 降级提示。

### 5.4 `web/src/lib/rpc`

封装 Connect-ES：

```ts
executeCommand(input: string): Promise<CommandView>
```

SolidJS 组件不直接创建 Transport，也不处理 Header 或 Protobuf 转换。

### 5.5 `web/src/lib/view-model`

把生成的 Protobuf 消息转换为稳定 UI View Model。生成代码不传播到全部视图组件。

### 5.6 依赖方向

```text
RPC → Command Service → Content Repository
                       ↓
                    Storage

Astro/Solid → RPC Adapter → Generated Protobuf Client
```

禁止：

```text
RPC Handler → Bun
Solid Component → Connect Transport
Command Parser → SQLite
Storage Model → 前端显示文案
```

## 6. Protobuf 契约

### 6.1 服务

```proto
syntax = "proto3";

package snxq.v1;

service CommandService {
  rpc ExecuteCommand(ExecuteCommandRequest)
      returns (ExecuteCommandResponse);
}
```

首期不设计详情 RPC。实现项目或文章详情时再引入 `GetContentDetail`。

### 6.2 请求

```proto
message ExecuteCommandRequest {
  string input = 1;
}
```

校验规则：

- Trim 后不能为空。
- UTF-8 长度不超过 120 个字符。
- 前端不传命令数量、语言或规范命令名。
- Request ID 由服务端生成。

### 6.3 响应

```proto
message ExecuteCommandResponse {
  string request_id = 1;
  bool valid = 2;
  string message = 3;
  optional WindowContent window = 4;
}
```

有效命令：

```text
valid = true
message = "已打开「关于」"
window = About 内容
```

无效命令：

```text
valid = false
message = "当前命令无效，总计支持 1 种命令。"
window = absent
```

无效命令是正常业务结果，不返回 RPC Error。

Connect Error 只用于：

- `invalid_argument`：协议校验失败。
- `failed_precondition`：有效命令对应内容缺失。
- `unavailable`：数据库或服务不可用。
- `deadline_exceeded`：请求超时。
- `internal`：未预期错误。

### 6.4 强类型窗口

```proto
message WindowContent {
  string id = 1;
  string title = 2;
  string subtitle = 3;
  optional google.protobuf.Timestamp updated_at = 4;

  oneof body {
    AboutContent about = 10;
  }
}
```

前端依据 `oneof` Case 选择模板，不使用标题字符串推断内容类型。已发布字段编号不得复用。

### 6.5 About 类型

```proto
message AboutContent {
  string display_name = 1;
  string handle = 2;
  string role = 3;
  string bio = 4;
  optional string location = 5;
  optional string status = 6;
  repeated string fields = 7;
  repeated ProfileLink links = 8;
}

message ProfileLink {
  string label = 1;
  string url = 2;
  ProfileLinkKind kind = 3;
}

enum ProfileLinkKind {
  PROFILE_LINK_KIND_UNSPECIFIED = 0;
  PROFILE_LINK_KIND_WEBSITE = 1;
  PROFILE_LINK_KIND_GITHUB = 2;
  PROFILE_LINK_KIND_EMAIL = 3;
  PROFILE_LINK_KIND_RSS = 4;
}
```

URL 校验：

- Website/GitHub/RSS 只允许 `https`。
- Email 只允许 `mailto`。
- 前端仍保留协议白名单。

## 7. About 数据库模型

```text
about_profiles
├── id
├── display_name
├── handle
├── role
├── bio
├── location
├── status
├── updated_at
└── is_active

about_fields
├── id
├── profile_id
├── value
└── sort_order

about_links
├── id
├── profile_id
├── label
├── url
├── kind
└── sort_order
```

规则：

- 同时只能存在一个活动 Profile。
- `handle` 非空。
- Field 和 Link 按 `sort_order` 排列。
- Repository 在一个查询上下文中读取 Profile、Fields 和 Links。
- SQLite 与 PostgreSQL 使用相同领域语义，但迁移 SQL 分开维护。

## 8. Seed

`seed/about.json` 由版本控制管理，示意结构：

```json
{
  "displayName": "晓琦",
  "handle": "snxq",
  "role": "builder · observer · internet resident",
  "bio": "在系统、工具与日常生活之间来回穿行。",
  "location": "UTC+8 · somewhere connected",
  "status": "正在建立更安静、更耐用的数字空间",
  "fields": [
    "软件工程",
    "自托管",
    "交互设计",
    "个人知识系统"
  ],
  "links": [
    {
      "label": "GitHub",
      "url": "https://github.com/example",
      "kind": "github"
    },
    {
      "label": "Email",
      "url": "mailto:hi@snxq.cc",
      "kind": "email"
    }
  ]
}
```

Seed 规则：

- 使用固定标识或唯一 Handle Upsert。
- 重复启动不产生重复数据。
- Fields 和 Links 在事务中整体替换。
- Seed 变更可审查和复现。
- Seed 失败则应用启动失败。
- 数据库保存 Seed 内容哈希；哈希未变化时跳过写入。

```text
seed_versions
├── name
├── content_hash
└── applied_at
```

## 9. About 完整数据流

```text
访客输入“关于你”
→ SolidJS CommandConsole
→ rpc.executeCommand("关于你")
→ Connect-ES / Protobuf
→ CommandService.ExecuteCommand
→ Protovalidate
→ Command Parser
→ canonical "about"
→ Content Service.GetAbout
→ Bun AboutRepository
→ SQLite about_* tables
→ Domain About
→ RPC Mapper
→ WindowContent.body.about
→ Connect Protocol
→ View Model Mapper
→ AboutWindow
```

## 10. 配置

服务通过环境变量和命令行参数接收配置，不依赖必须随二进制分发的配置文件。

```text
SNXQ_LISTEN_ADDR=:8080
SNXQ_DATABASE_DRIVER=sqlite
SNXQ_DATABASE_URL=.data/snxq.db
SNXQ_LOG_LEVEL=info
SNXQ_LOG_FORMAT=text
SNXQ_AUTO_MIGRATE=true
SNXQ_AUTO_SEED=true
SNXQ_SHUTDOWN_TIMEOUT=10s
```

正式环境：

```text
SNXQ_DATABASE_DRIVER=postgres
SNXQ_DATABASE_URL=postgres://snxq:***@127.0.0.1:5432/snxq
SNXQ_LOG_FORMAT=json
```

优先级：

```text
命令行参数 > 环境变量 > 编译时默认值
```

配置错误必须在启动时退出。

## 11. SQLite

使用纯 Go SQLite Driver，并在连接后执行：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

连接池：

```text
MaxOpenConns = 1
MaxIdleConns = 1
ConnMaxLifetime = 0
```

SQLite 文件默认位于 `.data/snxq.db`。应用可创建父目录，但不覆盖已有数据库。

## 12. PostgreSQL

正式环境使用 PostgreSQL。默认连接池：

```text
MaxOpenConns = 10
MaxIdleConns = 5
ConnMaxLifetime = 30m
ConnMaxIdleTime = 5m
```

启动阶段：连接、`PingContext`、Migration、Seed、应用组装、开始监听。数据库未就绪时进程启动失败，由 systemd 负责重启。

## 13. Migration

```text
migrations/
├── sqlite/
│   ├── 202607200001_create_about_profiles.tx.up.sql
│   └── 202607200001_create_about_profiles.tx.down.sql
└── postgres/
    ├── 202607200001_create_about_profiles.tx.up.sql
    └── 202607200001_create_about_profiles.tx.down.sql
```

Migration 通过 `go:embed` 内嵌。规则：

- 只加载当前数据库 Driver 的目录。
- 按版本执行。
- 默认事务化。
- Bun Migration 表记录版本。
- 正式启动只自动执行 Up。
- Down 仅用于明确的开发或运维命令。
- Migration 失败则不监听端口。

子命令：

```text
snxq-server migrate status
snxq-server migrate up
snxq-server migrate down
snxq-server migrate create <name>
```

## 14. 静态资源嵌入

Astro 使用静态输出。构建流程把 `web/dist` 同步到 `internal/web/dist`，由 Go 嵌入：

```go
//go:embed dist/*
var assets embed.FS
```

Go 构建前必须验证 `web/dist/index.html` 存在。

静态 Handler 顺序：

1. `/rpc/*` → ConnectRPC。
2. `/healthz`、`/readyz` → 健康检查。
3. 已存在静态文件直接返回。
4. 目录路由寻找 `index.html`。
5. 找不到时返回 `404.html`。
6. RPC 和健康路径不进入 HTML 回退。

缓存：

- `/_astro/*` 指纹资源：`public, max-age=31536000, immutable`。
- HTML：`no-cache`。
- Favicon/Manifest：`public, max-age=86400`。
- 支持 ETag、If-None-Match、HEAD 和正确 MIME Type。

首版由 Caddy 负责压缩；预生成 Brotli/Gzip 可作为后续优化。

## 15. 健康检查

### `/healthz`

只表示进程存活，不查询数据库：

```json
{"status":"ok"}
```

### `/readyz`

检查数据库、Migration、Seed 和嵌入首页。失败返回 HTTP 503，且不泄露内部错误。

## 16. 生命周期

收到 `SIGINT` 或 `SIGTERM`：

1. 停止接收新连接。
2. 在超时内执行 `http.Server.Shutdown`。
3. 等待 RPC 完成。
4. 关闭数据库连接池。
5. 刷新日志。
6. 正常退出。

超时后强制退出并记录阶段。

## 17. 错误处理

内部错误保留因果链，但不把 SQL、表名、路径、DSN、调用栈或内部包结构返回给浏览器。

```go
type ErrorCode string

const (
    ErrorCodeInvalidInput       ErrorCode = "invalid_input"
    ErrorCodeContentNotFound    ErrorCode = "content_not_found"
    ErrorCodeStorageUnavailable ErrorCode = "storage_unavailable"
    ErrorCodeInternal           ErrorCode = "internal"
)
```

映射：

- 无效命令：正常 RPC 结果，`valid=false`。
- 校验失败：`connect.CodeInvalidArgument`。
- 内容缺失：`connect.CodeFailedPrecondition`。
- 数据库不可用：`connect.CodeUnavailable`。
- 超时：`connect.CodeDeadlineExceeded`。
- 未预期错误：`connect.CodeInternal`。

前端使用稳定错误提示，不显示底层错误。

## 18. Request ID 与日志

服务端为每个请求生成时间有序 ULID，并放入：

- RPC 响应字段。
- 响应 Header。
- 结构化日志。
- 错误日志。
- 前端降级窗口。

使用 `log/slog`：本地 Text Handler，生产 JSON Handler。

默认不记录数据库连接串、密码、Token、完整 Header、访客 IP、User-Agent、未知命令原始文本或 About 内容字段。无效命令只记录输入长度和不可逆哈希。

## 19. Interceptor

顺序：

```text
Panic Recovery
→ Request ID
→ Timeout
→ Protovalidate
→ Structured Logging
→ Handler
```

- `ExecuteCommand` 服务端默认超时 2 秒。
- 浏览器默认超时 5 秒。
- Panic 对外映射为 `internal`，服务不退出。

## 20. OpenTelemetry

MVP 不要求部署 Collector，但保留标准接入点。可观测项：

- HTTP 和 ConnectRPC 请求耗时。
- 数据库查询耗时。
- 命令有效/无效计数。
- 活动请求数。
- Build 信息。

通过环境变量启用 OTLP；未配置时不创建后台导出任务。

禁止使用 Request ID、原始命令或错误文本作为 Metric Label。允许 RPC 方法、RPC Code、规范命令和数据库 Driver。

## 21. 安全

### RPC 输入

- Trim 后非空。
- 最大 120 个 UTF-8 字符。
- 不执行 Shell。
- 不把输入拼接进 SQL。
- 命令匹配只访问内存中的命令表。
- Bun 查询全部参数化。

### 内容输出

Seed 导入时限制字符串长度、URL Scheme、Link 数量、Field 数量、控制字符和枚举值。前端不使用 `innerHTML`。

### HTTP Header

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP：

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'none';
form-action 'self'
```

正式构建必须自托管字体，不依赖 Google Fonts。

生产前端和 RPC 同源，不开放通配 CORS。本地优先使用 Vite Proxy，也不需要 CORS。

### 数据库

SQLite 文件建议 `0600`，父目录建议 `0700`，并禁止静态 Handler 访问 `.data/`。

PostgreSQL 使用独立低权限用户，连接信息由权限为 `0600` 的 systemd EnvironmentFile 提供，日志不输出完整 DSN。

## 22. 测试策略

### Go

#### Command Parser

覆盖：

```text
about        → about
关于         → about
关于你       → about
你是谁       → about
"  about  "  → about
ABOUT        → about
unknown      → invalid
空白输入      → validation error
超过 120 字符 → validation error
```

命令数量按规范命令统计。

#### Content Service

Fake Repository 覆盖正常返回、Not Found、Repository Failure、Context Cancel，以及 Fields/Links 排序。

#### RPC Handler

使用真实 Connect HTTP Handler 验证有效命令、无效命令、校验错误、数据库错误、Request ID 和 `oneof about`。

#### Repository Contract

SQLite 使用临时数据库执行 Migration 与 Seed，验证数据、排序、幂等 Seed 和 Hash 更新。

PostgreSQL 在 CI 中运行同一套 Repository Contract，防止行为漂移。

### 前端

#### View Model Mapper

Vitest 覆盖 About `oneof`、无效命令、未知类型、Optional 字段、链接类型和 Timestamp。

#### SolidJS

Testing Library 覆盖加载状态、禁止重复提交、有效/无效响应、RPC Error、Escape、焦点约束、关闭后焦点恢复和会话历史不持久化。

#### Astro

验证首页、静态 About 页、SEO、无 JavaScript 内容和客户端 Bundle 范围。

#### Playwright

使用真实 Go、SQLite 和前端验证：

1. 首页加载。
2. `about` 命令。
3. 中文别名。
4. SQLite 数据展示。
5. 无效命令。
6. 键盘交互。
7. `390 × 844` 移动端。
8. 网络失败。
9. 静态 About URL。

## 23. 性能预算

### 首页资源

```text
客户端 JS Brotli ≤ 45 KiB
首屏关键 CSS Brotli ≤ 20 KiB
自托管首屏字体总量 ≤ 80 KiB
首屏图片总量 ≤ 100 KiB
```

### Web Vitals

```text
LCP  ≤ 1.5s
INP  ≤ 100ms
CLS  ≤ 0.02
TTFB ≤ 200ms
```

### RPC

同机数据库目标：

```text
ExecuteCommand p50 ≤ 10ms
ExecuteCommand p95 ≤ 30ms
```

CI 初期报告预算，稳定后超限升级为失败。

## 24. MVP 验收标准

### 构建

- `buf lint` 通过。
- `buf generate` 可重复执行。
- Astro 静态构建通过。
- Go 测试通过。
- 前端测试通过。
- 单二进制构建成功。
- 二进制包含前端、Migration 和 Seed。

### 本地开发

```bash
task dev
```

启动 Astro HMR、Go 自动重启、SQLite 初始化和 ConnectRPC。

### 生产运行

```bash
./snxq-server serve
```

自动执行 Migration、幂等 Seed、服务内嵌前端、响应健康检查和 ConnectRPC，并正确处理 `SIGTERM`。

### 用户路径

访客可打开首页，输入 `about` 或中文别名，经真实 ConnectRPC 从 SQLite 读取 About 并打开 SolidJS 页面内窗口；关闭后恢复焦点；无效命令显示后端返回的命令数量。

### 部署产物

```text
snxq-server
snxq-server.service
Caddyfile
snxq-server.env.example
```

PostgreSQL 是外部持久化依赖，不包含在应用交付物中。

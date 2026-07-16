# NestJS Production Scaffold

生产级 NestJS 脚手架，默认使用 Express 5，可通过环境变量切换 Fastify。内置：

- PostgreSQL / MySQL，通过 `DB_TYPE=postgres|mysql` 切换
- Redis 客户端
- RabbitMQ 发布与消费示例
- OpenAPI / Swagger
- JWT 鉴权、基于权限码的 RBAC（用户多角色、租户自定义角色）
- Access token + refresh token 模式，refresh token 存库并只保存哈希
- 请求级多租户隔离，默认通过 `x-tenant-id` 贯穿上下文
- 全局异常过滤器、局部异常过滤器示例
- 全局参数校验、响应包裹、限流、安全头、压缩
- 健康检查、Docker、Docker Compose、本地热更新
- 默认租户和管理员种子数据

## Quick Start

```bash
cp .env.example .env
npm install
docker compose -f docker-compose.dev.yml up -d postgres redis rabbitmq debezium
npm run start:dev
```

Swagger:

```text
http://localhost:3000/api/docs
```

健康检查:

```text
http://localhost:3000/api/health
```

## 默认账号

首次启动时，如果 `.env` 中 `SEED_ADMIN_ENABLED=true`，会创建：

```text
tenant slug: default
email: admin@example.com
password: change-me-123
role: system_admin（内置角色，不可修改或删除）
```

启动日志会输出默认租户 ID。登录后，受保护接口会优先使用 JWT 中的 `tenantId` 作为租户上下文。`x-tenant-id` 可以继续传，但只用于和 JWT 交叉校验：

```text
Authorization: Bearer <accessToken>
x-tenant-id: <tenantId> # optional after login; must match JWT tenantId when present
```

登录接口:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: <tenantId>' \
  -d '{"email":"admin@example.com","password":"change-me-123"}'
```

登录会返回当前租户下的角色和权限：

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {},
  "roles": ["system_admin"],
  "permissions": ["tenant.create", "user.read"]
}
```

也支持邮箱/手机号验证码登录。验证码存放在 Redis，默认 5 分钟有效、60 秒内不可重复发送，
验证成功后原子删除。开发环境默认将验证码写入应用日志；生产环境可以使用通用 Webhook，
或者阿里云短信与 DirectMail Provider：

```text
POST /api/auth/verification/email
POST /api/auth/verification/phone
POST /api/auth/login/email-code
POST /api/auth/login/phone-code
```

阿里云 Provider 使用官方 TypeScript V2 SDK。短信模板需要包含名为 `code` 的变量：

```env
VERIFY_CODE_PROVIDER=aliyun
ALIBABA_CLOUD_ACCESS_KEY_ID=your-access-key-id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your-access-key-secret
ALIYUN_SMS_SIGN_NAME=已审核的短信签名
ALIYUN_SMS_TEMPLATE_CODE=SMS_123456789
ALIYUN_MAIL_FROM_ADDRESS=noreply@example.com
ALIYUN_MAIL_FROM_NAME=NestJS Scaffold
```

也可设置 `VERIFY_CODE_PROVIDER=webhook` 和 `VERIFY_CODE_DELIVERY_WEBHOOK_URL` 保留原有通用
网关方式。未显式设置 Provider 时会按“阿里云凭证 → Webhook → 开发日志”自动选择；生产环境
没有可用 Provider 时应用拒绝启动。

验证码登录会自动注册新用户，并加入默认租户、授予 `member` 角色。已有用户只允许登录
自己已加入的租户。已登录用户可通过 `POST /api/auth/switch-tenant` 切换到另一个已有成员
关系的活跃租户；`GET /api/auth/my-access` 可刷新当前角色和权限。

`accessToken` 默认 2 小时过期，可通过 `JWT_EXPIRES_IN=2h` 调整。`refreshToken` 默认 30 天过期，可通过 `REFRESH_TOKEN_EXPIRES_IN_DAYS=30` 调整。

刷新 token:

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

刷新成功会返回新的 `accessToken` 和新的 `refreshToken`，旧 refresh token 会被吊销。refresh token 无效或过期时返回 `401`，响应体里的 `code` 可用于前端跳登录页：

```json
{
  "statusCode": 401,
  "message": "Refresh token has expired",
  "code": "REFRESH_TOKEN_EXPIRED"
}
```

退出登录:

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

## 切换 Fastify

```env
HTTP_ADAPTER=fastify
```

然后重启服务即可。启动入口位于 `src/main.ts`，Express/Fastify 的安全中间件分别使用 `helmet/compression` 与 `@fastify/helmet/@fastify/compress`。

## 切换 MySQL

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
```

Prisma schema 以 `prisma/schema.prisma`（PostgreSQL）为唯一源，MySQL 版本由脚本自动生成：

```bash
npm run prisma:schema:mysql
```

修改模型后只需编辑 `prisma/schema.prisma`，然后运行上述命令即可同步
`prisma-mysql/schema.prisma`。

本地启动 MySQL（含 migration 和 Debezium CDC）：

```bash
docker compose -f docker-compose.dev.yml --profile mysql up --build -d mysql redis rabbitmq migrate-mysql debezium-mysql swagger-ui
```

> **注意**：MySQL 模式下 migrate 和 debezium 使用独立服务名 `migrate-mysql` / `debezium-mysql`，与 Postgres 的 `migrate` / `debezium` 区分。两者共用 `mysql` profile，会强制使用 `DB_TYPE=mysql`、`DB_HOST=mysql`、`DB_PORT=3306`。
> Debezium MySQL 配置文件为 `docker/debezium/application-mysql.properties`，与 Postgres 的 `application.properties` 独立。

## Docker

开发模式:

```bash
docker compose -f docker-compose.dev.yml up --build
```

生产模式:

```bash
docker compose up --build -d
```

## 目录结构

```text
src/
  access/      当前租户角色/权限聚合与缓存
  auth/        密码/验证码登录、租户切换、JWT
  common/      装饰器、守卫、过滤器、拦截器、中间件
  config/      环境变量校验和应用配置
  database/    启动种子
  generated/   Prisma 自动生成（gitignored）
  health/      DB/Redis 健康检查
  notification/ 验证码日志、Webhook、阿里云短信和邮件 Provider
  permissions/ 权限字典模块
  prisma/      PrismaService、PrismaModule、健康指示器
  queue/       RabbitMQ 发布服务
  redis/       Redis 客户端
  roles/       内置与租户自定义角色模块
  tenancy/     租户服务和 AsyncLocalStorage 请求上下文
  users/       用户、租户成员关系和多角色分配
```

## 多租户与权限约定

`User` 是全局身份，租户归属由 `TenantMembership` 表表达；角色通过
`UserRoleAssignment(userId, tenantId, roleId)` 按租户分配，因此一个用户可加入多个租户，
并在每个租户拥有多个角色。业务查询必须从 `TenancyContext.requireTenantId()` 读取当前租户并
显式加入租户条件。全局 `TenantGuard` 会交叉校验 header 与 JWT 中的 `tenantId`。

内置角色为全局共享的 `system_admin`、`admin`、`member`、`viewer`，角色定义不可修改或删除；
`system_admin` 始终拥有全部启用权限，其权限不可关闭。全局内置 `admin`、`member`、`viewer`
的权限只能由 `system_admin` 配置，修改后对所有租户生效；自定义角色严格绑定当前租户。
控制器可以同时使用 `@Roles(...)` 和 `@Permissions(...)`：单独声明时
分别按角色或权限检查，同时声明时必须两项都通过。守卫从数据库/Redis 加载用户在当前租户
的访问范围；角色、角色权限、用户角色或权限发生变化后会自动删除相关缓存，下一次请求从
数据库重建。

`system_admin` 自动拥有全部启用权限；租户管理员创建角色、配置权限或给用户分配角色时，
只能授予自己当前拥有的权限，且不能授予 `system_admin`。`tenant.*` 属于不可委派的平台
权限，不能配置给租户自定义角色；租户管理接口同时要求 `system_admin` 角色及对应权限。

权限码是由 `PermissionCode` 和路由装饰器共同定义的代码契约，权限模块只提供只读字典，
不支持运行时新增、修改或删除。新增权限必须随代码版本发布，并由启动种子同步到数据库；
同步完成后会清空访问缓存。租户的自定义能力通过“自定义角色 + 静态权限组合”实现。

`GET /api/roles/:id/permissions` 返回全局全部启用权限，并通过 `granted` 表示该角色是否拥有、
`configurable` 表示当前操作者能否切换。`PATCH /api/roles/:id/permissions/:permissionId` 用于
单个开关，`PUT /api/roles/:id/permissions` 接收完整的已启用权限 ID 集合用于批量配置。角色权限
修改后立即清理对应租户缓存；全局内置角色修改后清理全部访问缓存。登录、刷新 token 和切换
租户均通过同一访问范围解析逻辑返回最新的 `roles`、`permissions`。

服务层保留 `system_admin`、`admin`、`member`、`viewer` 这些鉴权用角色 `code`：自定义角色
不能使用这些 code。展示字段 `name` 不作为保留值，可按产品语言自由命名。项目按全新数据库
初始化，migration 完全由最终 Prisma schema 生成；内置角色和权限数据由 Seed 同步。

租户管理权限只授予 `system_admin`；普通租户 `admin` 只能管理当前租户的用户与角色。

## 索引约定

当前初始 schema 已包含基础索引：

- `tenants.slug` 唯一索引，用于租户 slug 查找
- `users.email`、`users(countryCode, phone)` 唯一约束，用于全局登录身份
- `tenant_memberships(tenantId, active, createdAt)`，用于租户成员列表
- `user_role_assignments(tenantId, roleId)`，用于按租户解析多角色
- `refresh_tokens.tokenHash` 唯一索引，用于 refresh token 校验
- `refresh_tokens(userId, revokedAt, expiresAt)` 复合索引，用于用户 token 管理和过期 token 清理

新增业务模块时，不建议只给单列盲目加索引。优先根据查询条件和排序方向设计复合索引，例如多租户表常见模式是：

```text
(tenantId, status, createdAt)
(tenantId, userId, createdAt)
(tenantId, externalId)
```

## 常用命令

```bash
npm run build                    # prisma generate && nest build
npm run lint                     # eslint --fix
npm run test                     # jest
npm run start:dev                # prisma generate && nest start --watch
npm run prisma:generate          # 重新生成 Prisma Client
npm run prisma:migrate:dev       # 开发环境创建 migration
npm run prisma:migrate:deploy    # 生产环境应用 migration
npm run prisma:studio            # 可视化数据库浏览器
```

## Migration 模式

项目使用 Prisma Migrate 管理表结构。Schema 文件位于：

- PostgreSQL：`prisma/schema.prisma`
- MySQL：`prisma-mysql/schema.prisma`

Migration 文件分别存放在 `prisma/migrations/`（PostgreSQL）和 `prisma/migrations-mysql/`（MySQL）。`prisma.config.ts` 根据 `DB_TYPE` 自动选择对应的 schema 和 migration 目录。

本次 PostgreSQL 升级会把旧表中跨租户重复的邮箱（忽略大小写）合并为一个全局用户身份，
并保留所有租户成员关系、角色、refresh token 与用户 outbox 事件引用。上线前应先备份数据库，
并确认这些同邮箱记录确实代表同一个登录身份。

### 开发环境

修改 schema 后，生成新的 migration：

```bash
# PostgreSQL
npm run prisma:migrate:dev

# MySQL（先同步 schema，再生成 migration）
npm run prisma:schema:mysql
DB_TYPE=mysql DATABASE_URL=mysql://... npm run prisma:migrate:dev
```

### 生产环境

生产 Docker Compose 内置了一个一次性 `migrate` 服务，`api` 会等待 `migrate` 成功后再启动：

```bash
docker compose up --build -d
```

也可以显式只跑 migration：

```bash
docker compose run --rm migrate
```

开发 Compose 里也提供了 `migrate` 服务：

```bash
docker compose -f docker-compose.dev.yml run --rm migrate
```

手动部署 migration：

```bash
npm run prisma:migrate:deploy
```

## RabbitMQ 消费示例

当前项目的消息链路已经切到 `transactional outbox + CDC`。`UsersService.create()` 会在同一个数据库事务里写入 `users` 和 `outbox_events`，Debezium 监听数据库 binlog/WAL 后，再把 outbox 事件投递到 RabbitMQ。应用内的 `RabbitmqConsumer` 最终仍然从 `RABBITMQ_QUEUE` 消费，并按 `routingKey` 分发到 handler：

```text
src/queue/rabbitmq.consumer.ts
src/queue/handlers/user-created.handler.ts
src/queue/events/user-created.event.ts
```

默认拓扑如下：

```text
PostgreSQL/MySQL outbox_events
  -> Debezium Outbox Event Router
  -> RabbitMQ exchange: app.events (topic)
  -> queue: app.events
  -> dead-letter queue: app.events.dlq
```

消费者失败时消息会 `nack` 且不重新入队，并进入默认死信队列：

```text
${RABBITMQ_QUEUE}.dlq
```

如果只想让 API 发布消息，不在当前进程消费，可设置：

```env
RABBITMQ_CONSUMER_ENABLED=false
```

## Debezium CDC

项目内置了一套 `Debezium Server -> RabbitMQ` 的落地配置，默认针对 PostgreSQL：

```text
docker/debezium/application.properties
docker/rabbitmq/definitions.json
docker/rabbitmq/rabbitmq.conf
docker-compose.yml
docker-compose.dev.yml
```

### Outbox 约定

Debezium 的 Outbox Event Router 已按当前 `outbox_events` 表结构做了映射：

```text
id           -> 事件 ID
aggregateId  -> 消息 key
routingKey   -> RabbitMQ routing key
payload      -> 消息体
createdAt    -> publishedAt
tenantId     -> 额外放入 envelope
aggregateType -> 额外放入 envelope
```

因此 `UsersService.create()` 写出的 outbox 记录会被 Debezium 路由成类似下面的 RabbitMQ 消息：

```json
{
  "userId": "uuid",
  "tenantId": "tenant-id",
  "email": "john@example.com",
  "occurredAt": "2026-06-02T00:00:00.000Z",
  "aggregateType": "user",
  "aggregateId": "uuid",
  "publishedAt": "2026-06-02T00:00:00.000Z"
}
```

RabbitMQ routing key 会使用 outbox 表中的 `routingKey`，例如 `user.created`。

### 开发环境启动

先准备环境变量：

```bash
cp .env.example .env
```

然后确保以下配置启用：

```env
DB_TYPE=postgres
RABBITMQ_EXCHANGE=app.events
RABBITMQ_EXCHANGE_TYPE=topic
RABBITMQ_BINDING_KEY=#
RABBITMQ_QUEUE=app.events
```

启动开发依赖和 Debezium：

```bash
docker compose -f docker-compose.dev.yml --profile cdc up -d postgres redis rabbitmq debezium
docker compose -f docker-compose.dev.yml run --rm migrate
npm run start:dev
```

如果要一把启动完整开发环境：

```bash
docker compose -f docker-compose.dev.yml --profile cdc up --build
```

### 生产 Compose

生产模式也内置了 CDC profile：

```bash
docker compose --profile cdc up --build -d
```

### PostgreSQL 要求

PostgreSQL CDC 依赖逻辑复制。Compose 已自动附带：

```text
wal_level=logical
max_wal_senders=10
max_replication_slots=10
```

Debezium 默认配置：

```env
DEBEZIUM_SOURCE_CONNECTOR_CLASS=io.debezium.connector.postgresql.PostgresConnector
DEBEZIUM_SOURCE_PLUGIN_NAME=pgoutput
DEBEZIUM_SOURCE_SLOT_NAME=nestjs_outbox
DEBEZIUM_SOURCE_PUBLICATION_NAME=nestjs_outbox_pub
DEBEZIUM_SOURCE_TABLE_INCLUDE_LIST=public.outbox_events
```

### MySQL 要求

如果切换到 MySQL，需要使用 binlog，并把 Debezium connector 切到 MySQL：

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DEBEZIUM_SOURCE_CONNECTOR_CLASS=io.debezium.connector.mysql.MySqlConnector
DEBEZIUM_SOURCE_DATABASE_HOST=mysql
DEBEZIUM_SOURCE_DATABASE_PORT=3306
DEBEZIUM_SOURCE_TABLE_INCLUDE_LIST=app.outbox_events
```

Compose 已为 MySQL 容器打开：

```text
log-bin=mysql-bin
binlog-format=ROW
binlog-row-image=FULL
```

MySQL 用户需要有 `REPLICATION CLIENT` 权限才能让 Debezium 读取 binlog。首次启动后执行一次：

```bash
docker compose -f docker-compose.dev.yml exec mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD:-root}" -e \
  "GRANT REPLICATION CLIENT, REPLICATION SLAVE ON *.* TO \`app\`@'%'; FLUSH PRIVILEGES;"
```

> 也支持 `REPLICATION SLAVE`，Debezium MySQL connector 在某些快照模式下需要用到。

启动示例：

```bash
# 开发环境（MySQL + CDC）
docker compose -f docker-compose.dev.yml --profile mysql up --build -d mysql redis rabbitmq migrate-mysql debezium-mysql swagger-ui

# 生产环境（MySQL + CDC）
docker compose --profile mysql up --build -d
```

### 验证 CDC 是否生效

1. 先启动 API、数据库、RabbitMQ、Debezium
2. 调用创建用户接口
3. 确认 `outbox_events` 表新增了一条记录
4. 打开 RabbitMQ 管理台 [http://localhost:15672](http://localhost:15672)
5. 查看 `app.events` 队列消息增长或被消费者消费
6. 查看 Debezium 健康检查 [http://localhost:8080/q/health](http://localhost:8080/q/health)

### 运行建议

- 生产环境统一走 Prisma Migrate（`prisma migrate deploy`）
- Outbox 和 CDC 语义通常是 at-least-once，下游消费者应保持幂等
- 如果后续需要按事件类型拆分队列，可以新增 RabbitMQ binding，例如 `user.*`
- 如果要把 Debezium 发出的 routing key 精细路由到多队列，建议为每个消费组单独建队列并绑定 `app.events` topic exchange

# NestJS Production Scaffold

生产级 NestJS 脚手架，默认使用 Express 5，可通过环境变量切换 Fastify。内置：

- PostgreSQL / MySQL，通过 `DB_TYPE=postgres|mysql` 切换
- Redis 客户端
- RabbitMQ 发布与消费示例
- OpenAPI / Swagger
- JWT 鉴权、RBAC 角色守卫
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
role: system_admin
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

登录会返回：

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {}
}
```

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
  auth/        JWT 登录、策略、DTO
  common/      装饰器、守卫、过滤器、拦截器、中间件
  config/      环境变量校验和应用配置
  database/    TypeORM 配置、启动种子
  health/      DB/Redis 健康检查
  queue/       RabbitMQ 发布服务
  redis/       Redis 客户端
  tenancy/     租户实体和 AsyncLocalStorage 请求上下文
  users/       多租户用户示例模块
```

## 多租户约定

所有实体主键默认继承 `UuidV7Entity`，使用应用层生成的 UUID v7，兼顾分布式 ID 与索引写入局部性。所有租户隔离实体继承 `TenantScopedEntity` 并带 `tenantId` 字段。业务查询必须从 `TenancyContext.requireTenantId()` 读取当前租户并显式加入 `where` 条件。全局 `TenantGuard` 会拒绝缺失租户头或 token 租户与请求租户不一致的请求。

## 索引约定

租户管理接口属于平台级能力，只允许 `system_admin` 访问；普通租户 `admin` 只能管理当前租户下的用户。

当前初始 schema 已包含基础索引：

- `tenants.slug` 唯一索引，用于租户 slug 查找
- `users(tenantId, email)` 唯一约束，用于同租户内邮箱唯一和登录查询
- `users(tenantId, active, createdAt)` 复合索引，用于租户用户列表
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
npm run build
npm run lint
npm run test
npm run migration:generate -- src/database/migrations/Init
npm run migration:run
npm run migration:run:prod
```

## Migration 模式

开发初期可以用：

```env
DB_SYNCHRONIZE=true
```

如果要改成 migration 管理表结构，建议：

```env
DB_SYNCHRONIZE=false
```

然后执行：

```bash
npm run migration:run
```

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

项目内置了一个初始 migration 示例：

```text
src/database/migrations/1764576000000-InitSchema.ts
```

后续修改 entity 后，可以生成新的 migration：

```bash
npm run migration:generate -- src/database/migrations/AddOrders
```

## RabbitMQ 消费示例

当前项目的消息链路已经切到 `transactional outbox + CDC`。`UsersService.create()` 会在同一个数据库事务里写入 `users` 和 `outbox_events`，Debezium 监听数据库 binlog/WAL 后，再把 outbox 事件投递到 RabbitMQ。应用内的 `RabbitmqConsumer` 最终仍然从 `RABBITMQ_QUEUE` 消费，并按 `routingKey` 分发到 handler：

```text
src/queue/rabbitmq.consumer.ts
src/queue/handlers/user-created.handler.ts
src/queue/events/user-created.event.ts
src/queue/outbox-event.entity.ts
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
DB_SYNCHRONIZE=false
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

- 生产环境建议 `DB_SYNCHRONIZE=false`，统一走 migration
- Outbox 和 CDC 语义通常是 at-least-once，下游消费者应保持幂等
- 如果后续需要按事件类型拆分队列，可以新增 RabbitMQ binding，例如 `user.*`
- 如果要把 Debezium 发出的 routing key 精细路由到多队列，建议为每个消费组单独建队列并绑定 `app.events` topic exchange

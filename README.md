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
docker compose -f docker-compose.dev.yml up -d postgres redis rabbitmq
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
```

启动日志会输出默认租户 ID。调用受保护接口时需要：

```text
Authorization: Bearer <accessToken>
x-tenant-id: <tenantId>
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

本地启动 MySQL:

```bash
docker compose -f docker-compose.dev.yml --profile mysql up -d mysql redis rabbitmq
```

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

`UsersService.create()` 创建用户后会发布 `user.created` 事件。`RabbitmqConsumer` 会消费 `RABBITMQ_QUEUE`，根据 `routingKey` 分发到对应 handler：

```text
src/queue/rabbitmq.consumer.ts
src/queue/handlers/user-created.handler.ts
src/queue/events/user-created.event.ts
```

消费失败时消息会 `nack` 且不重新入队，并进入默认死信队列：

```text
${RABBITMQ_QUEUE}.dlq
```

如果只想让 API 发布消息，不在当前进程消费，可设置：

```env
RABBITMQ_CONSUMER_ENABLED=false
```

# NestJS Production Scaffold

生产级 NestJS 脚手架，默认使用 Express 5，可通过环境变量切换 Fastify。内置：

- PostgreSQL / MySQL，通过 `DB_TYPE=postgres|mysql` 切换
- Redis 客户端
- RabbitMQ 发布服务
- OpenAPI / Swagger
- JWT 鉴权、RBAC 角色守卫
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

所有租户隔离实体继承 `TenantScopedEntity` 并带 `tenantId` 字段。业务查询必须从 `TenancyContext.requireTenantId()` 读取当前租户并显式加入 `where` 条件。全局 `TenantGuard` 会拒绝缺失租户头或 token 租户与请求租户不一致的请求。

## 常用命令

```bash
npm run build
npm run lint
npm run test
npm run migration:generate -- src/database/migrations/Init
npm run migration:run
```

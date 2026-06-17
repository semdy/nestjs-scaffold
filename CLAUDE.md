# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build                    # nest build
npm run lint                     # eslint {src,test}/**/*.ts --fix
npm run test                     # jest
npm run test -- --testPathPattern auth.service  # single test file
npm run start:dev                # nest start --watch
npm run migration:generate -- src/database/migrations/AddOrders
npm run migration:run            # local migration run (ts-node)
npm run migration:run:prod       # production migration run (compiled JS)
npm run migration:revert
```

## Architecture

### Request lifecycle

Each HTTP request flows through:

1. `RequestContextMiddleware` → extracts `x-tenant-id` (or resolves via subdomain), generates `requestId`, runs callback inside `AsyncLocalStorage` store containing `{ requestId, tenantId }`
2. `ValidationPipe` (global) → whitelist + transform
3. `ThrottlerGuard` → rate limiting
4. `JwtAuthGuard` → validates access token, sets `req.user`
5. `TenantGuard` → enforces `x-tenant-id` matches JWT tenant claim; skips public routes (`@Public()` decorator or health endpoint)
6. `RolesGuard` → enforces `@Roles()` RBAC
7. `ResponseEnvelopeInterceptor` → wraps all responses in `{ success: true, requestId, data }`
8. `AllExceptionsFilter` → catches unhandled exceptions, returns structured error with `requestId`, `tenantId`, and `code` field

### Tenancy

Tenant isolation is request-scoped via `AsyncLocalStorage`. The `TenancyContext` service (injectable) wraps `tenantStore.getStore()`:

- `requireTenantId()` — returns current tenant or throws
- `tenantId` / `requestId` — nullable getters

All tenant-scoped entities extend `TenantScopedEntity` which adds a `tenantId` column and inherits `UuidV7Entity` (UUID v7 primary key generated at app layer). Business queries **must** explicitly include `tenantId` in WHERE — there's no automatic row-level filtering.

The `CurrentTenant` param decorator reads `tenantStore.getStore()?.tenantId` from the AsyncLocalStorage store directly (no DI needed).

### CDC pipeline (Outbox → RabbitMQ)

```
UsersService.create()
  → DB transaction (users + outbox_events)
  → Debezium tails MySQL binlog / PostgreSQL WAL
  → Outbox Event Router transform (routing by routingKey field)
  → RabbitMQ exchange: app.events (topic)
  → queue: app.events (# binding)
  → RabbitmqConsumer.dispatch()
  → IdempotencyService (Redis SETNX, 7-day TTL)
  → ProcessedEvent insert (DB dedup by PK)
  → handler dispatch by routingKey
```

Consumer config is toggleable:
- `RABBITMQ_CONSUMER_ENABLED=false` — publish only, don't consume
- `RABBITMQ_DLQ_CONSUMER_ENABLED=false` — don't consume dead-letter queue

Consumer uses retry queues with exponential TTL: `{queue}.retry.1` (5s), `{queue}.retry.2` (25s). After max retries, messages go to DLQ `{queue}.dlq`.

### Debezium MySQL configuration (critical)

When switching to MySQL CDC, these rules apply:

1. **Remove `env_file`** from `debezium-mysql` docker-compose service. The `.env` file contains Postgres-specific defaults (`DEBEZIUM_SOURCE_TABLE_INCLUDE_LIST=public.outbox_events`, `DEBEZIUM_SOURCE_SCHEMA_INCLUDE_LIST=public`, etc.) that silently leak into the MySQL connector through `env_file`, overriding correct values.

2. **Do NOT set `schema.include.list`** — the MySQL connector has a bug where setting both `schema.include.list` and `table.include.list` causes the table filter to break, either matching wrong tables or matching nothing at all.

3. **Do NOT set `table.field.event.timestamp`** in the outbox transform config. MySQL `timestamp` columns map to string types in Debezium, but the outbox transform expects `INT64` with a logical schema name. Omitting `table.field.event.timestamp` makes Debezium use the source record's metadata timestamp instead, avoiding the type mismatch entirely.

4. The MySQL user needs `REPLICATION CLIENT` and `REPLICATION SLAVE` privileges:
   ```sql
   GRANT REPLICATION CLIENT, REPLICATION SLAVE ON *.* TO 'app'@'%';
   ```

5. MySQL table names in Debezium config use the format `database.table` (e.g. `app.outbox_events`), not `schema.table`.

### Database switching

`DB_TYPE=postgres|mysql` controls the TypeORM dialect. The `typeorm.config.ts` reads `process.env.DB_TYPE` directly (not through `ConfigService`) because TypeORM's `DataSource` needs static options for CLI migration commands. All five entities are registered in `dataSourceOptions.entities`.

Migrations live in `src/database/migrations/`. They're referenced by the TypeORM CLI (`ts-node`) and compiled to `dist/database/migrations/` for production runs.

### HTTP adapter switching

`HTTP_ADAPTER=express|fastify` in `main.ts`. The bootstrap function chooses between `NestExpressApplication` and `NestFastifyApplication`. Security middleware differs per adapter: Express uses `helmet` + `compression`, Fastify uses `@fastify/helmet` + `@fastify/compress` (dynamic imports to avoid loading Fastify packages in Express mode).

### Swagger / OpenAPI export

`SWAGGER_ENABLED=true` serves Swagger UI at `/{globalPrefix}/{swaggerPath}`. `OPENAPI_EXPORT=true` writes `openapi.json` to `{OPENAPI_SPEC_DIR}`. Both can be enabled simultaneously. Swagger setup adds Bearer auth and tenant API key security requirements.

The production docker-compose has `SWAGGER_ENABLED=false` but `OPENAPI_EXPORT=true`, writing the spec to a shared volume consumed by the `swagger-ui` service.

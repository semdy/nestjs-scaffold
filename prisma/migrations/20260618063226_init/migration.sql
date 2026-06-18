-- CreateTable
CREATE TABLE "tenants" (
    "id" VARCHAR(36) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(30) NOT NULL DEFAULT 'member',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "userId" VARCHAR(36) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "revokedAt" TIMESTAMP,
    "replacedByTokenId" VARCHAR(36),
    "userAgent" VARCHAR(512),
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "aggregateType" VARCHAR(80) NOT NULL,
    "aggregateId" VARCHAR(36) NOT NULL,
    "routingKey" VARCHAR(120) NOT NULL,
    "payload" JSON NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" VARCHAR(36) NOT NULL,
    "routingKey" VARCHAR(120) NOT NULL,
    "processedAt" TIMESTAMP NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "IDX_tenants_slug" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "IDX_users_tenant_id" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "IDX_users_tenant_active_created_at" ON "users"("tenantId", "active", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_users_tenant_email" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "IDX_refresh_tokens_tenant_id" ON "refresh_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "IDX_refresh_tokens_user_revoked_expires" ON "refresh_tokens"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "IDX_outbox_events_tenant_created_at" ON "outbox_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "IDX_outbox_events_aggregate" ON "outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "IDX_outbox_events_routing_key_created_at" ON "outbox_events"("routingKey", "createdAt");

-- CreateIndex
CREATE INDEX "IDX_processed_events_expires" ON "processed_events"("expiresAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

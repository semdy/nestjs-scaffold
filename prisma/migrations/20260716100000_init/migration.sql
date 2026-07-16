-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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
    "email" VARCHAR(180),
    "phone" VARCHAR(32),
    "countryCode" VARCHAR(8),
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "userId" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("userId","tenantId")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" VARCHAR(36) NOT NULL,
    "permissionId" VARCHAR(36) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "userId" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "roleId" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("userId","tenantId","roleId")
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
CREATE UNIQUE INDEX "UQ_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "IDX_users_active_created_at" ON "users"("active", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_users_country_phone" ON "users"("countryCode", "phone");

-- CreateIndex
CREATE INDEX "IDX_memberships_tenant_active_created_at" ON "tenant_memberships"("tenantId", "active", "createdAt");

-- CreateIndex
CREATE INDEX "IDX_roles_tenant_enabled_code" ON "roles"("tenantId", "enabled", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_roles_tenant_code" ON "roles"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_permissions_code" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "IDX_permissions_enabled_code" ON "permissions"("enabled", "code");

-- CreateIndex
CREATE INDEX "IDX_role_permissions_permission_id" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "IDX_user_roles_tenant_role" ON "user_role_assignments"("tenantId", "roleId");

-- CreateIndex
CREATE INDEX "IDX_user_roles_role_id" ON "user_role_assignments"("roleId");

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
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

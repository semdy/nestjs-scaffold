-- Split tenant membership and authorization data out of users.
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(32), ADD COLUMN "countryCode" VARCHAR(8);
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "tenant_memberships" (
  "userId" VARCHAR(36) NOT NULL,
  "tenantId" VARCHAR(36) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("userId", "tenantId"),
  CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "roles" (
  "id" VARCHAR(36) NOT NULL,
  "tenantId" VARCHAR(36),
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(255) NOT NULL DEFAULT '',
  "builtIn" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "permissions" (
  "id" VARCHAR(36) NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(255) NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "roleId" VARCHAR(36) NOT NULL,
  "permissionId" VARCHAR(36) NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "user_role_assignments" (
  "userId" VARCHAR(36) NOT NULL,
  "tenantId" VARCHAR(36) NOT NULL,
  "roleId" VARCHAR(36) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("userId", "tenantId", "roleId"),
  CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_role_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UQ_roles_tenant_code" ON "roles"("tenantId", "code");
CREATE INDEX "IDX_roles_tenant_enabled_code" ON "roles"("tenantId", "enabled", "code");
CREATE UNIQUE INDEX "UQ_permissions_code" ON "permissions"("code");
CREATE INDEX "IDX_permissions_enabled_code" ON "permissions"("enabled", "code");
CREATE INDEX "IDX_role_permissions_permission_id" ON "role_permissions"("permissionId");
CREATE INDEX "IDX_user_roles_tenant_role" ON "user_role_assignments"("tenantId", "roleId");
CREATE INDEX "IDX_user_roles_role_id" ON "user_role_assignments"("roleId");
CREATE INDEX "IDX_memberships_tenant_active_created_at" ON "tenant_memberships"("tenantId", "active", "createdAt");

-- Deterministic built-in role IDs make the legacy role backfill repeatable.
INSERT INTO "roles" ("id", "code", "name", "builtIn") VALUES
  ('00000000-0000-7000-8000-000000000001', 'system_admin', 'System Administrator', true),
  ('00000000-0000-7000-8000-000000000002', 'admin', 'Tenant Administrator', true),
  ('00000000-0000-7000-8000-000000000003', 'member', 'Member', true),
  ('00000000-0000-7000-8000-000000000004', 'viewer', 'Viewer', true);

INSERT INTO "tenant_memberships" ("userId", "tenantId", "active", "createdAt", "updatedAt")
SELECT "id", "tenantId", "active", "createdAt", "updatedAt" FROM "users";

INSERT INTO "user_role_assignments" ("userId", "tenantId", "roleId")
SELECT u."id", u."tenantId",
  CASE u."role"
    WHEN 'system_admin' THEN '00000000-0000-7000-8000-000000000001'
    WHEN 'admin' THEN '00000000-0000-7000-8000-000000000002'
    WHEN 'viewer' THEN '00000000-0000-7000-8000-000000000004'
    ELSE '00000000-0000-7000-8000-000000000003'
  END
FROM "users" u;

-- The old model allowed the same email in different tenants. Consolidate those
-- rows into one global identity while retaining every membership and role.
WITH identity_map AS (
  SELECT "id", MIN("id") OVER (PARTITION BY LOWER("email")) AS canonical_id
  FROM "users" WHERE "email" IS NOT NULL
)
INSERT INTO "tenant_memberships" ("userId", "tenantId", "active", "createdAt", "updatedAt")
SELECT m.canonical_id, tm."tenantId", tm."active", tm."createdAt", tm."updatedAt"
FROM identity_map m
JOIN "tenant_memberships" tm ON tm."userId" = m."id"
WHERE m."id" <> m.canonical_id
ON CONFLICT ("userId", "tenantId") DO UPDATE
SET "active" = "tenant_memberships"."active" OR EXCLUDED."active";

WITH identity_map AS (
  SELECT "id", MIN("id") OVER (PARTITION BY LOWER("email")) AS canonical_id
  FROM "users" WHERE "email" IS NOT NULL
)
INSERT INTO "user_role_assignments" ("userId", "tenantId", "roleId", "createdAt")
SELECT m.canonical_id, a."tenantId", a."roleId", a."createdAt"
FROM identity_map m
JOIN "user_role_assignments" a ON a."userId" = m."id"
WHERE m."id" <> m.canonical_id
ON CONFLICT ("userId", "tenantId", "roleId") DO NOTHING;

WITH identity_state AS (
  SELECT LOWER("email") AS normalized_email, BOOL_OR("active") AS any_active
  FROM "users" WHERE "email" IS NOT NULL GROUP BY LOWER("email")
), canonical AS (
  SELECT MIN("id") AS canonical_id, LOWER("email") AS normalized_email
  FROM "users" WHERE "email" IS NOT NULL GROUP BY LOWER("email")
)
UPDATE "users" u SET "active" = s.any_active
FROM identity_state s JOIN canonical c USING (normalized_email)
WHERE u."id" = c.canonical_id;

WITH identity_map AS (
  SELECT "id", MIN("id") OVER (PARTITION BY LOWER("email")) AS canonical_id
  FROM "users" WHERE "email" IS NOT NULL
)
UPDATE "refresh_tokens" t SET "userId" = m.canonical_id
FROM identity_map m WHERE t."userId" = m."id" AND m."id" <> m.canonical_id;

WITH identity_map AS (
  SELECT "id", MIN("id") OVER (PARTITION BY LOWER("email")) AS canonical_id
  FROM "users" WHERE "email" IS NOT NULL
)
UPDATE "outbox_events" e
SET "aggregateId" = m.canonical_id,
    "payload" = jsonb_set(e."payload"::jsonb, '{userId}', to_jsonb(m.canonical_id), true)::json
FROM identity_map m
WHERE e."aggregateType" = 'user' AND e."aggregateId" = m."id" AND m."id" <> m.canonical_id;

WITH identity_map AS (
  SELECT "id", MIN("id") OVER (PARTITION BY LOWER("email")) AS canonical_id
  FROM "users" WHERE "email" IS NOT NULL
)
DELETE FROM "users" u USING identity_map m
WHERE u."id" = m."id" AND m."id" <> m.canonical_id;

UPDATE "users" SET "email" = LOWER("email") WHERE "email" IS NOT NULL;

ALTER TABLE "users" DROP CONSTRAINT "users_tenantId_fkey";
DROP INDEX "IDX_users_tenant_id";
DROP INDEX "IDX_users_tenant_active_created_at";
DROP INDEX "UQ_users_tenant_email";
ALTER TABLE "users" DROP COLUMN "tenantId", DROP COLUMN "role";
CREATE UNIQUE INDEX "UQ_users_email" ON "users"("email");
CREATE UNIQUE INDEX "UQ_users_country_phone" ON "users"("countryCode", "phone");
CREATE INDEX "IDX_users_active_created_at" ON "users"("active", "createdAt");

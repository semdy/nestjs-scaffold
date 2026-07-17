-- Prevent tenant-scoped custom roles from using globally reserved built-in role codes.
ALTER TABLE "roles"
ADD CONSTRAINT "CK_roles_reserved_builtin_codes"
CHECK (
    "tenant_id" IS NULL
    OR LOWER("code") NOT IN ('system_admin', 'admin', 'member', 'viewer')
);

-- MySQL does not allow a CHECK constraint to reference tenant_id while that column
-- participates in a cascading foreign key. Triggers provide the equivalent
-- database-level protection without changing the foreign key behavior.
CREATE TRIGGER `TR_roles_reserved_builtin_codes_insert`
BEFORE INSERT ON `roles`
FOR EACH ROW
BEGIN
    IF NEW.`tenant_id` IS NOT NULL
       AND LOWER(NEW.`code`) IN ('system_admin', 'admin', 'member', 'viewer') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tenant roles cannot use a reserved built-in role code';
    END IF;
END;

CREATE TRIGGER `TR_roles_reserved_builtin_codes_update`
BEFORE UPDATE ON `roles`
FOR EACH ROW
BEGIN
    IF NEW.`tenant_id` IS NOT NULL
       AND LOWER(NEW.`code`) IN ('system_admin', 'admin', 'member', 'viewer') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tenant roles cannot use a reserved built-in role code';
    END IF;
END;

import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitSchema1764576000000 implements MigrationInterface {
  name = 'InitSchema1764576000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'slug', type: 'varchar', length: '120', isNullable: false },
          { name: 'name', type: 'varchar', length: '160', isNullable: false },
          { name: 'active', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'tenants',
      new TableIndex({ name: 'IDX_tenants_slug', columnNames: ['slug'], isUnique: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'tenantId', type: 'varchar', length: '36', isNullable: false },
          { name: 'email', type: 'varchar', length: '180', isNullable: false },
          { name: 'name', type: 'varchar', length: '120', isNullable: false },
          { name: 'passwordHash', type: 'varchar', isNullable: false },
          { name: 'role', type: 'varchar', length: '30', default: "'member'" },
          { name: 'active', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndices('users', [
      new TableIndex({ name: 'IDX_users_tenant_id', columnNames: ['tenantId'] }),
      new TableIndex({
        name: 'IDX_users_tenant_active_created_at',
        columnNames: ['tenantId', 'active', 'createdAt'],
      }),
    ]);
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'UQ_users_tenant_email',
        columnNames: ['tenantId', 'email'],
        isUnique: true,
      }),
    );
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'FK_users_tenant_id',
        columnNames: ['tenantId'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'tenantId', type: 'varchar', length: '36', isNullable: false },
          { name: 'userId', type: 'varchar', length: '36', isNullable: false },
          { name: 'tokenHash', type: 'varchar', length: '64', isNullable: false },
          { name: 'expiresAt', type: 'timestamp', isNullable: false },
          { name: 'revokedAt', type: 'timestamp', isNullable: true },
          { name: 'replacedByTokenId', type: 'varchar', length: '36', isNullable: true },
          { name: 'userAgent', type: 'varchar', length: '512', isNullable: true },
          { name: 'ipAddress', type: 'varchar', length: '64', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndices('refresh_tokens', [
      new TableIndex({ name: 'IDX_refresh_tokens_tenant_id', columnNames: ['tenantId'] }),
      new TableIndex({ name: 'IDX_refresh_tokens_user_id', columnNames: ['userId'] }),
      new TableIndex({
        name: 'IDX_refresh_tokens_token_hash',
        columnNames: ['tokenHash'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_refresh_tokens_user_revoked_expires',
        columnNames: ['userId', 'revokedAt', 'expiresAt'],
      }),
    ]);
    await queryRunner.createForeignKeys('refresh_tokens', [
      new TableForeignKey({
        name: 'FK_refresh_tokens_tenant_id',
        columnNames: ['tenantId'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_refresh_tokens_user_id',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_tokens', true);
    await queryRunner.dropTable('users', true);
    await queryRunner.dropTable('tenants', true);
  }
}

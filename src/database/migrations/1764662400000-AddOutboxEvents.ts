import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddOutboxEvents1764662400000 implements MigrationInterface {
  name = 'AddOutboxEvents1764662400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'outbox_events',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'tenantId', type: 'varchar', length: '36', isNullable: false },
          { name: 'aggregateType', type: 'varchar', length: '80', isNullable: false },
          { name: 'aggregateId', type: 'varchar', length: '36', isNullable: false },
          { name: 'routingKey', type: 'varchar', length: '120', isNullable: false },
          { name: 'payload', type: 'json', isNullable: false },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('outbox_events', [
      new TableIndex({
        name: 'IDX_outbox_events_tenant_created_at',
        columnNames: ['tenantId', 'createdAt'],
      }),
      new TableIndex({
        name: 'IDX_outbox_events_aggregate',
        columnNames: ['aggregateType', 'aggregateId'],
      }),
      new TableIndex({
        name: 'IDX_outbox_events_routing_key_created_at',
        columnNames: ['routingKey', 'createdAt'],
      }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('outbox_events', true);
  }
}

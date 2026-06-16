import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddProcessedEvents1780905190308 implements MigrationInterface {
  name = 'AddProcessedEvents1780905190308';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'processed_events',
        columns: [
          { name: 'eventId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'routingKey', type: 'varchar', length: '120', isNullable: false },
          { name: 'processedAt', type: 'timestamp', isNullable: false },
          { name: 'expiresAt', type: 'timestamp', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'processed_events',
      new TableIndex({ name: 'IDX_processed_events_expires', columnNames: ['expiresAt'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('processed_events', true);
  }
}

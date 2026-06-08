import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessedEvents1780905190308 implements MigrationInterface {
    name = 'AddProcessedEvents1780905190308'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_tenant_id"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_tenant_id"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tenants_slug"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_token_hash"`);
        await queryRunner.query(`CREATE TABLE "processed_events" ("eventId" character varying(36) NOT NULL, "routingKey" character varying(120) NOT NULL, "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6df2a6135cc301de873d3b3948c" PRIMARY KEY ("eventId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_processed_events_expires" ON "processed_events" ("expiresAt") `);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_tenant_active_created_at"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_tenant_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_routing_key_created_at"`);
        await queryRunner.query(`ALTER TABLE "outbox_events" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2310ecc5cb8be427097154b18f" ON "tenants" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_c58f7e88c286e5e3478960a998" ON "users" ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_tenant_active_created_at" ON "users" ("tenantId", "active", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ef335e11835cd9836b83d7be7c" ON "refresh_tokens" ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_52a799f51de1652614e8a8908f" ON "outbox_events" ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_events_routing_key_created_at" ON "outbox_events" ("routingKey", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_events_tenant_created_at" ON "outbox_events" ("tenantId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_c58f7e88c286e5e3478960a998b" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_ef335e11835cd9836b83d7be7cd" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_ef335e11835cd9836b83d7be7cd"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_c58f7e88c286e5e3478960a998b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_tenant_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_routing_key_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_52a799f51de1652614e8a8908f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ef335e11835cd9836b83d7be7c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_tenant_active_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c58f7e88c286e5e3478960a998"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2310ecc5cb8be427097154b18f"`);
        await queryRunner.query(`ALTER TABLE "outbox_events" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_events_routing_key_created_at" ON "outbox_events" ("createdAt", "routingKey") `);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_events_tenant_created_at" ON "outbox_events" ("createdAt", "tenantId") `);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`CREATE INDEX "IDX_users_tenant_active_created_at" ON "users" ("active", "createdAt", "tenantId") `);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`DROP INDEX "public"."IDX_processed_events_expires"`);
        await queryRunner.query(`DROP TABLE "processed_events"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("tokenHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_tenant_id" ON "refresh_tokens" ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_tenant_id" ON "users" ("tenantId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tenants_slug" ON "tenants" ("slug") `);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}

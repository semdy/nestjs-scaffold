import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

function createAdapter() {
  const dbType = process.env.DB_TYPE ?? 'postgres';

  if (dbType === 'mysql') {
    return new PrismaMariaDb({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USERNAME ?? 'app',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'app',
    });
  }

  return new PrismaPg({ connectionString: process.env.DATABASE_URL });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: createAdapter(),
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

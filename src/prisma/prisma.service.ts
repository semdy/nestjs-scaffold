import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dbType = process.env.DB_TYPE ?? 'postgres';
  const protocol = dbType === 'mysql' ? 'mysql' : 'postgresql';
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? (dbType === 'mysql' ? '3306' : '5432');
  const user = encodeURIComponent(process.env.DB_USERNAME ?? 'app');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const database = process.env.DB_DATABASE ?? 'app';
  return `${protocol}://${user}:${password}@${host}:${port}/${database}`;
}

function createAdapter() {
  const connectionString = buildConnectionString();

  if ((process.env.DB_TYPE ?? 'postgres') === 'mysql') {
    return new PrismaMariaDb(connectionString);
  }

  return new PrismaPg({ connectionString });
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

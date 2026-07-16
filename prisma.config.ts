import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const dbType = process.env.DB_TYPE ?? 'postgres';
const isMysql = dbType === 'mysql';

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const protocol = isMysql ? 'mysql' : 'postgresql';
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? (isMysql ? '3306' : '5432');
  const user = encodeURIComponent(process.env.DB_USERNAME ?? 'app');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const database = process.env.DB_DATABASE ?? 'app';
  return `${protocol}://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: isMysql ? 'prisma-mysql/schema.prisma' : 'prisma/schema.prisma',
  migrations: {
    path: isMysql ? 'prisma/migrations-mysql' : 'prisma/migrations',
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});

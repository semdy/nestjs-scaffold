import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const dbType = process.env.DB_TYPE ?? 'postgres';
const isMysql = dbType === 'mysql';

export default defineConfig({
  schema: isMysql ? 'prisma/schema-mysql.prisma' : 'prisma/schema.prisma',
  migrations: {
    path: isMysql ? 'prisma/migrations-mysql' : 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});

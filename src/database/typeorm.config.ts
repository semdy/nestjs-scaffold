import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Tenant } from '../tenancy/tenant.entity';
import { User } from '../users/user.entity';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: (process.env.DB_TYPE ?? 'postgres') as 'postgres' | 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Tenant, User, RefreshToken],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
};

export default new DataSource(dataSourceOptions);

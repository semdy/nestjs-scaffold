const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'app',
    password: process.env.DB_PASSWORD || 'app',
    database: process.env.DB_DATABASE || 'app',
  });

  await client.connect();
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'outbox_events'
     LIMIT 1`,
  );
  await client.end();

  if (rows.length === 0) {
    console.error('CDC schema not ready: public.outbox_events table is missing');
    process.exit(1);
  }

  console.log('CDC schema already present (public.outbox_events exists), continuing.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

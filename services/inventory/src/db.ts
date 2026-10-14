import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
  connectionString:
    process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5434}/${process.env.PGDATABASE || 'kartvibe_inventory'}`,
});

pool.on('error', (err) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'inventory', event: 'pool_error', errorCode: 'INTERNAL_ERROR', errorName: err.name }));
});

export const metrics = {
  requests: 0,
  dbQueries: 0,
  reset() {
    this.requests = 0;
    this.dbQueries = 0;
  },
};

export async function executeQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  metrics.dbQueries += 1;
  return pool.query<T>(text, params);
}

export async function initDb(): Promise<void> {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS stock (
      sku text primary key,
      available int not null check (available >= 0)
    );
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS reservations (
      id serial primary key,
      sku text not null,
      quantity int not null,
      created_at timestamptz not null default now()
    );
  `);

  const countRes = await executeQuery<{ count: string }>('SELECT COUNT(*) as count FROM stock;');
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    await seedStock();
  }
}

export async function seedStock(): Promise<void> {
  await executeQuery(`
    INSERT INTO stock (sku, available) VALUES
      ('SKU-OK', 10),
      ('SKU-LOW', 1),
      ('SKU-ZERO', 0)
    ON CONFLICT (sku) DO UPDATE SET available = EXCLUDED.available;
  `);
}

export async function resetDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE reservations RESTART IDENTITY;');
    await client.query('DELETE FROM stock;');
    await client.query(`
      INSERT INTO stock (sku, available) VALUES
        ('SKU-OK', 10),
        ('SKU-LOW', 1),
        ('SKU-ZERO', 0);
    `);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

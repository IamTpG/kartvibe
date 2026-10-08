import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5434}/${process.env.PGDATABASE || 'kartvibe_order'}`,
});

export const metrics = {
  requests: 0,
  dbQueries: 0,
  reset() {
    this.requests = 0;
    this.dbQueries = 0;
  }
};

export async function executeQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  metrics.dbQueries += 1;
  return pool.query<T>(text, params);
}

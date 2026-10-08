import pg from 'pg';

const { Pool, Client } = pg;

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  price: number;
  thumbnail: string;
  description: string;
}

export type DataSize = 'S' | 'L';

export const PG_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5434),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'kartvibe_product',
};

let pool: pg.Pool | null = null;
let usingMemoryFallback = false;
let memoryStore: Map<number, ProductRow> = new Map();
let dbQueriesCount = 0;

export function getDbQueriesCount(): number {
  return dbQueriesCount;
}

export function resetDbQueriesCount(): void {
  dbQueriesCount = 0;
}

export function isUsingMemoryFallback(): boolean {
  return usingMemoryFallback;
}

export function generateProducts(size: DataSize): ProductRow[] {
  const count = size === 'L' ? 30 : 10;
  const products: ProductRow[] = [];
  for (let id = 1; id <= count; id++) {
    const sku = `SKU-${String(id).padStart(3, '0')}`;
    const name = `Sản phẩm ${String(id).padStart(2, '0')}`;
    const price = 10000 + id * 500;
    const thumbnail = `https://img.example.test/p/${id}.jpg`;
    const description = `Mô tả sản phẩm ${id}. `.repeat(6);
    products.push({ id, sku, name, price, thumbnail, description });
  }
  return products;
}

/**
 * Ensures the `kartvibe_product` database and `products` table exist in Postgres.
 * If Postgres is unreachable and fallback is allowed, initializes the in-memory store.
 */
export async function initDb(options?: { requirePostgres?: boolean; defaultSize?: DataSize }): Promise<void> {
  const defaultSize: DataSize =
    (options?.defaultSize || (process.env.SIZE?.toUpperCase() === 'L' ? 'L' : 'S')) as DataSize;

  if (process.env.USE_MEMORY_DB === '1') {
    usingMemoryFallback = true;
    seedMemoryStore(defaultSize);
    return;
  }

  try {
    // 1. Connect to default 'postgres' database to ensure 'kartvibe_product' exists
    const adminClient = new Client({
      host: PG_CONFIG.host,
      port: PG_CONFIG.port,
      user: PG_CONFIG.user,
      password: PG_CONFIG.password,
      database: 'postgres',
      connectionTimeoutMillis: 2500,
    });
    await adminClient.connect();
    const dbCheck = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [PG_CONFIG.database]
    );
    if (dbCheck.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${PG_CONFIG.database}"`);
    }
    await adminClient.end();

    // 2. Connect pool to 'kartvibe_product'
    pool = new Pool({
      ...(process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : PG_CONFIG),
      max: 20,
      connectionTimeoutMillis: 2500,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id int PRIMARY KEY,
        sku text UNIQUE NOT NULL,
        name text NOT NULL,
        price int NOT NULL,
        thumbnail text NOT NULL,
        description text NOT NULL
      );
    `);

    // 3. Auto-seed if table is empty so service is ready immediately
    const countRes = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products');
    const existingCount = Number(countRes.rows[0]?.count || 0);
    if (existingCount === 0) {
      await seedDatabase(defaultSize);
    }
    usingMemoryFallback = false;
  } catch (err) {
    if (options?.requirePostgres || process.env.REQUIRE_POSTGRES === '1') {
      throw err;
    }
    usingMemoryFallback = true;
    seedMemoryStore(defaultSize);
    console.warn(
      `[product-service] Postgres at ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database} not reachable (${(err as Error).message}). ` +
        `Running with in-memory SQL store seeded with SIZE=${defaultSize}.`
    );
  }
}

export function seedMemoryStore(size: DataSize): ProductRow[] {
  const rows = generateProducts(size);
  memoryStore = new Map(rows.map((r) => [r.id, r]));
  return rows;
}

export async function seedDatabase(size: DataSize): Promise<{ count: number; mode: 'postgres' | 'memory' }> {
  const rows = generateProducts(size);

  if (usingMemoryFallback || !pool) {
    seedMemoryStore(size);
    return { count: rows.length, mode: 'memory' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id int PRIMARY KEY,
        sku text UNIQUE NOT NULL,
        name text NOT NULL,
        price int NOT NULL,
        thumbnail text NOT NULL,
        description text NOT NULL
      );
    `);
    await client.query('TRUNCATE TABLE products');

    for (const p of rows) {
      await client.query(
        `INSERT INTO products (id, sku, name, price, thumbnail, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.id, p.sku, p.name, p.price, p.thumbnail, p.description]
      );
    }
    await client.query('COMMIT');
    return { count: rows.length, mode: 'postgres' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Queries a single product by ID.
 * Counts as exactly 1 DB query.
 */
export async function queryProductById(id: number): Promise<ProductRow | null> {
  dbQueriesCount += 1;

  if (usingMemoryFallback || !pool) {
    const item = memoryStore.get(id);
    return item ? { ...item } : null;
  }

  const res = await pool.query<ProductRow>(
    `SELECT id, sku, name, price, thumbnail, description
     FROM products
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Queries multiple products by an array of deduplicated IDs using a single SQL query (`WHERE id = ANY($1::int[])`).
 * Counts as exactly 1 DB query. Results are sorted by `id` ascending.
 */
export async function queryProductsByIds(uniqueIds: number[]): Promise<ProductRow[]> {
  dbQueriesCount += 1;

  if (usingMemoryFallback || !pool) {
    const idSet = new Set(uniqueIds);
    return Array.from(memoryStore.values())
      .filter((p) => idSet.has(p.id))
      .sort((a, b) => a.id - b.id)
      .map((p) => ({ ...p }));
  }

  const res = await pool.query<ProductRow>(
    `SELECT id, sku, name, price, thumbnail, description
     FROM products
     WHERE id = ANY($1::int[])
     ORDER BY id ASC`,
    [uniqueIds]
  );
  return res.rows;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

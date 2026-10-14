import './env.js';
import { pool } from './db.js';

interface SeedConfig {
  numOrders: number;
  itemsPerOrder: number;
  numProducts: number;
}

const CONFIGS: Record<string, SeedConfig> = {
  S: {
    numOrders: 5,
    itemsPerOrder: 3,
    numProducts: 10,
  },
  L: {
    numOrders: 50,
    itemsPerOrder: 4,
    numProducts: 30,
  },
};

const STATUS_LIST = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const BASE_DATE_MS = new Date('2026-01-01T00:00:00.000Z').getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function seed() {
  const sizeArg = (process.argv[2] || process.env.SIZE || 'S').toUpperCase();
  const config = CONFIGS[sizeArg] || CONFIGS.S;
  const size = CONFIGS[sizeArg] ? sizeArg : 'S';

  console.log(`[Order Service] Seeding database kartvibe_order for SIZE=${size} (${config.numOrders} orders, ${config.itemsPerOrder} items/order, ${config.numProducts} products)...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Tạo bảng nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id int PRIMARY KEY,
        user_id int NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_items (
        order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_index int NOT NULL,
        product_id int NOT NULL,
        quantity int NOT NULL,
        PRIMARY KEY (order_id, item_index)
      );
    `);

    // 2. Dọn dẹp dữ liệu cũ
    await client.query('TRUNCATE TABLE order_items, orders CASCADE;');

    // 3. Chèn các đơn hàng và items theo công thức xác định
    for (let o = 1; o <= config.numOrders; o++) {
      const status = STATUS_LIST[(o - 1) % 5];
      const createdAt = new Date(BASE_DATE_MS + (o - 1) * MS_PER_DAY).toISOString();
      const userId = 1; // Chỉ có 1 người dùng id = 1

      await client.query(
        `INSERT INTO orders (id, user_id, status, created_at) VALUES ($1, $2, $3, $4);`,
        [o, userId, status, createdAt]
      );

      for (let i = 0; i < config.itemsPerOrder; i++) {
        const productId = ((o * 7 + i * 11) % config.numProducts) + 1;
        const quantity = ((o + i) % 3) + 1;
        const itemIndex = i;

        await client.query(
          `INSERT INTO order_items (order_id, item_index, product_id, quantity) VALUES ($1, $2, $3, $4);`,
          [o, itemIndex, productId, quantity]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[Order Service] Seed completed successfully: ${config.numOrders} orders and ${config.numOrders * config.itemsPerOrder} order_items created.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Order Service] Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

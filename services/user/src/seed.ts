import './env.js';
import { pool } from './db.js';

async function seed() {
  const size = (process.argv[2] || process.env.SIZE || 'S').toUpperCase();
  console.log(`[User Service] Seeding database kartvibe_user for SIZE=${size}...`);

  try {
    // 1. Tạo bảng nếu chưa tồn tại
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id int PRIMARY KEY,
        name text NOT NULL
      );
    `);

    // 2. Xóa dữ liệu cũ và chèn User 1
    await pool.query(`TRUNCATE TABLE users;`);

    // Theo hợp đồng: Chỉ có 1 người dùng (id = 1, name: "Người dùng 1")
    await pool.query(
      `INSERT INTO users (id, name) VALUES ($1, $2);`,
      [1, 'Người dùng 1']
    );

    console.log(`[User Service] Seed completed successfully: User(id=1, name="Người dùng 1") created.`);
  } catch (err) {
    console.error('[User Service] Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();

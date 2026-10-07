// Nạp dữ liệu mẫu cho sân thử Block 2. Idempotent: drop và tạo lại 3 schema.
// Quy mô đổi bằng biến môi trường: ORDERS (20), ITEMS_PER_ORDER (3), PRODUCTS (30).
// Dữ liệu sinh bằng bộ ngẫu nhiên có hạt giống cố định nên kết quả lặp lại được.
import pg from 'pg';

const DATABASE_URL =
  process.env.LAB_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/kartvibe_lab';
const ORDERS = Number(process.env.ORDERS ?? 20);
const ITEMS_PER_ORDER = Number(process.env.ITEMS_PER_ORDER ?? 3);
const PRODUCTS = Number(process.env.PRODUCTS ?? 30);

if (![ORDERS, ITEMS_PER_ORDER, PRODUCTS].every((n) => Number.isInteger(n) && n >= 1)) {
  throw new Error('ORDERS, ITEMS_PER_ORDER, PRODUCTS phải là số nguyên dương');
}
if (ITEMS_PER_ORDER > PRODUCTS) {
  throw new Error('ITEMS_PER_ORDER không được lớn hơn PRODUCTS (mỗi đơn chọn sản phẩm khác nhau)');
}

// mulberry32: bộ sinh số giả ngẫu nhiên nhỏ gọn, có hạt giống.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);

const products = Array.from({ length: PRODUCTS }, (_, i) => ({
  id: i + 1,
  name: `Sản phẩm ${String(i + 1).padStart(3, '0')}`,
  priceCents: 1000 + Math.floor(rand() * 90) * 100,
}));

const orders = [];
const items = [];
const base = Date.UTC(2026, 0, 1);
for (let o = 1; o <= ORDERS; o++) {
  orders.push({ id: o, userId: 1, status: o % 5 === 0 ? 'shipped' : 'paid', createdAt: new Date(base + o * 86400000) });
  // Chọn ITEMS_PER_ORDER sản phẩm khác nhau trong đơn; giữa các đơn thì có thể trùng nhau.
  const picked = new Set();
  while (picked.size < ITEMS_PER_ORDER) picked.add(1 + Math.floor(rand() * PRODUCTS));
  for (const productId of picked) items.push({ orderId: o, productId, quantity: 1 + Math.floor(rand() * 3) });
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  for (const s of ['user_svc', 'order_svc', 'product_svc']) {
    await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await client.query(`CREATE SCHEMA ${s}`);
  }
  // Không có khóa ngoại giữa các schema: mỗi service sở hữu dữ liệu của mình.
  await client.query(`CREATE TABLE user_svc.users (id int PRIMARY KEY, name text NOT NULL, email text NOT NULL)`);
  await client.query(`CREATE TABLE product_svc.products (id int PRIMARY KEY, name text NOT NULL, price_cents int NOT NULL)`);
  await client.query(`CREATE TABLE order_svc.orders (
    id int PRIMARY KEY, user_id int NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL)`);
  await client.query(`CREATE TABLE order_svc.order_items (
    id serial PRIMARY KEY, order_id int NOT NULL REFERENCES order_svc.orders(id),
    product_id int NOT NULL, quantity int NOT NULL)`);
  await client.query('CREATE INDEX ON order_svc.orders (user_id)');
  await client.query('CREATE INDEX ON order_svc.order_items (order_id)');

  await client.query(`INSERT INTO user_svc.users VALUES (1, 'Nguyễn Văn An', 'an@example.com')`);
  await client.query(
    `INSERT INTO product_svc.products SELECT * FROM unnest($1::int[], $2::text[], $3::int[])`,
    [products.map((p) => p.id), products.map((p) => p.name), products.map((p) => p.priceCents)],
  );
  await client.query(
    `INSERT INTO order_svc.orders SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::timestamptz[])`,
    [orders.map((o) => o.id), orders.map((o) => o.userId), orders.map((o) => o.status), orders.map((o) => o.createdAt)],
  );
  await client.query(
    `INSERT INTO order_svc.order_items (order_id, product_id, quantity) SELECT * FROM unnest($1::int[], $2::int[], $3::int[])`,
    [items.map((i) => i.orderId), items.map((i) => i.productId), items.map((i) => i.quantity)],
  );
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}

const distinct = new Set(items.map((i) => i.productId)).size;
console.log(
  `Seeded: users=1, products=${PRODUCTS}, orders=${ORDERS}, order_items=${items.length} ` +
    `(${distinct} sản phẩm khác nhau được tham chiếu)`,
);

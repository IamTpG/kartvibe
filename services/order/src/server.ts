import { createDb, createLabApp, listen, parseId } from '../../_shared/lab.js';

const db = createDb();

const app = createLabApp((app) => {
  // Cố định 2 truy vấn: các đơn của user, rồi toàn bộ item của các đơn đó (không tự tạo N+1).
  app.get('/orders', async (req, res) => {
    const userId = parseId(req.query.userId, 'userId');
    const orders = await db.query<{ id: number; status: string; created_at: Date }>(
      'SELECT id, status, created_at FROM order_svc.orders WHERE user_id = $1 ORDER BY id',
      [userId],
    );
    const itemsByOrder = new Map<number, { productId: number; quantity: number }[]>();
    if (orders.rows.length > 0) {
      const items = await db.query<{ order_id: number; product_id: number; quantity: number }>(
        'SELECT order_id, product_id, quantity FROM order_svc.order_items WHERE order_id = ANY($1) ORDER BY order_id, id',
        [orders.rows.map((o) => o.id)],
      );
      for (const it of items.rows) {
        const list = itemsByOrder.get(it.order_id) ?? [];
        list.push({ productId: it.product_id, quantity: it.quantity });
        itemsByOrder.set(it.order_id, list);
      }
    }
    res.json({
      data: orders.rows.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.created_at,
        items: itemsByOrder.get(o.id) ?? [],
      })),
    });
  });
});

listen(app, Number(process.env.PORT ?? 4002), 'order');

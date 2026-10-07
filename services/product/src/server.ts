import { createDb, createLabApp, HttpError, listen, parseId } from '../../_shared/lab.js';

const db = createDb();

const app = createLabApp((app) => {
  // Cố ý ngây thơ: mỗi lời gọi một truy vấn, không có endpoint lấy nhiều sản phẩm cùng lúc.
  app.get('/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query<{ id: number; name: string; price_cents: number }>(
      'SELECT id, name, price_cents FROM product_svc.products WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');
    res.json({ id: rows[0].id, name: rows[0].name, priceCents: rows[0].price_cents });
  });
});

listen(app, Number(process.env.PORT ?? 4003), 'product');

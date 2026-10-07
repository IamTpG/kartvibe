import { createDb, createLabApp, HttpError, listen, parseId } from '../../_shared/lab.js';

const db = createDb();

const app = createLabApp((app) => {
  app.get('/users/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query('SELECT id, name, email FROM user_svc.users WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    res.json(rows[0]);
  });
});

listen(app, Number(process.env.PORT ?? 4001), 'user');

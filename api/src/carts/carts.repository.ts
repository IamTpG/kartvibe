import { prisma, type Tx } from '../shared/db.js';

type Db = Tx | typeof prisma;

export const cartsRepository = {
  create(db: Db = prisma) {
    return db.cart.create({ data: {} });
  },

  findById(id: string, db: Db = prisma) {
    return db.cart.findUnique({ where: { id } });
  },

  /** SELECT ... FOR UPDATE — chỉ dùng trong transaction. */
  async lockById(id: string, tx: Tx) {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  },

  /** Items kèm giá hiện tại từ products. ORDER BY p.name, p.id. */
  listItems(cartId: string, db: Db = prisma) {
    return db.cartItem.findMany({
      where: { cartId },
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }, { productId: 'asc' }],
    });
  },

  /** Đọc product (chỉ đọc) trong cùng transaction với thao tác ghi giỏ. */
  findProduct(id: string, tx: Tx) {
    return tx.product.findUnique({ where: { id } });
  },

  findItem(cartId: string, productId: string, tx: Tx) {
    return tx.cartItem.findUnique({ where: { cartId_productId: { cartId, productId } } });
  },

  insertItem(cartId: string, productId: string, quantity: number, tx: Tx) {
    return tx.cartItem.create({ data: { cartId, productId, quantity } });
  },

  updateItemQuantity(cartId: string, productId: string, quantity: number, tx: Tx) {
    return tx.cartItem.update({
      where: { cartId_productId: { cartId, productId } },
      data: { quantity },
    });
  },

  /** Trả số dòng đã xóa (0 nếu item không có trong giỏ). */
  async removeItem(cartId: string, productId: string, db: Db = prisma) {
    const { count } = await db.cartItem.deleteMany({ where: { cartId, productId } });
    return count;
  },
};

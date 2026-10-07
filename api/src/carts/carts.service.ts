import { mapInsertError } from '../shared/db-errors.js';
import { prisma, type Tx } from '../shared/db.js';
import { AppError } from '../shared/errors.js';
import { cartsRepository } from './carts.repository.js';

export interface CartResponse {
  id: string;
  status: 'open' | 'checked_out';
  items: {
    product_id: string;
    sku: string;
    name: string;
    price_cents: number;
    quantity: number;
    subtotal_cents: number;
  }[];
  subtotal_cents: number;
}

/**
 * Dùng chung cho GET /carts/:id, POST /items (201), PATCH /items/:pid (200).
 * subtotal không lưu DB, luôn tính lại; giá đọc từ products.
 */
export async function buildCartResponse(
  cartId: string,
  db: Tx | typeof prisma = prisma,
): Promise<CartResponse> {
  const cart = await cartsRepository.findById(cartId, db);
  if (!cart) throw new AppError('CART_NOT_FOUND');
  const rows = await cartsRepository.listItems(cartId, db);
  const items = rows.map((r) => ({
    product_id: r.productId,
    sku: r.product.sku,
    name: r.product.name,
    price_cents: r.product.priceCents,
    quantity: r.quantity,
    subtotal_cents: r.product.priceCents * r.quantity,
  }));
  return {
    id: cart.id,
    status: cart.status as CartResponse['status'],
    items,
    subtotal_cents: items.reduce((sum, i) => sum + i.subtotal_cents, 0),
  };
}

const insufficientStock = (stock: number) =>
  new AppError('INSUFFICIENT_STOCK', [
    { field: 'quantity', issue: `exceeds available stock (${stock})` },
  ]);

/** Bước 2–3 chung: cart tồn tại → cart open. Khóa dòng cart để các thao tác cùng cart tuần tự. */
async function lockOpenCart(cartId: string, tx: Tx) {
  const cart = await cartsRepository.lockById(cartId, tx);
  if (!cart) throw new AppError('CART_NOT_FOUND');
  if (cart.status !== 'open') throw new AppError('CART_CLOSED');
}

export const cartsService = {
  async create(): Promise<CartResponse> {
    const cart = await cartsRepository.create();
    return { id: cart.id, status: 'open', items: [], subtotal_cents: 0 };
  },

  get(cartId: string) {
    return buildCartResponse(cartId);
  },

  // CART_NOT_FOUND → CART_CLOSED → PRODUCT_UNAVAILABLE → ITEM_ALREADY_IN_CART → INSUFFICIENT_STOCK
  async addItem(cartId: string, productId: string, quantity: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockOpenCart(cartId, tx);

        const product = await cartsRepository.findProduct(productId, tx);
        if (!product || !product.isActive) throw new AppError('PRODUCT_UNAVAILABLE');

        if (await cartsRepository.findItem(cartId, productId, tx)) {
          throw new AppError('ITEM_ALREADY_IN_CART');
        }
        if (quantity > product.stock) throw insufficientStock(product.stock);

        await cartsRepository.insertItem(cartId, productId, quantity, tx);
        return buildCartResponse(cartId, tx);
      });
    } catch (err) {
      throw mapInsertError(err);
    }
  },

  // CART_NOT_FOUND → CART_CLOSED → ITEM_NOT_FOUND → INSUFFICIENT_STOCK
  // Không check lại is_active: SP đã nằm trong giỏ (PATCH không trả 422).
  updateItem(cartId: string, productId: string, quantity: number) {
    return prisma.$transaction(async (tx) => {
      await lockOpenCart(cartId, tx);

      if (!(await cartsRepository.findItem(cartId, productId, tx))) {
        throw new AppError('ITEM_NOT_FOUND');
      }
      const product = await cartsRepository.findProduct(productId, tx);
      if (product && quantity > product.stock) throw insufficientStock(product.stock);

      await cartsRepository.updateItemQuantity(cartId, productId, quantity, tx);
      return buildCartResponse(cartId, tx);
    });
  },

  // CART_NOT_FOUND → CART_CLOSED → ITEM_NOT_FOUND. Không cần transaction (đọc + 1 DELETE).
  async removeItem(cartId: string, productId: string) {
    const cart = await cartsRepository.findById(cartId);
    if (!cart) throw new AppError('CART_NOT_FOUND');
    if (cart.status !== 'open') throw new AppError('CART_CLOSED');

    const deleted = await cartsRepository.removeItem(cartId, productId);
    if (deleted === 0) throw new AppError('ITEM_NOT_FOUND');
  },
};

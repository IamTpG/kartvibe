import { z } from './common.js';

export const CartIdParams = z.strictObject({
  cartId: z.uuid().openapi({ example: '3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10' }),
});

export const CartItemSchema = z
  .strictObject({
    product_id: z.uuid(),
    sku: z.string(),
    name: z.string(),
    price_cents: z.number().int().min(1),
    quantity: z.number().int().min(1).max(10),
    subtotal_cents: z.number().int().min(1),
  })
  .openapi('CartItem');

export const CartSchema = z
  .strictObject({
    id: z.uuid(),
    status: z.enum(['open', 'checked_out']),
    items: z.array(CartItemSchema),
    subtotal_cents: z.number().int().min(0),
  })
  .openapi('Cart');

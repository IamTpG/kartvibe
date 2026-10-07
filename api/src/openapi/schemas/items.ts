import { z } from './common.js';

const quantity = z.number().int().min(1).max(10);

export const CartItemParams = z.strictObject({
  cartId: z.uuid().openapi({ example: '3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10' }),
  productId: z.uuid().openapi({ example: '10000000-0000-4000-8000-000000000001' }),
});

// Body không ép kiểu: "quantity": "2" → 400. strictObject = additionalProperties: false.
export const AddItemRequest = z
  .strictObject({
    product_id: z.uuid().openapi({ example: '10000000-0000-4000-8000-000000000001' }),
    quantity: quantity.openapi({ example: 2 }),
  })
  .openapi('AddItemRequest');

export const UpdateItemRequest = z
  .strictObject({ quantity: quantity.openapi({ example: 3 }) })
  .openapi('UpdateItemRequest');

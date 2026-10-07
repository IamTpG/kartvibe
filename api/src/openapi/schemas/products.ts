import { z } from './common.js';

// Query param được ép kiểu từ chuỗi (khác body). "abc", "1.5", "" → lỗi.
const intQuery = (def: string, min: number, max?: number) => {
  let n = z.number().int().min(min);
  if (max !== undefined) n = n.max(max);
  return z
    .string()
    .regex(/^-?\d+$/, 'must be integer')
    .default(def)
    .transform(Number)
    .pipe(n);
};

export const ListProductsQuery = z.strictObject({
  limit: intQuery('20', 1, 50).openapi({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
    example: 20,
  }),
  offset: intQuery('0', 0).openapi({ type: 'integer', minimum: 0, default: 0, example: 0 }),
});

export const ProductSchema = z
  .strictObject({
    id: z.uuid(),
    sku: z.string(),
    name: z.string(),
    price_cents: z.number().int().min(1),
    stock: z.number().int().min(0),
  })
  .openapi('Product');

export const ProductListSchema = z
  .strictObject({
    data: z.array(ProductSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(50),
    offset: z.number().int().min(0),
  })
  .openapi('ProductList');

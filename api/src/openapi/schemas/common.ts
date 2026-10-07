import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };

export const uuid = (description: string, example: string) =>
  z.uuid().openapi({ description, example });

export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'CART_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'CART_CLOSED',
  'ITEM_ALREADY_IN_CART',
  'INSUFFICIENT_STOCK',
  'PRODUCT_UNAVAILABLE',
  'INTERNAL_ERROR',
  'ROUTE_NOT_FOUND',
  'METHOD_NOT_ALLOWED',
]);

export const ErrorDetailSchema = z
  .strictObject({ field: z.string(), issue: z.string() })
  .openapi('ErrorDetail');

export const ErrorSchema = z
  .strictObject({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema),
    request_id: z.uuid(),
  })
  .openapi('Error');

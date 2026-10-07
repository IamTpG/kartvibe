import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { CartIdParams, CartSchema } from './schemas/carts.js';
import { ErrorSchema } from './schemas/common.js';
import { AddItemRequest, CartItemParams, UpdateItemRequest } from './schemas/items.js';
import { ListProductsQuery, ProductListSchema } from './schemas/products.js';

const REQUEST_ID = '7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10';
const SP1 = '10000000-0000-4000-8000-000000000001';
const SP2 = '10000000-0000-4000-8000-000000000002';
const CART = '3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10';

const registry = new OpenAPIRegistry();
registry.register('Error', ErrorSchema);

const requestIdHeader = {
  'X-Request-Id': {
    description: 'UUID của request, trùng với request_id trong error body và dòng log',
    schema: { type: 'string' as const, format: 'uuid' },
  },
};

const err = (code: string, message: string, details: unknown[] = []) => ({
  summary: code,
  value: { code, message, details, request_id: REQUEST_ID },
});

const errorResponse = (description: string, examples: Record<string, ReturnType<typeof err>>) => ({
  description,
  headers: requestIdHeader,
  content: { 'application/json': { schema: ErrorSchema, examples } },
});

const validation = (details: { field: string; issue: string }[]) =>
  errorResponse('Request không hợp lệ (VALIDATION_ERROR)', {
    VALIDATION_ERROR: err('VALIDATION_ERROR', 'Request không hợp lệ', details),
  });

const internal = errorResponse('Lỗi server (INTERNAL_ERROR) — không lộ stack trace / SQL', {
  INTERNAL_ERROR: err('INTERNAL_ERROR', 'Đã có lỗi xảy ra, vui lòng thử lại sau'),
});

const cartNotFound = err('CART_NOT_FOUND', 'Không tìm thấy giỏ hàng');
const itemNotFound = err('ITEM_NOT_FOUND', 'Sản phẩm không có trong giỏ hàng');
const cartClosed = err('CART_CLOSED', 'Giỏ hàng đã checkout, không thể chỉnh sửa');

const cartExample = {
  id: CART,
  status: 'open',
  items: [
    { product_id: SP1, sku: 'SKU-001', name: 'Bút bi xanh', price_cents: 5000, quantity: 2, subtotal_cents: 10000 },
    { product_id: SP2, sku: 'SKU-002', name: 'Vở kẻ ngang', price_cents: 15000, quantity: 1, subtotal_cents: 15000 },
  ],
  subtotal_cents: 25000,
};

const cartResponse = (description: string, extraHeaders = {}) => ({
  description,
  headers: { ...requestIdHeader, ...extraHeaders },
  content: {
    'application/json': { schema: CartSchema, examples: { withItems: { value: cartExample } } },
  },
});

// 1. GET /products
registry.registerPath({
  method: 'get',
  path: '/products',
  operationId: 'listProducts',
  summary: 'Danh sách sản phẩm đang bán (phân trang)',
  tags: ['Products'],
  request: { query: ListProductsQuery },
  responses: {
    200: {
      description: 'OK',
      headers: requestIdHeader,
      content: {
        'application/json': {
          schema: ProductListSchema,
          examples: {
            page: {
              value: {
                data: [
                  { id: SP1, sku: 'SKU-001', name: 'Bút bi xanh', price_cents: 5000, stock: 3 },
                  { id: SP2, sku: 'SKU-002', name: 'Vở kẻ ngang', price_cents: 15000, stock: 50 },
                ],
                total: 4,
                limit: 2,
                offset: 0,
              },
            },
          },
        },
      },
    },
    400: validation([{ field: 'limit', issue: 'must be <= 50' }]),
    500: internal,
  },
});

// 2. POST /carts
registry.registerPath({
  method: 'post',
  path: '/carts',
  operationId: 'createCart',
  summary: 'Tạo cart rỗng (status = open)',
  tags: ['Carts'],
  responses: {
    201: {
      description: 'Tạo thành công',
      headers: {
        ...requestIdHeader,
        Location: {
          description: 'Đường dẫn tới cart vừa tạo',
          schema: { type: 'string' as const, example: `/carts/${CART}` },
        },
      },
      content: {
        'application/json': {
          schema: CartSchema,
          examples: { empty: { value: { id: CART, status: 'open', items: [], subtotal_cents: 0 } } },
        },
      },
    },
    500: internal,
  },
});

// 3. GET /carts/{cartId}
registry.registerPath({
  method: 'get',
  path: '/carts/{cartId}',
  operationId: 'getCart',
  summary: 'Đọc cart (open hoặc checked_out)',
  tags: ['Carts'],
  request: { params: CartIdParams },
  responses: {
    200: cartResponse('OK'),
    400: validation([{ field: 'cartId', issue: 'must be a valid UUID' }]),
    404: errorResponse('Cart không tồn tại', { CART_NOT_FOUND: cartNotFound }),
    500: internal,
  },
});

// 4. POST /carts/{cartId}/items
registry.registerPath({
  method: 'post',
  path: '/carts/{cartId}/items',
  operationId: 'addCartItem',
  summary: 'Thêm sản phẩm (chưa có trong giỏ) vào cart',
  tags: ['Items'],
  request: {
    params: CartIdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AddItemRequest,
          examples: { valid: { value: { product_id: SP1, quantity: 2 } } },
        },
      },
    },
  },
  responses: {
    201: cartResponse('Thêm thành công, trả Cart'),
    400: validation([{ field: 'quantity', issue: 'must be >= 1' }]),
    404: errorResponse('Cart không tồn tại', { CART_NOT_FOUND: cartNotFound }),
    409: errorResponse('Xung đột trạng thái', {
      CART_CLOSED: cartClosed,
      ITEM_ALREADY_IN_CART: err(
        'ITEM_ALREADY_IN_CART',
        'Sản phẩm đã có trong giỏ, dùng PATCH để đổi số lượng',
      ),
      INSUFFICIENT_STOCK: err('INSUFFICIENT_STOCK', 'Không đủ hàng trong kho', [
        { field: 'quantity', issue: 'exceeds available stock (3)' },
      ]),
    }),
    422: errorResponse('Sản phẩm không tồn tại hoặc ngừng bán', {
      PRODUCT_UNAVAILABLE: err('PRODUCT_UNAVAILABLE', 'Sản phẩm không tồn tại hoặc đã ngừng bán'),
    }),
    500: internal,
  },
});

// 5. PATCH /carts/{cartId}/items/{productId}
registry.registerPath({
  method: 'patch',
  path: '/carts/{cartId}/items/{productId}',
  operationId: 'updateCartItem',
  summary: 'Đặt lại số lượng (giá trị tuyệt đối) của sản phẩm đã có trong cart',
  tags: ['Items'],
  request: {
    params: CartItemParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateItemRequest,
          examples: { valid: { value: { quantity: 3 } } },
        },
      },
    },
  },
  responses: {
    200: cartResponse('Cập nhật thành công, trả Cart'),
    400: validation([{ field: 'quantity', issue: 'must be <= 10' }]),
    404: errorResponse('Cart hoặc item không tồn tại', {
      CART_NOT_FOUND: cartNotFound,
      ITEM_NOT_FOUND: itemNotFound,
    }),
    409: errorResponse('Xung đột trạng thái', {
      CART_CLOSED: cartClosed,
      INSUFFICIENT_STOCK: err('INSUFFICIENT_STOCK', 'Không đủ hàng trong kho', [
        { field: 'quantity', issue: 'exceeds available stock (3)' },
      ]),
    }),
    500: internal,
  },
});

// 6. DELETE /carts/{cartId}/items/{productId}
registry.registerPath({
  method: 'delete',
  path: '/carts/{cartId}/items/{productId}',
  operationId: 'removeCartItem',
  summary: 'Xóa sản phẩm khỏi cart',
  tags: ['Items'],
  request: { params: CartItemParams },
  responses: {
    204: { description: 'Xóa thành công, không có body', headers: requestIdHeader },
    400: validation([{ field: 'productId', issue: 'must be a valid UUID' }]),
    404: errorResponse('Cart hoặc item không tồn tại', {
      CART_NOT_FOUND: cartNotFound,
      ITEM_NOT_FOUND: itemNotFound,
    }),
    409: errorResponse('Cart đã checkout', { CART_CLOSED: cartClosed }),
    500: internal,
  },
});

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Kartvibe API',
      version: '1.0.0',
      description:
        'Kartvibe API. Spec sinh tự động từ cùng Zod schema dùng để validate request.',
    },
    servers: [{ url: `http://localhost:${process.env.PORT ?? 3000}` }],
  });
}

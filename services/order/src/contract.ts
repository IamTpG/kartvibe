// Hợp đồng của Order Service: nguồn sự thật cho openapi.json (npm run openapi).
// Bên tiêu thụ sinh kiểu từ openapi.json, không import file này.
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const ErrorSchema = z
  .strictObject({ code: z.string(), message: z.string() })
  .openapi('Error', { description: 'Lỗi chung của mọi service; không lộ stack trace.' });

export const HealthSchema = z.strictObject({ status: z.literal('ok') }).openapi('Health');

export const MetricsSchema = z
  .strictObject({ service: z.string(), requests: z.int().min(0), dbQueries: z.int().min(0) })
  .openapi('Metrics', { description: 'Bộ đếm phục vụ đo; không tính /health và /_metrics.' });

export const OrderItemSchema = z
  .strictObject({ productId: z.int().min(1), quantity: z.int().min(1) })
  .openapi('OrderItem');

export const OrderSchema = z
  .strictObject({
    id: z.int().min(1),
    userId: z.int().min(1),
    status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
    createdAt: z.iso.datetime(),
    items: z.array(OrderItemSchema),
  })
  .openapi('Order', { description: 'items theo thứ tự item_index.' });

export const OrderListSchema = z.strictObject({ data: z.array(OrderSchema) }).openapi('OrderList');

export type Order = z.infer<typeof OrderSchema>;
export type OrderList = z.infer<typeof OrderListSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({ Error: ErrorSchema, Health: HealthSchema, Metrics: MetricsSchema, OrderItem: OrderItemSchema, Order: OrderSchema, OrderList: OrderListSchema })) {
    registry.register(name, schema);
  }

  registry.registerPath({
    method: 'get',
    path: '/orders',
    summary: 'Đơn của một người dùng, sắp theo id tăng dần',
    description: 'Mỗi lời gọi dùng đúng 2 truy vấn DB (lấy đơn, rồi lấy mọi item của các đơn đó).',
    request: { query: z.object({ userId: z.coerce.number().int().min(1) }) },
    responses: {
      200: json(OrderListSchema, 'Danh sách đơn (rỗng nếu không có)'),
      400: json(ErrorSchema, 'VALIDATION_ERROR: userId sai kiểu'),
      500: json(ErrorSchema, 'INTERNAL_ERROR'),
    },
  });
  registry.registerPath({ method: 'get', path: '/health', responses: { 200: json(HealthSchema, 'Còn sống') } });
  registry.registerPath({ method: 'get', path: '/_metrics', responses: { 200: json(MetricsSchema, 'Bộ đếm') } });
  registry.registerPath({ method: 'post', path: '/_metrics/reset', responses: { 204: { description: 'Đã đặt lại bộ đếm' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Order Service', version: '1.0.0', description: 'Đơn hàng theo người dùng. Mỗi service sở hữu hợp đồng của mình.' },
    servers: [{ url: 'http://localhost:4002' }],
  });
}

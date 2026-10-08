// Hợp đồng của BFF: nguồn sự thật cho openapi.json (npm run openapi).
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

const PositiveInt = z.int().min(1);
const Status = z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']);

export const UserSchema = z.strictObject({ id: PositiveInt, name: z.string() }).openapi('User');

const WebProduct = z.strictObject({ name: z.string(), price: z.int().min(0) });
const MobileProduct = z.strictObject({ name: z.string(), thumbnail: z.string() });

export const WebOrderSchema = z
  .strictObject({
    id: PositiveInt,
    status: Status,
    createdAt: z.iso.datetime(),
    items: z.array(
      z.strictObject({ productId: PositiveInt, quantity: PositiveInt, product: WebProduct.nullable() }),
    ),
  })
  .openapi('WebOrder', { description: 'product là null khi Product lỗi hoặc quá hạn (khi đó partial = true).' });

export const MobileOrderSchema = z
  .strictObject({
    id: PositiveInt,
    status: Status,
    items: z.array(z.strictObject({ product: MobileProduct.nullable() })),
  })
  .openapi('MobileOrder', { description: 'Chỉ các trường mobile cần: không có price, createdAt, productId, quantity.' });

export const PartialErrorSchema = z
  .strictObject({ code: z.string(), message: z.string(), productIds: z.array(PositiveInt).optional() })
  .openapi('PartialError', { description: 'code = PRODUCT_UNAVAILABLE; productIds là các product bị ảnh hưởng.' });

export const WebDashboardSchema = z
  .strictObject({
    user: UserSchema,
    orders: z.array(WebOrderSchema),
    partial: z.boolean(),
    errors: z.array(PartialErrorSchema),
  })
  .openapi('WebDashboard');

export const MobileOrdersSchema = z
  .strictObject({
    orders: z.array(MobileOrderSchema),
    partial: z.boolean(),
    errors: z.array(PartialErrorSchema),
  })
  .openapi('MobileOrders');

export type WebDashboard = z.infer<typeof WebDashboardSchema>;
export type MobileOrders = z.infer<typeof MobileOrdersSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({ Error: ErrorSchema, Health: HealthSchema, Metrics: MetricsSchema, User: UserSchema, WebOrder: WebOrderSchema, MobileOrder: MobileOrderSchema, PartialError: PartialErrorSchema, WebDashboard: WebDashboardSchema, MobileOrders: MobileOrdersSchema })) {
    registry.register(name, schema);
  }

  const query = z.object({ userId: z.coerce.number().int().min(1) });
  const failures = {
    400: json(ErrorSchema, 'VALIDATION_ERROR: userId không hợp lệ'),
    502: json(ErrorSchema, 'UPSTREAM_ERROR: User hoặc Order lỗi'),
    500: json(ErrorSchema, 'INTERNAL_ERROR'),
  };
  registry.registerPath({
    method: 'get',
    path: '/bff/web/dashboard',
    summary: 'Dashboard web: người dùng và đơn, đủ trường',
    description: 'Gọi User và Order song song, rồi Product một lần với id đã loại trùng.',
    request: { query },
    responses: { 200: json(WebDashboardSchema, 'Dashboard (có thể một phần)'), ...failures },
  });
  registry.registerPath({
    method: 'get',
    path: '/bff/mobile/orders',
    summary: 'Danh sách đơn cho mobile, chỉ trường mobile cần',
    description: 'Không gọi User Service.',
    request: { query },
    responses: { 200: json(MobileOrdersSchema, 'Danh sách đơn (có thể một phần)'), ...failures },
  });
  registry.registerPath({ method: 'get', path: '/health', responses: { 200: json(HealthSchema, 'Còn sống') } });
  registry.registerPath({ method: 'get', path: '/_metrics', responses: { 200: json(MetricsSchema, 'Bộ đếm') } });
  registry.registerPath({ method: 'post', path: '/_metrics/reset', responses: { 204: { description: 'Đã đặt lại bộ đếm' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'BFF', version: '1.0.0', description: 'Một endpoint cho mỗi loại client. Chỉ gọi service qua REST. Product lỗi hoặc quá hạn thì trả một phần; User hoặc Order lỗi thì 502.' },
    servers: [{ url: 'http://localhost:4004' }],
  });
}

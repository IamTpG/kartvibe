// Hợp đồng của GraphQL: nguồn sự thật cho openapi.json (npm run openapi).
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

export const WebDataSchema = z
  .strictObject({ user: UserSchema, orders: z.array(WebOrderSchema) })
  .openapi('WebData', { description: 'data của query Web: cùng hình dạng thân BFF web, bỏ partial và errors.' });

export const MobileDataSchema = z
  .strictObject({ orders: z.array(MobileOrderSchema) })
  .openapi('MobileData', { description: 'data của query Mobile: cùng hình dạng thân BFF mobile, bỏ partial và errors.' });

export const GraphQLRequestSchema = z
  .strictObject({ query: z.string(), variables: z.record(z.string(), z.unknown()).optional(), operationName: z.string().optional() })
  .openapi('GraphQLRequest');

export const GraphQLErrorSchema = z
  .looseObject({
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])).optional(),
    extensions: z.looseObject({ code: z.string() }).optional(),
  })
  .openapi('GraphQLError', { description: 'extensions.code = PRODUCT_UNAVAILABLE khi Product lỗi hoặc quá hạn.' });

export const GraphQLResponseSchema = z
  .strictObject({
    data: z.union([WebDataSchema, MobileDataSchema]),
    errors: z.array(GraphQLErrorSchema).optional(),
  })
  .openapi('GraphQLResponse');

export type WebData = z.infer<typeof WebDataSchema>;
export type MobileData = z.infer<typeof MobileDataSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({ Error: ErrorSchema, Health: HealthSchema, Metrics: MetricsSchema, User: UserSchema, WebOrder: WebOrderSchema, MobileOrder: MobileOrderSchema, WebData: WebDataSchema, MobileData: MobileDataSchema, GraphQLRequest: GraphQLRequestSchema, GraphQLError: GraphQLErrorSchema, GraphQLResponse: GraphQLResponseSchema })) {
    registry.register(name, schema);
  }

  registry.registerPath({
    method: 'post',
    path: '/graphql',
    summary: 'Chạy query Web hoặc Mobile',
    description: 'DataLoader bật mặc định; ghi đè từng request bằng ?dataloader=on|off.',
    request: {
      query: z.object({ dataloader: z.enum(['on', 'off']).optional() }),
      body: { content: { 'application/json': { schema: GraphQLRequestSchema } } },
    },
    responses: { 200: json(GraphQLResponseSchema, 'Kết quả; product null kèm errors khi Product lỗi') },
  });
  registry.registerPath({ method: 'get', path: '/health', responses: { 200: json(HealthSchema, 'Còn sống') } });
  registry.registerPath({ method: 'get', path: '/_metrics', responses: { 200: json(MetricsSchema, 'Bộ đếm') } });
  registry.registerPath({ method: 'post', path: '/_metrics/reset', responses: { 204: { description: 'Đã đặt lại bộ đếm' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'GraphQL', version: '1.0.0', description: 'Một endpoint cho cả hai loại client bằng hai query (Web, Mobile). Công tắc DATALOADER chọn bản ngây thơ (N+1) hay đã sửa.' },
    servers: [{ url: 'http://localhost:4005' }],
  });
}

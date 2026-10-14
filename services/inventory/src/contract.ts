// Hợp đồng của Inventory Service: nguồn sự thật cho openapi.json (npm run openapi).
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const ErrorSchema = z
  .strictObject({ code: z.string(), message: z.string() })
  .openapi('Error', { description: 'Lỗi chung của service; không lộ stack trace.' });

export const HealthSchema = z.strictObject({ status: z.literal('ok') }).openapi('Health');

export const MetricsSchema = z
  .strictObject({
    service: z.string(),
    requests: z.number().int().min(0),
    dbQueries: z.number().int().min(0),
  })
  .openapi('Metrics', { description: 'Bộ đếm phục vụ đo; không tính /health và /_metrics.' });

export const ReserveRequestSchema = z
  .strictObject({
    sku: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(1000),
  })
  .openapi('ReserveRequest', { description: 'Yêu cầu giữ hàng tồn kho.' });

export const ReserveResponseSchema = z
  .strictObject({
    reservationId: z.string(),
  })
  .openapi('ReserveResponse', { description: 'Kết quả giữ hàng thành công.' });

export const FaultRequestSchema = z
  .strictObject({
    delayMs: z.number().int().min(0),
  })
  .openapi('FaultRequest', { description: 'Cài đặt độ trễ giả lập.' });

export type ReserveRequest = z.infer<typeof ReserveRequestSchema>;
export type ReserveResponse = z.infer<typeof ReserveResponseSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  for (const [name, schema] of Object.entries({
    Error: ErrorSchema,
    Health: HealthSchema,
    Metrics: MetricsSchema,
    ReserveRequest: ReserveRequestSchema,
    ReserveResponse: ReserveResponseSchema,
    FaultRequest: FaultRequestSchema,
  })) {
    registry.register(name, schema);
  }

  registry.registerPath({
    method: 'post',
    path: '/inventory/reservations',
    summary: 'Giữ hàng trong kho (nguyên tử)',
    description: 'Trừ tồn bằng câu lệnh có điều kiện. Đủ hàng trả 201, hết hàng 409, sai dữ liệu 400.',
    request: { body: json(ReserveRequestSchema, 'Thông tin sku và quantity') },
    responses: {
      201: json(ReserveResponseSchema, 'Giữ hàng thành công'),
      400: json(ErrorSchema, 'VALIDATION_ERROR: sku hoặc quantity ngoài miền'),
      409: json(ErrorSchema, 'OUT_OF_STOCK: Hết hàng hoặc không đủ số lượng'),
      500: json(ErrorSchema, 'INTERNAL_ERROR: Lỗi cơ sở dữ liệu'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: 'Kiểm tra trạng thái service',
    responses: { 200: json(HealthSchema, 'Còn sống') },
  });

  registry.registerPath({
    method: 'get',
    path: '/_metrics',
    summary: 'Lấy số đo request và db queries',
    responses: { 200: json(MetricsSchema, 'Bộ đếm') },
  });

  registry.registerPath({
    method: 'post',
    path: '/_metrics/reset',
    summary: 'Đặt lại bộ đếm số đo',
    responses: { 204: { description: 'Đã đặt lại bộ đếm' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/_reset',
    summary: 'Khôi phục dữ liệu tồn kho về fixture ban đầu',
    responses: { 204: { description: 'Đã đặt lại tồn kho' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/_fault',
    summary: 'Bơm độ trễ giả lập cho cả REST và gRPC',
    request: { body: json(FaultRequestSchema, 'Độ trễ delayMs') },
    responses: { 204: { description: 'Đã cài đặt độ trễ' } },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Inventory Service',
      version: '1.0.0',
      description: 'Quản lý tồn kho và giữ hàng (REST & gRPC).',
    },
    servers: [{ url: 'http://localhost:4006' }],
  });
}

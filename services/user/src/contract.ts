// Hợp đồng của User Service: nguồn sự thật cho openapi.json (npm run openapi).
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

export const UserSchema = z
  .strictObject({ id: z.int().min(1), name: z.string() })
  .openapi('User');

export type User = z.infer<typeof UserSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({ Error: ErrorSchema, Health: HealthSchema, Metrics: MetricsSchema, User: UserSchema })) {
    registry.register(name, schema);
  }

  registry.registerPath({
    method: 'get',
    path: '/users/{id}',
    summary: 'Lấy một người dùng',
    request: { params: z.object({ id: z.coerce.number().int().min(1) }) },
    responses: {
      200: json(UserSchema, 'Người dùng'),
      404: json(ErrorSchema, 'USER_NOT_FOUND'),
      500: json(ErrorSchema, 'INTERNAL_ERROR'),
    },
  });
  registry.registerPath({ method: 'get', path: '/health', responses: { 200: json(HealthSchema, 'Còn sống') } });
  registry.registerPath({ method: 'get', path: '/_metrics', responses: { 200: json(MetricsSchema, 'Bộ đếm') } });
  registry.registerPath({ method: 'post', path: '/_metrics/reset', responses: { 204: { description: 'Đã đặt lại bộ đếm' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'User Service', version: '1.0.0', description: 'Dữ liệu người dùng. Mỗi service sở hữu hợp đồng của mình.' },
    servers: [{ url: 'http://localhost:4001' }],
  });
}

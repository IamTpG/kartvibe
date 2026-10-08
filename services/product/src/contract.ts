// Hợp đồng của Product Service: nguồn sự thật cho openapi.json (npm run openapi).
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

export const ProductSchema = z
  .strictObject({
    id: z.int().min(1),
    sku: z.string(),
    name: z.string(),
    price: z.int().min(0),
    thumbnail: z.string(),
    description: z.string(),
  })
  .openapi('Product');

export const ProductListSchema = z.strictObject({ data: z.array(ProductSchema) }).openapi('ProductList');

export type Product = z.infer<typeof ProductSchema>;
export type ProductList = z.infer<typeof ProductListSchema>;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({ Error: ErrorSchema, Health: HealthSchema, Metrics: MetricsSchema, Product: ProductSchema, ProductList: ProductListSchema })) {
    registry.register(name, schema);
  }

  registry.registerPath({
    method: 'get',
    path: '/products/{id}',
    summary: 'Lấy một product (1 request, 1 truy vấn DB)',
    request: { params: z.object({ id: z.coerce.number().int().min(1) }) },
    responses: {
      200: json(ProductSchema, 'Product'),
      404: json(ErrorSchema, 'PRODUCT_NOT_FOUND'),
      500: json(ErrorSchema, 'INTERNAL_ERROR'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/products',
    summary: 'Lấy nhiều product theo ids (1 request, 1 truy vấn DB)',
    description:
      'ids là số nguyên cách nhau dấu phẩy. Id trùng chỉ tính một; id không tồn tại bị bỏ qua; kết quả sắp theo id tăng dần; tối đa 200 id.',
    request: { query: z.object({ ids: z.string().openapi({ example: '8,9,10' }) }) },
    responses: {
      200: json(ProductListSchema, 'Các product tìm thấy'),
      400: json(ErrorSchema, 'VALIDATION_ERROR: sai định dạng hoặc quá 200 id'),
      500: json(ErrorSchema, 'INTERNAL_ERROR'),
    },
  });
  registry.registerPath({ method: 'get', path: '/health', responses: { 200: json(HealthSchema, 'Còn sống') } });
  registry.registerPath({ method: 'get', path: '/_metrics', responses: { 200: json(MetricsSchema, 'Bộ đếm') } });
  registry.registerPath({ method: 'post', path: '/_metrics/reset', responses: { 204: { description: 'Đã đặt lại bộ đếm' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Product Service', version: '1.0.0', description: 'Danh mục product. Các điểm vào /_fault và /_seed chỉ có khi ENABLE_TEST_HOOKS=1 nên không nằm trong hợp đồng.' },
    servers: [{ url: 'http://localhost:4003' }],
  });
}

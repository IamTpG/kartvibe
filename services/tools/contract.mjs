// Kiểm dữ liệu theo HỢP ĐỒNG ĐÃ CÔNG BỐ của từng service: <service>/openapi.json (sinh từ src/contract.ts của chính service đó).
// Dùng cho check-contract (service thật), test của BFF/GraphQL (service giả và kết quả của chúng) và test của schema.
// Chỉ đọc artifact openapi.json, không import mã của service.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const specs = new Map();
const compiled = new Map();

function spec(service) {
  if (!specs.has(service)) {
    const file = new URL(`../${service}/openapi.json`, import.meta.url);
    specs.set(service, JSON.parse(readFileSync(file, 'utf8')));
  }
  return specs.get(service);
}

function validator(key, service, schema) {
  if (!compiled.has(key)) compiled.set(key, ajv.compile({ ...schema, components: spec(service).components }));
  return compiled.get(key);
}

const describe = (validate) => validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);

/** Lỗi khi `data` không khớp response `status` của `route` (ví dụ 'GET /users/{id}') trong hợp đồng của `service`. */
export function responseViolations(service, route, status, data) {
  const [method, path] = route.split(' ');
  const schema = spec(service).paths?.[path]?.[method.toLowerCase()]?.responses?.[status]?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`Hợp đồng của ${service} không khai báo ${route} → ${status}`);
  const validate = validator(`${service} ${route} ${status}`, service, schema);
  return validate(data) ? [] : describe(validate);
}

/** Lỗi khi `data` không khớp schema có tên `name` trong components của `service` (ví dụ graphql/WebData). */
export function schemaViolations(service, name, data) {
  const schema = spec(service).components?.schemas?.[name];
  if (!schema) throw new Error(`Hợp đồng của ${service} không có schema "${name}"`);
  const validate = validator(`${service} #${name}`, service, { $ref: `#/components/schemas/${name}` });
  return validate(data) ? [] : describe(validate);
}

const fail = (what, v) => { if (v.length) throw new Error(`Vi phạm hợp đồng ${what}: ${v.slice(0, 5).join('; ')}`); };
export const assertResponse = (service, route, status, data) => fail(`${service} ${route} → ${status}`, responseViolations(service, route, status, data));
export const assertSchema = (service, name, data) => fail(`${service}/${name}`, schemaViolations(service, name, data));

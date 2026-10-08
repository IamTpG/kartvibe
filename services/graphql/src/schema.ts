// Schema GraphQL theo hợp đồng chung (mục 5). Hai query web/mobile dùng chung một schema.
import DataLoader from 'dataloader';
import { buildSchema, GraphQLError, type GraphQLObjectType } from 'graphql';
import { getOrders, getProduct, getProducts, getUser, type OrderRow, type Product, UpstreamError } from './upstream.js';

export const SDL = /* GraphQL */ `
  type Query {
    user(id: Int!): User
    orders(userId: Int!): [Order!]!
  }
  type User      { id: Int!  name: String! }
  type Order     { id: Int!  status: String!  createdAt: String!  items: [OrderItem!]! }
  type OrderItem { productId: Int!  quantity: Int!  product: Product }
  type Product   { id: Int!  name: String!  price: Int!  thumbnail: String!  description: String! }
`;

export type LoaderMode = 'on' | 'off';

export interface Context {
  requestId: string;
  product: { load(id: number): Promise<Product | null> };
}

/**
 * off: mỗi item gọi riêng GET /products/:id  → N+1 (cố ý).
 * on : gom id trong MỘT request, loại trùng, gọi GET /products?ids= một lần.
 * Tạo mới cho mỗi request để cache không dùng chung giữa các request.
 */
export function makeContext(requestId: string, mode: LoaderMode): Context {
  if (mode === 'off') {
    return { requestId, product: { load: (id) => getProduct(id, requestId) } };
  }
  const loader = new DataLoader<number, Product | null>(async (ids) => {
    try {
      const list = await getProducts(ids, requestId);
      const byId = new Map(list.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id) ?? null);
    } catch (err) {
      return ids.map(() => err as Error); // mỗi key nhận cùng một lỗi
    }
  });
  return { requestId, product: { load: (id) => loader.load(id) } };
}

const upstreamFailure = (service: string, code: string, message: string) =>
  new GraphQLError(message, { extensions: { code, service } });

const schema = buildSchema(SDL);

function resolver(type: string, field: string, fn: (parent: any, args: any, ctx: Context) => unknown) {
  (schema.getType(type) as GraphQLObjectType).getFields()[field].resolve = fn;
}

resolver('Query', 'user', async (_p, { id }, ctx) => {
  try {
    return await getUser(id, ctx.requestId);
  } catch (err) {
    throw upstreamFailure('user', 'UPSTREAM_ERROR', (err as Error).message);
  }
});

resolver('Query', 'orders', async (_p, { userId }, ctx): Promise<OrderRow[]> => {
  try {
    return await getOrders(userId, ctx.requestId);
  } catch (err) {
    throw upstreamFailure('order', 'UPSTREAM_ERROR', (err as Error).message);
  }
});

// Policy lỗi chung: product lỗi/quá thời gian chờ → null + một mục trong `errors`; không điền giá trị giả.
resolver('OrderItem', 'product', async (item, _args, ctx) => {
  try {
    return await ctx.product.load(item.productId);
  } catch (err) {
    const detail = err instanceof UpstreamError ? err.message : 'Product Service không khả dụng';
    throw upstreamFailure('product', 'PRODUCT_UNAVAILABLE', detail);
  }
});

export { schema };

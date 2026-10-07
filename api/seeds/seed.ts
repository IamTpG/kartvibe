import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Mỗi bảng một file trong seeds/data/ (dùng chung với evidence/build-collection.mjs).
// `alias` chỉ để người đọc/test tham chiếu, không phải cột DB.
const load = <T>(table: string): T[] =>
  JSON.parse(readFileSync(new URL(`./data/${table}.json`, import.meta.url), 'utf-8'));
const dropAlias = <T extends { alias: string }>({ alias: _alias, ...row }: T) => row;

const products = load<{ alias: string; id: string; sku: string; name: string; priceCents: number; stock: number; isActive: boolean }>('products').map(dropAlias);
const carts = load<{ alias: string; id: string; status: string }>('carts').map(dropAlias);
const cartItems = load<{ alias: string; cartId: string; productId: string; quantity: number }>('cart_items').map(dropAlias);

async function main() {
  // Idempotent: xóa sạch rồi nạp lại. Thứ tự theo khóa ngoại: xóa con trước cha, nạp cha trước con.
  // Thêm bảng mới = thêm seeds/data/<bảng>.json và 1 dòng deleteMany/createMany ở đúng vị trí.
  await prisma.$transaction([
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.product.deleteMany(),
    prisma.product.createMany({ data: products }),
    prisma.cart.createMany({ data: carts }),
    prisma.cartItem.createMany({ data: cartItems }),
  ]);
  console.log(`Seeded: products=${products.length}, carts=${carts.length}, cart_items=${cartItems.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

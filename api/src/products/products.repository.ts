import { prisma } from '../shared/db.js';

export const productsRepository = {
  async listActive(limit: number, offset: number) {
    const where = { isActive: true };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { sku: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);
    return { rows, total };
  },
};

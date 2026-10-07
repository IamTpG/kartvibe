import { productsRepository } from './products.repository.js';

export const productsService = {
  async list(limit: number, offset: number) {
    const { rows, total } = await productsRepository.listActive(limit, offset);
    return {
      data: rows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price_cents: p.priceCents,
        stock: p.stock,
      })),
      total,
      limit,
      offset,
    };
  },
};

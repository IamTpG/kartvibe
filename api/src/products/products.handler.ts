import type { RequestHandler } from 'express';
import { productsService } from './products.service.js';

export const listProducts: RequestHandler = async (_req, res) => {
  const { limit, offset } = res.locals.query as { limit: number; offset: number };
  res.status(200).json(await productsService.list(limit, offset));
};

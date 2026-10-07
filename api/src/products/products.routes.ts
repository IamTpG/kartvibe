import { Router } from 'express';
import { ListProductsQuery } from '../openapi/schemas/products.js';
import { methodNotAllowed } from '../shared/middleware/error-handler.js';
import { validate } from '../shared/middleware/validate.js';
import { listProducts } from './products.handler.js';

export const productsRouter = Router();

productsRouter
  .route('/products')
  .get(validate({ query: ListProductsQuery }), listProducts)
  .all(methodNotAllowed);

import { Router } from 'express';
import { CartIdParams } from '../openapi/schemas/carts.js';
import { AddItemRequest, CartItemParams, UpdateItemRequest } from '../openapi/schemas/items.js';
import { methodNotAllowed } from '../shared/middleware/error-handler.js';
import { validate } from '../shared/middleware/validate.js';
import { addItem, createCart, getCart, removeItem, updateItem } from './carts.handler.js';

export const cartsRouter = Router();

cartsRouter.route('/carts').post(createCart).all(methodNotAllowed);

cartsRouter
  .route('/carts/:cartId')
  .get(validate({ params: CartIdParams }), getCart)
  .all(methodNotAllowed);

cartsRouter
  .route('/carts/:cartId/items')
  .post(validate({ params: CartIdParams, body: AddItemRequest }), addItem)
  .all(methodNotAllowed);

cartsRouter
  .route('/carts/:cartId/items/:productId')
  .patch(validate({ params: CartItemParams, body: UpdateItemRequest }), updateItem)
  .delete(validate({ params: CartItemParams }), removeItem)
  .all(methodNotAllowed);

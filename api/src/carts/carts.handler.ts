import type { RequestHandler } from 'express';
import { cartsService } from './carts.service.js';

export const createCart: RequestHandler = async (_req, res) => {
  const cart = await cartsService.create();
  res.status(201).location(`/carts/${cart.id}`).json(cart);
};

export const getCart: RequestHandler = async (_req, res) => {
  const { cartId } = res.locals.params as { cartId: string };
  res.status(200).json(await cartsService.get(cartId));
};

type Params = { cartId: string; productId?: string };

export const addItem: RequestHandler = async (_req, res) => {
  const { cartId } = res.locals.params as Params;
  const { product_id, quantity } = res.locals.body as { product_id: string; quantity: number };
  res.status(201).json(await cartsService.addItem(cartId, product_id, quantity));
};

export const updateItem: RequestHandler = async (_req, res) => {
  const { cartId, productId } = res.locals.params as Required<Params>;
  const { quantity } = res.locals.body as { quantity: number };
  res.status(200).json(await cartsService.updateItem(cartId, productId, quantity));
};

export const removeItem: RequestHandler = async (_req, res) => {
  const { cartId, productId } = res.locals.params as Required<Params>;
  await cartsService.removeItem(cartId, productId);
  res.status(204).end();
};

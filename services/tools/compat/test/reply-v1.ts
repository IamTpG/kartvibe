// Mã phụ thuộc hình dạng ReserveReply của client CŨ (proto v1): không đọc available.
import * as grpc from '@grpc/grpc-js';
import { InventoryClient, type ReserveReply } from './generated/v1/inventory.js';

export const CLIENT_VERSION = 'v1';
export const makeClient = (addr: string) => new InventoryClient(addr, grpc.credentials.createInsecure());
export const replyFields = (_reply: ReserveReply): Record<string, unknown> => ({});

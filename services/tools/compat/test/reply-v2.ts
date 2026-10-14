// Mã phụ thuộc hình dạng ReserveReply của client MỚI (proto v2): available vắng thì ghi "absent", không suy ra 0 (D7).
import * as grpc from '@grpc/grpc-js';
import { InventoryClient, type ReserveReply } from './generated/v2/inventory.js';

export const CLIENT_VERSION = 'v2';
export const makeClient = (addr: string) => new InventoryClient(addr, grpc.credentials.createInsecure());
export const replyFields = (reply: ReserveReply): Record<string, unknown> => ({
  available: reply.available === undefined ? 'absent' : reply.available,
});

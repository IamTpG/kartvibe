// All ReserveReply v2 presence handling and the client version live here so
// order-v1 needs to change only this file after regenerating from proto v1.
import { credentials, Metadata, status, type ServiceError } from '@grpc/grpc-js';
import { InventoryClient as GeneratedClient } from '../generated/inventory.js';
import { InventoryError, type InventoryClient, type ReserveContext, type ReserveResult } from './types.js';

export const clientVersion = 'v2';
const grpcNames = new Map<number, string>(Object.entries(status).filter(([, value]) => typeof value === 'number').map(([name, value]) => [value as number, name]));

export class GrpcInventoryClient implements InventoryClient {
  readonly protocol = 'grpc' as const;
  private readonly client: GeneratedClient;

  constructor(address: string) { this.client = new GeneratedClient(address, credentials.createInsecure()); }

  reserve(sku: string, quantity: number, ctx: ReserveContext): Promise<ReserveResult> {
    // int32 would wrap larger JSON integers, potentially reserving the wrong quantity.
    // The wire contract cannot represent them; report the same validation result
    // that Inventory returns for quantities outside its accepted range.
    if (quantity < -2147483648 || quantity > 2147483647) {
      return Promise.reject(new InventoryError('VALIDATION_ERROR', status.INVALID_ARGUMENT, 'INVALID_ARGUMENT'));
    }
    const metadata = new Metadata();
    metadata.set('x-request-id', ctx.requestId);
    metadata.set('x-client-version', clientVersion);
    return new Promise((resolve, reject) => {
      this.client.reserve({ sku, quantity }, metadata, { deadline: Date.now() + ctx.deadlineMs }, (error, reply) => {
        if (error) return reject(this.mapError(error));
        if (!reply?.reservationId) return reject(new InventoryError('INTERNAL_ERROR', status.OK, 'OK'));
        // Optional field presence is meaningful: zero and absent are distinct.
        const result: ReserveResult = { reservationId: reply.reservationId };
        if (reply.available !== undefined) result.available = reply.available;
        resolve(result);
      });
    });
  }

  private mapError(error: ServiceError): InventoryError {
    const name = grpcNames.get(error.code) ?? 'UNKNOWN';
    if (error.code === status.FAILED_PRECONDITION && error.metadata?.get('x-error-code').map(String).includes('OUT_OF_STOCK')) {
      return new InventoryError('OUT_OF_STOCK', error.code, name);
    }
    if (error.code === status.INVALID_ARGUMENT) return new InventoryError('VALIDATION_ERROR', error.code, name);
    if (error.code === status.DEADLINE_EXCEEDED) return new InventoryError('INVENTORY_TIMEOUT', error.code, name);
    if (error.code === status.UNAVAILABLE) return new InventoryError('INVENTORY_UNAVAILABLE', error.code, name);
    return new InventoryError('INTERNAL_ERROR', error.code, name);
  }
}

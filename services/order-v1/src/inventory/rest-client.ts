import { InventoryError, type InventoryClient, type ReserveContext, type ReserveResult } from './types.js';
import { clientVersion } from './grpc-client.js';

export class RestInventoryClient implements InventoryClient {
  readonly protocol = 'rest' as const;
  constructor(private readonly baseUrl: string) {}

  async reserve(sku: string, quantity: number, ctx: ReserveContext): Promise<ReserveResult> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/inventory/reservations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': ctx.requestId, 'x-client-version': clientVersion },
        body: JSON.stringify({ sku, quantity }),
        signal: AbortSignal.timeout(ctx.deadlineMs),
      });
      if (response.status === 201) {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null && 'reservationId' in body && typeof body.reservationId === 'string' && body.reservationId) {
          return { reservationId: body.reservationId };
        }
        throw new InventoryError('INTERNAL_ERROR', 201);
      }
      if (response.status === 409) {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null && 'code' in body && body.code === 'OUT_OF_STOCK') {
          throw new InventoryError('OUT_OF_STOCK', 409);
        }
      }
      if (response.status === 400) throw new InventoryError('VALIDATION_ERROR', 400);
      throw new InventoryError('INTERNAL_ERROR', response.status);
    } catch (error) {
      if (error instanceof InventoryError) throw error;
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new InventoryError('INVENTORY_TIMEOUT', 504);
      }
      if (error instanceof TypeError) throw new InventoryError('INVENTORY_UNAVAILABLE', 503);
      throw new InventoryError('INTERNAL_ERROR', 500);
    }
  }
}

export type InventoryErrorKind = 'OUT_OF_STOCK' | 'VALIDATION_ERROR' | 'INVENTORY_TIMEOUT' | 'INVENTORY_UNAVAILABLE' | 'INTERNAL_ERROR';

export class InventoryError extends Error {
  constructor(
    public readonly kind: InventoryErrorKind,
    public readonly upstreamStatus: number,
    public readonly grpcStatus?: string,
  ) {
    super(kind);
  }
}

export interface ReserveContext { requestId: string; deadlineMs: number }
export interface ReserveResult { reservationId: string; available?: number }
export interface InventoryClient {
  readonly protocol: 'rest' | 'grpc';
  reserve(sku: string, quantity: number, ctx: ReserveContext): Promise<ReserveResult>;
}

export const externalErrors: Record<InventoryErrorKind, { status: number; message: string }> = {
  OUT_OF_STOCK: { status: 409, message: 'Out of stock' },
  VALIDATION_ERROR: { status: 400, message: 'Invalid reservation request' },
  INVENTORY_TIMEOUT: { status: 504, message: 'Inventory request timed out' },
  INVENTORY_UNAVAILABLE: { status: 503, message: 'Inventory unavailable' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
};

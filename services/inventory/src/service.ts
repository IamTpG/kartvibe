import { pool, metrics } from './db.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateReserveInput(sku: unknown, quantity: unknown): ValidationResult {
  if (typeof sku !== 'string' || sku.length === 0) {
    return { valid: false, error: 'sku must be a non-empty string' };
  }
  if (sku.length > 64) {
    return { valid: false, error: 'sku must not exceed 64 characters' };
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    return { valid: false, error: 'quantity must be an integer' };
  }
  if (quantity < 1 || quantity > 1000) {
    return { valid: false, error: 'quantity must be between 1 and 1000' };
  }
  return { valid: true };
}

export type ReserveResult =
  | { success: true; reservationId: string; available: number }
  | { success: false; reason: 'OUT_OF_STOCK' };

export async function reserve(sku: string, quantity: number): Promise<ReserveResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    metrics.dbQueries += 1;

    // Trừ tồn kho bằng câu lệnh có điều kiện (nguyên tử)
    const updateRes = await client.query<{ available: number }>(
      `UPDATE stock SET available = available - $1 WHERE sku = $2 AND available >= $1 RETURNING available;`,
      [quantity, sku]
    );
    metrics.dbQueries += 1;

    if (updateRes.rowCount === 0) {
      await client.query('ROLLBACK');
      metrics.dbQueries += 1;
      return { success: false, reason: 'OUT_OF_STOCK' };
    }

    const available = updateRes.rows[0].available;

    const insertRes = await client.query<{ id: number }>(
      `INSERT INTO reservations (sku, quantity) VALUES ($1, $2) RETURNING id;`,
      [sku, quantity]
    );
    metrics.dbQueries += 1;

    await client.query('COMMIT');
    metrics.dbQueries += 1;

    const id = insertRes.rows[0].id;
    return {
      success: true,
      reservationId: `RSV-${id}`,
      available,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Độ trễ giả lập (Fault Injection)
let currentDelayMs = process.env.LATENCY_MS ? parseInt(process.env.LATENCY_MS, 10) : 0;

export function setFaultDelay(ms: number): void {
  currentDelayMs = ms >= 0 ? ms : 0;
}

export function getFaultDelay(): number {
  return currentDelayMs;
}

export async function applyFaultDelay(): Promise<void> {
  if (currentDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, currentDelayMs));
  }
}

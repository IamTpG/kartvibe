// Fixture tồn kho xác định (PLAN-trich.md mục 3.4). Không database (D12): giữ trong bộ nhớ,
// nên khởi động lại tiến trình là nạp lại tồn kho.
const SEED: Readonly<Record<string, number>> = { 'SKU-OK': 10, 'SKU-LOW': 1, 'SKU-ZERO': 0 };

const stock = new Map<string, number>();
let nextReservation = 1;

export function resetStock(): void {
  stock.clear();
  for (const [sku, n] of Object.entries(SEED)) stock.set(sku, n);
  nextReservation = 1;
}
resetStock();

export type ReserveResult =
  | { kind: 'reserved'; reservationId: string }
  | { kind: 'out_of_stock'; inStock: number }
  | { kind: 'invalid'; message: string };

// Kiểm miền giá trị như Inventory thật (mục 3.2): sku 1..64 ký tự, quantity 1..1000.
export function reserve(sku: string, quantity: number): ReserveResult {
  if (sku.length === 0 || sku.length > 64) return { kind: 'invalid', message: 'sku phải có 1 đến 64 ký tự' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    return { kind: 'invalid', message: 'quantity phải từ 1 đến 1000' };
  }
  // sku không có trong fixture coi như tồn 0. Node chạy đơn luồng nên kiểm và trừ liền nhau là nguyên tử.
  const inStock = stock.get(sku) ?? 0;
  if (inStock < quantity) return { kind: 'out_of_stock', inStock };
  stock.set(sku, inStock - quantity);
  return { kind: 'reserved', reservationId: `v1-res-${nextReservation++}` };
}

// Một dòng JSON mỗi lời gọi ra stdout (ADR 0009, PLAN-trich.md mục 3.5). Không ghi file log trong mã.
export const SERVICE = 'inventory-grpc-v1';

export function log(entry: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), service: SERVICE, ...entry }) + '\n');
}

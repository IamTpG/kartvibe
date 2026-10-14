// Log của bản giả: một dòng JSON mỗi lời gọi ra stdout, như PLAN-trich.md mục 3.5.
export function makeLog(service: string) {
  return (entry: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), service, ...entry }) + '\n');
}

export const GRPC_PATH = '/kartvibe.inventory.Inventory/Reserve';
export const elapsed = (started: number) => Number((performance.now() - started).toFixed(1));

// Mỗi lời gọi một dòng JSON ra stdout (dùng làm trace N+1). Nơi lưu log do môi trường chạy quyết định:
// start-all.sh ghi stdout vào LOG_DIR; Docker/Kubernetes dùng cơ chế riêng của chúng.
export function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'graphql', ...entry }));
}

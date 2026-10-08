export interface LogEntry {
  ts: string;
  service: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

// Mỗi lời gọi nghiệp vụ một dòng JSON ra stdout. Nơi lưu log do môi trường chạy quyết định
// (start-all.sh ghi vào LOG_DIR; Docker/Kubernetes dùng cơ chế riêng của chúng).
export function logRequest(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

// Sự kiện vòng đời (khởi động...): cũng một dòng JSON, không có requestId, để mọi dòng stdout đều parse được.
export function logEvent(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'user', msg, ...extra }));
}

export interface LogEntry {
  ts: string;
  service: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  protocol?: 'rest' | 'grpc';
  direction?: 'inbound' | 'outbound';
  operation?: string;
  clientVersion?: string;
  reservationId?: string;
  errorCode?: string;
  grpcStatus?: string;
  [key: string]: unknown;
}

// Mỗi lời gọi nghiệp vụ một dòng JSON ra stdout (ADR 0009 & PLAN-trich 3.5).
export function logRequest(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

// Sự kiện vòng đời (khởi động...): cũng một dòng JSON, không có requestId.
export function logEvent(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'inventory', msg, ...extra }));
}

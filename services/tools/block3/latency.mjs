import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { resetAllServices } from './scenarios.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ORDER_REST_URL = process.env.ORDER_REST_URL || 'http://localhost:4002';
export const ORDER_GRPC_URL = process.env.ORDER_GRPC_URL || 'http://localhost:4012';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let n = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--n' && args[i + 1]) {
      n = parseInt(args[i + 1], 10) || 5;
      i++;
    }
  }
  return { n: Math.max(n, 5) };
}

function calculateStats(times) {
  if (times.length === 0) return { median: 0, min: 0, max: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  let median;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    median = sorted[mid];
  } else {
    median = Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }

  return { median, min, max, sorted };
}

async function measureEndpoint(name, url, count) {
  console.log(`[latency] Đo cổng: ${name} (${url}) với ${count} lần chạy (gọi /_reset trước mỗi lần)...`);
  const latencies = [];

  for (let i = 1; i <= count; i++) {
    await resetAllServices();

    const start = performance.now();
    const res = await fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-OK', quantity: 2 })
    });
    const elapsed = Number((performance.now() - start).toFixed(2));

    if (res.status !== 201) {
      console.warn(`  [Lần ${i}/${count}] Cảnh báo: HTTP status = ${res.status}`);
    }
    latencies.push(elapsed);
    console.log(`  - Lần ${i}/${count}: ${elapsed} ms (HTTP ${res.status})`);
  }

  return latencies;
}

export async function runLatency(count = 5) {
  const ts = new Date().toISOString();
  console.log(`======================================================================`);
  console.log(`[latency] Bắt đầu đo thời gian phản hồi API ngoài Order kịch bản "ok"`);
  console.log(`  - Thời điểm bắt đầu: ${ts}`);
  console.log(`  - Số lần gọi mỗi cổng: ${count} lần (tối thiểu 5 lần theo W4.md)`);
  console.log(`  - REST URL: ${ORDER_REST_URL}`);
  console.log(`  - gRPC URL: ${ORDER_GRPC_URL}`);
  console.log(`======================================================================\n`);

  const restTimes = await measureEndpoint('REST (4002)', ORDER_REST_URL, count);
  console.log('');
  const grpcTimes = await measureEndpoint('gRPC (4012)', ORDER_GRPC_URL, count);

  const restStats = calculateStats(restTimes);
  const grpcStats = calculateStats(grpcTimes);

  console.log(`\n======================================================================`);
  console.log(`BẢNG KẾT QUẢ ĐO THỜI GIAN PHẢN HỒI (ms)`);
  console.log(`Thời điểm: ${ts} | Số mẫu mỗi cổng: ${count}`);
  console.log(`======================================================================`);
  console.log(`| Cổng / Chế độ       | Số mẫu (n) | Median (ms) | [Min, Max] (ms)     | Các mẫu đo được (ms) |`);
  console.log(`|---------------------|------------|-------------|---------------------|----------------------|`);
  console.log(`| REST (4002)         | ${count.toString().padEnd(10)} | ${restStats.median.toString().padEnd(11)} | [${restStats.min}, ${restStats.max}]`.padEnd(44) + `| ${restTimes.join(', ')} |`);
  console.log(`| gRPC (4012)         | ${count.toString().padEnd(10)} | ${grpcStats.median.toString().padEnd(11)} | [${grpcStats.min}, ${grpcStats.max}]`.padEnd(44) + `| ${grpcTimes.join(', ')} |`);
  console.log(`======================================================================`);
  console.log(`(Lưu ý: Không đưa ra kết luận về hiệu năng chung ngoài dữ liệu đo được)\n`);

  // Save to out/
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const resultData = {
    timestamp: ts,
    sampleCount: count,
    endpoints: {
      rest: ORDER_REST_URL,
      grpc: ORDER_GRPC_URL
    },
    results: {
      rest: {
        raw: restTimes,
        median: restStats.median,
        min: restStats.min,
        max: restStats.max
      },
      grpc: {
        raw: grpcTimes,
        median: grpcStats.median,
        min: grpcStats.min,
        max: grpcStats.max
      }
    }
  };

  const outFile = path.join(outDir, 'latency-measurement.json');
  fs.writeFileSync(outFile, JSON.stringify(resultData, null, 2), 'utf8');
  console.log(`[latency] Đã lưu dữ liệu đo vào: ${outFile}`);

  return true;
}

if (process.argv[1] && process.argv[1].endsWith('latency.mjs')) {
  const { n } = parseArgs();
  runLatency(n).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('[latency] Lỗi:', err);
    process.exit(1);
  });
}

// Chặn `npm run reset` chạy nhầm trên DB không phải môi trường dev/test cục bộ.
// Từ chối khi NODE_ENV=production hoặc host trong DATABASE_URL không phải máy local.
import { pathToFileURL } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Trả { ok, target, reason }. Không bao giờ trả mật khẩu. */
export function check(env) {
  if (env.NODE_ENV === 'production') {
    return { ok: false, reason: 'NODE_ENV=production' };
  }
  if (!env.DATABASE_URL) {
    return { ok: false, reason: 'thiếu DATABASE_URL' };
  }
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    return { ok: false, reason: 'DATABASE_URL không hợp lệ' };
  }
  const target = `${url.hostname}:${url.port || '5432'}/${url.pathname.replace(/^\//, '')}`;
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return { ok: false, target, reason: `host "${url.hostname}" không phải máy local` };
  }
  return { ok: true, target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('dotenv/config');
  const r = check(process.env);
  if (!r.ok) {
    console.error(`Từ chối reset: ${r.reason}${r.target ? ` (${r.target})` : ''}`);
    process.exit(1);
  }
  console.log(`Reset DB: ${r.target}`);
}

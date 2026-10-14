// Tiện ích khởi động tiến trình cho check và run-fakes: stdout của mỗi tiến trình ghi vào <logDir>/<tên>.log,
// giống logs/<tên>.log của start-all.sh, để compat.mjs đọc như log thật.
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export const freePort = () => new Promise((ok) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

export function start({ name, script, cwd, env, logDir }) {
  const logFile = join(logDir, `${name}.log`);
  const errFile = join(logDir, `${name}.err.log`);
  const out = openSync(logFile, 'a');
  const err = openSync(errFile, 'a');
  // --import tsx phân giải tsx từ cwd, nên mỗi tiến trình dùng node_modules của gói chứa nó.
  const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, err] });
  closeSync(out);
  closeSync(err);
  return { name, child, logFile, errFile };
}

export async function waitStarted(proc, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) break;
    const started = readFileSync(proc.logFile, 'utf8').split('\n').some((l) => l.includes('"event":"started"'));
    if (started) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const stderr = readFileSync(proc.errFile, 'utf8').trim();
  throw new Error(`${proc.name} không khởi động được (exit ${proc.child.exitCode})${stderr ? `:\n${stderr}` : ''}`);
}

export async function stop(proc) {
  if (proc.child.exitCode !== null) return;
  const exited = new Promise((r) => proc.child.once('exit', r));
  proc.child.kill('SIGTERM');
  const timer = setTimeout(() => proc.child.kill('SIGKILL'), 2000);
  await exited;
  clearTimeout(timer);
}

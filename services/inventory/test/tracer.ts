import http from 'node:http';
import * as grpc from '@grpc/grpc-js';
import { callGrpcReserve, createInventoryGrpcClient } from './grpc-client.js';

const port = Number(process.env.PORT || 4006);
const grpcPort = Number(process.env.GRPC_PORT || 4007);
const grpcClient = createInventoryGrpcClient(`localhost:${grpcPort}`);
let failed = false;

async function run() {
  console.log('--- RUNNING TRACER BULLET CHECKS ---');
  const restOk = await new Promise<boolean>((resolve) => {
    http.get(`http://localhost:${port}/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(res.statusCode === 200 && JSON.parse(body).status === 'ok'));
    }).on('error', () => resolve(false));
  });
  console.log(`[TRACER] REST /health available: ${restOk ? 'PASS' : 'FAIL'}`);
  if (!restOk) failed = true;

  const grpcResult = await callGrpcReserve(grpcClient, { sku: 'TRACER-NOT-FOUND', quantity: 1 });
  const grpcOk = grpcResult.error?.code === grpc.status.FAILED_PRECONDITION;
  console.log(`[TRACER] gRPC Reserve available: ${grpcOk ? 'PASS' : 'FAIL'}`);
  if (!grpcOk) failed = true;
  grpcClient.close();

  console.log(failed ? 'TRACER BULLET FAILED (RED)' : 'TRACER BULLET PASSED (GREEN)');
  process.exitCode = failed ? 1 : 0;
}

run().catch((error) => {
  console.error('TRACER BULLET FAILED (RED)', error);
  grpcClient.close();
  process.exitCode = 1;
});

import * as grpc from '@grpc/grpc-js';
import { InventoryClient, ReserveRequest, ReserveReply } from '../src/generated/inventory.js';

export interface GrpcCallResult {
  response?: ReserveReply;
  error?: grpc.ServiceError;
}

export function createInventoryGrpcClient(addr = 'localhost:4007'): InventoryClient {
  return new InventoryClient(addr, grpc.credentials.createInsecure());
}

export function callGrpcReserve(
  client: InventoryClient,
  req: ReserveRequest,
  metadataObj: Record<string, string> = {}
): Promise<GrpcCallResult> {
  return new Promise((resolve) => {
    const md = new grpc.Metadata();
    for (const [k, v] of Object.entries(metadataObj)) {
      md.set(k, v);
    }

    client.reserve(req, md, (err, response) => {
      if (err) {
        resolve({ error: err });
      } else {
        resolve({ response });
      }
    });
  });
}

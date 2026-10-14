import * as grpc from '@grpc/grpc-js';
import * as s2 from './gen/v2/inventory';
import * as c1 from './gen/v1/inventory';
const server = new grpc.Server();
server.addService(s2.InventoryService, {
  reserve: (_call: any, cb: any) => {
    const md = new grpc.Metadata();
    md.set('x-error-code', 'OUT_OF_STOCK');
    cb({ code: grpc.status.FAILED_PRECONDITION, details: 'OUT_OF_STOCK', metadata: md });
  },
});
server.bindAsync('127.0.0.1:50998', grpc.ServerCredentials.createInsecure(), () => {
  const old = new c1.InventoryClient('127.0.0.1:50998', grpc.credentials.createInsecure());
  old.reserve({ sku: 'Z', quantity: 1 }, (e) => {
    console.log('status:', grpc.status[e!.code], '| details:', e!.details, '| x-error-code:', e!.metadata.get('x-error-code'));
    server.forceShutdown(); process.exit(0);
  });
});

import * as grpc from '@grpc/grpc-js';
import * as s2 from './gen/v2/inventory';
import * as c1 from './gen/v1/inventory';
const server = new grpc.Server();
server.addService(s2.InventoryService, {
  reserve: (call: any, cb: any) => {
    const { sku, quantity } = call.request;
    if (quantity < 1) return cb({ code: grpc.status.INVALID_ARGUMENT, details: 'quantity<1' });
    if (sku === 'ZERO') return cb({ code: grpc.status.FAILED_PRECONDITION, details: 'out_of_stock' });
    cb(null, s2.ReserveReply.fromPartial({ reserved: true, reservationId: 'r1', available: sku === 'A0' ? 0 : 8 }));
  },
});
server.bindAsync('127.0.0.1:50999', grpc.ServerCredentials.createInsecure(), () => {
  const old = new c1.InventoryClient('127.0.0.1:50999', grpc.credentials.createInsecure());
  const nw = new s2.InventoryClient('127.0.0.1:50999', grpc.credentials.createInsecure());
  old.reserve({ sku: "X", quantity: 2 }, (e, r) => {
    console.log('v1 client ->', e?.message ?? JSON.stringify(r), '| bytes v1 reply:', c1.ReserveReply.encode(r!).finish().length);
    nw.reserve({ sku: 'X', quantity: 2 }, (e2, r2) => {
      console.log('v2 client ->', JSON.stringify(r2), 'available' in r2! , r2!.available);
      nw.reserve({ sku: 'A0', quantity: 1 }, (_e, r3) => {
        console.log('presence: A0 available=', r3!.available, '(0 co mat, khong phai vang)');
        nw.reserve({ sku: 'ZERO', quantity: 1 }, (e4) => {
          console.log('thieu hang ->', grpc.status[e4!.code]);
          console.log('req bytes proto:', c1.ReserveRequest.encode({sku:'A1',quantity:2}).finish().length, 'json:', JSON.stringify({sku:'A1',quantity:2}).length);
          server.forceShutdown(); process.exit(0);
        });
      });
    });
  });
});

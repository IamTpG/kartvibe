import http from 'node:http';

// State for Inventory mock
const inventoryState = {
  stock: {
    'SKU-OK': 10,
    'SKU-LOW': 1,
    'SKU-ZERO': 0
  },
  reservations: [],
  reservationCounter: 1000,
  delayMs: 0
};

// State for Order mock
let orderCounter = 0;

function resetInventory() {
  inventoryState.stock = {
    'SKU-OK': 10,
    'SKU-LOW': 1,
    'SKU-ZERO': 0
  };
  inventoryState.reservations = [];
  inventoryState.reservationCounter = 1000;
  inventoryState.delayMs = 0;
}

function resetOrder() {
  orderCounter = 0;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Date': new Date().toUTCString(),
    'x-request-id': 'req-' + Math.random().toString(36).substring(2, 9)
  });
  res.end(JSON.stringify(payload));
}

// -----------------------------------------------------------------------------
// Inventory Mock Server (Port 4006)
// -----------------------------------------------------------------------------
export function createInventoryServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok', service: 'inventory' });
    }

    if (url.pathname === '/_reset' && req.method === 'POST') {
      resetInventory();
      return sendJson(res, 200, { ok: true, message: 'Inventory reset to fixture state' });
    }

    if (url.pathname === '/_fault' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        inventoryState.delayMs = Number(body?.delayMs) || 0;
        return sendJson(res, 200, { ok: true, delayMs: inventoryState.delayMs });
      } catch {
        return sendJson(res, 400, { code: 'INVALID_ARGUMENT', message: 'Invalid fault payload' });
      }
    }

    if (url.pathname === '/inventory/reservations' && req.method === 'POST') {
      // Simulate fault delay if active
      if (inventoryState.delayMs > 0) {
        await new Promise(r => setTimeout(r, inventoryState.delayMs));
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch {
        return sendJson(res, 400, { code: 'INVALID_ARGUMENT', message: 'Body must be valid JSON' });
      }

      const sku = body?.sku;
      const quantity = body?.quantity;

      // Inventory validates domain: sku non-empty string <= 64, quantity 1..1000
      if (typeof sku !== 'string' || sku.trim() === '' || sku.length > 64 || typeof quantity !== 'number' || quantity < 1 || quantity > 1000) {
        return sendJson(res, 400, { code: 'INVALID_ARGUMENT', message: 'Domain validation error in Inventory' });
      }

      const currentStock = inventoryState.stock[sku] ?? 0;
      if (currentStock < quantity) {
        return sendJson(res, 409, { code: 'OUT_OF_STOCK', message: 'Insufficient inventory' });
      }

      inventoryState.stock[sku] = currentStock - quantity;
      const reservationId = 'res-' + (++inventoryState.reservationCounter);
      inventoryState.reservations.push({ reservationId, sku, quantity, createdAt: new Date() });

      return sendJson(res, 201, { reservationId });
    }

    sendJson(res, 404, { code: 'NOT_FOUND', message: 'Not found' });
  });
}

// -----------------------------------------------------------------------------
// Order Mock Server (Port 4002 REST, Port 4012 gRPC mode)
// -----------------------------------------------------------------------------
export function createOrderServer({ port, mode, inventoryUrl = 'http://127.0.0.1:4006' }) {
  const DEADLINE_MS = 500;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok', service: 'order', mode });
    }

    if (url.pathname === '/_reset' && req.method === 'POST') {
      resetOrder();
      return sendJson(res, 200, { ok: true, message: `Order (${mode}) reset` });
    }

    if (url.pathname === '/orders' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch {
        // invalid JSON body -> 400 VALIDATION_ERROR
        return sendJson(res, 400, { code: 'VALIDATION_ERROR', message: 'Malformed JSON payload' });
      }

      if (!body || typeof body !== 'object') {
        return sendJson(res, 400, { code: 'VALIDATION_ERROR', message: 'Request body must be an object' });
      }

      const { sku, quantity } = body;
      // Order shape validation: sku string, quantity integer
      if (typeof sku !== 'string' || typeof quantity !== 'number' || !Number.isInteger(quantity)) {
        return sendJson(res, 400, { code: 'VALIDATION_ERROR', message: 'Invalid shape: sku must be string and quantity must be integer' });
      }

      // Order calls Inventory internally
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEADLINE_MS);

      try {
        const invRes = await fetch(`${inventoryUrl}/inventory/reservations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': req.headers['x-request-id'] || 'req-order-' + (++orderCounter)
          },
          body: JSON.stringify({ sku, quantity }),
          signal: controller.signal
        });
        clearTimeout(timer);

        const invData = await invRes.json().catch(() => null);

        if (invRes.status === 201) {
          const newOrderId = ++orderCounter;
          return sendJson(res, 201, {
            orderId: newOrderId,
            sku,
            quantity,
            status: 'CONFIRMED'
          });
        }

        if (invRes.status === 409) {
          return sendJson(res, 409, {
            code: 'OUT_OF_STOCK',
            message: invData?.message || 'Out of stock'
          });
        }

        if (invRes.status === 400) {
          return sendJson(res, 400, {
            code: 'VALIDATION_ERROR',
            message: invData?.message || 'Validation error from inventory'
          });
        }

        return sendJson(res, 500, {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response from inventory'
        });
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          return sendJson(res, 504, {
            code: 'INVENTORY_TIMEOUT',
            message: `Inventory call timed out after ${DEADLINE_MS}ms`
          });
        }

        // Connection refused / unavailable
        return sendJson(res, 503, {
          code: 'INVENTORY_UNAVAILABLE',
          message: 'Unable to connect to inventory service'
        });
      }
    }

    sendJson(res, 404, { code: 'NOT_FOUND', message: 'Not found' });
  });
}

// -----------------------------------------------------------------------------
// Cluster Runner
// -----------------------------------------------------------------------------
export async function startMockServers({
  inventoryPort = 4006,
  orderRestPort = 4002,
  orderGrpcPort = 4012
} = {}) {
  const invServer = createInventoryServer();
  const orderRestServer = createOrderServer({ port: orderRestPort, mode: 'rest', inventoryUrl: `http://127.0.0.1:${inventoryPort}` });
  const orderGrpcServer = createOrderServer({ port: orderGrpcPort, mode: 'grpc', inventoryUrl: `http://127.0.0.1:${inventoryPort}` });

  await new Promise(r => invServer.listen(inventoryPort, '127.0.0.1', r));
  await new Promise(r => orderRestServer.listen(orderRestPort, '127.0.0.1', r));
  await new Promise(r => orderGrpcServer.listen(orderGrpcPort, '127.0.0.1', r));

  console.log(`[mock-services] Inventory listening on http://127.0.0.1:${inventoryPort}`);
  console.log(`[mock-services] Order (REST baseline) listening on http://127.0.0.1:${orderRestPort}`);
  console.log(`[mock-services] Order (gRPC mode) listening on http://127.0.0.1:${orderGrpcPort}`);

  return {
    invServer,
    orderRestServer,
    orderGrpcServer,
    stopAll: async () => {
      await Promise.all([
        new Promise(r => invServer.close(r)),
        new Promise(r => orderRestServer.close(r)),
        new Promise(r => orderGrpcServer.close(r))
      ]);
      console.log('[mock-services] All mock servers stopped cleanly.');
    }
  };
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('mock-services.mjs')) {
  console.log('[mock-services] Starting standalone mock servers...');
  startMockServers().then(() => {
    console.log('[mock-services] Ready for tests. Press Ctrl+C to terminate.');
  }).catch(err => {
    console.error('[mock-services] Failed to start:', err);
    process.exit(1);
  });
}

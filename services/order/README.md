# Order Service

Order exposes the existing `GET /orders` API and adds `POST /orders`. The latter reserves stock through Inventory using REST or gRPC, selected once at startup, then saves a confirmed purchase order. Both modes return the same external JSON contract.

## Requirements and installation

Use Node.js 22 or newer and PostgreSQL on `localhost:5434`. The local test configuration uses database `kartvibe_order`, user `postgres`, and password `postgres` (dummy data only). Create the database once, then install dependencies:

```bash
docker run -d --name kartvibe-postgres -e POSTGRES_PASSWORD=postgres -p 5434:5432 postgres:17
docker exec kartvibe-postgres psql -U postgres -c "CREATE DATABASE kartvibe_order"
npm ci
npm run codegen
npm run build
```

The service creates `purchase_orders` at startup. The existing `orders` and `order_items` tables are only populated by `npm run seed:s` or `npm run seed:l` for `GET /orders`.

## Run

Start Inventory at REST port 4006 and gRPC port 4007. From two terminals in this directory, run:

```bash
PORT=4002 INVENTORY_PROTOCOL=rest npm start
PORT=4012 INVENTORY_PROTOCOL=grpc npm start
```

`INVENTORY_PROTOCOL` defaults to `rest`; other values fail at startup. `INVENTORY_REST_URL` defaults to `http://localhost:4006`, `INVENTORY_GRPC_ADDR` to `localhost:4007`, and `INVENTORY_DEADLINE_MS` to `500`. `DATABASE_URL` or the usual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` variables configure PostgreSQL. `PORT` defaults to `4002`. `LATENCY_MS` is retained from the original service. Setting `ENABLE_TEST_HOOKS=1` enables `POST /_reset` to truncate `purchase_orders` and reset its sequence.

```bash
curl -i -H 'content-type: application/json' -d '{"sku":"SKU-OK","quantity":2}' http://localhost:4002/orders
curl -i 'http://localhost:4002/orders?userId=1'
```

`POST /orders` returns `201 {"orderId":1,"sku":"SKU-OK","quantity":2,"status":"CONFIRMED"}` on success. Error responses have `code` and `message`; documented statuses are 400, 409, 503, 504, and 500. The exact contract is in `openapi.json`, generated with `npm run openapi`.

## Verification

```bash
npm run build
npm run check
```

`check` starts local fake REST and gRPC Inventory servers and runs both Order modes. It needs the local PostgreSQL database, unused ports 4002/4012/4006/4007, and no real Inventory running. It verifies success, out of stock, invalid shape and range, malformed JSON, deadline, unavailable Inventory, unknown errors, external response parity, request logging, header propagation, database rows, and reset behavior. Test hooks are enabled only in the spawned test processes.

The protobuf contract is the shared `services/proto/inventory/v2/inventory.proto` (override the directory with `PROTO_DIR`). `npm run codegen` writes `src/generated/inventory.ts`; generated code is included in this delivery. All `ReserveReply` presence handling and the `v2` client version constant are in `src/inventory/grpc-client.ts` so the team can build an old client from proto v1 by changing that one file after code generation.

When Inventory reserves stock but the Order database insert later fails, Order logs the reservation ID and returns 500. The assignment intentionally has no compensating release or idempotency flow.

The gRPC client rejects integers outside protobuf `int32` before encoding them. This prevents a large JSON integer from wrapping into a different stock quantity; Inventory still validates representable quantities against its 1–1000 business range.

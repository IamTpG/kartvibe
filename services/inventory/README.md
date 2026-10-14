# Inventory Service (`kartvibe-inventory-service`)

Inventory reserves stock over REST (default port 4006) and gRPC (default port 4007), using PostgreSQL database `kartvibe_inventory`.

## Requirements and install

- Node.js ≥ 22, npm, PostgreSQL reachable using the configured `PG*` values.
- Install exactly from lockfile:

```sh
npm ci
```

## Build and generated files

```sh
npm run codegen
npm run openapi
npm run build
```

Codegen reads `services/proto/inventory/v2/inventory.proto` (override with `PROTO_DIR`, the directory that contains `inventory.proto`). Clean-copy `npm ci` and `npm run build` passed on this Windows host. Stock bundled `protoc.exe` then failed with `0xC0000135` (missing Debug CRT `MSVCP140D.dll`, `ucrtbased.dll`). Replacing `node_modules/grpc-tools/bin/protoc.exe` with official Google Protobuf 3.19.1 Windows Release executable made `npm run codegen` and `npm run build` pass. `npm ci` removes this manual replacement; stock Windows install is not codegen-ready here. `scripts/codegen.mjs` invokes installed grpc-tools launcher and plugin; it does not download or replace protoc. Linux/macOS codegen not verified.

### Windows: workaround protoc sau `npm ci`

Tải bản phát hành chính thức, kiểm SHA256 rồi thay `protoc.exe` (Python stdlib; chạy trong thư mục service):

```sh
python -c "import urllib.request,hashlib,zipfile,io,pathlib; b=urllib.request.urlopen('https://github.com/protocolbuffers/protobuf/releases/download/v3.19.1/protoc-3.19.1-win64.zip',timeout=60).read(); assert hashlib.sha256(b).hexdigest()=='7e904214696702285aa5b503a86fa38a14c9eeb0f3fe10ff3115a74e3a90dae8'; pathlib.Path('node_modules/grpc-tools/bin/protoc.exe').write_bytes(zipfile.ZipFile(io.BytesIO(b)).read('bin/protoc.exe'))"
npm run codegen
```

Archive hash và binary đã đối chiếu trực tiếp với bản chính thức. Không thay phiên bản npm đã ghim.

## Run service and capture stdout logs

```sh
# Bash; test hooks off by default
npm start

# Bash; expose POST /_reset and POST /_fault for tests
mkdir -p logs
ENABLE_TEST_HOOKS=1 npm start > logs/inventory.log 2>&1
```

Log each command's stdout/stderr to a fresh or truncated file; `npm run check` validates exact request IDs emitted during its current run, not older historical entries.

## Regression check

Requires service running with `ENABLE_TEST_HOOKS=1`, reachable REST/gRPC ports, and writable/readable `LOG_FILE` capturing that service's stdout. Example (Bash):

```sh
: > logs/inventory.log
ENABLE_TEST_HOOKS=1 npm start > logs/inventory.log 2>&1 &
# After service is ready, run in another shell:
LOG_FILE=logs/inventory.log npm run check
```

`npm run check` fails when log file is missing/unreadable or current-run REST/gRPC success and malformed-JSON events fail request-ID, result-ID, or error-code correlation. It exercises real PostgreSQL and leaves fixture data reset at end. `POST /_fault` accepts only integer `delayMs` from 0 through 60000 ms inclusive.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4006` | REST port |
| `GRPC_PORT` | `4007` | gRPC port |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5434` | PostgreSQL port |
| `PGUSER` | `postgres` | PostgreSQL user |
| `PGPASSWORD` | `postgres` | PostgreSQL password |
| `PGDATABASE` | `kartvibe_inventory` | PostgreSQL database |
| `DATABASE_URL` | optional | Full PostgreSQL connection URL |
| `LATENCY_MS` | `0` | Startup business-operation delay in ms |
| `ENABLE_TEST_HOOKS` | off | Set `1` to enable `/_reset` and `/_fault` |
| `LOG_FILE` | `logs/inventory.log` | File read by test; service stdout must be captured there |

import './env.js';
// GraphQL gateway (cổng 4005): POST /graphql, hai query web/mobile, công tắc DATALOADER.
import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { graphql } from 'graphql';
import { log } from './logger.js';
import { type LoaderMode, makeContext, schema } from './schema.js';

const PORT = Number(process.env.PORT ?? 4005);
const DEFAULT_MODE: LoaderMode = process.env.DATALOADER === 'off' ? 'off' : 'on';

const metrics = { requests: 0 };

const cors: RequestHandler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-request-id');
  if (req.method === 'OPTIONS') return void res.status(204).end();
  next();
};

const app = express();
app.disable('x-powered-by');
app.use(cors);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/_metrics', (_req, res) => res.json({ service: 'graphql', requests: metrics.requests, dbQueries: 0 }));
app.post('/_metrics/reset', (_req, res) => {
  metrics.requests = 0;
  res.status(204).end();
});

// ?dataloader=off|on ghi đè công tắc cho một request (tiện đo mà không phải khởi động lại).
app.post('/graphql', express.json(), async (req, res) => {
  metrics.requests++;
  const t0 = performance.now();
  const requestId = req.header('x-request-id') ?? randomUUID();
  res.setHeader('x-request-id', requestId);

  const { query, variables, operationName } = (req.body ?? {}) as {
    query?: unknown;
    variables?: Record<string, unknown>;
    operationName?: string;
  };
  if (typeof query !== 'string' || query.trim() === '') {
    res.status(400).json({ errors: [{ message: 'Thiếu `query`', extensions: { code: 'VALIDATION_ERROR' } }] });
    return;
  }

  const override = req.query.dataloader;
  const mode: LoaderMode = override === 'off' || override === 'on' ? override : DEFAULT_MODE;

  const result = await graphql({
    schema,
    source: query,
    variableValues: variables,
    operationName,
    contextValue: makeContext(requestId, mode),
  });

  log({
    requestId,
    method: 'POST',
    path: '/graphql',
    status: 200,
    mode,
    errors: result.errors?.length ?? 0,
    ms: Math.round(performance.now() - t0),
  });
  res.json(result);
});

app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy' }));

app.listen(PORT, () => {
  log({ msg: `GraphQL listening on :${PORT}`, defaultMode: DEFAULT_MODE === 'on' ? 'dataloader on' : 'dataloader off' });
});

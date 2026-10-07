import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { cartsRouter } from './carts/carts.routes.js';
import { generateOpenApiDocument } from './openapi/registry.js';
import { productsRouter } from './products/products.routes.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { httpLogger, requestId } from './shared/middleware/request-id.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // request_id + header X-Request-Id + log context phải đứng đầu tiên.
  app.use(httpLogger);
  app.use(requestId);

  const spec = generateOpenApiDocument();
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

  // Body không ép kiểu; JSON hỏng → error handler → 400 VALIDATION_ERROR.
  app.use(express.json({ strict: true }));

  app.use(productsRouter);
  app.use(cartsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

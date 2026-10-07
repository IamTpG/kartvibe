import 'dotenv/config';
import { createApp } from './app.js';
import { prisma } from './shared/db.js';
import { logger } from './shared/logger.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
  logger.info({ port }, `Kartvibe API listening — docs at http://localhost:${port}/docs`);
});

const shutdown = () => {
  server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

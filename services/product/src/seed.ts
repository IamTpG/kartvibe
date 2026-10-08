import './env.js';
import { initDb, seedDatabase, closeDb, DataSize, PG_CONFIG } from './db.js';

async function main() {
  const rawSize = (process.env.SIZE || process.argv[2] || 'S').toUpperCase();
  if (rawSize !== 'S' && rawSize !== 'L') {
    console.error(`Invalid SIZE="${rawSize}". Must be "S" or "L".`);
    process.exit(1);
  }
  const size: DataSize = rawSize;

  await initDb({ defaultSize: size });
  const result = await seedDatabase(size);

  // Also notify running Product Service on port 4003 (if running) so in-memory or cached state stays in sync
  const port = Number(process.env.PORT || 4003);
  try {
    await fetch(`http://localhost:${port}/_seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size }),
    });
  } catch {
    // Service not currently running on port, which is fine
  }

  console.log(
    JSON.stringify({
      service: 'product',
      action: 'seed',
      size,
      productsSeeded: result.count,
      storageMode: result.mode,
      database: PG_CONFIG.database,
    })
  );

  await closeDb();
}

main().catch((err) => {
  console.error('[product-seed] Error:', err);
  process.exit(1);
});

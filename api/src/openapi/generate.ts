import { writeFileSync } from 'node:fs';
import { generateOpenApiDocument } from './registry.js';

const out = process.argv[2] ?? 'openapi.json';
writeFileSync(out, JSON.stringify(generateOpenApiDocument(), null, 2));
console.log(`wrote ${out}`);

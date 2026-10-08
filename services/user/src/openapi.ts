import { writeFileSync } from 'node:fs';
import { generateOpenApiDocument } from './contract.js';

const out = process.argv[2] ?? 'openapi.json';
writeFileSync(out, JSON.stringify(generateOpenApiDocument(), null, 2) + '\n');
console.log(`wrote ${out}`);

import { existsSync } from 'node:fs';

// Nạp .env của service nếu có. Biến đã đặt trong môi trường được ưu tiên hơn file.
if (existsSync('.env')) process.loadEnvFile('.env');

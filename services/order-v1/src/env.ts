import { existsSync } from 'node:fs';

// Nạp .env của service (cùng thư mục chạy) nếu có. Biến đã đặt trong môi trường được ưu tiên hơn file.
// Phải là import đầu tiên của điểm vào để các module sau đọc được cấu hình.
if (existsSync('.env')) process.loadEnvFile('.env');

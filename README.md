# NGUYỄN ĐỨC • Web • Store — v3.0.0

Nền tảng công nghệ & dịch vụ số hiện đại: backend Node/Express, database SQLite, xác thực bảo mật, phân quyền, ví tiền với ledger, kho Media, chat realtime, thông báo, AntiBot proof-of-work.

## Yêu cầu
- Node.js ≥ 20
- npm ≥ 10

## Cài đặt

```bash
npm install
cp .env.example .env
# Mở .env và thay SESSION_SECRET / CSRF_SECRET / ENCRYPTION_KEY / ANTIBOT_SECRET
# (dùng: openssl rand -hex 32)
npm run db:migrate
npm start
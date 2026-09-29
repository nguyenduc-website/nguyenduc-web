# DEPLOYMENT

## Render
1. New Web Service → chọn repo.
2. Build: `npm install`
3. Start: `npm run db:migrate && npm start`
4. Env: `NODE_ENV=production`, `PUBLIC_BASE_URL=https://<your-app>.onrender.com`, `SESSION_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`, `ANTIBOT_SECRET`, `DATABASE_PATH=/data/ngduc.db`, `TRUST_PROXY=1`.
5. Disk: mount `/data` và `/app/uploads` (Persistent Disk).

## Railway
Tương tự Render. Dùng Volume mount cho `/app/data` và `/app/uploads`.

## Docker
```bash
docker compose up -d --build
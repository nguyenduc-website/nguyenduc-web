FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

VOLUME ["/app/data", "/app/uploads"]

CMD ["sh", "-c", "npm run db:migrate && node server/server.js"]
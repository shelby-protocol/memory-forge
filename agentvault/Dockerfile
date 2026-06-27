FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app

RUN addgroup -S memoryforge && adduser -S memoryforge -G memoryforge

COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY package.json README.md LICENSE ./

USER memoryforge
ENV NODE_ENV=production
ENV MEMORYFORGE_HOME=/data
VOLUME /data

ENTRYPOINT ["node", "dist/index.js"]

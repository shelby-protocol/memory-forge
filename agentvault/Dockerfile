FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/
COPY README.md ./

ENV MEMORYFORGE_HOME=/data

ENTRYPOINT ["node", "dist/index.js"]

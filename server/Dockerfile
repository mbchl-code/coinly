# syntax=docker/dockerfile:1
# Node 24 запускает TypeScript напрямую (type stripping), node:sqlite встроен — зависимостей в рантайме нет
FROM node:24-slim
WORKDIR /app
COPY src ./src
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "--no-warnings", "src/index.ts"]

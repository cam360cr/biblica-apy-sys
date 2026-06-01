FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY hcb-basicos-app ./hcb-basicos-app

RUN mkdir -p /data && chown -R node:node /app /data

ENV NODE_ENV=production
ENV PORT=2934
ENV SQLITE_DB_PATH=/data/database.sqlite

EXPOSE 2934

USER node

CMD ["npm", "start"]
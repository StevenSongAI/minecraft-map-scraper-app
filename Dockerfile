FROM node:18-alpine

WORKDIR /app

# Force rebuild on every deploy by using a timestamp
ARG BUILD_TIMESTAMP=2026-02-03-1600
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "server.js"]

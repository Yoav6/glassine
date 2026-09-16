# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/vendor ./vendor
COPY --from=builder /app/tsconfig.json ./
EXPOSE 3000
CMD ["node", "build"]

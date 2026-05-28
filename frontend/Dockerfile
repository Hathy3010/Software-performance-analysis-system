# =============================================================================
# AIOps Frontend — Multi-stage Dockerfile (Vite + React → Nginx)
# =============================================================================

# --- Stage 1: Node build ---
FROM node:22-alpine3.21 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

COPY . .

# Vite env vars are baked in at build time
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_GRAFANA_URL=http://localhost:3001
ARG VITE_JAEGER_URL=http://localhost:16686
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GRAFANA_URL=$VITE_GRAFANA_URL \
    VITE_JAEGER_URL=$VITE_JAEGER_URL

RUN npm run build

# --- Stage 2: Nginx production server ---
FROM nginx:1.27-alpine3.21 AS production

RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

# Stage 1: Build Frontend Assets
FROM node:24-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Backend Runtime & Final Image
FROM python:3.13-slim AS runner

# Prevent Python from writing bytecode and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    APP_AUTH_ENABLED=true \
    APP_DATABASE_URL=sqlite:////app/data/finance.db \
    APP_STATIC_DIR=/app/static

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code & scripts
COPY backend/ .

# Copy built frontend assets from Stage 1 into /app/static
COPY --from=frontend-builder /build/dist /app/static

# Prepare directories for SQLite database and backups
RUN mkdir -p /app/data /app/backups

# Setup entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "-m", "app"]

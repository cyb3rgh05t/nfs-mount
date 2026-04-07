# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nfs-common \
    nfs-kernel-server \
    nfs4-acl-tools \
    mergerfs \
    fuse3 \
    wireguard-tools \
    iproute2 \
    iptables \
    curl \
    iputils-ping \
    procps \
    kmod \
    && rm -rf /var/lib/apt/lists/*

# Enable FUSE for all users
RUN echo "user_allow_other" >> /etc/fuse.conf

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p /data /config /var/log/nfs-manager

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/system/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]

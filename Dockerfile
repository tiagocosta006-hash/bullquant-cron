FROM node:22-slim

WORKDIR /app

# Install Python, openssl, and unzip
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv openssl unzip

# Install dependencies for both Python and Node
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY scripts/requirements.txt ./scripts/requirements.txt
RUN pip install --no-cache-dir --break-system-packages -r scripts/requirements.txt

# Copy all source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port 8080 for Render's health check
EXPOSE 8080

# Run the cron server
CMD ["npx", "tsx", "scripts/cron_server.ts"]

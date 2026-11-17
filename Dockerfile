FROM node:22-bookworm-slim

WORKDIR /app

# Instalasi kebutuhan SQLite
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Salin konfigurasi workspace
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Instal dependency
RUN npm install

# Salin seluruh source code
COPY . .

# Build frontend React
RUN npm run build

# Konfigurasi server
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Jalankan backend dan dashboard
CMD ["npm", "start"]
# Zidan AI Bot Manager

Dashboard web responsif/PWA untuk mengelola Telegram AI chatbot menggunakan React, Express, grammY, Google Gemini API, dan SQLite.

## Fitur
- Login administrator dengan JWT dan password bcrypt.
- Role owner dan admin. Owner dapat menambah, menonaktifkan, dan menghapus admin.
- Start/stop/restart Telegram bot dari dashboard.
- Chat history per Telegram user dan reset melalui `/reset`.
- System prompt dapat diedit dari dashboard.
- PWA agar dashboard dapat ditambahkan ke layar utama HP.
- SQLite lokal untuk data admin, pengaturan, dan percakapan.

## Persyaratan
- Node.js 20 atau lebih baru (disarankan LTS yang masih didukung).
- Token Telegram dari [@BotFather](https://t.me/BotFather).
- Gemini API key dari [Google AI Studio](https://aistudio.google.com/apikey).

## Menjalankan lokal
1. Salin `.env.example` menjadi `.env`.
2. Isi `JWT_SECRET` dengan string acak panjang (minimal 32 karakter), `OWNER_EMAIL`, `OWNER_PASSWORD` (minimal 12 karakter), `TELEGRAM_BOT_TOKEN`, dan `GEMINI_API_KEY`.
3. Dari folder root jalankan:

   ```bash
   npm install
   npm run dev
   ```

4. Buka `http://localhost:5173`. Login menggunakan `OWNER_EMAIL` dan `OWNER_PASSWORD`.
5. Buka Overview lalu tekan **Start Bot**.

Untuk menjalankan satu proses production lokal:

```bash
npm run build
npm start
```

Buka `http://localhost:3000`.

## Deploy ke Ubuntu VPS / Oracle Cloud VM
> Free tier bukan jaminan uptime 100%. Ketersediaan VM gratis, kapasitas region, verifikasi akun, dan kebijakan provider dapat berubah. Jangan mengandalkan platform free web-hosting yang menidurkan proses untuk long polling 24/7.

1. Buat VM Ubuntu yang sesuai ketentuan free tier provider.
2. Hubungkan via SSH dan install Node.js LTS, npm, git, serta build tools SQLite:

   ```bash
   sudo apt update
   sudo apt install -y curl git build-essential python3 make g++
   ```

   Install Node.js LTS sesuai instruksi resmi NodeSource atau gunakan Node Version Manager.
3. Upload/clone proyek ke server.
4. Buat `.env` di root proyek. Untuk production, set:

   ```env
   NODE_ENV=production
   PORT=3000
   APP_ORIGIN=https://domain-kamu.example
   JWT_SECRET=string-acak-panjang-minimal-32-karakter
   OWNER_NAME=Nama Owner
   OWNER_EMAIL=email-kamu@example.com
   OWNER_PASSWORD=password-kuat-minimal-12-karakter
   TELEGRAM_BOT_TOKEN=token-dari-botfather
   GEMINI_API_KEY=api-key-gemini
   GEMINI_MODEL=gemini-2.5-flash
   BOT_AUTO_START=true
   ```

5. Install dan build:

   ```bash
   npm install
   npm run build
   ```

6. Jalankan dengan PM2:

   ```bash
   sudo npm install -g pm2
   pm2 start backend/src/index.js --name zidan-ai-manager
   pm2 save
   pm2 startup
   ```

   Jalankan perintah tambahan yang dicetak oleh `pm2 startup`, lalu `pm2 save` lagi.
7. Pasang Nginx sebagai reverse proxy ke `127.0.0.1:3000` dan aktifkan HTTPS dengan sertifikat TLS (misalnya Let's Encrypt). Jangan membuka port dashboard tanpa HTTPS.
8. Setelah domain HTTPS aktif, buka dashboard dari HP dan pilih **Add to Home Screen** (Android/Chrome) atau **Share > Add to Home Screen** (iPhone/Safari).

## Contoh konfigurasi Nginx

```nginx
server {
    listen 80;
    server_name domain-kamu.example;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Konfigurasikan HTTPS setelah DNS domain mengarah ke IP VM.

## Multi-admin
- Akun owner pertama dibuat otomatis saat database pertama kali dibuat, berdasarkan `OWNER_EMAIL` dan `OWNER_PASSWORD`.
- Owner login ke dashboard > Administrators untuk membuat akun admin tambahan.
- Admin tambahan dapat mengelola bot, chat, dan prompt; hanya owner yang dapat mengelola akun admin.
- Simpan password secara aman dan nonaktifkan akun admin yang tidak lagi digunakan.

## Catatan penting keamanan dan operasional
- Jangan commit `.env`, `backend/data/`, database SQLite, token Telegram, atau API key ke Git.
- Ganti password owner awal setelah login melalui mekanisme pengelolaan kredensial yang aman; versi starter ini belum menyediakan UI ubah password.
- API key Gemini dan Telegram hanya berada di environment backend. Pengaturan AI di dashboard hanya mengubah system prompt.
- SQLite cocok untuk satu instance backend. Jangan menjalankan beberapa replika aplikasi yang berbagi file SQLite melalui network filesystem.
- Dashboard harus dipasang di HTTPS agar PWA dapat di-install dan token login terlindungi saat transit.
- Bot menggunakan Telegram long polling. Jangan menjalankan dua proses bot dengan token yang sama secara bersamaan.
- Chat history berisi data pengguna. Batasi akses admin dan buat kebijakan retensi/penghapusan yang sesuai.
- Gemini API free tier memiliki kuota/batas dan ketentuan penggunaan yang dapat berubah. Hosting gratis juga memiliki batas dan tidak menjamin uptime 100%.
- Saat mengaktifkan `BOT_AUTO_START=true`, backend akan mencoba menjalankan bot saat start. Kamu tetap bisa Stop/Start dari dashboard.

## Troubleshooting
- `JWT_SECRET wajib diisi`: isi secret minimal 32 karakter.
- `Owner belum dibuat`: isi OWNER_EMAIL dan OWNER_PASSWORD, lalu restart. Jika database sudah terbuat kosong, restart setelah mengisi env.
- `TELEGRAM_BOT_TOKEN belum diatur`: periksa token BotFather.
- `GEMINI_API_KEY belum diatur`: isi API key Google AI Studio.
- SQLite native module error: install build tools (`build-essential`, `python3`, `make`, `g++`) lalu jalankan `npm rebuild better-sqlite3`.
- Bot tidak merespons: cek `pm2 logs zidan-ai-manager`, kuota Gemini, token Telegram, dan pastikan tidak ada proses bot lain memakai token yang sama.

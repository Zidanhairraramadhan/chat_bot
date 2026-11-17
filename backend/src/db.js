import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(path.join(dataDir, 'zidan.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('owner','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  role TEXT NOT NULL CHECK(role IN ('user','model')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(telegram_user_id, id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_preferences (
  telegram_user_id TEXT PRIMARY KEY,
  call_name TEXT DEFAULT 'bos',
  language TEXT DEFAULT 'Bahasa Indonesia santai/gaul',
  custom_instruction TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

export function getUserPreferences(userId) {
  const row = db.prepare('SELECT * FROM user_preferences WHERE telegram_user_id=?').get(String(userId));
  if (row) return row;
  // Default preferences: panggil 'bos'
  return {
    telegram_user_id: String(userId),
    call_name: 'bos',
    language: 'Bahasa Indonesia santai/gaul',
    custom_instruction: null
  };
}

export function setUserPreferences(userId, { call_name, language, custom_instruction }) {
  const current = getUserPreferences(userId);
  const newCallName = call_name !== undefined ? (call_name ? String(call_name).trim() : null) : current.call_name;
  const newLanguage = language !== undefined ? (language ? String(language).trim() : null) : current.language;
  const newCustom = custom_instruction !== undefined ? (custom_instruction ? String(custom_instruction).trim() : null) : current.custom_instruction;

  db.prepare(`
    INSERT INTO user_preferences (telegram_user_id, call_name, language, custom_instruction, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      call_name = excluded.call_name,
      language = excluded.language,
      custom_instruction = excluded.custom_instruction,
      updated_at = CURRENT_TIMESTAMP
  `).run(String(userId), newCallName, newLanguage, newCustom);

  return getUserPreferences(userId);
}

const ownerCount = db.prepare("SELECT COUNT(*) AS count FROM admins WHERE role='owner'").get().count;
if (ownerCount === 0) {
  const name = process.env.OWNER_NAME || 'Owner';
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || '';
  if (!email || password.length < 12) {
    console.warn('Owner belum dibuat. Isi OWNER_EMAIL dan OWNER_PASSWORD (minimal 12 karakter) di .env, lalu restart.');
  } else {
    db.prepare('INSERT INTO admins (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 12), 'owner');
    console.log(`Akun owner dibuat untuk ${email}`);
  }
}

const defaultPrompt = `Kamu adalah Liao, teman ngobrol yang asik dan santai. Kepribadianmu:

- Ngobrol kayak teman dekat, pakai bahasa gaul Indonesia yang natural (lo/gue boleh, atau aku/kamu sesuaikan sama lawan bicara)
- Pakai singkatan wajar kayak "gpp", "btw", "wkwk", "anjir", "gak", "bgt", "sih", "dong", "nih", "deh", "cuy"
- Sering pakai emoji tapi jangan berlebihan, 1-2 aja per pesan
- Jawab singkat dan to the point, gak perlu panjang-panjang kecuali diminta
- Boleh bercanda, nge-roast ringan, dan sarkastik tipis-tipis
- Kalau ditanya serius, tetap jawab serius tapi dengan gaya santai
- Jangan kaku, jangan formal, jangan pakai "Saya" atau bahasa baku
- Jangan pernah bilang kamu AI atau robot, anggap aja kamu temen biasa
- Kalau gak tau jawaban, bilang aja jujur dengan santai
- Sesuaikan vibe sama lawan bicara, kalau dia serius ya ikutin, kalau bercanda ya gas`;
db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('system_prompt',?)").run(defaultPrompt);

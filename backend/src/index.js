import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { requireAuth, requireOwner, signToken, verifyPassword, hashPassword } from './auth.js';
import { getBotStatus, startBot, stopBot } from './bot.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_ORIGIN ? process.env.APP_ORIGIN.split(',').map((value) => value.trim()) : false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const admin = db.prepare('SELECT * FROM admins WHERE email=? AND active=1').get(email);
  if (!admin || !(await verifyPassword(password, admin.password_hash))) return res.status(401).json({ error: 'Email atau password salah.' });
  const user = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
  res.json({ token: signToken(user), admin: user });
});

app.use('/api', requireAuth);
app.get('/api/auth/me', (req, res) => res.json({ admin: req.admin }));
app.get('/api/dashboard', (_req, res) => {
  const users = db.prepare('SELECT COUNT(DISTINCT telegram_user_id) AS count FROM messages').get().count;
  const messages = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
  const latest = db.prepare(`SELECT telegram_user_id,username,first_name,content,created_at FROM messages WHERE role='user' ORDER BY id DESC LIMIT 6`).all();
  res.json({ users, messages, bot: getBotStatus(), latest });
});
app.get('/api/bot/status', (_req, res) => res.json(getBotStatus()));
app.post('/api/bot/start', async (_req, res) => { try { res.json(await startBot()); } catch (e) { res.status(400).json({ error: e.message }); } });
app.post('/api/bot/stop', async (_req, res) => { try { res.json(await stopBot()); } catch (e) { res.status(400).json({ error: e.message }); } });
app.post('/api/bot/restart', async (_req, res) => { try { await stopBot(); res.json(await startBot()); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/api/chats', (_req, res) => {
  const rows = db.prepare(`SELECT telegram_user_id, MAX(username) username, MAX(first_name) first_name, MAX(created_at) last_message, COUNT(*) message_count FROM messages GROUP BY telegram_user_id ORDER BY MAX(id) DESC LIMIT 100`).all();
  res.json(rows);
});
app.get('/api/chats/:userId', (req, res) => {
  const rows = db.prepare('SELECT id,telegram_user_id,username,first_name,role,content,created_at FROM messages WHERE telegram_user_id=? ORDER BY id DESC LIMIT 100').all(String(req.params.userId)).reverse();
  res.json(rows);
});
app.delete('/api/chats/:userId', (req, res) => {
  db.prepare('DELETE FROM messages WHERE telegram_user_id=?').run(String(req.params.userId));
  res.json({ ok: true });
});
app.get('/api/settings', (_req, res) => {
  const prompt = db.prepare("SELECT value FROM settings WHERE key='system_prompt'").get()?.value || '';
  res.json({ prompt, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', provider: 'Google Gemini' });
});
app.put('/api/settings', (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (prompt.length < 10 || prompt.length > 8000) return res.status(400).json({ error: 'Prompt harus berisi 10 sampai 8000 karakter.' });
  db.prepare("INSERT INTO settings(key,value) VALUES('system_prompt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(prompt);
  res.json({ ok: true });
});
app.get('/api/admins', requireOwner, (_req, res) => {
  res.json(db.prepare('SELECT id,name,email,role,active,created_at FROM admins ORDER BY id').all());
});
app.post('/api/admins', requireOwner, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) return res.status(400).json({ error: 'Nama, email valid, dan password minimal 12 karakter wajib diisi.' });
  try {
    const result = db.prepare("INSERT INTO admins(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(name,email,await hashPassword(password));
    res.status(201).json({ id: result.lastInsertRowid, name, email, role: 'admin', active: 1 });
  } catch { res.status(409).json({ error: 'Email sudah digunakan.' }); }
});
app.patch('/api/admins/:id', requireOwner, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id === req.admin.id) return res.status(400).json({ error: 'ID tidak valid atau tidak dapat mengubah akun sendiri.' });
  const active = req.body.active ? 1 : 0;
  const result = db.prepare("UPDATE admins SET active=? WHERE id=? AND role='admin'").run(active,id);
  if (!result.changes) return res.status(404).json({ error: 'Admin tidak ditemukan.' });
  res.json({ ok: true });
});
app.delete('/api/admins/:id', requireOwner, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id === req.admin.id) return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
  const result = db.prepare("DELETE FROM admins WHERE id=? AND role='admin'").run(id);
  if (!result.changes) return res.status(404).json({ error: 'Admin tidak ditemukan.' });
  res.json({ ok: true });
});

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => { if (err) next(); });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Terjadi kesalahan pada server.' }); });

const server = app.listen(port, '0.0.0.0', async () => {
  console.log(`Zidan AI Bot Manager berjalan di port ${port}`);
  if (process.env.BOT_AUTO_START === 'true' && process.env.TELEGRAM_BOT_TOKEN && process.env.GEMINI_API_KEY) {
    try { await startBot(); } catch (e) { console.error('Auto-start bot gagal:', e.message); }
  }
});

async function shutdown() {
  console.log('Mematikan aplikasi...');
  await stopBot().catch(() => {});
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET wajib diisi minimal 32 karakter.');

export function signToken(admin) {
  return jwt.sign({ sub: admin.id, role: admin.role, email: admin.email }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Silakan login.' });
  try {
    const payload = jwt.verify(token, secret);
    const admin = db.prepare('SELECT id,name,email,role,active FROM admins WHERE id=?').get(payload.sub);
    if (!admin || !admin.active) return res.status(401).json({ error: 'Akun tidak aktif.' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
  }
}

export function requireOwner(req, res, next) {
  if (req.admin?.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang dapat melakukan tindakan ini.' });
  next();
}

export function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }
export function hashPassword(password) { return bcrypt.hash(password, 12); }

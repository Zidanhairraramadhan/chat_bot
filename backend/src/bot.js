import { Bot } from 'grammy';
import { db, getUserPreferences, setUserPreferences } from './db.js';
import { generateReply } from './ai.js';

let bot = null;
let running = false;
let lastError = null;
const queues = new Map();

function saveMessage(user, role, content) {
  db.prepare(`INSERT INTO messages (telegram_user_id,username,first_name,role,content) VALUES (?,?,?,?,?)`)
    .run(String(user.id), user.username || null, user.first_name || null, role, content);
}
function getHistory(userId, limit = 20) {
  return db.prepare('SELECT role,content FROM messages WHERE telegram_user_id=? ORDER BY id DESC LIMIT ?')
    .all(String(userId), limit).reverse();
}
function splitText(text, max = 4000) {
  const chunks = [];
  while (text.length > max) {
    let index = text.lastIndexOf('\n', max);
    if (index < max * 0.5) index = max;
    chunks.push(text.slice(0, index));
    text = text.slice(index).trimStart();
  }
  if (text) chunks.push(text);
  return chunks;
}

export function getBotStatus() {
  return { running, configured: Boolean(process.env.TELEGRAM_BOT_TOKEN), lastError, username: bot?.botInfo?.username || null };
}

export async function startBot() {
  if (running) return getBotStatus();
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN belum diatur.');
  bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

  bot.command('start', (ctx) => {
    const prefs = getUserPreferences(ctx.from.id);
    const greeting = prefs.call_name || ctx.from.first_name || 'bos';
    return ctx.reply(`Yoo ${greeting}! 👋 Gue Liao, asisten santai lo.

💡 Fitur yang bisa lo pakai:
• /panggil <sebutan> — Atur panggilan (contoh: /panggil bos atau /panggil orang ganteng)
• /bahasa <bahasa> — Ganti bahasa (contoh: /bahasa inggris, /bahasa sunda, /bahasa indonesia)
• /profil — Cek panggilan & bahasa aktif lo
• /resetprofil — Kembalikan ke setelan default
• /reset — Hapus riwayat chat

Atau langsung chat biasa aja, misal ketik "panggil aku bos" atau "ganti bahasa ke inggris"! 😎`);
  });

  bot.command('panggil', async (ctx) => {
    const text = ctx.message.text.replace(/^\/panggil\s*/i, '').trim();
    if (!text) {
      return ctx.reply('Format salah cuy. Contoh:\n/panggil bos\n/panggil orang ganteng');
    }
    const updated = setUserPreferences(ctx.from.id, { call_name: text });
    return ctx.reply(`Siap ${updated.call_name}! Mulai sekarang gue bakal panggil lo "${updated.call_name}" 😎👌`);
  });

  bot.command('bahasa', async (ctx) => {
    const text = ctx.message.text.replace(/^\/bahasa\s*/i, '').trim();
    if (!text) {
      return ctx.reply('Format salah cuy. Contoh:\n/bahasa inggris\n/bahasa sunda\n/bahasa indonesia\n/bahasa jepang');
    }
    const updated = setUserPreferences(ctx.from.id, { language: text });
    const prefs = getUserPreferences(ctx.from.id);
    return ctx.reply(`Sip ${prefs.call_name || 'bos'}! Bahasa berhasil diubah ke: ${updated.language} 👍`);
  });

  bot.command('profil', (ctx) => {
    const prefs = getUserPreferences(ctx.from.id);
    return ctx.reply(`📋 Info Profil Kamu:
• Panggilan: ${prefs.call_name || 'bos'}
• Bahasa: ${prefs.language || 'Bahasa Indonesia santai/gaul'}
${prefs.custom_instruction ? `• Catatan: ${prefs.custom_instruction}\n` : ''}
Ketik /panggil atau /bahasa untuk mengubah! 👌`);
  });

  bot.command('resetprofil', (ctx) => {
    setUserPreferences(ctx.from.id, { call_name: 'bos', language: 'Bahasa Indonesia santai/gaul', custom_instruction: null });
    return ctx.reply('Setelan profil berhasil di-reset ke default (panggilan: bos, bahasa: Indonesia gaul) 👌');
  });

  bot.command('reset', async (ctx) => {
    db.prepare('DELETE FROM messages WHERE telegram_user_id=?').run(String(ctx.from.id));
    const prefs = getUserPreferences(ctx.from.id);
    await ctx.reply(`Oke riwayat chat udah gue hapus, ${prefs.call_name || 'bos'}. Fresh start! 🔥`);
  });

  bot.command('help', (ctx) => ctx.reply(`Perintah yang tersedia:
/panggil <sebutan> - Ubah panggilan
/bahasa <bahasa> - Ubah bahasa
/profil - Cek setelan saat ini
/resetprofil - Reset panggilan & bahasa
/reset - Hapus riwayat chat
/help - Bantuan

Tinggal chat aja santai, gue siap bantu! 👌`));

  bot.on('message:text', async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    // Di grup: hanya respon jika di-mention atau di-reply
    if (isGroup) {
      const botUsername = bot.botInfo?.username?.toLowerCase() || '';
      const isMentioned = ctx.message.text.toLowerCase().includes(`@${botUsername}`);
      const isRepliedTo = ctx.message.reply_to_message?.from?.id === bot.botInfo?.id;
      if (!isMentioned && !isRepliedTo) return;
    } else if (!isPrivate) {
      return;
    }

    const user = ctx.from;
    const previous = queues.get(user.id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      let message = ctx.message.text.trim();
      // Hapus mention bot dari pesan
      const botUsername = bot.botInfo?.username || '';
      if (botUsername) message = message.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
      if (!message || message.startsWith('/')) return;

      // 1. Deteksi ganti panggilan secara natural di chat
      const callMatch = message.match(/^(?:tolong\s+)?(?:mulai\s+sekarang\s+)?panggil\s+(?:aku|saya|gue|gw)\s+(.+)$/i)
        || message.match(/^(?:ubah|ganti)\s+panggilan(?:ku)?\s+(?:jadi|ke)\s+(.+)$/i);
      if (callMatch) {
        const newCallName = callMatch[1].replace(/[.!?]+$/, '').trim();
        if (newCallName) {
          const updated = setUserPreferences(user.id, { call_name: newCallName });
          saveMessage(user, 'user', message);
          const replyText = `Siap ${updated.call_name}! Mulai sekarang gue bakal panggil lo "${updated.call_name}" 😎👌`;
          saveMessage(user, 'model', replyText);
          return ctx.reply(replyText);
        }
      }

      // 2. Deteksi ganti bahasa secara natural di chat
      const langMatch = message.match(/^(?:tolong\s+)?(?:ganti|ubah|pake|pakai)\s+bahasa\s+(?:ke\s+)?(.+)$/i);
      if (langMatch) {
        const newLang = langMatch[1].replace(/[.!?]+$/, '').trim();
        if (newLang) {
          const updated = setUserPreferences(user.id, { language: newLang });
          const prefs = getUserPreferences(user.id);
          saveMessage(user, 'user', message);
          const replyText = `Sip ${prefs.call_name || 'bos'}! Bahasa percakapan diset ke ${updated.language}. Gas ngobrol! 🚀`;
          saveMessage(user, 'model', replyText);
          return ctx.reply(replyText);
        }
      }

      await ctx.replyWithChatAction('typing');
      saveMessage(user, 'user', message);
      const history = getHistory(user.id, 20);
      const prefs = getUserPreferences(user.id);
      const answer = await generateReply(history, prefs);
      saveMessage(user, 'model', answer);
      for (const chunk of splitText(answer)) await ctx.reply(chunk);
    }).catch(async (error) => {
      lastError = error.message;
      console.error('Telegram message error:', error);
      try { await ctx.reply('Maaf, aku sedang mengalami kendala. Coba lagi sebentar, ya. 🙏'); } catch {}
    });
    queues.set(user.id, current);
    try { await current; } finally { if (queues.get(user.id) === current) queues.delete(user.id); }
  });
  bot.catch((err) => { lastError = err.message; console.error('Telegram bot error:', err); });
  await bot.init();
  running = true;
  lastError = null;
  void bot.start({ onStart: (info) => console.log(`Telegram bot @${info.username} aktif`) }).catch((error) => {
    running = false;
    lastError = error.message;
    console.error('Polling berhenti:', error);
  });
  return getBotStatus();
}

export async function stopBot() {
  if (bot && running) {
    await bot.stop();
    running = false;
  }
  return getBotStatus();
}

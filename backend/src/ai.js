import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

async function tryGenerate(ai, model, contents, config) {
  const result = await ai.models.generateContent({ model, contents, config });
  const text = result.text?.trim();
  if (!text) throw new Error('Gemini tidak menghasilkan jawaban.');
  return text;
}

export async function generateReply(history, userPreferences = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY belum diatur di server.');
  const ai = new GoogleGenAI({ apiKey });
  let prompt = db.prepare("SELECT value FROM settings WHERE key='system_prompt'").get()?.value || 'Kamu adalah asisten AI yang ramah.';

  if (userPreferences) {
    const rules = [];
    if (userPreferences.call_name) {
      rules.push(`- Panggil lawan bicaramu dengan sebutan "${userPreferences.call_name}". Gunakan sebutan ini secara konsisten dan natural saat menyapa atau merespon.`);
    }
    if (userPreferences.language) {
      rules.push(`- Gunakan ${userPreferences.language} untuk semua jawabanmu.`);
    }
    if (userPreferences.custom_instruction) {
      rules.push(`- Instruksi khusus tambahan: ${userPreferences.custom_instruction}`);
    }
    if (rules.length > 0) {
      prompt += `\n\n[PANDUAN KHUSUS PENGGUNA INI]\n${rules.join('\n')}`;
    }
  }

  const contents = history.map((item) => ({
    role: item.role === 'model' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }));
  const config = { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 1200 };

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await tryGenerate(ai, model, contents, config);
      } catch (err) {
        const status = err.status || err.code;
        // Retry on 503 (overload) or 429 (rate limit)
        if ((status === 503 || status === 429) && attempt < 2) {
          console.log(`Model ${model} sibuk (${status}), retry dalam 1s...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        // Try next model on 503/429/404
        if (status === 503 || status === 429 || status === 404) {
          console.log(`Model ${model} gagal (${status}), coba model lain...`);
          break;
        }
        throw err;
      }
    }
  }
  throw new Error('Semua model Gemini sedang tidak tersedia. Coba lagi nanti.');
}

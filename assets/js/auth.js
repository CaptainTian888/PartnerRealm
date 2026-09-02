/**
 * 稳链同创 — 后台口令
 *
 * 静态站点只能在浏览器里校验口令，用于阻止误入与随手翻看；
 * 真正的访问控制请配置 Cloudflare Access（见 README）。
 */
import { CONFIG } from './config.js';
import { sha256Hex } from './util.js';

const SESSION_KEY = 'wlt.session';

export async function verifyPassword(password) {
  if (!password) return false;
  const hash = await sha256Hex(password);
  return hash === CONFIG.adminPasswordHash;
}

export function openSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now() }));
}

export function isAuthed() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    if (!at || Date.now() - at > CONFIG.sessionTtl) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function closeSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

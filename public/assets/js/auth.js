/**
 * 稳链同创 — 登录（服务端校验）
 *
 * 口令不在浏览器里比对，前端代码里也不留摘要：
 * 提交给 /api/auth/login，由 Worker 与 Cloudflare Secret 中的 ADMIN_PASSWORD 比对，
 * 通过后下发 HttpOnly Cookie，前端 JS 读不到这个凭证。
 */
import { api } from './store.js';

/** 登录成功返回 null，失败返回错误提示 */
export async function login(password) {
  try {
    await api('/auth/login', { method: 'POST', body: { password } });
    return null;
  } catch (err) {
    return err.message || '登录失败';
  }
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // 退出失败不影响前端清场，忽略
  }
}

/** 询问服务端当前会话是否有效 */
export async function isAuthed() {
  try {
    const res = await api('/auth/session');
    return !!(res && res.authed);
  } catch {
    return false;
  }
}

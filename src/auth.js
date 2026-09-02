/**
 * 服务端鉴权
 *
 * 会话用 HMAC-SHA256 签名的无状态令牌，放在 HttpOnly Cookie 里，
 * 前端 JS 读不到，也就无法被 XSS 顺走。校验只做签名与过期检查，不查库。
 */

const COOKIE = 'wlt_session';
const SESSION_TTL = 8 * 60 * 60; // 秒
const LOGIN_WINDOW = 15 * 60 * 1000; // 限流窗口
const LOGIN_MAX_FAILS = 8;

const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** 定长比较，避免因提前返回泄露口令前缀信息 */
function timingSafeEqual(a, b) {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // 长度不同也要走完整轮比较，用固定长度缓冲垫齐
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** 签发会话令牌：payload.签名 */
export async function issueToken(env) {
  const payload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL, iat: Math.floor(Date.now() / 1000) };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** 校验令牌，通过返回 payload，否则返回 null */
export async function verifyToken(env, token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let sigBytes;
  try { sigBytes = b64urlDecode(sig); } catch { return null; }

  const key = await hmacKey(env.SESSION_SECRET);
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body));
  if (!ok) return null;

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function readSessionCookie(request) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token, { secure }) {
  const attrs = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie({ secure }) {
  const attrs = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** 当前请求是否已登录 */
export async function isAuthed(request, env) {
  return (await verifyToken(env, readSessionCookie(request))) !== null;
}

// ---- 登录限流 ----

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

/** 返回 { blocked, remaining }，blocked 为真表示该来源暂时不允许再试 */
export async function checkLoginThrottle(env, ip) {
  const since = Date.now() - LOGIN_WINDOW;
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at >= ?')
    .bind(ip, since).first();
  const fails = row ? row.n : 0;
  return { blocked: fails >= LOGIN_MAX_FAILS, remaining: Math.max(0, LOGIN_MAX_FAILS - fails) };
}

export async function recordLoginFailure(env, ip) {
  await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
}

export async function clearLoginFailures(env, ip) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}

/** 口令校验：与 Secret 中的 ADMIN_PASSWORD 定长比较 */
export function checkPassword(env, password) {
  if (!env.ADMIN_PASSWORD) return false;
  if (typeof password !== 'string' || !password) return false;
  return timingSafeEqual(password, env.ADMIN_PASSWORD);
}

export { SESSION_TTL };

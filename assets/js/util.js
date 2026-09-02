/** 稳链同创 — 通用工具 */

/** querySelector 简写 */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** HTML 转义，所有用户数据进入 innerHTML 前必须过一遍 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 创建元素 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

/** 金额格式化：4800000 -> ¥480.00 万 */
export function money(amount, currency = 'CNY') {
  const n = Number(amount) || 0;
  const symbol = { CNY: '¥', USD: '$', EUR: '€', HKD: 'HK$' }[currency] || '';
  if (Math.abs(n) >= 10000) {
    return `${symbol}${(n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 万`;
  }
  return `${symbol}${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

/** 精确金额，用于表单与明细 */
export function moneyExact(amount, currency = 'CNY') {
  const n = Number(amount) || 0;
  const symbol = { CNY: '¥', USD: '$', EUR: '€', HKD: 'HK$' }[currency] || '';
  return `${symbol}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 日期显示，空值返回破折号 */
export function fmtDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

/** 今天 YYYY-MM-DD */
export function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 两个日期之间的天数差（b - a），无效返回 null */
export function daysBetween(a, b) {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
}

/** 合作周期进度：按起止日期算已过百分比 */
export function periodProgress(startDate, endDate, now = today()) {
  const total = daysBetween(startDate, endDate);
  const passed = daysBetween(startDate, now);
  if (total === null || passed === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
}

/** 生成带前缀的短 id */
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 深拷贝（数据都是纯 JSON） */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** SHA-256 十六进制摘要 */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** UTF-8 安全的 base64 编码，GitHub Contents API 需要 */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 防抖 */
export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 轻量提示条 */
export function toast(message, tone = 'info', duration = 3200) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host' });
    document.body.append(host);
  }
  const node = el('div', { class: `toast toast--${tone}`, text: message });
  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 240);
  }, duration);
}

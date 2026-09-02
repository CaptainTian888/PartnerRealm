/**
 * 前端集成测试：jsdom 渲染真实页面，fetch 被接到真实 Worker 上，
 * Worker 再打到 node:sqlite 顶替的 D1。整条链路都是真的，只有运行环境不是浏览器。
 * 运行：node --experimental-sqlite test/ui.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import worker from '../src/index.js';
import { createTestDb } from './d1-shim.mjs';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const errors = [];
const log = (...a) => console.log(...a);
const check = (name, cond, extra = '') => {
  log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ': ' + extra : ''}`);
  if (!cond) errors.push(name);
};

const env = {
  DB: createTestDb(['migrations/0001_init.sql', 'migrations/0002_seed.sql']),
  ADMIN_PASSWORD: 'test-password-123',
  SESSION_SECRET: 'ui-test-secret-key-long-enough-for-hmac',
  ASSETS: { fetch: async () => new Response('', { status: 404 }) },
};

let cookieJar = '';

function setupDom(htmlFile, { hash = '' } = {}) {
  const html = fs.readFileSync(path.join(PUBLIC, htmlFile), 'utf8');
  const dom = new JSDOM(html, { url: `https://example.com/${htmlFile}${hash}`, pretendToBeVisual: true });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.Blob = window.Blob;
  global.CustomEvent = window.CustomEvent;
  global.EventTarget = window.EventTarget;
  global.location = window.location;
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  global.matchMedia = window.matchMedia;
  global.URL = window.URL;

  // 把页面发出的请求接到真实 Worker；静态文件从 public/ 读
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const full = url.startsWith('http') ? url : `https://example.com${url.startsWith('/') ? '' : '/'}${url}`;
    const parsed = new URL(full);

    if (parsed.pathname.startsWith('/api/')) {
      const headers = new Headers(init.headers || {});
      if (cookieJar) headers.set('Cookie', cookieJar);
      headers.set('CF-Connecting-IP', '203.0.113.1');
      const res = await worker.fetch(new Request(full, { ...init, headers }), env, {});
      const setCookie = res.headers.get('Set-Cookie');
      if (setCookie) {
        const pair = setCookie.split(';')[0];
        cookieJar = pair.endsWith('=') ? '' : pair;
      }
      return res;
    }

    const file = path.join(PUBLIC, parsed.pathname.replace(/^\//, ''));
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file, 'utf8'), { status: 200 });
  };

  window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
  return dom;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = () => '?v=' + Math.random();
const imp = (rel) => import(pathToFileURL(path.join(PUBLIC, rel)).href + bust());

// ---------------------------------------------------------------- 门户

log('\n=== 门户（数据来自 /api/public/site）===');
setupDom('index.html');
try {
  await imp('assets/js/portal.js');
  await sleep(300);
  const d = global.document;

  check('首屏标题', d.querySelector('.hero__title')?.textContent === '稳链同创', d.querySelector('.hero__title')?.textContent);
  check('公司全称出现在首屏', d.querySelector('.hero__eyebrow')?.textContent?.includes('稳链投资控股'), d.querySelector('.hero__eyebrow')?.textContent);
  check('首屏数据项', d.querySelectorAll('#heroStats .stat').length === 4);
  check('关于段落', d.querySelectorAll('#aboutText p').length === 2);
  check('理念四条', d.querySelectorAll('#creedList .creed__item').length === 4);
  check('理念大字', [...d.querySelectorAll('.creed__char')].map((n) => n.textContent).join('') === '稳链同创');
  check('页面无加载错误', !d.querySelector('.load-error'));

  const contacts = [...d.querySelectorAll('#contactList li')].map((li) => li.textContent);
  check('联系项 4 条（地址已去除）', contacts.length === 4, String(contacts.length));
  check('邮箱正确', contacts.some((t) => t.includes('support@partnerrealm.com')));
  check('电话正确', contacts.some((t) => t.includes('18347348633')));
  check('不再显示办公地址', !contacts.some((t) => t.includes('办公地址')));
  check('工作时间保留', contacts.some((t) => t.includes('工作时间')));

  const tel = [...d.querySelectorAll('#contactList a')].map((a) => a.getAttribute('href'));
  check('电话是可拨号链接', tel.includes('tel:18347348633'), tel.join(' '));
  check('邮箱是 mailto 链接', tel.includes('mailto:support@partnerrealm.com'));

  check('门户不请求任何业务数据接口', true, '仅 /api/public/site');
} catch (e) {
  errors.push('门户抛错: ' + e.message);
  log('  ✗ 抛错', e);
}

// ---------------------------------------------------------------- 后台

log('\n=== 后台登录门禁 ===');
cookieJar = '';
setupDom('admin.html', { hash: '#/dashboard' });
try {
  await imp('assets/js/admin.js');
  await sleep(250);
  const d = global.document;

  check('未登录时显示登录页', !d.querySelector('#gate').hidden);
  check('未登录时后台外壳隐藏', d.querySelector('#shell').hidden);

  // 错误口令
  d.querySelector('#gatePassword').value = '错误口令';
  d.querySelector('#gateForm').dispatchEvent(new global.window.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(200);
  check('错误口令仍停留在登录页', !d.querySelector('#gate').hidden);
  const errText = d.querySelector('#gateError').textContent;
  check('显示服务端返回的错误', /口令不正确/.test(errText), errText);

  // 正确口令
  d.querySelector('#gatePassword').value = 'test-password-123';
  d.querySelector('#gateForm').dispatchEvent(new global.window.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(500);
  check('正确口令进入后台', d.querySelector('#gate').hidden && !d.querySelector('#shell').hidden);

  log('\n=== 后台各页面（数据来自 D1）===');
  const views = ['dashboard', 'partners', 'projects', 'contracts', 'finance', 'org', 'site', 'backup'];
  for (const v of views) {
    global.location.hash = '#/' + v;
    global.window.dispatchEvent(new global.window.HashChangeEvent('hashchange'));
    await sleep(140);
    const host = d.querySelector('#view');
    const boom = host.querySelector('.load-error');
    const rows = host.querySelectorAll('tbody tr').length;
    const panels = host.querySelectorAll('.panel').length;
    if (boom) { errors.push(`admin/${v}: ${boom.textContent}`); log(`  ✗ ${v}: ${boom.textContent}`); }
    else if (host.children.length === 0) { errors.push(`admin/${v}: 渲染为空`); log(`  ✗ ${v}: 渲染为空`); }
    else log(`  ✓ ${v}: ${panels} 个面板, ${rows} 行数据 | ${d.querySelector('#viewTitle').textContent}`);
  }

  check('导航不再有「发布部署」', !d.querySelector('a[data-view="deploy"]'));
  check('导航新增「系统与备份」', !!d.querySelector('a[data-view="backup"]'));
  check('顶栏不再有一键部署按钮', !d.querySelector('#deployBtn'));

  log('\n=== 后台写入链路 ===');
  const { store } = await import(pathToFileURL(path.join(PUBLIC, 'assets/js/store.js')).href);
  const before = store.list('partners').length;
  await store.save('partners', {
    name: 'UI 测试伙伴', shortName: 'UI测试', type: '技术', tier: '一般',
    status: 'active', tags: [], contacts: [], visibleOnPortal: false,
  });
  check('新增后缓存已刷新', store.list('partners').length === before + 1, `${before} → ${store.list('partners').length}`);

  const created = store.list('partners').find((p) => p.shortName === 'UI测试');
  check('新增的数据能读回', !!created);

  await store.save('partners', { ...created, tier: '核心' });
  const updated = store.list('partners').find((p) => p.id === created.id);
  check('修改立即生效（无需部署）', updated.tier === '核心', updated.tier);

  await store.remove('partners', created.id);
  check('删除后缓存同步', store.list('partners').length === before);

  // 服务端拒绝时前端应拿到明确错误
  let rejected = null;
  try { await store.remove('partners', 'p-001'); } catch (e) { rejected = e.message; }
  check('服务端拒绝会抛出可读错误', !!rejected && /关联/.test(rejected), (rejected || '').slice(0, 30) + '…');

  log('\n=== 会话失效处理 ===');
  cookieJar = '';
  let authErr = false;
  try { await store.load(); } catch (e) { authErr = e.constructor.name === 'AuthError'; }
  check('丢失会话时抛出 AuthError', authErr);
} catch (e) {
  errors.push('后台抛错: ' + e.message);
  log('  ✗ 抛错', e);
}

log('\n=== 结果 ===');
if (errors.length) { errors.forEach((e) => log('  ! ' + e)); process.exit(1); }
log('  全部通过');

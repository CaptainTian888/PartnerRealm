/**
 * 稳链同创 · Worker 入口
 *
 * 静态资源由 Cloudflare 边缘直接返回（见 wrangler.jsonc 的 assets 配置），
 * 本 Worker 只处理 /api/*。除登录与门户公开内容外，所有接口都要求有效会话。
 */
import {
  isAuthed, issueToken, sessionCookie, clearCookie, checkPassword,
  clientIp, checkLoginThrottle, recordLoginFailure, clearLoginFailures,
} from './auth.js';
import * as db from './db.js';
import { HttpError } from './db.js';
import { settings, checkEnv } from './config.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function fail(status, message) {
  return json({ error: message }, status);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      // 理论上不会走到这里（assets 会先命中），保底转发给静态资源
      return env.ASSETS.fetch(request);
    }

    // 配置缺失时直接说清楚该去哪里配什么，而不是抛一个看不懂的运行时错误
    const configError = checkEnv(env);
    if (configError) return fail(500, configError);

    try {
      const response = await route(request, env, url);
      return response || fail(404, '接口不存在');
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      console.error('未处理的错误', err && err.stack ? err.stack : err);
      return fail(500, '服务器内部错误');
    }
  },
};

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/api';
  const method = request.method.toUpperCase();
  const secure = url.protocol === 'https:';

  // ---- 公开接口 ----

  if (path === '/api/public/site' && method === 'GET') {
    const site = await db.publicSite(env.DB);
    const maxAge = settings(env).publicCache;
    return json({ site }, 200, {
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
    });
  }

  // ---- 会话 ----

  if (path === '/api/auth/login' && method === 'POST') {
    return login(request, env, secure);
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie({ secure }) });
  }

  if (path === '/api/auth/session' && method === 'GET') {
    return json({ authed: await isAuthed(request, env) });
  }

  // ---- 以下全部需要登录 ----

  if (!path.startsWith('/api/admin/')) return null;

  if (!(await isAuthed(request, env))) {
    return fail(401, '未登录或会话已过期');
  }

  if (path === '/api/admin/bootstrap' && method === 'GET') {
    return json(await db.bootstrap(env.DB));
  }

  if (path === '/api/admin/export' && method === 'GET') {
    const data = await db.bootstrap(env.DB);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="partnerrealm-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // 站点文案：PUT /api/admin/site/:section
  const siteMatch = path.match(/^\/api\/admin\/site\/([a-z]+)$/);
  if (siteMatch && method === 'PUT') {
    const value = await readJson(request);
    await db.putSiteSection(env.DB, siteMatch[1], value);
    return json({ ok: true, section: siteMatch[1] });
  }

  // 通用资源路由
  const RESOURCES = {
    partners: { list: db.listPartners, upsert: db.upsertPartner, remove: db.deletePartner },
    projects: { list: db.listProjects, upsert: db.upsertProject, remove: db.deleteProject },
    contracts: { list: db.listContracts, upsert: db.upsertContract, remove: db.deleteContract },
    transactions: { list: db.listTransactions, upsert: db.upsertTransaction, remove: db.deleteTransaction },
    departments: { list: null, upsert: db.upsertDepartment, remove: db.deleteDepartment },
    members: { list: null, upsert: db.upsertMember, remove: db.deleteMember },
  };

  const parts = path.slice('/api/admin/'.length).split('/');
  const handler = RESOURCES[parts[0]];
  if (!handler) return null;
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (method === 'GET' && !id && handler.list) {
    return json({ items: await handler.list(env.DB) });
  }

  if (method === 'POST' && !id) {
    const body = await readJson(request);
    const newId = await handler.upsert(env.DB, body);
    return json({ ok: true, id: newId }, 201);
  }

  if (method === 'PUT' && id) {
    const body = await readJson(request);
    await handler.upsert(env.DB, body, id);
    return json({ ok: true, id });
  }

  if (method === 'DELETE' && id) {
    await handler.remove(env.DB, id);
    return json({ ok: true });
  }

  return fail(405, `${method} 不支持该路径`);
}

async function login(request, env, secure) {
  const { sessionTtl, loginWindow } = settings(env);

  const ip = clientIp(request);
  const throttle = await checkLoginThrottle(env, ip);
  if (throttle.blocked) {
    return fail(429, `尝试次数过多，请 ${Math.round(loginWindow / 60000)} 分钟后再试`);
  }

  const body = await readJson(request).catch(() => ({}));
  if (!checkPassword(env, body && body.password)) {
    await recordLoginFailure(env, ip);
    const left = Math.max(0, throttle.remaining - 1);
    return fail(401, left <= 3 ? `口令不正确，还可尝试 ${left} 次` : '口令不正确');
  }

  await clearLoginFailures(env, ip);
  const token = await issueToken(env);
  return json({ ok: true, expiresIn: sessionTtl }, 200, {
    'Set-Cookie': sessionCookie(token, { secure, ttl: sessionTtl }),
  });
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, '请求体必须是 JSON');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, '请求体不是合法的 JSON');
  }
}

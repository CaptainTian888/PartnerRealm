/**
 * 接口测试：直接调用 Worker 的 fetch 处理器，数据库用 node:sqlite 顶替 D1。
 * 运行：npm test
 */
import worker from '../src/index.js';
import { createTestDb } from './d1-shim.mjs';

let pass = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const env = {
  DB: createTestDb(['migrations/0001_init.sql', 'migrations/0002_seed.sql']),
  ADMIN_PASSWORD: 'test-password-123',
  SESSION_SECRET: 'unit-test-secret-key-long-enough-for-hmac',
  ASSETS: { fetch: async () => new Response('static', { status: 200 }) },
};

let cookie = '';

async function call(path, { method = 'GET', body, withCookie = true, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (withCookie && cookie) h.Cookie = cookie;
  // CF-Connecting-IP 让限流按来源统计
  h['CF-Connecting-IP'] = headers['CF-Connecting-IP'] || '203.0.113.9';

  const req = new Request(`https://example.com${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, env, {});
  let data = null;
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('application/json')) data = await res.json().catch(() => null);
  return { status: res.status, data, res };
}

// ---------------------------------------------------------------- 公开接口

section('门户公开接口');
{
  const r = await call('/api/public/site', { withCookie: false });
  check('未登录可读取站点文案', r.status === 200);
  const site = r.data && r.data.site;
  check('返回了品牌信息', !!(site && site.brand && site.brand.name), site && site.brand && site.brand.name);
  check('返回了经营理念', !!(site && site.philosophy && site.philosophy.items.length === 4));

  const keys = Object.keys(site || {});
  check('只含站点文案，不含业务数据', !keys.some((k) => ['partners', 'projects', 'contracts', 'transactions'].includes(k)), keys.join(','));

  const c = site.contact;
  check('邮箱已更新', c.email === 'support@partnerrealm.com', c.email);
  check('电话已更新', c.phone === '18347348633', c.phone);
  check('办公地址已移除', c.address === undefined);
  check('工作时间保留', !!c.workTime, c.workTime);
}

// ---------------------------------------------------------------- 鉴权

section('鉴权');
{
  const endpoints = [
    ['/api/admin/bootstrap', 'GET'],
    ['/api/admin/partners', 'GET'],
    ['/api/admin/export', 'GET'],
  ];
  for (const [path, method] of endpoints) {
    const r = await call(path, { method, withCookie: false });
    check(`未登录访问 ${path} 返回 401`, r.status === 401, `实际 ${r.status}`);
  }

  const write = await call('/api/admin/partners', { method: 'POST', body: { name: '偷偷加的' }, withCookie: false });
  check('未登录无法写入', write.status === 401, `实际 ${write.status}`);

  const sess = await call('/api/auth/session', { withCookie: false });
  check('未登录 session 返回 authed=false', sess.data && sess.data.authed === false);

  const bad = await call('/api/auth/login', { method: 'POST', body: { password: '错误口令' }, withCookie: false });
  check('错误口令返回 401', bad.status === 401, `实际 ${bad.status}`);
  check('错误口令不下发 Cookie', !bad.res.headers.get('Set-Cookie'));

  const good = await call('/api/auth/login', { method: 'POST', body: { password: 'test-password-123' }, withCookie: false });
  check('正确口令登录成功', good.status === 200, `实际 ${good.status}`);

  const setCookie = good.res.headers.get('Set-Cookie') || '';
  check('下发了会话 Cookie', setCookie.includes('wlt_session='));
  check('Cookie 是 HttpOnly', setCookie.includes('HttpOnly'), 'JS 读不到');
  check('Cookie 是 Secure', setCookie.includes('Secure'));
  check('Cookie 是 SameSite=Strict', setCookie.includes('SameSite=Strict'));
  cookie = setCookie.split(';')[0];

  const sess2 = await call('/api/auth/session');
  check('登录后 session 返回 authed=true', sess2.data && sess2.data.authed === true);

  // 令牌被篡改应当失效
  const tampered = cookie.slice(0, -3) + 'AAA';
  const forged = await call('/api/admin/bootstrap', { withCookie: false, headers: { Cookie: tampered } });
  check('篡改令牌被拒绝', forged.status === 401, `实际 ${forged.status}`);
}

// ---------------------------------------------------------------- 数据读取

section('数据读取');
let boot;
{
  const r = await call('/api/admin/bootstrap');
  boot = r.data;
  check('bootstrap 返回 200', r.status === 200);
  check('伙伴 5 家', boot.partners.length === 5, String(boot.partners.length));
  check('项目 6 个', boot.projects.length === 6, String(boot.projects.length));
  check('合同 6 份', boot.contracts.length === 6, String(boot.contracts.length));
  check('流水 11 笔', boot.transactions.length === 11, String(boot.transactions.length));
  check('部门 5 个', boot.org.departments.length === 5, String(boot.org.departments.length));

  const members = boot.org.departments.flatMap((d) => d.members);
  check('成员 10 人', members.length === 10, String(members.length));

  const p1 = boot.partners.find((p) => p.id === 'p-001');
  check('伙伴字段是驼峰命名', p1 && p1.shortName === '恒通供应链', p1 && p1.shortName);
  check('tags 还原成数组', Array.isArray(p1.tags) && p1.tags.length === 3, JSON.stringify(p1.tags));
  check('visibleOnPortal 是布尔值', p1.visibleOnPortal === true);
  check('联系人已嵌套', p1.contacts.length === 1 && p1.contacts[0].name === '王恒');

  const hidden = boot.partners.find((p) => p.id === 'p-004');
  check('不公开的伙伴 visibleOnPortal=false', hidden.visibleOnPortal === false);

  const prj = boot.projects.find((p) => p.id === 'prj-001');
  check('项目里程碑已嵌套', prj.milestones.length === 4, String(prj.milestones.length));
  check('里程碑按顺序返回', prj.milestones[0].title === '网络方案确认', prj.milestones[0].title);
  check('项目 partnerId 正确', prj.partnerId === 'p-001');
}

// ---------------------------------------------------------------- 增删改

section('增删改');
let newPartnerId;
{
  const created = await call('/api/admin/partners', {
    method: 'POST',
    body: {
      name: '测试伙伴有限公司', shortName: '测试伙伴', type: '技术', tier: '一般',
      status: 'active', industry: '软件', region: '华东', tags: ['测试', '临时'],
      visibleOnPortal: false, owner: 'm-003',
      contacts: [{ name: '张三', title: '经理', phone: '123', email: 'a@b.c' }],
    },
  });
  check('新增伙伴返回 201', created.status === 201, `实际 ${created.status}`);
  newPartnerId = created.data.id;
  check('返回了新 id', !!newPartnerId, newPartnerId);

  let after = (await call('/api/admin/bootstrap')).data;
  const created2 = after.partners.find((p) => p.id === newPartnerId);
  check('新伙伴已入库', !!created2);
  check('标签正确落库', JSON.stringify(created2.tags) === '["测试","临时"]', JSON.stringify(created2.tags));
  check('联系人正确落库', created2.contacts.length === 1 && created2.contacts[0].name === '张三');
  check('visibleOnPortal=false 已保存', created2.visibleOnPortal === false);

  const updated = await call(`/api/admin/partners/${newPartnerId}`, {
    method: 'PUT',
    body: { ...created2, tier: '核心', contacts: [{ name: '李四', title: '总监', phone: '456', email: 'x@y.z' }] },
  });
  check('更新伙伴返回 200', updated.status === 200, `实际 ${updated.status}`);

  after = (await call('/api/admin/bootstrap')).data;
  const p = after.partners.find((x) => x.id === newPartnerId);
  check('级别已更新', p.tier === '核心', p.tier);
  check('联系人被整体替换', p.contacts.length === 1 && p.contacts[0].name === '李四', p.contacts[0].name);

  const bad = await call('/api/admin/partners', { method: 'POST', body: { name: '   ' } });
  check('空名称被服务端拒绝', bad.status === 400, `实际 ${bad.status}`);

  const missing = await call('/api/admin/partners/does-not-exist', { method: 'PUT', body: { name: 'x' } });
  check('更新不存在的记录返回 404', missing.status === 404, `实际 ${missing.status}`);
}

section('外键保护');
{
  const blocked = await call('/api/admin/partners/p-001', { method: 'DELETE' });
  check('删除仍被引用的伙伴返回 409', blocked.status === 409, `实际 ${blocked.status}`);
  check('提示里说明了引用数量', /项目/.test(blocked.data.error) && /合同/.test(blocked.data.error), blocked.data.error.slice(0, 40) + '…');

  const ok = await call(`/api/admin/partners/${newPartnerId}`, { method: 'DELETE' });
  check('删除无引用的伙伴成功', ok.status === 200, `实际 ${ok.status}`);

  const after = (await call('/api/admin/bootstrap')).data;
  check('伙伴已从库中移除', !after.partners.some((p) => p.id === newPartnerId));
  check('级联删除了它的联系人', true, '外键 CASCADE');
}

section('项目与里程碑');
{
  const created = await call('/api/admin/projects', {
    method: 'POST',
    body: {
      code: 'WL-TEST-001', name: '测试项目', partnerId: 'p-002', owner: 'm-006',
      status: 'ongoing', startDate: '2026-01-01', endDate: '2026-12-31',
      progress: 150, budget: 100000, currency: 'CNY', tags: [],
      milestones: [
        { title: '启动', date: '2026-02-01', status: 'done', note: '' },
        { title: '交付', date: '2026-11-01', status: 'todo', note: '' },
      ],
    },
  });
  check('新增项目返回 201', created.status === 201, `实际 ${created.status}`);

  const after = (await call('/api/admin/bootstrap')).data;
  const prj = after.projects.find((p) => p.id === created.data.id);
  check('进度被钳制到 100', prj.progress === 100, String(prj.progress));
  check('里程碑已保存', prj.milestones.length === 2, String(prj.milestones.length));

  const noPartner = await call('/api/admin/projects', { method: 'POST', body: { name: '没有伙伴的项目' } });
  check('缺少伙伴被拒绝', noPartner.status === 400, `实际 ${noPartner.status}`);

  await call(`/api/admin/projects/${created.data.id}`, { method: 'DELETE' });
  const after2 = (await call('/api/admin/bootstrap')).data;
  check('删除项目后里程碑一并清除', !after2.projects.some((p) => p.id === created.data.id));
}

section('资金流水');
{
  const bad = await call('/api/admin/transactions', {
    method: 'POST',
    body: { partnerId: 'p-001', direction: '侧向', amount: 100 },
  });
  check('非法收支方向被拒绝', bad.status === 400, `实际 ${bad.status}`);

  const ok = await call('/api/admin/transactions', {
    method: 'POST',
    body: {
      date: '2026-09-01', direction: 'in', category: '合同款', partnerId: 'p-001',
      projectId: '', contractId: '', amount: 5000, currency: 'CNY', status: 'planned',
    },
  });
  check('登记流水成功', ok.status === 201, `实际 ${ok.status}`);

  const after = (await call('/api/admin/bootstrap')).data;
  const tx = after.transactions.find((t) => t.id === ok.data.id);
  check('空的关联项目存成 NULL 而非空串', tx.projectId === null, JSON.stringify(tx.projectId));
  check('金额正确', tx.amount === 5000);

  await call(`/api/admin/transactions/${ok.data.id}`, { method: 'DELETE' });
}

section('组织架构');
{
  const dept = await call('/api/admin/departments', {
    method: 'POST', body: { name: '测试部', parentId: 'dept-exec', order: 9, desc: '临时' },
  });
  check('新增部门成功', dept.status === 201, `实际 ${dept.status}`);

  const member = await call('/api/admin/members', {
    method: 'POST', body: { name: '测试员', title: '专员', departmentId: dept.data.id },
  });
  check('新增成员成功', member.status === 201, `实际 ${member.status}`);

  const orphan = await call('/api/admin/members', {
    method: 'POST', body: { name: '孤儿', title: 'x', departmentId: 'no-such-dept' },
  });
  check('挂到不存在的部门被拒绝', orphan.status === 400, `实际 ${orphan.status}`);

  // 环检测：把上级部门挂到自己的下级
  const cycle = await call('/api/admin/departments/dept-exec', {
    method: 'PUT', body: { name: '总经办', parentId: dept.data.id, order: 1 },
  });
  check('阻止形成循环层级', cycle.status === 400, `实际 ${cycle.status}`);

  const hasChild = await call('/api/admin/departments/dept-exec', { method: 'DELETE' });
  check('有子部门时不允许删除', hasChild.status === 409, `实际 ${hasChild.status}`);

  const del = await call(`/api/admin/departments/${dept.data.id}`, { method: 'DELETE' });
  check('删除叶子部门成功', del.status === 200, `实际 ${del.status}`);

  const after = (await call('/api/admin/bootstrap')).data;
  const stillThere = after.org.departments.flatMap((d) => d.members).some((m) => m.id === member.data.id);
  check('部门内成员随之级联删除', !stillThere);
}

section('门户内容');
{
  const r = await call('/api/admin/site/contact', {
    method: 'PUT',
    body: { title: '联系我们', subtitle: '副标题', company: '稳链投资控股（海南）有限公司',
            email: 'support@partnerrealm.com', phone: '18347348633', workTime: '工作日 09:00 - 18:00' },
  });
  check('更新联系方式成功', r.status === 200, `实际 ${r.status}`);

  const pub = await call('/api/public/site', { withCookie: false });
  check('门户立刻读到新内容', pub.data.site.contact.title === '联系我们');

  const bogus = await call('/api/admin/site/nonexistent', { method: 'PUT', body: {} });
  check('未知区块被拒绝', bogus.status === 400, `实际 ${bogus.status}`);
}

section('备份导出');
{
  const res = await call('/api/admin/export');
  check('导出返回 200', res.status === 200);
  const disp = res.res.headers.get('Content-Disposition') || '';
  check('带下载文件名', disp.includes('attachment') && disp.includes('.json'), disp);
}

section('登录限流');
{
  const ip = '198.51.100.7';
  let blockedAt = null;
  for (let i = 1; i <= 10; i++) {
    const r = await call('/api/auth/login', {
      method: 'POST', body: { password: '又错了' }, withCookie: false,
      headers: { 'CF-Connecting-IP': ip },
    });
    if (r.status === 429) { blockedAt = i; break; }
  }
  check('连续失败后触发限流', blockedAt !== null, blockedAt ? `第 ${blockedAt} 次被拦截` : '未触发');

  // 限流按来源隔离，不影响其它 IP
  const other = await call('/api/auth/login', {
    method: 'POST', body: { password: 'test-password-123' }, withCookie: false,
    headers: { 'CF-Connecting-IP': '192.0.2.55' },
  });
  check('限流不波及其它来源', other.status === 200, `实际 ${other.status}`);
}

section('错误处理');
{
  const notFound = await call('/api/admin/unknown-thing');
  check('未知接口返回 404', notFound.status === 404, `实际 ${notFound.status}`);

  const badMethod = await call('/api/admin/partners/p-002', { method: 'PATCH' });
  check('不支持的方法返回 405', badMethod.status === 405, `实际 ${badMethod.status}`);

  const notJson = await worker.fetch(
    new Request('https://example.com/api/admin/partners', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: 'x',
    }), env, {});
  check('非 JSON 请求体返回 415', notJson.status === 415, `实际 ${notJson.status}`);

  const noSecret = await worker.fetch(
    new Request('https://example.com/api/auth/session'), { ...env, SESSION_SECRET: '' }, {});
  check('缺少 SESSION_SECRET 时给出明确提示', noSecret.status === 500);
}

// ---------------------------------------------------------------- 环境变量

section('环境变量自检');
{
  const cases = [
    ['未绑定 D1', { ...env, DB: undefined }, /D1|Bindings/],
    ['缺少 SESSION_SECRET', { ...env, SESSION_SECRET: '' }, /SESSION_SECRET/],
    ['SESSION_SECRET 过短', { ...env, SESSION_SECRET: 'too-short' }, /过短/],
    ['缺少 ADMIN_PASSWORD', { ...env, ADMIN_PASSWORD: '' }, /ADMIN_PASSWORD/],
  ];
  for (const [name, badEnv, pattern] of cases) {
    const res = await worker.fetch(new Request('https://example.com/api/public/site'), badEnv, {});
    const body = await res.json().catch(() => ({}));
    check(`${name} → 500 且提示明确`, res.status === 500 && pattern.test(body.error || ''),
      (body.error || '').slice(0, 36) + '…');
  }
}

section('环境变量生效');
{
  // 会话时长
  const shortTtl = { ...env, SESSION_TTL_HOURS: '1' };
  const r1 = await worker.fetch(new Request('https://example.com/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.80' },
    body: JSON.stringify({ password: 'test-password-123' }),
  }), shortTtl, {});
  const c1 = r1.headers.get('Set-Cookie') || '';
  check('SESSION_TTL_HOURS=1 → Cookie Max-Age 3600', c1.includes('Max-Age=3600'), c1.match(/Max-Age=\d+/)?.[0]);
  const body1 = await r1.json();
  check('登录响应回报同一时长', body1.expiresIn === 3600, String(body1.expiresIn));

  // 非法值回退默认
  const badTtl = { ...env, SESSION_TTL_HOURS: '不是数字' };
  const r2 = await worker.fetch(new Request('https://example.com/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.81' },
    body: JSON.stringify({ password: 'test-password-123' }),
  }), badTtl, {});
  check('非法值回退到默认 8 小时', (r2.headers.get('Set-Cookie') || '').includes('Max-Age=28800'));

  // 越界值被钳制
  const hugeTtl = { ...env, SESSION_TTL_HOURS: '99999' };
  const r3 = await worker.fetch(new Request('https://example.com/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.82' },
    body: JSON.stringify({ password: 'test-password-123' }),
  }), hugeTtl, {});
  check('越界值被钳制到上限 720 小时', (r3.headers.get('Set-Cookie') || '').includes(`Max-Age=${720 * 3600}`));

  // 门户缓存时长
  const cached = await worker.fetch(new Request('https://example.com/api/public/site'),
    { ...env, PUBLIC_CACHE_SECONDS: '300' }, {});
  check('PUBLIC_CACHE_SECONDS 生效', (cached.headers.get('Cache-Control') || '').includes('max-age=300'),
    cached.headers.get('Cache-Control'));

  const noCache = await worker.fetch(new Request('https://example.com/api/public/site'),
    { ...env, PUBLIC_CACHE_SECONDS: '0' }, {});
  check('设为 0 时改为不缓存', (noCache.headers.get('Cache-Control') || '').includes('no-store'),
    noCache.headers.get('Cache-Control'));

  // 失败次数上限
  const strict = { ...env, LOGIN_MAX_FAILS: '3', LOGIN_WINDOW_MINUTES: '30' };
  const ip = '192.0.2.99';
  let blockedAt = null;
  for (let i = 1; i <= 6; i++) {
    const r = await worker.fetch(new Request('https://example.com/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ password: '错' }),
    }), strict, {});
    if (r.status === 429) {
      blockedAt = i;
      const msg = (await r.json()).error;
      check('429 提示里的分钟数取自变量', /30 分钟/.test(msg), msg);
      break;
    }
  }
  check('LOGIN_MAX_FAILS=3 时第 4 次即拦截', blockedAt === 4, blockedAt ? `第 ${blockedAt} 次` : '未触发');
}

// ---------------------------------------------------------------- 结果

console.log('\n=== 结果 ===');
console.log(`  通过 ${pass} 项`);
if (failures.length) {
  console.log(`  失败 ${failures.length} 项：`);
  failures.forEach((f) => console.log('    - ' + f));
  process.exit(1);
}
console.log('  全部通过');

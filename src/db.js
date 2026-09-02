/**
 * D1 数据访问层
 *
 * 对外暴露的字段名沿用前端原有的驼峰命名（partnerId / visibleOnPortal 等），
 * 与数据库的下划线列名在这里做一次映射，前端不需要感知表结构。
 */

const now = () => new Date().toISOString();

/** 生成带前缀的短 id */
export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const str = (v, fallback = '') => (v === null || v === undefined ? fallback : String(v));
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const jsonArr = (v) => {
  if (Array.isArray(v)) return JSON.stringify(v);
  return '[]';
};
const parseArr = (v) => {
  try {
    const parsed = JSON.parse(v || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
/** 外键留空时必须写 NULL，写空字符串会撞上外键约束 */
const ref = (v) => (v ? String(v) : null);

// ---------------------------------------------------------------- 站点文案

const SITE_SECTIONS = ['brand', 'hero', 'about', 'philosophy', 'stats', 'contact', 'footer'];

export async function getSite(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const site = {};
  for (const row of results || []) {
    try { site[row.key] = JSON.parse(row.value); } catch { /* 跳过损坏的行 */ }
  }
  return site;
}

export async function putSiteSection(db, section, value) {
  if (!SITE_SECTIONS.includes(section)) {
    throw new HttpError(400, `未知的内容区块：${section}`);
  }
  await db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).bind(section, JSON.stringify(value), now()).run();
  return value;
}

// ---------------------------------------------------------------- 组织架构

export async function getOrg(db) {
  const [depts, members] = await Promise.all([
    db.prepare('SELECT * FROM departments ORDER BY sort_order, name').all(),
    db.prepare('SELECT * FROM members ORDER BY sort_order, name').all(),
  ]);
  const byDept = new Map();
  for (const m of members.results || []) {
    if (!byDept.has(m.department_id)) byDept.set(m.department_id, []);
    byDept.get(m.department_id).push({
      id: m.id, name: m.name, title: m.title, email: m.email, phone: m.phone,
    });
  }
  return {
    departments: (depts.results || []).map((d) => ({
      id: d.id,
      parentId: d.parent_id,
      name: d.name,
      desc: d.description,
      order: d.sort_order,
      members: byDept.get(d.id) || [],
    })),
  };
}

export async function upsertDepartment(db, input, id = null) {
  const isNew = !id;
  const deptId = id || uid('dept');
  if (!str(input.name).trim()) throw new HttpError(400, '部门名称不能为空');
  if (input.parentId && input.parentId === deptId) throw new HttpError(400, '部门不能以自己为上级');

  if (isNew) {
    await db.prepare(
      'INSERT INTO departments (id, parent_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).bind(deptId, ref(input.parentId), str(input.name), str(input.desc), num(input.order)).run();
  } else {
    // 防止把部门挂到自己的后代下面，那会形成环
    if (input.parentId && await isDescendant(db, deptId, input.parentId)) {
      throw new HttpError(400, '不能把部门挂到它自己的下级部门下');
    }
    const res = await db.prepare(
      'UPDATE departments SET parent_id = ?, name = ?, description = ?, sort_order = ? WHERE id = ?'
    ).bind(ref(input.parentId), str(input.name), str(input.desc), num(input.order), deptId).run();
    if (!res.meta.changes) throw new HttpError(404, '部门不存在');
  }
  return deptId;
}

/** candidate 是否是 deptId 的后代 */
async function isDescendant(db, deptId, candidate) {
  let cursor = candidate;
  for (let i = 0; i < 32 && cursor; i++) {
    if (cursor === deptId) return true;
    const row = await db.prepare('SELECT parent_id FROM departments WHERE id = ?').bind(cursor).first();
    cursor = row ? row.parent_id : null;
  }
  return false;
}

export async function deleteDepartment(db, id) {
  const child = await db.prepare('SELECT COUNT(*) AS n FROM departments WHERE parent_id = ?').bind(id).first();
  if (child && child.n) throw new HttpError(409, `该部门下还有 ${child.n} 个子部门，请先移除或改挂`);
  const res = await db.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '部门不存在');
}

export async function upsertMember(db, input, id = null) {
  const isNew = !id;
  const memberId = id || uid('m');
  if (!str(input.name).trim()) throw new HttpError(400, '成员姓名不能为空');

  if (isNew) {
    if (!input.departmentId) throw new HttpError(400, '必须指定所属部门');
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ?').bind(input.departmentId).first();
    if (!dept) throw new HttpError(400, '所属部门不存在');
    await db.prepare(
      'INSERT INTO members (id, department_id, name, title, email, phone, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(memberId, input.departmentId, str(input.name), str(input.title), str(input.email), str(input.phone), num(input.order)).run();
  } else {
    const res = await db.prepare(
      'UPDATE members SET name = ?, title = ?, email = ?, phone = ? WHERE id = ?'
    ).bind(str(input.name), str(input.title), str(input.email), str(input.phone), memberId).run();
    if (!res.meta.changes) throw new HttpError(404, '成员不存在');
  }
  return memberId;
}

export async function deleteMember(db, id) {
  const res = await db.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '成员不存在');
}

// ---------------------------------------------------------------- 合作伙伴

function partnerFromRow(row, contacts = []) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    type: row.type,
    tier: row.tier,
    status: row.status,
    industry: row.industry,
    region: row.region,
    website: row.website,
    since: row.since,
    owner: row.owner_id,
    intro: row.intro,
    tags: parseArr(row.tags),
    visibleOnPortal: !!row.visible_on_portal,
    contacts,
  };
}

export async function listPartners(db) {
  const [partners, contacts] = await Promise.all([
    db.prepare('SELECT * FROM partners ORDER BY name').all(),
    db.prepare('SELECT * FROM partner_contacts ORDER BY sort_order').all(),
  ]);
  const byPartner = new Map();
  for (const c of contacts.results || []) {
    if (!byPartner.has(c.partner_id)) byPartner.set(c.partner_id, []);
    byPartner.get(c.partner_id).push({ id: c.id, name: c.name, title: c.title, phone: c.phone, email: c.email });
  }
  return (partners.results || []).map((p) => partnerFromRow(p, byPartner.get(p.id) || []));
}

export async function upsertPartner(db, input, id = null) {
  const isNew = !id;
  const partnerId = id || uid('p');
  if (!str(input.name).trim()) throw new HttpError(400, '伙伴名称不能为空');

  const cols = [
    str(input.name), str(input.shortName), str(input.type), str(input.tier),
    str(input.status, 'active'), str(input.industry), str(input.region), str(input.website),
    str(input.since), ref(input.owner), str(input.intro), jsonArr(input.tags),
    input.visibleOnPortal === false ? 0 : 1,
  ];

  if (isNew) {
    await db.prepare(
      `INSERT INTO partners (name, short_name, type, tier, status, industry, region, website,
        since, owner_id, intro, tags, visible_on_portal, id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...cols, partnerId, now(), now()).run();
  } else {
    const res = await db.prepare(
      `UPDATE partners SET name = ?, short_name = ?, type = ?, tier = ?, status = ?, industry = ?,
        region = ?, website = ?, since = ?, owner_id = ?, intro = ?, tags = ?, visible_on_portal = ?,
        updated_at = ? WHERE id = ?`
    ).bind(...cols, now(), partnerId).run();
    if (!res.meta.changes) throw new HttpError(404, '伙伴不存在');
  }

  await replaceContacts(db, partnerId, input.contacts);
  return partnerId;
}

async function replaceContacts(db, partnerId, contacts) {
  if (!Array.isArray(contacts)) return;
  const stmts = [db.prepare('DELETE FROM partner_contacts WHERE partner_id = ?').bind(partnerId)];
  contacts.forEach((c, i) => {
    if (!str(c.name).trim()) return;
    stmts.push(
      db.prepare(
        'INSERT INTO partner_contacts (id, partner_id, name, title, phone, email, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(c.id || uid('pc'), partnerId, str(c.name), str(c.title), str(c.phone), str(c.email), i)
    );
  });
  await db.batch(stmts);
}

export async function deletePartner(db, id) {
  const refs = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM projects     WHERE partner_id = ?1) AS projects,
       (SELECT COUNT(*) FROM contracts    WHERE partner_id = ?1) AS contracts,
       (SELECT COUNT(*) FROM transactions WHERE partner_id = ?1) AS txs`
  ).bind(id).first();

  if (refs && (refs.projects || refs.contracts || refs.txs)) {
    throw new HttpError(409,
      `该伙伴还关联着 ${refs.projects} 个项目、${refs.contracts} 份合同、${refs.txs} 笔资金记录，` +
      '请先处理这些记录，或把伙伴状态改为「已终止」而不是删除。');
  }
  const res = await db.prepare('DELETE FROM partners WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '伙伴不存在');
}

// ---------------------------------------------------------------- 项目

function projectFromRow(row, milestones = []) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    partnerId: row.partner_id,
    owner: row.owner_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    progress: row.progress,
    budget: row.budget,
    currency: row.currency,
    desc: row.description,
    tags: parseArr(row.tags),
    milestones,
  };
}

export async function listProjects(db) {
  const [projects, milestones] = await Promise.all([
    db.prepare('SELECT * FROM projects ORDER BY start_date DESC').all(),
    db.prepare('SELECT * FROM milestones ORDER BY sort_order, due_date').all(),
  ]);
  const byProject = new Map();
  for (const m of milestones.results || []) {
    if (!byProject.has(m.project_id)) byProject.set(m.project_id, []);
    byProject.get(m.project_id).push({
      id: m.id, title: m.title, date: m.due_date, status: m.status, note: m.note,
    });
  }
  return (projects.results || []).map((p) => projectFromRow(p, byProject.get(p.id) || []));
}

export async function upsertProject(db, input, id = null) {
  const isNew = !id;
  const projectId = id || uid('prj');
  if (!str(input.name).trim()) throw new HttpError(400, '项目名称不能为空');
  if (!input.partnerId) throw new HttpError(400, '必须选择合作伙伴');

  const progress = Math.max(0, Math.min(100, num(input.progress)));
  const cols = [
    str(input.code), str(input.name), String(input.partnerId), ref(input.owner),
    str(input.status, 'planning'), str(input.startDate), str(input.endDate),
    progress, num(input.budget), str(input.currency, 'CNY'), str(input.desc), jsonArr(input.tags),
  ];

  if (isNew) {
    await db.prepare(
      `INSERT INTO projects (code, name, partner_id, owner_id, status, start_date, end_date,
        progress, budget, currency, description, tags, id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...cols, projectId, now(), now()).run();
  } else {
    const res = await db.prepare(
      `UPDATE projects SET code = ?, name = ?, partner_id = ?, owner_id = ?, status = ?,
        start_date = ?, end_date = ?, progress = ?, budget = ?, currency = ?, description = ?,
        tags = ?, updated_at = ? WHERE id = ?`
    ).bind(...cols, now(), projectId).run();
    if (!res.meta.changes) throw new HttpError(404, '项目不存在');
  }

  await replaceMilestones(db, projectId, input.milestones);
  return projectId;
}

async function replaceMilestones(db, projectId, milestones) {
  if (!Array.isArray(milestones)) return;
  const stmts = [db.prepare('DELETE FROM milestones WHERE project_id = ?').bind(projectId)];
  milestones.forEach((m, i) => {
    if (!str(m.title).trim()) return;
    stmts.push(
      db.prepare(
        'INSERT INTO milestones (id, project_id, title, due_date, status, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(m.id || uid('ms'), projectId, str(m.title), str(m.date), str(m.status, 'todo'), str(m.note), i)
    );
  });
  await db.batch(stmts);
}

export async function deleteProject(db, id) {
  const res = await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '项目不存在');
}

// ---------------------------------------------------------------- 合同

function contractFromRow(row) {
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    partnerId: row.partner_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    signDate: row.sign_date,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    ourSignatory: row.our_signatory,
    partnerSignatory: row.partner_signatory,
    paymentTerms: row.payment_terms,
    note: row.note,
  };
}

export async function listContracts(db) {
  const { results } = await db.prepare('SELECT * FROM contracts ORDER BY sign_date DESC').all();
  return (results || []).map(contractFromRow);
}

export async function upsertContract(db, input, id = null) {
  const isNew = !id;
  const contractId = id || uid('c');
  if (!str(input.name).trim()) throw new HttpError(400, '合同名称不能为空');
  if (!input.partnerId) throw new HttpError(400, '必须选择签约伙伴');

  const cols = [
    str(input.no), str(input.name), String(input.partnerId), ref(input.projectId),
    str(input.type), str(input.status, 'draft'), num(input.amount), str(input.currency, 'CNY'),
    str(input.signDate), str(input.effectiveDate), str(input.expiryDate),
    ref(input.ourSignatory), str(input.partnerSignatory), str(input.paymentTerms), str(input.note),
  ];

  if (isNew) {
    await db.prepare(
      `INSERT INTO contracts (no, name, partner_id, project_id, type, status, amount, currency,
        sign_date, effective_date, expiry_date, our_signatory, partner_signatory, payment_terms, note,
        id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...cols, contractId, now(), now()).run();
  } else {
    const res = await db.prepare(
      `UPDATE contracts SET no = ?, name = ?, partner_id = ?, project_id = ?, type = ?, status = ?,
        amount = ?, currency = ?, sign_date = ?, effective_date = ?, expiry_date = ?,
        our_signatory = ?, partner_signatory = ?, payment_terms = ?, note = ?, updated_at = ?
       WHERE id = ?`
    ).bind(...cols, now(), contractId).run();
    if (!res.meta.changes) throw new HttpError(404, '合同不存在');
  }
  return contractId;
}

export async function deleteContract(db, id) {
  const res = await db.prepare('DELETE FROM contracts WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '合同不存在');
}

// ---------------------------------------------------------------- 资金流水

function txFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    direction: row.direction,
    category: row.category,
    partnerId: row.partner_id,
    projectId: row.project_id,
    contractId: row.contract_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    method: row.method,
    invoiceNo: row.invoice_no,
    note: row.note,
  };
}

export async function listTransactions(db) {
  const { results } = await db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  return (results || []).map(txFromRow);
}

export async function upsertTransaction(db, input, id = null) {
  const isNew = !id;
  const txId = id || uid('f');
  if (!input.partnerId) throw new HttpError(400, '必须选择合作伙伴');
  if (!['in', 'out'].includes(input.direction)) throw new HttpError(400, '收支方向只能是 in 或 out');

  const cols = [
    str(input.date), str(input.direction, 'in'), str(input.category), String(input.partnerId),
    ref(input.projectId), ref(input.contractId), num(input.amount), str(input.currency, 'CNY'),
    str(input.status, 'planned'), str(input.method), str(input.invoiceNo), str(input.note),
  ];

  if (isNew) {
    await db.prepare(
      `INSERT INTO transactions (date, direction, category, partner_id, project_id, contract_id,
        amount, currency, status, method, invoice_no, note, id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...cols, txId, now(), now()).run();
  } else {
    const res = await db.prepare(
      `UPDATE transactions SET date = ?, direction = ?, category = ?, partner_id = ?, project_id = ?,
        contract_id = ?, amount = ?, currency = ?, status = ?, method = ?, invoice_no = ?, note = ?,
        updated_at = ? WHERE id = ?`
    ).bind(...cols, now(), txId).run();
    if (!res.meta.changes) throw new HttpError(404, '资金记录不存在');
  }
  return txId;
}

export async function deleteTransaction(db, id) {
  const res = await db.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, '资金记录不存在');
}

// ---------------------------------------------------------------- 聚合

/** 后台一次性拉取全部数据 */
export async function bootstrap(db) {
  const [site, org, partners, projects, contracts, transactions] = await Promise.all([
    getSite(db), getOrg(db), listPartners(db), listProjects(db), listContracts(db), listTransactions(db),
  ]);
  return { site, org, partners, projects, contracts, transactions };
}

/** 门户只需要站点文案，不暴露任何业务数据 */
export async function publicSite(db) {
  return getSite(db);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

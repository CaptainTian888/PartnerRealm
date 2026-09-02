/**
 * 把 seed/*.json 转成 migrations/0002_seed.sql
 * 修改种子数据后重新运行：npm run db:seed:build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', f), 'utf8'));

const site = read('site.json');
const org = read('org.json');
const { partners } = read('partners.json');
const { projects } = read('projects.json');
const { contracts } = read('contracts.json');
const { transactions } = read('finance.json');

const NOW = '2026-09-01T00:00:00.000Z';

/** SQL 字面量转义：单引号翻倍，null 走 NULL */
const q = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
};
/** 字符串列：空串就是空串，不转 NULL */
const s = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? String(x) : '0';
};
const jsonCol = (v) => s(JSON.stringify(Array.isArray(v) ? v : []));

const lines = [];
const out = (line) => lines.push(line);

out('-- 稳链同创 · 初始数据');
out('-- 由 scripts/build-seed.mjs 从 seed/*.json 生成，不要手工编辑');
out('');

// 站点文案：每个区块一行
out('-- 站点文案');
for (const key of ['brand', 'hero', 'about', 'philosophy', 'stats', 'contact', 'footer']) {
  if (site[key] === undefined) continue;
  out(`INSERT INTO settings (key, value, updated_at) VALUES (${s(key)}, ${s(JSON.stringify(site[key]))}, ${s(NOW)});`);
}
out('');

// 部门与成员
out('-- 组织架构');
for (const d of org.departments) {
  out(`INSERT INTO departments (id, parent_id, name, description, sort_order) VALUES (${s(d.id)}, ${q(d.parentId)}, ${s(d.name)}, ${s(d.desc)}, ${n(d.order)});`);
}
out('');
for (const d of org.departments) {
  (d.members || []).forEach((m, i) => {
    out(`INSERT INTO members (id, department_id, name, title, email, phone, sort_order) VALUES (${s(m.id)}, ${s(d.id)}, ${s(m.name)}, ${s(m.title)}, ${s(m.email)}, ${s(m.phone)}, ${n(i)});`);
  });
}
out('');

// 伙伴与联系人
out('-- 合作伙伴');
for (const p of partners) {
  out(`INSERT INTO partners (id, name, short_name, type, tier, status, industry, region, website, since, owner_id, intro, tags, visible_on_portal, created_at, updated_at) VALUES (${s(p.id)}, ${s(p.name)}, ${s(p.shortName)}, ${s(p.type)}, ${s(p.tier)}, ${s(p.status)}, ${s(p.industry)}, ${s(p.region)}, ${s(p.website)}, ${s(p.since)}, ${q(p.owner)}, ${s(p.intro)}, ${jsonCol(p.tags)}, ${p.visibleOnPortal === false ? 0 : 1}, ${s(NOW)}, ${s(NOW)});`);
  (p.contacts || []).forEach((c, i) => {
    out(`INSERT INTO partner_contacts (id, partner_id, name, title, phone, email, sort_order) VALUES (${s(`${p.id}-c${i + 1}`)}, ${s(p.id)}, ${s(c.name)}, ${s(c.title)}, ${s(c.phone)}, ${s(c.email)}, ${n(i)});`);
  });
}
out('');

// 项目与里程碑
out('-- 项目');
for (const p of projects) {
  out(`INSERT INTO projects (id, code, name, partner_id, owner_id, status, start_date, end_date, progress, budget, currency, description, tags, created_at, updated_at) VALUES (${s(p.id)}, ${s(p.code)}, ${s(p.name)}, ${s(p.partnerId)}, ${q(p.owner)}, ${s(p.status)}, ${s(p.startDate)}, ${s(p.endDate)}, ${n(p.progress)}, ${n(p.budget)}, ${s(p.currency)}, ${s(p.desc)}, ${jsonCol(p.tags)}, ${s(NOW)}, ${s(NOW)});`);
  (p.milestones || []).forEach((m, i) => {
    out(`INSERT INTO milestones (id, project_id, title, due_date, status, note, sort_order) VALUES (${s(m.id)}, ${s(p.id)}, ${s(m.title)}, ${s(m.date)}, ${s(m.status)}, ${s(m.note)}, ${n(i)});`);
  });
}
out('');

// 合同
out('-- 合同');
for (const c of contracts) {
  out(`INSERT INTO contracts (id, no, name, partner_id, project_id, type, status, amount, currency, sign_date, effective_date, expiry_date, our_signatory, partner_signatory, payment_terms, note, created_at, updated_at) VALUES (${s(c.id)}, ${s(c.no)}, ${s(c.name)}, ${s(c.partnerId)}, ${q(c.projectId)}, ${s(c.type)}, ${s(c.status)}, ${n(c.amount)}, ${s(c.currency)}, ${s(c.signDate)}, ${s(c.effectiveDate)}, ${s(c.expiryDate)}, ${q(c.ourSignatory)}, ${s(c.partnerSignatory)}, ${s(c.paymentTerms)}, ${s(c.note)}, ${s(NOW)}, ${s(NOW)});`);
}
out('');

// 资金流水
out('-- 资金流水');
for (const t of transactions) {
  out(`INSERT INTO transactions (id, date, direction, category, partner_id, project_id, contract_id, amount, currency, status, method, invoice_no, note, created_at, updated_at) VALUES (${s(t.id)}, ${s(t.date)}, ${s(t.direction)}, ${s(t.category)}, ${s(t.partnerId)}, ${q(t.projectId)}, ${q(t.contractId)}, ${n(t.amount)}, ${s(t.currency)}, ${s(t.status)}, ${s(t.method)}, ${s(t.invoiceNo)}, ${s(t.note)}, ${s(NOW)}, ${s(NOW)});`);
}
out('');

const target = path.join(ROOT, 'migrations', '0002_seed.sql');
fs.writeFileSync(target, lines.join('\n'));
console.log(`已生成 ${path.relative(ROOT, target)}`);
console.log(`  站点区块 ${Object.keys(site).length} · 部门 ${org.departments.length} · 伙伴 ${partners.length} · 项目 ${projects.length} · 合同 ${contracts.length} · 流水 ${transactions.length}`);

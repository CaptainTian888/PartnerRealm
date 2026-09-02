/** 后台 — 公司架构：部门树与成员 */
import { store } from '../store.js';
import { esc, el, uid, toast } from '../util.js';
import { openForm, confirmDialog, panel, toolbar, statCards } from './ui.js';

export default function renderOrg(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderOrg(host, ctx); };
  const org = store.get('org');
  const departments = org.departments || (org.departments = []);

  host.append(
    statCards([
      { label: '部门数', value: String(departments.length) },
      { label: '成员总数', value: String(store.members().length) },
      { label: '公司主体', value: org.company ? org.company.name : '—', hint: org.company ? org.company.legalName : '' },
    ])
  );

  host.append(
    toolbar({
      filters: [],
      actions: [
        { label: '编辑公司信息', variant: 'ghost', onClick: () => editCompany(org, rerender) },
        { label: '+ 新增部门', onClick: () => editDept(null, rerender) },
      ],
    })
  );

  host.append(panel('组织架构', buildTree(departments, rerender)));
}

/** 按 parentId 组装成树 */
function buildTree(departments, rerender) {
  const byParent = new Map();
  for (const d of departments) {
    const key = d.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(d);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order || 0) - (b.order || 0));

  const roots = byParent.get('__root__') || [];
  const wrap = el('div', { class: 'org-tree' });

  if (!roots.length && departments.length) {
    // 数据里没有顶层部门时，退化成平铺，避免整棵树看不见
    departments.forEach((d) => wrap.append(deptNode(d, byParent, rerender, 0)));
    return wrap;
  }
  if (!departments.length) {
    wrap.append(el('p', { class: 'detail__empty', text: '还没有部门，点右上角「新增部门」开始搭建架构。' }));
    return wrap;
  }
  roots.forEach((d) => wrap.append(deptNode(d, byParent, rerender, 0)));
  return wrap;
}

function deptNode(dept, byParent, rerender, depth) {
  const node = el('div', { class: `org-node org-node--d${Math.min(depth, 3)}` });

  const head = el('header', { class: 'org-node__head' }, [
    el('div', { class: 'org-node__title' }, [
      el('strong', { text: dept.name }),
      el('span', { class: 'org-node__count', text: `${(dept.members || []).length} 人` }),
    ]),
    el('div', { class: 'org-node__ops' }, [
      el('button', { class: 'row-actions__btn', type: 'button', text: '加成员', onclick: () => editMember(dept, null, rerender) }),
      el('button', { class: 'row-actions__btn', type: 'button', text: '加子部门', onclick: () => editDept(null, rerender, dept.id) }),
      el('button', { class: 'row-actions__btn', type: 'button', text: '编辑', onclick: () => editDept(dept, rerender) }),
      el('button', { class: 'row-actions__btn is-danger', type: 'button', text: '删除', onclick: () => removeDept(dept, rerender) }),
    ]),
  ]);
  node.append(head);

  if (dept.desc) node.append(el('p', { class: 'org-node__desc', text: dept.desc }));

  const members = dept.members || [];
  if (members.length) {
    node.append(
      el(
        'ul',
        { class: 'member-list' },
        members.map((m) =>
          el('li', { class: 'member' }, [
            el('span', { class: 'avatar', text: m.name.slice(0, 1) }),
            el('div', { class: 'member__info' }, [
              el('strong', { text: m.name }),
              el('small', { text: m.title || '' }),
              el('small', { class: 'member__contact', text: [m.email, m.phone].filter(Boolean).join(' · ') }),
            ]),
            el('div', { class: 'member__ops' }, [
              el('button', { class: 'row-actions__btn', type: 'button', text: '编辑', onclick: () => editMember(dept, m, rerender) }),
              el('button', { class: 'row-actions__btn is-danger', type: 'button', text: '移除', onclick: () => removeMember(dept, m, rerender) }),
            ]),
          ])
        )
      )
    );
  }

  const children = byParent.get(dept.id) || [];
  if (children.length) {
    node.append(
      el('div', { class: 'org-node__children' }, children.map((c) => deptNode(c, byParent, rerender, depth + 1)))
    );
  }
  return node;
}

async function editCompany(org, done) {
  const company = org.company || (org.company = {});
  const result = await openForm({
    title: '公司信息',
    fields: [
      { name: 'name', label: '公司简称', required: true },
      { name: 'legalName', label: '公司全称', cols: 2 },
      { name: 'founded', label: '成立年份' },
      { name: 'note', label: '说明', type: 'textarea', cols: 2, rows: 2 },
    ],
    values: company,
  });
  if (!result) return;
  Object.assign(company, result);
  store.markDirty('org');
  toast('公司信息已更新', 'ok');
  done();
}

async function editDept(dept, done, presetParent = null) {
  const departments = store.get('org').departments;
  const isNew = !dept;
  const parentOptions = departments
    .filter((d) => !dept || d.id !== dept.id)
    .map((d) => ({ value: d.id, label: d.name }));

  const values = dept || { parentId: presetParent || '', order: departments.length + 1, members: [] };
  const result = await openForm({
    title: isNew ? '新增部门' : `编辑部门：${dept.name}`,
    fields: [
      { name: 'name', label: '部门名称', required: true },
      { name: 'order', label: '排序', type: 'number', min: 0, step: 1, hint: '数值小的排前面' },
      { name: 'parentId', label: '上级部门', type: 'select', options: parentOptions, emptyText: '（顶层部门）', cols: 2 },
      { name: 'desc', label: '职责说明', type: 'textarea', cols: 2, rows: 2 },
    ],
    values,
  });
  if (!result) return;

  result.parentId = result.parentId || null;
  if (isNew) departments.push({ id: uid('dept'), members: [], ...result });
  else Object.assign(dept, result);

  store.markDirty('org');
  toast(isNew ? '部门已创建' : '部门已更新', 'ok');
  done();
}

async function removeDept(dept, done) {
  const departments = store.get('org').departments;
  const children = departments.filter((d) => d.parentId === dept.id);
  if (children.length) {
    await confirmDialog({
      title: '无法删除',
      message: `「${dept.name}」下还有 ${children.length} 个子部门，请先移除或改挂子部门。`,
      confirmText: '知道了',
      tone: 'primary',
    });
    return;
  }
  const memberIds = (dept.members || []).map((m) => m.id);
  const refs =
    store.list('projects').filter((p) => memberIds.includes(p.owner)).length +
    store.list('partners').filter((p) => memberIds.includes(p.owner)).length;

  const ok = await confirmDialog({
    title: `删除部门「${dept.name}」`,
    message: refs
      ? `部门内成员被 ${refs} 条伙伴/项目记录引用为负责人，删除后这些记录的负责人会显示为空。`
      : `部门及其 ${memberIds.length} 名成员将被删除，此操作无法撤销。`,
    confirmText: '删除部门',
  });
  if (!ok) return;

  departments.splice(departments.indexOf(dept), 1);
  store.markDirty('org');
  toast('部门已删除', 'warn');
  done();
}

async function editMember(dept, member, done) {
  const isNew = !member;
  const result = await openForm({
    title: isNew ? `在「${dept.name}」新增成员` : `编辑成员：${member.name}`,
    fields: [
      { name: 'name', label: '姓名', required: true },
      { name: 'title', label: '职务', required: true },
      { name: 'email', label: '邮箱' },
      { name: 'phone', label: '电话' },
    ],
    values: member || {},
  });
  if (!result) return;

  if (!dept.members) dept.members = [];
  if (isNew) dept.members.push({ id: uid('m'), ...result });
  else Object.assign(member, result);

  store.markDirty('org');
  toast(isNew ? '成员已添加' : '成员信息已更新', 'ok');
  done();
}

async function removeMember(dept, member, done) {
  const refs =
    store.list('projects').filter((p) => p.owner === member.id).length +
    store.list('partners').filter((p) => p.owner === member.id).length +
    store.list('contracts').filter((c) => c.ourSignatory === member.id).length;

  const ok = await confirmDialog({
    title: `移除成员「${member.name}」`,
    message: refs ? `该成员被 ${refs} 条记录引用为负责人或签署人，移除后这些位置会显示为空。` : '移除后无法恢复。',
    confirmText: '移除',
  });
  if (!ok) return;

  dept.members.splice(dept.members.indexOf(member), 1);
  store.markDirty('org');
  toast('成员已移除', 'warn');
  done();
}

/** 后台 — 公司架构：部门树与成员 */
import { store } from '../store.js';
import { write } from './actions.js';
import { el } from '../util.js';
import { openForm, confirmDialog, panel, toolbar, statCards } from './ui.js';

export default function renderOrg(host) {
  const org = store.get('org') || { departments: [] };
  const departments = org.departments || [];

  host.append(
    statCards([
      { label: '部门数', value: String(departments.length) },
      { label: '成员总数', value: String(store.members().length) },
    ])
  );

  host.append(
    toolbar({
      filters: [],
      actions: [{ label: '+ 新增部门', onClick: () => editDept(null) }],
    })
  );

  host.append(panel('组织架构', buildTree(departments)));
}

/** 按 parentId 组装成树 */
function buildTree(departments) {
  const byParent = new Map();
  for (const d of departments) {
    const key = d.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(d);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order || 0) - (b.order || 0));

  const wrap = el('div', { class: 'org-tree' });
  if (!departments.length) {
    wrap.append(el('p', { class: 'detail__empty', text: '还没有部门，点右上角「新增部门」开始搭建架构。' }));
    return wrap;
  }

  const roots = byParent.get('__root__') || [];
  if (!roots.length) {
    // 数据里没有顶层部门时退化成平铺，避免整棵树看不见
    departments.forEach((d) => wrap.append(deptNode(d, byParent, 0)));
    return wrap;
  }
  roots.forEach((d) => wrap.append(deptNode(d, byParent, 0)));
  return wrap;
}

function deptNode(dept, byParent, depth) {
  const node = el('div', { class: `org-node org-node--d${Math.min(depth, 3)}` });

  node.append(
    el('header', { class: 'org-node__head' }, [
      el('div', { class: 'org-node__title' }, [
        el('strong', { text: dept.name }),
        el('span', { class: 'org-node__count', text: `${(dept.members || []).length} 人` }),
      ]),
      el('div', { class: 'org-node__ops' }, [
        el('button', { class: 'row-actions__btn', type: 'button', text: '加成员', onclick: () => editMember(dept, null) }),
        el('button', { class: 'row-actions__btn', type: 'button', text: '加子部门', onclick: () => editDept(null, dept.id) }),
        el('button', { class: 'row-actions__btn', type: 'button', text: '编辑', onclick: () => editDept(dept) }),
        el('button', { class: 'row-actions__btn is-danger', type: 'button', text: '删除', onclick: () => removeDept(dept) }),
      ]),
    ])
  );

  if (dept.desc) node.append(el('p', { class: 'org-node__desc', text: dept.desc }));

  const members = dept.members || [];
  if (members.length) {
    node.append(
      el('ul', { class: 'member-list' }, members.map((m) =>
        el('li', { class: 'member' }, [
          el('span', { class: 'avatar', text: m.name.slice(0, 1) }),
          el('div', { class: 'member__info' }, [
            el('strong', { text: m.name }),
            el('small', { text: m.title || '' }),
            el('small', { class: 'member__contact', text: [m.email, m.phone].filter(Boolean).join(' · ') }),
          ]),
          el('div', { class: 'member__ops' }, [
            el('button', { class: 'row-actions__btn', type: 'button', text: '编辑', onclick: () => editMember(dept, m) }),
            el('button', { class: 'row-actions__btn is-danger', type: 'button', text: '移除', onclick: () => removeMember(m) }),
          ]),
        ])
      ))
    );
  }

  const children = byParent.get(dept.id) || [];
  if (children.length) {
    node.append(
      el('div', { class: 'org-node__children' }, children.map((c) => deptNode(c, byParent, depth + 1)))
    );
  }
  return node;
}

async function editDept(dept, presetParent = null) {
  const departments = (store.get('org') || {}).departments || [];
  const isNew = !dept;
  const parentOptions = departments
    .filter((d) => !dept || d.id !== dept.id)
    .map((d) => ({ value: d.id, label: d.name }));

  const values = dept || { parentId: presetParent || '', order: departments.length + 1 };
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

  await write(
    () => store.save('departments', isNew ? result : { ...result, id: dept.id }),
    isNew ? '部门已创建' : '部门已更新'
  );
}

async function removeDept(dept) {
  const memberCount = (dept.members || []).length;
  const ok = await confirmDialog({
    title: `删除部门「${dept.name}」`,
    message: memberCount
      ? `部门内的 ${memberCount} 名成员会一并删除。他们在伙伴、项目、合同里担任的负责人或签署人会变为空。`
      : '删除后无法恢复，确定继续吗？',
    confirmText: '删除部门',
  });
  if (!ok) return;
  await write(() => store.remove('departments', dept.id), '部门已删除');
}

async function editMember(dept, member) {
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

  await write(
    () => store.save('members', isNew
      ? { ...result, departmentId: dept.id }
      : { ...result, id: member.id, departmentId: dept.id }),
    isNew ? '成员已添加' : '成员信息已更新'
  );
}

async function removeMember(member) {
  const refs =
    store.list('projects').filter((p) => p.owner === member.id).length +
    store.list('partners').filter((p) => p.owner === member.id).length +
    store.list('contracts').filter((c) => c.ourSignatory === member.id).length;

  const ok = await confirmDialog({
    title: `移除成员「${member.name}」`,
    message: refs
      ? `该成员被 ${refs} 条记录引用为负责人或签署人，移除后这些位置会变为空。`
      : '移除后无法恢复。',
    confirmText: '移除',
  });
  if (!ok) return;
  await write(() => store.remove('members', member.id), '成员已移除');
}

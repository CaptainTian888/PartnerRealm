/** 后台 — 项目管理（合作周期与里程碑） */
import { store } from '../store.js';
import { write } from './actions.js';
import { DICT, labelOf, toneOf } from '../config.js';
import { esc, el, uid, today, fmtDate, money, periodProgress, daysBetween } from '../util.js';
import { dataTable, toolbar, openForm, confirmDialog, tag, rowActions, panel, detailDialog } from './ui.js';

const filters = { q: '', status: '', partnerId: '' };

export default function renderProjects(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderProjects(host, ctx); };

  host.append(
    toolbar({
      filters: [
        { type: 'search', placeholder: '搜索项目名称、编号、描述', value: filters.q, onChange: (v) => { filters.q = v; refresh(); } },
        {
          options: Object.entries(DICT.projectStatus).map(([value, o]) => ({ value, label: o.label })),
          value: filters.status, allLabel: '全部状态', onChange: (v) => { filters.status = v; refresh(); },
        },
        {
          options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
          value: filters.partnerId, allLabel: '全部伙伴', onChange: (v) => { filters.partnerId = v; refresh(); },
        },
      ],
      actions: [{ label: '+ 新增项目', onClick: () => editProject(null, rerender) }],
    })
  );

  const slot = el('div', { class: 'panel-slot' });
  host.append(slot);

  function refresh() {
    slot.innerHTML = '';
    const rows = filtered();
    slot.append(
      panel(
        `项目列表（${rows.length}）`,
        dataTable({
          columns: [
            {
              key: 'name', label: '项目', width: '26%',
              render: (p) => `<div><span class="code">${esc(p.code || '')}</span><strong class="cell-title">${esc(p.name)}</strong><small>${esc(store.partnerName(p.partnerId))}</small></div>`,
            },
            { key: 'owner', label: '负责人', width: '9%', render: (p) => esc(store.memberName(p.owner)) },
            {
              key: 'period', label: '合作周期', width: '17%',
              render: (p) => {
                const cycle = periodProgress(p.startDate, p.endDate);
                const left = daysBetween(today(), p.endDate);
                const warn = left !== null && left <= 60 && left >= 0 && !['completed', 'terminated'].includes(p.status);
                return `
                  <div class="period">
                    <span>${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</span>
                    <div class="bar bar--thin"><i style="width:${cycle === null ? 0 : cycle}%"></i></div>
                    <small class="${warn ? 'is-warn' : ''}">${left === null ? '' : left < 0 ? `已超期 ${-left} 天` : `剩余 ${left} 天`}</small>
                  </div>`;
              },
            },
            {
              key: 'progress', label: '进度', width: '13%',
              render: (p) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, Number(p.progress) || 0))}%"></i></div><small>${Number(p.progress) || 0}%</small>`,
            },
            { key: 'budget', label: '项目规模', width: '11%', align: 'right', render: (p) => esc(money(p.budget, p.currency)) },
            {
              key: 'milestones', label: '里程碑', width: '8%', align: 'right',
              render: (p) => {
                const ms = p.milestones || [];
                const done = ms.filter((m) => m.status === 'done').length;
                return `${done}/${ms.length}`;
              },
            },
            { key: 'status', label: '状态', width: '8%', render: (p) => tag(labelOf(DICT.projectStatus, p.status), toneOf(DICT.projectStatus, p.status)) },
            {
              key: 'actions', label: '操作', width: '10%', align: 'right',
              render: (p) => rowActions([
                { label: '编辑', onClick: () => editProject(p, rerender) },
                { label: '删除', danger: true, onClick: () => removeProject(p, rerender) },
              ]),
            },
          ],
          rows,
          empty: '没有匹配的项目',
          onRowClick: showDetail,
        })
      )
    );
  }

  refresh();
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  return store
    .list('projects')
    .filter((p) => {
      if (filters.status && p.status !== filters.status) return false;
      if (filters.partnerId && p.partnerId !== filters.partnerId) return false;
      if (!q) return true;
      return [p.name, p.code, p.desc, (p.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

function fields() {
  return [
    { name: 'name', label: '项目名称', required: true, cols: 2 },
    { name: 'code', label: '项目编号', required: true, placeholder: '如 WL-2026-001' },
    {
      name: 'partnerId', label: '合作伙伴', type: 'select', required: true,
      options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
    },
    {
      name: 'owner', label: '内部负责人', type: 'select',
      options: store.members().map((m) => ({ value: m.id, label: `${m.name}（${m.deptName}）` })),
    },
    {
      name: 'status', label: '项目状态', type: 'select', required: true,
      options: Object.entries(DICT.projectStatus).map(([value, o]) => ({ value, label: o.label })),
    },
    { name: 'startDate', label: '开始日期', type: 'date', required: true },
    { name: 'endDate', label: '结束日期', type: 'date', required: true },
    { name: 'progress', label: '完成进度 %', type: 'number', min: 0, max: 100, step: 1 },
    { name: 'budget', label: '项目规模（元）', type: 'number', min: 0, step: 1000 },
    { name: 'currency', label: '币种', type: 'select', options: ['CNY', 'USD', 'EUR', 'HKD'], required: true },
    { name: 'desc', label: '项目说明', type: 'textarea', cols: 2, rows: 3 },
    { name: 'tags', label: '标签', type: 'tags', cols: 2 },
    {
      name: 'milestones', label: '里程碑', type: 'rows', rowLabel: '里程碑',
      columns: [
        { name: 'title', label: '名称' },
        { name: 'date', label: '计划日期', type: 'date' },
        { name: 'status', label: '状态', type: 'select', options: Object.entries(DICT.milestoneStatus).map(([value, o]) => ({ value, label: o.label })), keep: true },
        { name: 'note', label: '备注' },
      ],
      hint: '里程碑按计划日期排序展示，删除留空行即可',
    },
  ];
}

async function editProject(project, done) {
  const isNew = !project;
  const values = project || {
    status: 'planning', currency: 'CNY', progress: 0, startDate: today(),
    tags: [], milestones: [],
  };
  const result = await openForm({
    title: isNew ? '新增项目' : `编辑：${values.name}`,
    fields: fields(),
    values,
    size: 'lg',
  });
  if (!result) return;

  result.milestones = (result.milestones || []).map((m) => ({ id: m.id || uid('ms'), ...m }));
  result.progress = Math.max(0, Math.min(100, Number(result.progress) || 0));

  await write(
    () => store.save('projects', isNew ? result : { ...result, id: project.id }),
    isNew ? '项目已创建' : '项目已更新'
  );
}

async function removeProject(project, done) {
  const contracts = store.list('contracts').filter((c) => c.projectId === project.id);
  const txs = store.list('finance').filter((t) => t.projectId === project.id);
  const ok = await confirmDialog({
    title: `删除项目「${project.name}」`,
    message: contracts.length || txs.length
      ? `该项目关联着 ${contracts.length} 份合同、${txs.length} 笔资金记录。删除项目后这些记录会保留，但不再归属任何项目。`
      : '删除后无法恢复，确定继续吗？',
    confirmText: '删除项目',
  });
  if (!ok) return;
  await write(() => store.remove('projects', project.id), '项目已删除');
}

function showDetail(project) {
  const contracts = store.list('contracts').filter((c) => c.projectId === project.id);
  const txs = store.list('finance').filter((t) => t.projectId === project.id);
  const sum = store.summarize(txs);
  const cycle = periodProgress(project.startDate, project.endDate);
  const milestones = (project.milestones || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  detailDialog({
    title: project.name,
    subtitle: `${project.code} · ${store.partnerName(project.partnerId)} · ${labelOf(DICT.projectStatus, project.status)}`,
    html: `
      <div class="detail">
        <p class="detail__intro">${esc(project.desc || '暂无说明')}</p>
        <dl class="detail__grid">
          <div><dt>合作周期</dt><dd>${fmtDate(project.startDate)} → ${fmtDate(project.endDate)}</dd></div>
          <div><dt>周期已过</dt><dd>${cycle === null ? '—' : cycle + '%'}</dd></div>
          <div><dt>完成进度</dt><dd>${Number(project.progress) || 0}%</dd></div>
          <div><dt>项目规模</dt><dd>${esc(money(project.budget, project.currency))}</dd></div>
          <div><dt>负责人</dt><dd>${esc(store.memberName(project.owner))}</dd></div>
          <div><dt>已结净额</dt><dd>${esc(money(sum.net))}</dd></div>
        </dl>

        <h4>里程碑</h4>
        ${milestones.length
          ? `<ol class="timeline">${milestones.map((m) => `
              <li class="timeline__item timeline__item--${esc(m.status || 'todo')}">
                <span class="timeline__date">${fmtDate(m.date)}</span>
                <div><strong>${esc(m.title)}</strong> ${tag(labelOf(DICT.milestoneStatus, m.status), toneOf(DICT.milestoneStatus, m.status))}
                ${m.note ? `<p>${esc(m.note)}</p>` : ''}</div>
              </li>`).join('')}</ol>`
          : '<p class="detail__empty">未设置里程碑</p>'}

        <h4>关联合同（${contracts.length}）</h4>
        ${contracts.length
          ? `<ul class="detail__list">${contracts.map((c) => `<li><strong>${esc(c.no)}</strong> ${esc(c.name)}<span>${esc(money(c.amount, c.currency))} · ${esc(labelOf(DICT.contractStatus, c.status))}</span></li>`).join('')}</ul>`
          : '<p class="detail__empty">暂无合同</p>'}

        <h4>资金记录（${txs.length}）</h4>
        ${txs.length
          ? `<ul class="detail__list">${txs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((t) => `<li><strong>${fmtDate(t.date)}</strong> ${esc(t.category)} ${tag(labelOf(DICT.txDirection, t.direction), toneOf(DICT.txDirection, t.direction))}<span>${esc(money(t.amount, t.currency))} · ${esc(labelOf(DICT.txStatus, t.status))}</span></li>`).join('')}</ul>`
          : '<p class="detail__empty">暂无资金记录</p>'}
      </div>`,
  });
}

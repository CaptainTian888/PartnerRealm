/** 后台 — 合作伙伴 */
import { store } from '../store.js';
import { DICT, labelOf, toneOf } from '../config.js';
import { esc, el, uid, today, fmtDate, money, toast } from '../util.js';
import { dataTable, toolbar, openForm, confirmDialog, tag, rowActions, panel, detailDialog } from './ui.js';

const filters = { q: '', type: '', tier: '', status: '' };

export default function renderPartners(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderPartners(host, ctx); };

  host.append(
    toolbar({
      filters: [
        { type: 'search', placeholder: '搜索名称、行业、地区、标签', value: filters.q, onChange: (v) => { filters.q = v; refreshTable(); } },
        { options: DICT.partnerType, value: filters.type, allLabel: '全部类型', onChange: (v) => { filters.type = v; refreshTable(); } },
        { options: DICT.partnerTier, value: filters.tier, allLabel: '全部级别', onChange: (v) => { filters.tier = v; refreshTable(); } },
        {
          options: Object.entries(DICT.partnerStatus).map(([value, o]) => ({ value, label: o.label })),
          value: filters.status, allLabel: '全部状态',
          onChange: (v) => { filters.status = v; refreshTable(); },
        },
      ],
      actions: [{ label: '+ 新增伙伴', onClick: () => editPartner(null, rerender) }],
    })
  );

  const tableHost = el('div', { class: 'panel-slot' });
  host.append(tableHost);

  function refreshTable() {
    tableHost.innerHTML = '';
    const rows = filtered();
    tableHost.append(
      panel(
        `伙伴列表（${rows.length}）`,
        dataTable({
          columns: [
            {
              key: 'name', label: '伙伴', width: '24%',
              render: (p) => `
                <div class="cell-main">
                  <span class="avatar" aria-hidden="true">${esc((p.shortName || p.name).slice(0, 2))}</span>
                  <div>
                    <strong>${esc(p.shortName || p.name)}</strong>
                    <small>${esc(p.name)}</small>
                  </div>
                </div>`,
            },
            { key: 'type', label: '类型', width: '8%' },
            { key: 'tier', label: '级别', width: '8%', render: (p) => tag(p.tier, p.tier === '核心' ? 'ok' : p.tier === '重点' ? 'info' : 'muted') },
            { key: 'industry', label: '行业 / 地区', width: '15%', render: (p) => `${esc(p.industry || '—')}<br><small>${esc(p.region || '')}</small>` },
            { key: 'owner', label: '对接人', width: '9%', render: (p) => esc(store.memberName(p.owner)) },
            { key: 'projects', label: '项目', width: '7%', align: 'right', render: (p) => String(store.list('projects').filter((x) => x.partnerId === p.id).length) },
            {
              key: 'balance', label: '净往来', width: '11%', align: 'right',
              render: (p) => {
                const sum = store.summarize(store.financeOfPartner(p.id));
                const cls = sum.net >= 0 ? 'num num--ok' : 'num num--warn';
                return `<span class="${cls}">${esc(money(sum.net))}</span>`;
              },
            },
            { key: 'status', label: '状态', width: '8%', render: (p) => tag(labelOf(DICT.partnerStatus, p.status), toneOf(DICT.partnerStatus, p.status)) },
            {
              key: 'actions', label: '操作', width: '10%', align: 'right',
              render: (p) => rowActions([
                { label: '编辑', onClick: () => editPartner(p, rerender) },
                { label: '删除', danger: true, onClick: () => removePartner(p, rerender) },
              ]),
            },
          ],
          rows,
          empty: '没有匹配的伙伴',
          onRowClick: (p) => showDetail(p),
        })
      )
    );
  }

  refreshTable();
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  return store.list('partners').filter((p) => {
    if (filters.type && p.type !== filters.type) return false;
    if (filters.tier && p.tier !== filters.tier) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (!q) return true;
    const hay = [p.name, p.shortName, p.industry, p.region, p.intro, (p.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function fields() {
  return [
    { name: 'name', label: '公司全称', required: true, cols: 2, placeholder: '营业执照上的名称' },
    { name: 'shortName', label: '简称', required: true },
    { name: 'type', label: '合作类型', type: 'select', options: DICT.partnerType, required: true },
    { name: 'tier', label: '级别', type: 'select', options: DICT.partnerTier, required: true },
    {
      name: 'status', label: '合作状态', type: 'select', required: true,
      options: Object.entries(DICT.partnerStatus).map(([value, o]) => ({ value, label: o.label })),
    },
    { name: 'industry', label: '所属行业' },
    { name: 'region', label: '所在地区', placeholder: '如 华东 · 上海' },
    { name: 'since', label: '合作起始日', type: 'date' },
    {
      name: 'owner', label: '内部对接人', type: 'select',
      options: store.members().map((m) => ({ value: m.id, label: `${m.name}（${m.deptName}）` })),
    },
    { name: 'website', label: '官网', placeholder: 'https://' },
    { name: 'intro', label: '合作简介', type: 'textarea', cols: 2, rows: 3 },
    { name: 'tags', label: '标签', type: 'tags', cols: 2, hint: '用逗号分隔，会显示在门户卡片上' },
    {
      name: 'contacts', label: '联系人', type: 'rows', rowLabel: '联系人',
      columns: [
        { name: 'name', label: '姓名' },
        { name: 'title', label: '职务' },
        { name: 'phone', label: '电话' },
        { name: 'email', label: '邮箱' },
      ],
    },
    { name: 'visibleOnPortal', label: '在门户首页展示这个伙伴', type: 'checkbox' },
  ];
}

async function editPartner(partner, done) {
  const isNew = !partner;
  const values = partner || {
    type: '战略', tier: '一般', status: 'active', since: today(),
    visibleOnPortal: true, tags: [], contacts: [],
  };
  const result = await openForm({
    title: isNew ? '新增合作伙伴' : `编辑：${values.shortName || values.name}`,
    fields: fields(),
    values,
    size: 'lg',
  });
  if (!result) return;

  if (isNew) {
    store.list('partners').push({ id: uid('p'), ...result });
  } else {
    Object.assign(partner, result);
  }
  store.markDirty('partners');
  toast(isNew ? '伙伴已添加' : '伙伴信息已更新', 'ok');
  done();
}

async function removePartner(partner, done) {
  const projects = store.list('projects').filter((p) => p.partnerId === partner.id);
  const contracts = store.list('contracts').filter((c) => c.partnerId === partner.id);
  const txs = store.financeOfPartner(partner.id);
  const linked = projects.length + contracts.length + txs.length;

  const ok = await confirmDialog({
    title: `删除「${partner.shortName || partner.name}」`,
    message: linked
      ? `该伙伴还关联着 ${projects.length} 个项目、${contracts.length} 份合同、${txs.length} 笔资金记录。删除后这些记录会失去伙伴归属，建议改为把状态设为「已终止」。`
      : '删除后无法恢复，确定继续吗？',
    confirmText: '仍然删除',
  });
  if (!ok) return;

  const list = store.list('partners');
  list.splice(list.indexOf(partner), 1);
  store.markDirty('partners');
  toast('伙伴已删除', 'warn');
  done();
}

function showDetail(partner) {
  const projects = store.list('projects').filter((p) => p.partnerId === partner.id);
  const contracts = store.list('contracts').filter((c) => c.partnerId === partner.id);
  const sum = store.summarize(store.financeOfPartner(partner.id));

  const html = `
    <div class="detail">
      <p class="detail__intro">${esc(partner.intro || '暂无简介')}</p>
      <dl class="detail__grid">
        <div><dt>公司全称</dt><dd>${esc(partner.name)}</dd></div>
        <div><dt>行业 / 地区</dt><dd>${esc(partner.industry || '—')} · ${esc(partner.region || '—')}</dd></div>
        <div><dt>合作起始</dt><dd>${fmtDate(partner.since)}</dd></div>
        <div><dt>内部对接人</dt><dd>${esc(store.memberName(partner.owner))}</dd></div>
        <div><dt>官网</dt><dd>${partner.website ? `<a href="${esc(partner.website)}" target="_blank" rel="noopener">${esc(partner.website)}</a>` : '—'}</dd></div>
        <div><dt>门户展示</dt><dd>${partner.visibleOnPortal === false ? '否' : '是'}</dd></div>
      </dl>

      <h4>联系人</h4>
      ${(partner.contacts || []).length
        ? `<ul class="detail__list">${partner.contacts.map((c) => `<li><strong>${esc(c.name)}</strong> ${esc(c.title || '')}<span>${esc(c.phone || '')} ${esc(c.email || '')}</span></li>`).join('')}</ul>`
        : '<p class="detail__empty">未登记联系人</p>'}

      <h4>资金往来</h4>
      <dl class="detail__grid">
        <div><dt>累计收入</dt><dd>${esc(money(sum.in))}</dd></div>
        <div><dt>累计支出</dt><dd>${esc(money(sum.out))}</dd></div>
        <div><dt>已结净额</dt><dd>${esc(money(sum.net))}</dd></div>
        <div><dt>逾期金额</dt><dd>${esc(money(sum.overdue))}</dd></div>
      </dl>

      <h4>关联项目（${projects.length}）</h4>
      ${projects.length
        ? `<ul class="detail__list">${projects.map((p) => `<li><strong>${esc(p.name)}</strong> ${tag(labelOf(DICT.projectStatus, p.status), toneOf(DICT.projectStatus, p.status))}<span>${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</span></li>`).join('')}</ul>`
        : '<p class="detail__empty">暂无项目</p>'}

      <h4>关联合同（${contracts.length}）</h4>
      ${contracts.length
        ? `<ul class="detail__list">${contracts.map((c) => `<li><strong>${esc(c.no)}</strong> ${esc(c.name)}<span>${esc(money(c.amount, c.currency))} · ${esc(labelOf(DICT.contractStatus, c.status))}</span></li>`).join('')}</ul>`
        : '<p class="detail__empty">暂无合同</p>'}
    </div>`;

  detailDialog({
    title: partner.shortName || partner.name,
    subtitle: `${partner.type} · ${partner.tier} · ${labelOf(DICT.partnerStatus, partner.status)}`,
    html,
  });
}

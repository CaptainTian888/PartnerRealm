/** 后台 — 签约管理 */
import { store } from '../store.js';
import { write } from './actions.js';
import { DICT, labelOf, toneOf } from '../config.js';
import { esc, el, today, fmtDate, moneyExact, money, daysBetween } from '../util.js';
import { dataTable, toolbar, openForm, confirmDialog, tag, rowActions, panel, detailDialog, statCards } from './ui.js';

const filters = { q: '', status: '', partnerId: '', type: '' };

export default function renderContracts(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderContracts(host, ctx); };
  const all = store.list('contracts');

  const active = all.filter((c) => ['signed', 'executing'].includes(c.status));
  const expiring = active.filter((c) => {
    const left = daysBetween(today(), c.expiryDate);
    return left !== null && left >= 0 && left <= 90;
  });
  const totalAmount = all
    .filter((c) => !['draft', 'terminated'].includes(c.status))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);

  host.append(
    statCards([
      { label: '合同总数', value: String(all.length) },
      { label: '执行中', value: String(active.length), tone: 'ok' },
      { label: '90 天内到期', value: String(expiring.length), tone: expiring.length ? 'warn' : '' },
      { label: '累计签约额', value: money(totalAmount), hint: '不含草拟与已解除' },
    ])
  );

  host.append(
    toolbar({
      filters: [
        { type: 'search', placeholder: '搜索合同编号、名称', value: filters.q, onChange: (v) => { filters.q = v; refresh(); } },
        {
          options: Object.entries(DICT.contractStatus).map(([value, o]) => ({ value, label: o.label })),
          value: filters.status, allLabel: '全部状态', onChange: (v) => { filters.status = v; refresh(); },
        },
        { options: DICT.contractType, value: filters.type, allLabel: '全部类型', onChange: (v) => { filters.type = v; refresh(); } },
        {
          options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
          value: filters.partnerId, allLabel: '全部伙伴', onChange: (v) => { filters.partnerId = v; refresh(); },
        },
      ],
      actions: [{ label: '+ 新增合同', onClick: () => editContract(null, rerender) }],
    })
  );

  const slot = el('div', { class: 'panel-slot' });
  host.append(slot);

  function refresh() {
    slot.innerHTML = '';
    const rows = filtered();
    slot.append(
      panel(
        `合同列表（${rows.length}）`,
        dataTable({
          columns: [
            {
              key: 'no', label: '合同', width: '28%',
              render: (c) => `<div><span class="code">${esc(c.no)}</span><strong class="cell-title">${esc(c.name)}</strong><small>${esc(store.partnerName(c.partnerId))}</small></div>`,
            },
            { key: 'type', label: '类型', width: '10%' },
            { key: 'projectId', label: '关联项目', width: '14%', render: (c) => esc(c.projectId ? store.projectName(c.projectId) : '—') },
            { key: 'amount', label: '合同金额', width: '11%', align: 'right', render: (c) => esc(moneyExact(c.amount, c.currency)) },
            { key: 'signDate', label: '签署日', width: '9%', render: (c) => fmtDate(c.signDate) },
            {
              key: 'expiryDate', label: '到期日', width: '11%',
              render: (c) => {
                const left = daysBetween(today(), c.expiryDate);
                const alive = ['signed', 'executing'].includes(c.status);
                if (!c.expiryDate) return '—';
                let note = '';
                if (alive && left !== null) {
                  if (left < 0) note = `<small class="is-bad">已到期 ${-left} 天</small>`;
                  else if (left <= 90) note = `<small class="is-warn">${left} 天后到期</small>`;
                }
                return `${fmtDate(c.expiryDate)}${note}`;
              },
            },
            { key: 'status', label: '状态', width: '8%', render: (c) => tag(labelOf(DICT.contractStatus, c.status), toneOf(DICT.contractStatus, c.status)) },
            {
              key: 'actions', label: '操作', width: '9%', align: 'right',
              render: (c) => rowActions([
                { label: '编辑', onClick: () => editContract(c, rerender) },
                { label: '删除', danger: true, onClick: () => removeContract(c, rerender) },
              ]),
            },
          ],
          rows,
          empty: '没有匹配的合同',
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
    .list('contracts')
    .filter((c) => {
      if (filters.status && c.status !== filters.status) return false;
      if (filters.type && c.type !== filters.type) return false;
      if (filters.partnerId && c.partnerId !== filters.partnerId) return false;
      if (!q) return true;
      return [c.no, c.name, c.note].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.signDate || '9999').localeCompare(a.signDate || '9999'));
}

function fields() {
  return [
    { name: 'no', label: '合同编号', required: true },
    { name: 'type', label: '合同类型', type: 'select', options: DICT.contractType, required: true },
    { name: 'name', label: '合同名称', required: true, cols: 2 },
    {
      name: 'partnerId', label: '签约伙伴', type: 'select', required: true,
      options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
    },
    {
      name: 'projectId', label: '关联项目', type: 'select',
      options: store.list('projects').map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
      emptyText: '（不关联项目）',
    },
    {
      name: 'status', label: '合同状态', type: 'select', required: true,
      options: Object.entries(DICT.contractStatus).map(([value, o]) => ({ value, label: o.label })),
    },
    { name: 'amount', label: '合同金额', type: 'number', min: 0, step: 1000, required: true },
    { name: 'currency', label: '币种', type: 'select', options: ['CNY', 'USD', 'EUR', 'HKD'], required: true },
    { name: 'signDate', label: '签署日期', type: 'date' },
    { name: 'effectiveDate', label: '生效日期', type: 'date' },
    { name: 'expiryDate', label: '到期日期', type: 'date' },
    {
      name: 'ourSignatory', label: '我方签署人', type: 'select',
      options: store.members().map((m) => ({ value: m.id, label: `${m.name}（${m.title}）` })),
    },
    { name: 'partnerSignatory', label: '对方签署人' },
    { name: 'paymentTerms', label: '付款条款', cols: 2, placeholder: '如：3:4:3 分期，按里程碑验收付款' },
    { name: 'note', label: '备注', type: 'textarea', cols: 2, rows: 3 },
  ];
}

async function editContract(contract, done) {
  const isNew = !contract;
  const values = contract || { type: '项目合同', status: 'draft', currency: 'CNY', amount: 0, signDate: today() };
  const result = await openForm({
    title: isNew ? '新增合同' : `编辑：${values.no}`,
    fields: fields(),
    values,
    size: 'lg',
  });
  if (!result) return;

  await write(
    () => store.save('contracts', isNew ? result : { ...result, id: contract.id }),
    isNew ? '合同已添加' : '合同已更新'
  );
}

async function removeContract(contract, done) {
  const txs = store.list('finance').filter((t) => t.contractId === contract.id);
  const ok = await confirmDialog({
    title: `删除合同「${contract.no}」`,
    message: txs.length
      ? `该合同关联着 ${txs.length} 笔资金记录。删除合同后这些记录会保留，但不再归属任何合同。`
      : '删除后无法恢复，确定继续吗？',
    confirmText: '删除合同',
  });
  if (!ok) return;
  await write(() => store.remove('contracts', contract.id), '合同已删除');
}

function showDetail(contract) {
  const txs = store.list('finance').filter((t) => t.contractId === contract.id);
  const sum = store.summarize(txs);
  const settled = txs.filter((t) => t.status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const rate = Number(contract.amount) ? Math.round((settled / Number(contract.amount)) * 100) : null;

  detailDialog({
    title: contract.name,
    subtitle: `${contract.no} · ${contract.type} · ${labelOf(DICT.contractStatus, contract.status)}`,
    html: `
      <div class="detail">
        <dl class="detail__grid">
          <div><dt>签约伙伴</dt><dd>${esc(store.partnerName(contract.partnerId))}</dd></div>
          <div><dt>关联项目</dt><dd>${esc(contract.projectId ? store.projectName(contract.projectId) : '—')}</dd></div>
          <div><dt>合同金额</dt><dd>${esc(moneyExact(contract.amount, contract.currency))}</dd></div>
          <div><dt>结算进度</dt><dd>${rate === null ? '—' : rate + '%'}</dd></div>
          <div><dt>签署 / 生效</dt><dd>${fmtDate(contract.signDate)} / ${fmtDate(contract.effectiveDate)}</dd></div>
          <div><dt>到期</dt><dd>${fmtDate(contract.expiryDate)}</dd></div>
          <div><dt>我方签署人</dt><dd>${esc(store.memberName(contract.ourSignatory))}</dd></div>
          <div><dt>对方签署人</dt><dd>${esc(contract.partnerSignatory || '—')}</dd></div>
        </dl>

        <h4>付款条款</h4>
        <p class="detail__intro">${esc(contract.paymentTerms || '未填写')}</p>

        ${contract.note ? `<h4>备注</h4><p class="detail__intro">${esc(contract.note)}</p>` : ''}

        <h4>资金记录（${txs.length}）</h4>
        ${txs.length
          ? `<ul class="detail__list">${txs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((t) => `<li><strong>${fmtDate(t.date)}</strong> ${esc(t.category)} ${tag(labelOf(DICT.txStatus, t.status), toneOf(DICT.txStatus, t.status))}<span>${esc(moneyExact(t.amount, t.currency))}</span></li>`).join('')}
             </ul><p class="detail__foot">已结净额 ${esc(money(sum.net))} · 未结 ${esc(money(sum.receivable + sum.payable))}</p>`
          : '<p class="detail__empty">暂无资金记录</p>'}
      </div>`,
  });
}

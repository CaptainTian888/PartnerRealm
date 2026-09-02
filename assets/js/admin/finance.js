/** 后台 — 资金往来 */
import { store } from '../store.js';
import { DICT, labelOf, toneOf } from '../config.js';
import { esc, el, uid, today, fmtDate, money, moneyExact, toast } from '../util.js';
import { dataTable, toolbar, openForm, confirmDialog, tag, rowActions, panel, statCards } from './ui.js';

const filters = { q: '', direction: '', status: '', partnerId: '', year: '' };

export default function renderFinance(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderFinance(host, ctx); };
  const rows = filtered();
  const sum = store.summarize(rows);

  host.append(
    statCards([
      { label: '收入合计', value: money(sum.in), hint: `已到账 ${money(sum.paidIn)}`, tone: 'ok' },
      { label: '支出合计', value: money(sum.out), hint: `已付出 ${money(sum.paidOut)}`, tone: 'warn' },
      { label: '已结净额', value: money(sum.net), tone: sum.net >= 0 ? 'ok' : 'bad' },
      { label: '待收 / 待付', value: `${money(sum.receivable)} / ${money(sum.payable)}` },
      { label: '逾期金额', value: money(sum.overdue), tone: sum.overdue ? 'bad' : '' },
    ])
  );

  const years = Array.from(new Set(store.list('finance').map((t) => (t.date || '').slice(0, 4)).filter(Boolean))).sort().reverse();

  host.append(
    toolbar({
      filters: [
        { type: 'search', placeholder: '搜索备注、发票号、类别', value: filters.q, onChange: (v) => { filters.q = v; rerender(); } },
        {
          options: Object.entries(DICT.txDirection).map(([value, o]) => ({ value, label: o.label })),
          value: filters.direction, allLabel: '收支不限', onChange: (v) => { filters.direction = v; rerender(); },
        },
        {
          options: Object.entries(DICT.txStatus).map(([value, o]) => ({ value, label: o.label })),
          value: filters.status, allLabel: '全部状态', onChange: (v) => { filters.status = v; rerender(); },
        },
        {
          options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
          value: filters.partnerId, allLabel: '全部伙伴', onChange: (v) => { filters.partnerId = v; rerender(); },
        },
        { options: years, value: filters.year, allLabel: '全部年份', onChange: (v) => { filters.year = v; rerender(); } },
      ],
      actions: [
        { label: '导出 CSV', variant: 'ghost', onClick: () => exportCsv(rows) },
        { label: '+ 登记流水', onClick: () => editTx(null, rerender) },
      ],
    })
  );

  host.append(
    panel(
      `资金流水（${rows.length}）`,
      dataTable({
        columns: [
          { key: 'date', label: '日期', width: '10%', render: (t) => fmtDate(t.date) },
          { key: 'direction', label: '收支', width: '7%', render: (t) => tag(labelOf(DICT.txDirection, t.direction), toneOf(DICT.txDirection, t.direction)) },
          { key: 'category', label: '类别', width: '9%' },
          { key: 'partnerId', label: '伙伴', width: '14%', render: (t) => esc(store.partnerName(t.partnerId)) },
          { key: 'projectId', label: '项目 / 合同', width: '20%', render: (t) => `${esc(t.projectId ? store.projectName(t.projectId) : '—')}<br><small>${esc(t.contractId ? (store.contract(t.contractId) || {}).no || '—' : '—')}</small>` },
          {
            key: 'amount', label: '金额', width: '12%', align: 'right',
            render: (t) => `<span class="num num--${t.direction === 'in' ? 'ok' : 'warn'}">${t.direction === 'in' ? '+' : '−'}${esc(moneyExact(t.amount, t.currency))}</span>`,
          },
          { key: 'status', label: '状态', width: '9%', render: (t) => tag(labelOf(DICT.txStatus, t.status), toneOf(DICT.txStatus, t.status)) },
          { key: 'note', label: '备注', width: '11%', render: (t) => `<small>${esc(t.note || '—')}</small>` },
          {
            key: 'actions', label: '操作', width: '8%', align: 'right',
            render: (t) => rowActions([
              { label: '编辑', onClick: () => editTx(t, rerender) },
              { label: '删除', danger: true, onClick: () => removeTx(t, rerender) },
            ]),
          },
        ],
        rows,
        empty: '没有匹配的资金记录',
      })
    )
  );
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  return store
    .list('finance')
    .filter((t) => {
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.partnerId && t.partnerId !== filters.partnerId) return false;
      if (filters.year && !(t.date || '').startsWith(filters.year)) return false;
      if (!q) return true;
      return [t.note, t.invoiceNo, t.category, t.method].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function fields() {
  return [
    { name: 'date', label: '日期', type: 'date', required: true },
    {
      name: 'direction', label: '收支方向', type: 'select', required: true,
      options: Object.entries(DICT.txDirection).map(([value, o]) => ({ value, label: o.label })),
    },
    { name: 'category', label: '款项类别', type: 'select', options: DICT.txCategory, required: true },
    {
      name: 'status', label: '结算状态', type: 'select', required: true,
      options: Object.entries(DICT.txStatus).map(([value, o]) => ({ value, label: o.label })),
    },
    {
      name: 'partnerId', label: '合作伙伴', type: 'select', required: true,
      options: store.list('partners').map((p) => ({ value: p.id, label: p.shortName || p.name })),
    },
    {
      name: 'projectId', label: '关联项目', type: 'select', emptyText: '（不关联）',
      options: store.list('projects').map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    },
    {
      name: 'contractId', label: '关联合同', type: 'select', emptyText: '（不关联）',
      options: store.list('contracts').map((c) => ({ value: c.id, label: `${c.no} ${c.name}` })),
    },
    { name: 'amount', label: '金额', type: 'number', min: 0, step: 100, required: true },
    { name: 'currency', label: '币种', type: 'select', options: ['CNY', 'USD', 'EUR', 'HKD'], required: true },
    { name: 'method', label: '结算方式', placeholder: '银行转账 / 承兑 / 抵扣' },
    { name: 'invoiceNo', label: '发票号' },
    { name: 'note', label: '备注', type: 'textarea', cols: 2, rows: 2 },
  ];
}

async function editTx(tx, done) {
  const isNew = !tx;
  const values = tx || { date: today(), direction: 'in', category: '合同款', status: 'planned', currency: 'CNY', amount: 0 };
  const result = await openForm({
    title: isNew ? '登记资金流水' : '编辑资金流水',
    fields: fields(),
    values,
    size: 'lg',
  });
  if (!result) return;

  if (isNew) store.list('finance').push({ id: uid('f'), ...result });
  else Object.assign(tx, result);

  store.markDirty('finance');
  toast(isNew ? '流水已登记' : '流水已更新', 'ok');
  done();
}

async function removeTx(tx, done) {
  const ok = await confirmDialog({
    title: '删除这笔资金记录',
    message: `${fmtDate(tx.date)} · ${tx.category} · ${moneyExact(tx.amount, tx.currency)}。删除后无法恢复。`,
    confirmText: '删除',
  });
  if (!ok) return;
  const list = store.list('finance');
  list.splice(list.indexOf(tx), 1);
  store.markDirty('finance');
  toast('记录已删除', 'warn');
  done();
}

function exportCsv(rows) {
  const header = ['日期', '收支', '类别', '伙伴', '项目', '合同', '金额', '币种', '状态', '结算方式', '发票号', '备注'];
  const lines = rows.map((t) => [
    t.date,
    labelOf(DICT.txDirection, t.direction),
    t.category,
    store.partnerName(t.partnerId),
    t.projectId ? store.projectName(t.projectId) : '',
    t.contractId ? (store.contract(t.contractId) || {}).no || '' : '',
    Number(t.amount) || 0,
    t.currency,
    labelOf(DICT.txStatus, t.status),
    t.method || '',
    t.invoiceNo || '',
    t.note || '',
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `稳链同创-资金流水-${today()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`已导出 ${rows.length} 条记录`, 'ok');
}

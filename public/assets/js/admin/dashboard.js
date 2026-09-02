/** 后台 — 总览看板 */
import { store } from '../store.js';
import { DICT, labelOf, toneOf } from '../config.js';
import { esc, el, today, fmtDate, money, daysBetween, periodProgress } from '../util.js';
import { statCards, panel, dataTable, tag } from './ui.js';

export default function renderDashboard(host) {
  const partners = store.list('partners');
  const projects = store.list('projects');
  const contracts = store.list('contracts');
  const txs = store.list('finance');
  const sum = store.summarize(txs);

  const activePartners = partners.filter((p) => p.status === 'active');
  const runningProjects = projects.filter((p) => ['planning', 'ongoing', 'delivering'].includes(p.status));
  const signedAmount = contracts
    .filter((c) => !['draft', 'terminated'].includes(c.status))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);

  host.append(
    statCards([
      { label: '合作中伙伴', value: String(activePartners.length), hint: `共 ${partners.length} 家`, tone: 'ok' },
      { label: '在管项目', value: String(runningProjects.length), hint: `共 ${projects.length} 个` },
      { label: '累计签约额', value: money(signedAmount), hint: `${contracts.length} 份合同` },
      { label: '已结净额', value: money(sum.net), tone: sum.net >= 0 ? 'ok' : 'bad' },
      { label: '待收款', value: money(sum.receivable), tone: sum.receivable ? 'info' : '' },
      { label: '逾期金额', value: money(sum.overdue), tone: sum.overdue ? 'bad' : '' },
    ])
  );

  host.append(el('div', { class: 'grid-2' }, [buildAlerts(), buildDistribution(partners, projects)]));
  host.append(buildProjectTable(runningProjects));
  host.append(el('div', { class: 'grid-2' }, [buildUpcoming(), buildRecentFinance(txs)]));
}

/** 需要关注：逾期款、临期合同、超期项目 */
function buildAlerts() {
  const now = today();
  const items = [];

  for (const t of store.list('finance')) {
    if (t.status !== 'overdue') continue;
    items.push({
      tone: 'bad',
      title: `${store.partnerName(t.partnerId)} · ${t.category}逾期`,
      meta: `${fmtDate(t.date)} · ${money(t.amount, t.currency)}`,
    });
  }

  for (const c of store.list('contracts')) {
    if (!['signed', 'executing'].includes(c.status)) continue;
    const left = daysBetween(now, c.expiryDate);
    if (left === null) continue;
    if (left < 0) items.push({ tone: 'bad', title: `合同 ${c.no} 已到期`, meta: `${esc(c.name)} · 到期 ${fmtDate(c.expiryDate)}` });
    else if (left <= 90) items.push({ tone: 'warn', title: `合同 ${c.no} 将在 ${left} 天后到期`, meta: esc(c.name) });
  }

  for (const p of store.list('projects')) {
    if (!['planning', 'ongoing', 'delivering'].includes(p.status)) continue;
    const left = daysBetween(now, p.endDate);
    const cycle = periodProgress(p.startDate, p.endDate);
    if (left !== null && left < 0) {
      items.push({ tone: 'bad', title: `项目「${p.name}」已超期 ${-left} 天`, meta: `进度 ${p.progress || 0}%` });
    } else if (cycle !== null && cycle - (Number(p.progress) || 0) >= 25) {
      items.push({ tone: 'warn', title: `项目「${p.name}」进度落后`, meta: `周期已过 ${cycle}%，实际进度 ${p.progress || 0}%` });
    }
  }

  for (const p of store.list('partners')) {
    if (p.status === 'paused') items.push({ tone: 'info', title: `伙伴「${p.shortName || p.name}」处于暂停状态`, meta: p.intro || '' });
  }

  const order = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone]);

  const body = items.length
    ? el('ul', { class: 'alert-list' }, items.slice(0, 12).map((i) =>
        el('li', { class: `alert alert--${i.tone}` }, [
          el('strong', { text: i.title }),
          el('span', { text: i.meta }),
        ])
      ))
    : el('p', { class: 'detail__empty', text: '目前没有需要处理的异常。' });

  return panel(`需要关注（${items.length}）`, body);
}

/** 分布统计：伙伴类型与项目状态 */
function buildDistribution(partners, projects) {
  const byType = new Map();
  for (const p of partners) byType.set(p.type, (byType.get(p.type) || 0) + 1);

  const byStatus = new Map();
  for (const p of projects) byStatus.set(p.status, (byStatus.get(p.status) || 0) + 1);

  const maxType = Math.max(1, ...byType.values());
  const maxStatus = Math.max(1, ...byStatus.values());

  const body = el('div', { class: 'dist' }, [
    el('h4', { text: '伙伴类型分布' }),
    el('ul', { class: 'dist__list' }, Array.from(byType.entries()).map(([k, v]) =>
      el('li', {}, [
        el('span', { class: 'dist__label', text: k }),
        el('div', { class: 'bar' }, [el('i', { style: `width:${(v / maxType) * 100}%` })]),
        el('b', { text: String(v) }),
      ])
    )),
    el('h4', { text: '项目状态分布' }),
    el('ul', { class: 'dist__list' }, Array.from(byStatus.entries()).map(([k, v]) =>
      el('li', {}, [
        el('span', { class: 'dist__label', text: labelOf(DICT.projectStatus, k) }),
        el('div', { class: `bar bar--${toneOf(DICT.projectStatus, k)}` }, [el('i', { style: `width:${(v / maxStatus) * 100}%` })]),
        el('b', { text: String(v) }),
      ])
    )),
  ]);

  return panel('结构分布', body);
}

function buildProjectTable(projects) {
  const rows = projects
    .slice()
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));

  return panel(
    `在管项目（${rows.length}）`,
    dataTable({
      columns: [
        { key: 'name', label: '项目', width: '28%', render: (p) => `<div><span class="code">${esc(p.code)}</span><strong class="cell-title">${esc(p.name)}</strong></div>` },
        { key: 'partnerId', label: '伙伴', width: '15%', render: (p) => esc(store.partnerName(p.partnerId)) },
        { key: 'owner', label: '负责人', width: '10%', render: (p) => esc(store.memberName(p.owner)) },
        { key: 'endDate', label: '结束日', width: '12%', render: (p) => {
            const left = daysBetween(today(), p.endDate);
            return `${fmtDate(p.endDate)}${left !== null && left <= 60 ? `<small class="${left < 0 ? 'is-bad' : 'is-warn'}">${left < 0 ? `超期 ${-left} 天` : `剩 ${left} 天`}</small>` : ''}`;
          } },
        { key: 'progress', label: '进度', width: '18%', render: (p) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, Number(p.progress) || 0))}%"></i></div><small>${Number(p.progress) || 0}%</small>` },
        { key: 'budget', label: '规模', width: '10%', align: 'right', render: (p) => esc(money(p.budget, p.currency)) },
        { key: 'status', label: '状态', width: '7%', render: (p) => tag(labelOf(DICT.projectStatus, p.status), toneOf(DICT.projectStatus, p.status)) },
      ],
      rows,
      empty: '当前没有在管项目',
      onRowClick: () => { location.hash = '#/projects'; },
    })
  );
}

/** 未来 6 个月的收付款计划 */
function buildUpcoming() {
  const now = today();
  const rows = store
    .list('finance')
    .filter((t) => t.status !== 'paid' && t.date >= now)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 8);

  const body = rows.length
    ? el('ul', { class: 'plan-list' }, rows.map((t) =>
        el('li', { class: `plan plan--${t.direction}` }, [
          el('span', { class: 'plan__date', text: fmtDate(t.date) }),
          el('div', { class: 'plan__body' }, [
            el('strong', { text: `${store.partnerName(t.partnerId)} · ${t.category}` }),
            el('small', { text: t.note || '' }),
          ]),
          el('b', { class: `num num--${t.direction === 'in' ? 'ok' : 'warn'}`, text: `${t.direction === 'in' ? '+' : '−'}${money(t.amount, t.currency)}` }),
        ])
      ))
    : el('p', { class: 'detail__empty', text: '没有待结算的计划。' });

  return panel('待结算计划', body);
}

function buildRecentFinance(txs) {
  const rows = txs
    .filter((t) => t.status === 'paid')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 8);

  const body = rows.length
    ? el('ul', { class: 'plan-list' }, rows.map((t) =>
        el('li', { class: `plan plan--${t.direction}` }, [
          el('span', { class: 'plan__date', text: fmtDate(t.date) }),
          el('div', { class: 'plan__body' }, [
            el('strong', { text: `${store.partnerName(t.partnerId)} · ${t.category}` }),
            el('small', { text: t.projectId ? store.projectName(t.projectId) : '' }),
          ]),
          el('b', { class: `num num--${t.direction === 'in' ? 'ok' : 'warn'}`, text: `${t.direction === 'in' ? '+' : '−'}${money(t.amount, t.currency)}` }),
        ])
      ))
    : el('p', { class: 'detail__empty', text: '暂无已结算记录。' });

  return panel('最近结算', body);
}

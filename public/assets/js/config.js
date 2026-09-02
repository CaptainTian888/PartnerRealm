/**
 * 稳链同创 — 枚举与中文标签
 *
 * 口令、会话与数据都在服务端（Worker + D1），这里不再有任何配置或凭证。
 */

/** 枚举与中文标签 */
export const DICT = {
  partnerType: ['战略', '渠道', '供应商', '技术', '投资'],
  partnerTier: ['核心', '重点', '一般'],
  partnerStatus: {
    active: { label: '合作中', tone: 'ok' },
    paused: { label: '暂停', tone: 'warn' },
    ended: { label: '已终止', tone: 'muted' },
  },
  projectStatus: {
    planning: { label: '筹备中', tone: 'info' },
    ongoing: { label: '进行中', tone: 'ok' },
    delivering: { label: '交付中', tone: 'ok' },
    completed: { label: '已结项', tone: 'muted' },
    paused: { label: '暂缓', tone: 'warn' },
    terminated: { label: '已终止', tone: 'bad' },
  },
  milestoneStatus: {
    todo: { label: '未开始', tone: 'muted' },
    doing: { label: '进行中', tone: 'info' },
    done: { label: '已完成', tone: 'ok' },
    blocked: { label: '受阻', tone: 'bad' },
  },
  contractType: ['框架协议', '项目合同', '补充协议', '保密协议', '其他'],
  contractStatus: {
    draft: { label: '草拟', tone: 'muted' },
    reviewing: { label: '审核中', tone: 'info' },
    signed: { label: '已签署', tone: 'ok' },
    executing: { label: '执行中', tone: 'ok' },
    completed: { label: '已完结', tone: 'muted' },
    terminated: { label: '已解除', tone: 'bad' },
  },
  txDirection: {
    in: { label: '收入', tone: 'ok' },
    out: { label: '支出', tone: 'warn' },
  },
  txCategory: ['合同款', '预付款', '尾款', '分成', '服务费', '保证金', '其他'],
  txStatus: {
    planned: { label: '计划中', tone: 'muted' },
    invoiced: { label: '已开票', tone: 'info' },
    paid: { label: '已结清', tone: 'ok' },
    overdue: { label: '逾期', tone: 'bad' },
  },
};

/** 取枚举标签，缺失时回退成原值 */
export function labelOf(dict, key) {
  const item = dict && dict[key];
  return item ? item.label : (key || '—');
}

/** 取枚举色调 */
export function toneOf(dict, key) {
  const item = dict && dict[key];
  return item ? item.tone : 'muted';
}

/**
 * 稳链同创 — 全局配置
 *
 * 仓库信息用于后台「一键部署」：后台把修改后的 data/*.json 通过 GitHub Contents API
 * 提交回本仓库，托管平台（Cloudflare Pages）监听到 push 后自动重新部署。
 */
export const CONFIG = {
  repo: {
    owner: 'CaptainTian888',
    name: 'PartnerRealm',
    branch: 'main',
    dataDir: 'data',
  },

  /**
   * 管理后台口令的 SHA-256 摘要。默认口令：wenlian2026
   * 更换口令：在浏览器控制台执行
   *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('新口令'))
   *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
   * 把输出替换到下面。
   *
   * 注意：这是纯静态站点，口令校验只能在浏览器里做，属于「防误入」而非「防攻击」。
   * 真正的访问控制请在 Cloudflare Access / Pages 访问策略上配置，详见 README。
   */
  adminPasswordHash: '00d31c4481eafb5ef178c45aa14cbd83bc29a64e245c3247db0d4f0dbaf13efa',

  /** 登录态有效期（毫秒），默认 8 小时 */
  sessionTtl: 8 * 60 * 60 * 1000,

  /** 数据文件清单：key 对应 store 中的数据集名 */
  files: {
    site: 'site.json',
    org: 'org.json',
    partners: 'partners.json',
    projects: 'projects.json',
    contracts: 'contracts.json',
    finance: 'finance.json',
  },
};

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

/**
 * 稳链同创 — 数据仓库（后端为 Cloudflare D1）
 *
 * 与旧版最大的区别：没有本地草稿，也没有「一键部署」。
 * 每次增删改都直接写数据库，成功后重新拉取缓存，改完即生效。
 */

/** 前端集合名 → 后端资源路径 */
const ENDPOINT = {
  partners: 'partners',
  projects: 'projects',
  contracts: 'contracts',
  finance: 'transactions',
  departments: 'departments',
  members: 'members',
};

/** 会话失效时抛出，由 admin.js 捕获后退回登录页 */
export class AuthError extends Error {}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    payload = await res.json().catch(() => null);
  }

  if (res.ok) return payload;

  // 始终优先展示服务端给出的原因：登录接口的 401 是「口令不正确」，
  // 其它接口的 401 才是会话过期，不能一律套用同一句话。
  const message = (payload && payload.error) || `请求失败（HTTP ${res.status}）`;
  if (res.status === 401) throw new AuthError(message);
  throw new Error(message);
}

class Store extends EventTarget {
  constructor() {
    super();
    this.data = { site: {}, org: { departments: [] }, partners: [], projects: [], contracts: [], finance: [] };
    this.loaded = false;
    this.saving = 0;
  }

  /** 拉取全部数据 */
  async load() {
    const payload = await api('/admin/bootstrap');
    this.data = {
      site: payload.site || {},
      org: payload.org || { departments: [] },
      partners: payload.partners || [],
      projects: payload.projects || [],
      contracts: payload.contracts || [],
      finance: payload.transactions || [],
    };
    this.loaded = true;
    this.#emit('load');
    return this.data;
  }

  /** 写操作后重新拉取，保证各处引用一致 */
  async refresh() {
    await this.load();
    this.#emit('change');
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** 包裹一次写操作，供顶栏显示「保存中」 */
  async #withSaving(fn) {
    this.saving += 1;
    this.#emit('saving', { active: true });
    try {
      return await fn();
    } finally {
      this.saving -= 1;
      this.#emit('saving', { active: this.saving > 0 });
    }
  }

  get(key) {
    return this.data[key];
  }

  list(key) {
    const value = this.data[key];
    return Array.isArray(value) ? value : [];
  }

  // ---- 写操作 ----

  /** 新增或更新：item.id 存在即为更新。返回服务端确认的 id */
  async save(collection, item) {
    const resource = ENDPOINT[collection];
    if (!resource) throw new Error(`未知的数据集：${collection}`);
    return this.#withSaving(async () => {
      const result = item.id
        ? await api(`/admin/${resource}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: item })
        : await api(`/admin/${resource}`, { method: 'POST', body: item });
      await this.refresh();
      return (result && result.id) || item.id;
    });
  }

  async remove(collection, id) {
    const resource = ENDPOINT[collection];
    if (!resource) throw new Error(`未知的数据集：${collection}`);
    return this.#withSaving(async () => {
      await api(`/admin/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await this.refresh();
    });
  }

  /** 保存门户文案的某个区块 */
  async saveSite(section, value) {
    return this.#withSaving(async () => {
      await api(`/admin/site/${section}`, { method: 'PUT', body: value });
      await this.refresh();
    });
  }

  // ---- 关联查询 ----

  partner(id) {
    return this.list('partners').find((p) => p.id === id) || null;
  }

  project(id) {
    return this.list('projects').find((p) => p.id === id) || null;
  }

  contract(id) {
    return this.list('contracts').find((c) => c.id === id) || null;
  }

  members() {
    const departments = (this.data.org && this.data.org.departments) || [];
    return departments.flatMap((dept) =>
      (dept.members || []).map((m) => ({ ...m, deptId: dept.id, deptName: dept.name }))
    );
  }

  member(id) {
    return this.members().find((m) => m.id === id) || null;
  }

  partnerName(id) {
    const p = this.partner(id);
    return p ? (p.shortName || p.name) : '—';
  }

  memberName(id) {
    const m = this.member(id);
    return m ? m.name : '—';
  }

  projectName(id) {
    const p = this.project(id);
    return p ? p.name : '—';
  }

  financeOfPartner(partnerId) {
    return this.list('finance').filter((t) => t.partnerId === partnerId);
  }

  summarize(transactions) {
    const acc = { in: 0, out: 0, paidIn: 0, paidOut: 0, overdue: 0, receivable: 0, payable: 0 };
    for (const t of transactions) {
      const amount = Number(t.amount) || 0;
      const settled = t.status === 'paid';
      if (t.direction === 'in') {
        acc.in += amount;
        if (settled) acc.paidIn += amount;
        else acc.receivable += amount;
      } else {
        acc.out += amount;
        if (settled) acc.paidOut += amount;
        else acc.payable += amount;
      }
      if (t.status === 'overdue') acc.overdue += amount;
    }
    acc.net = acc.paidIn - acc.paidOut;
    return acc;
  }
}

export const store = new Store();

/**
 * 稳链同创 — 数据仓库
 *
 * 线上数据来自仓库里的 data/*.json。后台的修改先写进 localStorage 草稿，
 * 点「一键部署」时才通过 GitHub API 提交回仓库。
 */
import { CONFIG } from './config.js';
import { clone } from './util.js';

const DRAFT_KEY = 'wlt.draft.v1';

/** 各数据集在 JSON 里的数组字段名；site / org 是对象结构，单独处理 */
const LIST_KEY = {
  partners: 'partners',
  projects: 'projects',
  contracts: 'contracts',
  finance: 'transactions',
};

class Store extends EventTarget {
  constructor() {
    super();
    this.remote = {};   // 仓库里的原始内容
    this.data = {};     // 当前内容（含未部署的草稿）
    this.dirty = new Set();
    this.loaded = false;
  }

  /** 加载全部数据文件，并叠加本地草稿 */
  async load({ withDraft = true } = {}) {
    const entries = Object.entries(CONFIG.files);
    const results = await Promise.all(
      entries.map(async ([key, file]) => {
        const res = await fetch(`${CONFIG.repo.dataDir}/${file}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`无法加载 ${file}（HTTP ${res.status}）`);
        return [key, await res.json()];
      })
    );
    this.remote = Object.fromEntries(results);
    this.data = clone(this.remote);
    this.dirty = new Set();

    if (withDraft) this.#applyDraft();
    this.loaded = true;
    this.#emit('load');
    return this.data;
  }

  #applyDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      for (const [key, value] of Object.entries(draft.data || {})) {
        if (!(key in this.data)) continue;
        this.data[key] = value;
        this.dirty.add(key);
      }
      this.draftSavedAt = draft.savedAt || null;
    } catch (err) {
      console.warn('草稿解析失败，已忽略', err);
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** 读取某个数据集（返回引用，改完请调用 markDirty） */
  get(key) {
    return this.data[key];
  }

  /** 取列表型数据集的数组 */
  list(key) {
    const field = LIST_KEY[key];
    const set = this.data[key];
    if (!set || !field) return [];
    if (!Array.isArray(set[field])) set[field] = [];
    return set[field];
  }

  /** 标记某数据集已改动并写入草稿 */
  markDirty(key) {
    this.dirty.add(key);
    this.saveDraft();
    this.#emit('change', { key });
  }

  saveDraft() {
    const payload = { savedAt: new Date().toISOString(), data: {} };
    for (const key of this.dirty) payload.data[key] = this.data[key];
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      this.draftSavedAt = payload.savedAt;
    } catch (err) {
      console.warn('草稿保存失败（可能超出存储配额）', err);
    }
  }

  /** 丢弃草稿，回到仓库版本 */
  discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    this.data = clone(this.remote);
    this.dirty = new Set();
    this.draftSavedAt = null;
    this.#emit('change', { key: null });
  }

  /** 部署成功后，把当前内容记为仓库版本 */
  commitLocal() {
    this.remote = clone(this.data);
    this.dirty = new Set();
    localStorage.removeItem(DRAFT_KEY);
    this.draftSavedAt = null;
    this.#emit('change', { key: null });
  }

  hasChanges() {
    return this.dirty.size > 0;
  }

  /** 待部署文件：[{ path, content }] */
  pendingFiles() {
    return Array.from(this.dirty).map((key) => ({
      key,
      path: `${CONFIG.repo.dataDir}/${CONFIG.files[key]}`,
      content: JSON.stringify(this.data[key], null, 2) + '\n',
    }));
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

  /** 扁平化的成员列表 */
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

  /** 某伙伴的资金汇总 */
  financeOfPartner(partnerId) {
    return this.list('finance').filter((t) => t.partnerId === partnerId);
  }

  /** 收支汇总 */
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

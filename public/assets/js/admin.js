/** 稳链同创 — 管理后台入口：登录、路由、保存状态 */
import { store, AuthError } from './store.js';
import { login, logout, isAuthed } from './auth.js';
import { $, esc } from './util.js';

import renderDashboard from './admin/dashboard.js';
import renderPartners from './admin/partners.js';
import renderProjects from './admin/projects.js';
import renderContracts from './admin/contracts.js';
import renderFinance from './admin/finance.js';
import renderOrg from './admin/org.js';
import renderSite from './admin/site.js';
import renderBackup from './admin/backup.js';

const VIEWS = {
  dashboard: { title: '总览看板', subtitle: '合作全景与需要关注的事项', render: renderDashboard },
  partners: { title: '合作伙伴', subtitle: '伙伴档案、分级与联系人', render: renderPartners },
  projects: { title: '项目管理', subtitle: '合作项目周期与里程碑', render: renderProjects },
  contracts: { title: '签约管理', subtitle: '合同要素、状态与有效期', render: renderContracts },
  finance: { title: '资金往来', subtitle: '收付款计划与实际结算', render: renderFinance },
  org: { title: '公司架构', subtitle: '部门层级与成员信息', render: renderOrg },
  site: { title: '门户内容', subtitle: '首页文案、经营理念与联系方式', render: renderSite },
  backup: { title: '系统与备份', subtitle: '数据规模、导出备份与运行说明', render: renderBackup },
};

// ---------- 登录 ----------

function showGate({ message } = {}) {
  $('#gate').hidden = false;
  $('#shell').hidden = true;

  const form = $('#gateForm');
  const error = $('#gateError');
  const input = $('#gatePassword');
  const submit = form.querySelector('button[type="submit"]');

  if (message) {
    error.hidden = false;
    error.textContent = message;
  }

  if (!form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = '验证中…';
      const failure = await login(input.value);
      submit.disabled = false;
      submit.textContent = '进入后台';

      if (failure) {
        error.hidden = false;
        error.textContent = failure;
        input.select();
        form.classList.remove('is-shake');
        void form.offsetWidth;
        form.classList.add('is-shake');
        return;
      }
      input.value = '';
      error.hidden = true;
      enterAdmin();
    });
  }

  setTimeout(() => input.focus(), 80);
}

async function enterAdmin() {
  $('#gate').hidden = true;
  $('#shell').hidden = false;

  try {
    await store.load();
  } catch (err) {
    if (err instanceof AuthError) return showGate({ message: err.message });
    $('#view').innerHTML = `<p class="load-error">数据加载失败：${esc(err.message)}</p>`;
    return;
  }

  store.addEventListener('saving', onSavingChange);
  bindShell();
  route();
}

// ---------- 路由 ----------

function currentView() {
  const key = (location.hash || '#/dashboard').replace(/^#\//, '').split('/')[0];
  return VIEWS[key] ? key : 'dashboard';
}

function route() {
  const key = currentView();
  const view = VIEWS[key];

  $('#viewTitle').textContent = view.title;
  $('#viewSubtitle').textContent = view.subtitle;
  document.querySelectorAll('.sidebar__nav a').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.view === key);
  });
  $('#sidebar').classList.remove('is-open');

  const host = $('#view');
  host.innerHTML = '';
  host.scrollTop = 0;
  try {
    view.render(host, { refresh: route });
  } catch (err) {
    console.error(err);
    host.innerHTML = `<p class="load-error">页面渲染出错：${esc(err.message)}</p>`;
  }
}

// ---------- 外壳 ----------

function bindShell() {
  if (document.body.dataset.shellBound) return;
  document.body.dataset.shellBound = '1';

  window.addEventListener('hashchange', route);

  // 业务模块写入成功后广播（见 admin/actions.js）
  window.addEventListener('wlt:refresh', route);
  window.addEventListener('wlt:auth-expired', (e) => {
    showGate({ message: (e.detail && e.detail.message) || '登录已过期，请重新登录' });
  });

  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('is-open');

  $('#logoutBtn').onclick = async () => {
    await logout();
    location.hash = '#/dashboard';
    showGate({ message: '已退出登录' });
  };
}

function onSavingChange(e) {
  const badge = $('#dirtyBadge');
  const active = e.detail && e.detail.active;
  badge.hidden = !active;
  badge.textContent = active ? '保存中…' : '';
}

// ---------- 启动 ----------

(async function boot() {
  if (await isAuthed()) enterAdmin();
  else showGate();
})();

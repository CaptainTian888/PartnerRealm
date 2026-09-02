/** 稳链同创 — 管理后台入口：口令、路由、部署状态条 */
import { store } from './store.js';
import { verifyPassword, openSession, isAuthed, closeSession } from './auth.js';
import { $, esc, toast } from './util.js';
import { confirmDialog } from './admin/ui.js';

import renderDashboard from './admin/dashboard.js';
import renderPartners from './admin/partners.js';
import renderProjects from './admin/projects.js';
import renderContracts from './admin/contracts.js';
import renderFinance from './admin/finance.js';
import renderOrg from './admin/org.js';
import renderSite from './admin/site.js';
import renderDeploy from './admin/deploy.js';

const VIEWS = {
  dashboard: { title: '总览看板', subtitle: '合作全景与需要关注的事项', render: renderDashboard },
  partners: { title: '合作伙伴', subtitle: '伙伴档案、分级与联系人', render: renderPartners },
  projects: { title: '项目管理', subtitle: '合作项目周期与里程碑', render: renderProjects },
  contracts: { title: '签约管理', subtitle: '合同要素、状态与有效期', render: renderContracts },
  finance: { title: '资金往来', subtitle: '收付款计划与实际结算', render: renderFinance },
  org: { title: '公司架构', subtitle: '部门层级与成员信息', render: renderOrg },
  site: { title: '门户内容', subtitle: '首页文案、业务板块与联系方式', render: renderSite },
  deploy: { title: '发布部署', subtitle: '把改动提交到仓库并触发线上更新', render: renderDeploy },
};

// ---------- 口令 ----------

function showGate() {
  $('#gate').hidden = false;
  $('#shell').hidden = true;
  const form = $('#gateForm');
  const error = $('#gateError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#gatePassword');
    const ok = await verifyPassword(input.value);
    if (!ok) {
      error.hidden = false;
      error.textContent = '口令不正确，请重试';
      input.select();
      form.classList.remove('is-shake');
      void form.offsetWidth;
      form.classList.add('is-shake');
      return;
    }
    openSession();
    input.value = '';
    error.hidden = true;
    enterAdmin();
  });

  setTimeout(() => $('#gatePassword').focus(), 80);
}

async function enterAdmin() {
  $('#gate').hidden = true;
  $('#shell').hidden = false;

  try {
    await store.load();
  } catch (err) {
    $('#view').innerHTML = `<p class="load-error">数据加载失败：${esc(err.message)}<br>请确认 data/ 目录下的 JSON 文件可访问。</p>`;
    return;
  }

  store.addEventListener('change', updateDirtyState);
  updateDirtyState();
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
  window.addEventListener('hashchange', route);

  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('is-open');

  $('#logoutBtn').onclick = async () => {
    if (store.hasChanges()) {
      const go = await confirmDialog({
        title: '还有未部署的修改',
        message: '退出不会丢失草稿，下次登录仍可继续编辑。确定现在退出吗？',
        confirmText: '退出',
        tone: 'primary',
      });
      if (!go) return;
    }
    closeSession();
    location.reload();
  };

  $('#deployBtn').onclick = () => {
    location.hash = '#/deploy';
  };

  $('#discardBtn').onclick = async () => {
    const go = await confirmDialog({
      title: '放弃所有未部署的修改',
      message: '当前草稿会被清除，数据回到线上仓库的版本。此操作无法撤销。',
      confirmText: '放弃修改',
    });
    if (!go) return;
    store.discardDraft();
    toast('已恢复到线上版本', 'info');
    route();
  };

  window.addEventListener('beforeunload', (e) => {
    if (!store.hasChanges()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function updateDirtyState() {
  const badge = $('#dirtyBadge');
  const discard = $('#discardBtn');
  const count = store.dirty.size;
  badge.hidden = count === 0;
  discard.hidden = count === 0;
  badge.textContent = count ? `${count} 项数据待部署` : '';
  $('#deployBtn').classList.toggle('is-pulse', count > 0);
}

// ---------- 启动 ----------

if (isAuthed()) {
  enterAdmin();
} else {
  showGate();
}

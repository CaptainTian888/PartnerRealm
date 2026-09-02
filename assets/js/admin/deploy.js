/** 后台 — 发布部署：把改动提交回 GitHub 仓库并触发线上更新 */
import { store } from '../store.js';
import { CONFIG } from '../config.js';
import { esc, el, toast } from '../util.js';
import { panel, confirmDialog } from './ui.js';
import { getToken, setToken, restoreToken, verifyToken, commitFiles } from '../github.js';

const LABEL = {
  site: '门户内容', org: '公司架构', partners: '合作伙伴',
  projects: '项目管理', contracts: '签约管理', finance: '资金往来',
};

export default function renderDeploy(host, ctx) {
  const rerender = () => { host.innerHTML = ''; renderDeploy(host, ctx); };
  restoreToken();

  host.append(buildTokenPanel(rerender));
  host.append(buildChangesPanel(rerender));
  host.append(buildHelpPanel());
}

// ---------- Token ----------

function buildTokenPanel(rerender) {
  const token = getToken();
  const body = el('div', { class: 'deploy-token' });

  if (token) {
    const status = el('p', { class: 'deploy-token__status', text: '正在校验 Token…' });
    body.append(status);

    verifyToken(token).then(
      (info) => {
        status.className = 'deploy-token__status is-ok';
        status.textContent = info.canPush
          ? `已连接：${info.login} → ${info.fullName}（可写）`
          : `已连接：${info.login} → ${info.fullName}，但这个 Token 没有写权限，部署会失败。`;
        if (!info.canPush) status.className = 'deploy-token__status is-bad';
      },
      (err) => {
        status.className = 'deploy-token__status is-bad';
        status.textContent = `Token 校验失败：${err.message}`;
      }
    );

    body.append(
      el('div', { class: 'deploy-token__ops' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: '清除 Token',
          onclick: () => { setToken(''); toast('Token 已清除', 'info'); rerender(); },
        }),
      ])
    );
    return panel('GitHub 连接', body);
  }

  const form = el('form', { class: 'deploy-token__form' });
  const input = el('input', {
    class: 'input', type: 'password', placeholder: 'ghp_… 或 github_pat_…',
    autocomplete: 'off', required: 'required',
  });
  const remember = el('label', { class: 'checkbox' });
  const rememberBox = el('input', { type: 'checkbox' });
  remember.append(rememberBox, el('span', { text: '在这台设备上记住（存浏览器本地，勿在公用电脑勾选）' }));

  form.append(
    el('p', { class: 'field__hint', html: `需要一个对 <code>${esc(CONFIG.repo.owner)}/${esc(CONFIG.repo.name)}</code> 有 <strong>Contents 写权限</strong> 的 GitHub Token。<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">去 GitHub 创建 ↗</a>` }),
    input,
    remember,
    el('button', { class: 'btn btn--primary', type: 'submit', text: '连接' })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    try {
      const info = await verifyToken(value);
      if (!info.canPush) {
        toast('这个 Token 对本仓库没有写权限', 'bad');
        return;
      }
      setToken(value, rememberBox.checked);
      toast(`已连接 GitHub：${info.login}`, 'ok');
      rerender();
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  body.append(form);
  return panel('GitHub 连接', body);
}

// ---------- 待部署改动 ----------

function buildChangesPanel(rerender) {
  const files = store.pendingFiles();
  const body = el('div', { class: 'deploy-body' });

  if (!files.length) {
    body.append(
      el('p', { class: 'detail__empty', text: '当前没有未部署的改动。去各个模块修改数据后，再回到这里发布。' })
    );
    if (store.draftSavedAt) {
      body.append(el('p', { class: 'field__hint', text: `上次草稿保存于 ${new Date(store.draftSavedAt).toLocaleString('zh-CN')}` }));
    }
    return panel('待部署改动', body);
  }

  body.append(
    el('ul', { class: 'change-list' }, files.map((f) =>
      el('li', { class: 'change' }, [
        el('div', {}, [
          el('strong', { text: LABEL[f.key] || f.key }),
          el('small', { text: f.path }),
        ]),
        el('span', { class: 'change__size', text: `${(new Blob([f.content]).size / 1024).toFixed(1)} KB` }),
      ])
    ))
  );

  const messageInput = el('input', {
    class: 'input', type: 'text',
    placeholder: '提交说明（可留空，将自动生成）',
  });
  body.append(el('label', { class: 'field__label', text: '提交说明' }), messageInput);

  const log = el('ol', { class: 'deploy-log', hidden: 'hidden' });
  const button = el('button', {
    class: 'btn btn--primary btn--lg', type: 'button',
    text: `一键部署（${files.length} 个文件）`,
  });

  button.onclick = async () => {
    if (!getToken()) {
      toast('请先在上方连接 GitHub Token', 'warn');
      return;
    }
    const ok = await confirmDialog({
      title: '确认部署到线上',
      message: `将把 ${files.map((f) => LABEL[f.key] || f.key).join('、')} 的改动提交到 ${CONFIG.repo.owner}/${CONFIG.repo.name} 的 ${CONFIG.repo.branch} 分支。提交后托管平台会自动重新部署，线上内容将随之更新。`,
      confirmText: '确认部署',
      tone: 'primary',
    });
    if (!ok) return;

    button.disabled = true;
    button.textContent = '部署中…';
    log.hidden = false;
    log.innerHTML = '';

    const step = (text) => log.append(el('li', { text }));
    const names = files.map((f) => LABEL[f.key] || f.key).join('、');
    const message = messageInput.value.trim() || `chore(data): 更新${names}`;

    try {
      const result = await commitFiles(files, message, step);
      step(`提交完成 ${result.shortSha}`);
      log.append(
        el('li', {}, [
          el('a', { href: result.url, target: '_blank', rel: 'noopener', text: '在 GitHub 上查看这次提交 ↗' }),
        ])
      );
      step('托管平台将在 1–2 分钟内完成部署');
      store.commitLocal();
      toast('部署已触发', 'ok');
      button.textContent = '部署完成';
      setTimeout(rerender, 2400);
    } catch (err) {
      console.error(err);
      step(`失败：${err.message}`);
      log.lastChild.classList.add('is-bad');
      toast(err.message, 'bad');
      button.disabled = false;
      button.textContent = '重试部署';
    }
  };

  body.append(el('div', { class: 'deploy-actions' }, [button]), log);
  return panel(`待部署改动（${files.length}）`, body);
}

function buildHelpPanel() {
  const body = el('div', { class: 'deploy-help', html: `
    <ol>
      <li><strong>数据存在哪里</strong>：所有内容都保存在仓库的 <code>data/</code> 目录里，是普通的 JSON 文件。</li>
      <li><strong>改动怎么暂存</strong>：后台里的修改先存在浏览器本地草稿，刷新页面不会丢，别的设备看不到。</li>
      <li><strong>一键部署做了什么</strong>：把改动的 JSON 打成一次提交推到 <code>${esc(CONFIG.repo.branch)}</code> 分支，托管平台监听到推送后自动重新构建上线。</li>
      <li><strong>部署失败怎么办</strong>：多为 Token 过期或权限不足。重新生成一个带本仓库 Contents 写权限的 Token 再试；草稿不会因失败而丢失。</li>
      <li><strong>换仓库</strong>：修改 <code>assets/js/config.js</code> 里的 <code>repo</code> 配置。</li>
    </ol>` });
  return panel('部署说明', body);
}

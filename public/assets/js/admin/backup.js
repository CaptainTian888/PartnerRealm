/** 后台 — 系统与备份 */
import { store } from '../store.js';
import { el, toast, today } from '../util.js';
import { panel, statCards } from './ui.js';

export default function renderBackup(host, ctx) {
  const counts = {
    partners: store.list('partners').length,
    projects: store.list('projects').length,
    contracts: store.list('contracts').length,
    finance: store.list('finance').length,
    departments: (store.get('org').departments || []).length,
    members: store.members().length,
  };

  host.append(
    statCards([
      { label: '合作伙伴', value: String(counts.partners) },
      { label: '项目', value: String(counts.projects) },
      { label: '合同', value: String(counts.contracts) },
      { label: '资金流水', value: String(counts.finance) },
      { label: '部门 / 成员', value: `${counts.departments} / ${counts.members}` },
    ])
  );

  // ---- 导出备份 ----
  const exportBody = el('div', { class: 'deploy-body' });
  exportBody.append(
    el('p', { class: 'field__hint', text: '把数据库里的全部数据导出成一个 JSON 文件保存到本地。建议定期备份。' })
  );

  const exportBtn = el('button', { class: 'btn btn--primary', type: 'button', text: '导出全部数据（JSON）' });
  exportBtn.onclick = async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = '导出中…';
    try {
      const res = await fetch('/api/admin/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `稳链同创-数据备份-${today()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('备份已下载', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '导出全部数据（JSON）';
    }
  };
  exportBody.append(el('div', { class: 'deploy-actions' }, [exportBtn]));
  host.append(panel('数据备份', exportBody));

  // ---- 说明 ----
  host.append(
    panel('系统说明', el('div', { class: 'deploy-help', html: `
      <ol>
        <li><strong>数据存在哪里</strong>：Cloudflare D1 数据库，由 Worker 提供接口。后台的每一次修改都直接写库，<strong>保存即生效，不需要再部署</strong>。</li>
        <li><strong>谁能读到</strong>：所有业务接口都在 <code>/api/admin/*</code> 之下，必须持有有效会话才能访问。未登录请求一律返回 401，数据不会外泄。</li>
        <li><strong>门户看到什么</strong>：门户只调用 <code>/api/public/site</code>，这个接口仅返回首页文案，不包含任何伙伴、项目、合同与资金信息。</li>
        <li><strong>登录凭证</strong>：会话是 HMAC 签名的令牌，存放在 HttpOnly Cookie 里，前端 JavaScript 读不到，有效期 8 小时。连续输错 8 次会锁定该来源 15 分钟。</li>
        <li><strong>改口令</strong>：在项目目录执行 <code>wrangler secret put ADMIN_PASSWORD</code>，按提示输入新口令即可，无需改代码。</li>
        <li><strong>改代码后上线</strong>：执行 <code>npm run deploy</code>。数据不受部署影响。</li>
      </ol>` }))
  );
}

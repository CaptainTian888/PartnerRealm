/**
 * 稳链同创 — GitHub 提交与部署
 *
 * 用 Git Data API 把多个 data/*.json 打包成一个 commit，避免逐文件提交产生多次部署。
 * Token 只保存在浏览器 sessionStorage，关掉标签页即失效。
 */
import { CONFIG } from './config.js';

const API = 'https://api.github.com';
const TOKEN_KEY = 'wlt.gh.token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token, persist = false) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (persist) localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** 页面加载时把「记住」的 token 恢复到 session */
export function restoreToken() {
  const remembered = localStorage.getItem(TOKEN_KEY);
  if (remembered && !sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(TOKEN_KEY, remembered);
  }
  return getToken();
}

async function gh(path, { method = 'GET', body, token = getToken() } = {}) {
  if (!token) throw new Error('缺少 GitHub Token');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* 忽略 */ }
    const hint = {
      401: 'Token 无效或已过期',
      403: 'Token 权限不足，需要对本仓库的 Contents 写权限',
      404: '仓库或分支不存在，请检查 config.js 里的 repo 配置',
      409: '分支状态冲突，请刷新后重试',
      422: '提交内容被拒绝',
    }[res.status];
    throw new Error(`GitHub ${res.status}：${hint || detail || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

/** 校验 token 是否能写这个仓库 */
export async function verifyToken(token) {
  const repo = await gh(`/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}`, { token });
  const user = await gh('/user', { token }).catch(() => null);
  return {
    login: user ? user.login : '未知账号',
    canPush: !!(repo.permissions && repo.permissions.push),
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
  };
}

/**
 * 把若干文件作为一个 commit 推到仓库。
 * @param {Array<{path:string, content:string}>} files
 * @param {string} message 提交说明
 * @param {(step:string)=>void} onProgress
 */
export async function commitFiles(files, message, onProgress = () => {}) {
  const { owner, name, branch } = CONFIG.repo;
  const base = `/repos/${owner}/${name}`;

  onProgress('读取分支状态');
  const ref = await gh(`${base}/git/ref/heads/${branch}`);
  const latestCommitSha = ref.object.sha;

  onProgress('读取目录树');
  const latestCommit = await gh(`${base}/git/commits/${latestCommitSha}`);
  const baseTreeSha = latestCommit.tree.sha;

  onProgress(`上传 ${files.length} 个文件`);
  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await gh(`${base}/git/blobs`, {
        method: 'POST',
        body: { content: file.content, encoding: 'utf-8' },
      });
      return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
    })
  );

  onProgress('生成提交');
  const tree = await gh(`${base}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseTreeSha, tree: blobs },
  });

  const commit = await gh(`${base}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [latestCommitSha] },
  });

  onProgress('推送到 ' + branch);
  await gh(`${base}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    url: `https://github.com/${owner}/${name}/commit/${commit.sha}`,
  };
}

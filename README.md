# 稳链同创 · 合作伙伴管理平台

**稳链投资控股（海南）有限公司**（业务品牌：稳链同创）的对外门户 + 内部管理后台，
纯静态站点。所有业务数据以 JSON 形式存放在仓库的 `data/` 目录，
后台修改后通过「一键部署」提交回仓库，托管平台监听到 push 后自动重新上线。

- 门户首页：`index.html` —— 首屏、关于我们、经营理念、联系方式
- 管理后台：`admin.html`（默认口令 **`wenlian2026`**，请尽快更换）

门户是纯品牌展示，不对外暴露伙伴、项目与合同信息；这些内容只在后台管理。

## 功能

| 模块 | 说明 |
|---|---|
| 总览看板 | 伙伴/项目/签约/资金的关键指标，逾期款、临期合同、超期与进度落后项目的预警 |
| 合作伙伴 | 伙伴档案、分级、状态、联系人、标签，以及关联项目/合同/资金汇总 |
| 项目管理 | 合作周期、完成进度、里程碑时间线、项目规模 |
| 签约管理 | 合同要素、状态流转、到期提醒、结算进度 |
| 资金往来 | 收付款逐笔登记、待收待付与逾期统计、CSV 导出 |
| 公司架构 | 部门树与成员，供项目负责人、合同签署人引用 |
| 门户内容 | 首页文案、站点标识、经营理念、首屏数据、联系方式、页脚 |
| 发布部署 | 连接 GitHub Token，把改动打成一次提交推送并触发部署 |

## 目录结构

```
index.html              门户首页
admin.html              管理后台
data/                   业务数据（后台读写的就是这些文件）
  site.json               门户文案
  org.json                公司架构
  partners.json           合作伙伴
  projects.json           项目与里程碑
  contracts.json          合同
  finance.json            资金流水
assets/
  img/logo.png            完整组合标（透明底，用于后台登录页）
  img/logo-mark.png       图形标（透明底，用于页头/侧栏/页脚/首屏）
  img/favicon.png         浏览器页签图标
  css/tokens.css          设计变量
  css/base.css            基础样式与通用组件
  css/portal.css          门户样式
  css/admin.css           后台样式
  js/config.js            仓库配置、口令摘要、枚举字典
  js/util.js              工具函数
  js/store.js             数据加载、草稿、关联查询
  js/github.js            GitHub 提交
  js/auth.js              口令校验
  js/portal.js            门户渲染
  js/admin.js             后台入口与路由
  js/admin/               后台各功能模块
```

## 本地预览

必须通过 HTTP 打开（页面用了 ES Module 与 fetch，`file://` 直接双击会失败）：

```bash
python -m http.server 8080
# 或 npx serve .
```

然后访问 http://localhost:8080

## 部署（Cloudflare Pages）

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择本仓库。
2. 构建设置：
   - Framework preset：**None**
   - Build command：**留空**
   - Build output directory：**`/`**
3. 部署完成后，之后每次 push 到 `main` 都会自动重新部署。

GitHub Pages 同样可用：Settings → Pages → Source 选 `main` 分支根目录。

## 一键部署怎么用

1. 在 GitHub 创建一个 [Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)：
   - Repository access：只勾选本仓库
   - Permissions → Repository permissions → **Contents: Read and write**
2. 后台 →「发布部署」→ 粘贴 Token → 连接。
3. 在各模块修改数据（改动先存浏览器本地草稿，顶栏会显示「N 项数据待部署」）。
4. 回到「发布部署」，点「一键部署」。改动会作为一次提交推送到 `main`，托管平台随后自动上线。

Token 默认只存在 `sessionStorage`，关掉标签页即失效；勾选「记住」才会写入 `localStorage`。

## 更换站点标识

三个图片资源都由原始 logo 派生而来，已去白底转成透明 PNG：

| 文件 | 用途 | 建议规格 |
|---|---|---|
| `assets/img/logo.png` | 后台登录页 | 完整组合标，透明底，宽 ≥600px |
| `assets/img/logo-mark.png` | 页头、侧栏、页脚、首屏 | 只要图形部分，正方形透明底，≥256px |
| `assets/img/favicon.png` | 浏览器页签 | 64×64 透明底 |

换图有两种做法：直接覆盖同名文件；或把新图放进 `assets/img/`，
再到后台「门户内容 → 站点标识」里填写新路径（`favicon` 需手动改两个 HTML 里的 `<link rel="icon">`）。

首屏用的是**图形标**而不是完整组合标 —— 组合标自带「稳链同创」字样，
和首屏主标题并排会重复。若换成不含文字的标识，可自行调整。

## 更换后台口令

在浏览器控制台执行，把输出替换到 `assets/js/config.js` 的 `adminPasswordHash`：

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('你的新口令'))
  .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
```

## 安全说明（务必阅读）

这是纯静态站点，**后台口令只能在浏览器里校验**，作用是防止误入和随手翻看，
不能阻挡任何有心人：口令摘要写在 `config.js` 里，而 `data/` 下的伙伴、合同、
资金数据是可直接访问的静态文件。

如果这些数据不能公开，请至少做到其中一项：

1. **把仓库设为 Private**。Cloudflare Pages 和 GitHub Pages（付费版）都支持私有仓库部署，
   源码不再公开——但注意站点本身仍是公开的，`data/*.json` 依然可被访问。
2. **加 Cloudflare Access**（推荐，免费额度足够）：
   Cloudflare Dashboard → Zero Trust → Access → Applications → Add an application → Self-hosted，
   域名填你的站点，Path 填 `admin.html`（数据也要保护就再加一条 `data/`），
   策略选邮箱白名单或 OTP。这样在请求到达站点之前就完成了身份验证。
3. 若数据敏感度高，应改用带服务端鉴权的方案（如 Cloudflare Workers + D1），
   静态 JSON 方案不适合承载真正机密的信息。

## 换一个仓库部署

修改 `assets/js/config.js` 里的 `repo` 配置：

```js
repo: { owner: '你的账号', name: '仓库名', branch: 'main', dataDir: 'data' }
```

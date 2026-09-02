# 稳链同创 · 合作伙伴管理平台

**稳链投资控股（海南）有限公司**（业务品牌：稳链同创）的对外门户 + 内部管理后台。

Cloudflare Workers + D1 架构：数据存在数据库里，接口由 Worker 提供，
口令与会话在**服务端**校验。后台改完立即生效，不需要再部署。

- 门户首页：`/` —— 首屏、关于我们、经营理念、联系方式
- 管理后台：`/admin.html`

## 架构

```
浏览器
  ├── 门户 index.html ──→ GET /api/public/site   （公开，仅站点文案）
  └── 后台 admin.html ──→ POST /api/auth/login   （服务端校验口令）
                      └─→ /api/admin/*           （需 HttpOnly Cookie 会话）
                                 ↓
                        Cloudflare Worker (src/)
                                 ↓
                          Cloudflare D1（SQLite）
```

静态文件由 Cloudflare 边缘直接返回，只有 `/api/*` 会唤醒 Worker
（`wrangler.jsonc` 里的 `run_worker_first`）。

## 安全模型

上一版是纯静态站点，口令在浏览器里比对、数据是公开的 JSON 文件。现在：

| | 旧（静态） | 现在（Worker + D1） |
|---|---|---|
| 口令校验 | 浏览器里比对哈希 | 服务端与 Secret 比对，定长比较 |
| 口令存放 | 摘要写在前端代码里 | Cloudflare Secret，加密存储，不进仓库 |
| 会话 | localStorage 标记 | HMAC-SHA256 签名令牌，HttpOnly Cookie |
| 业务数据 | `data/*.json` 任何人可直接下载 | 必须持有有效会话，否则 401 |
| 暴力破解 | 无限制 | 同一来源 15 分钟内错 8 次即锁定 |

会话 Cookie 带 `HttpOnly`（JS 读不到）、`Secure`、`SameSite=Strict`，有效期 8 小时。
令牌被篡改一个字节即失效。

门户只调用 `/api/public/site`，这个接口返回的内容里**不含**任何伙伴、项目、
合同与资金信息 —— 未登录的人无论如何都拿不到业务数据。

## 首次部署

```bash
npm install

# 1. 建数据库，把输出的 database_id 填进 wrangler.jsonc
npm run db:create

# 2. 建表并写入初始数据
npm run db:migrate

# 3. 设置两个机密（交互式输入，不会留在命令历史里）
npx wrangler secret put ADMIN_PASSWORD    # 后台登录口令，自己定
npx wrangler secret put SESSION_SECRET    # 会话签名密钥，随便一串长随机字符

# 4. 上线
npm run deploy
```

`SESSION_SECRET` 可以这样生成：

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

## 本地开发

```bash
cp .dev.vars.example .dev.vars   # 填本地用的口令与密钥
npm run db:migrate:local          # 初始化本地数据库
npm run dev                       # http://localhost:8787
```

`.dev.vars` 已在 `.gitignore` 里，不会被提交。

## 测试

```bash
npm test                                  # 80 项接口测试
node --experimental-sqlite test/ui.mjs    # 前端 + Worker 端到端测试
```

测试用 `node:sqlite` 顶替 D1（`test/d1-shim.mjs`），不需要 Cloudflare 账号，
也不会碰到线上数据。

## 目录结构

```
wrangler.jsonc          Worker 配置：静态资源 + D1 绑定
src/
  index.js                路由与接口
  auth.js                 口令校验、会话签发与验证、登录限流
  db.js                   D1 读写，行 ↔ 前端字段的映射
migrations/
  0001_init.sql           表结构
  0002_seed.sql           初始数据（由 scripts/build-seed.mjs 生成）
seed/*.json             种子数据源，改完跑 npm run db:seed:build
public/                 静态站点
  index.html              门户
  admin.html              后台
  assets/img/             logo 三件套
  assets/css/             tokens / base / portal / admin
  assets/js/
    portal.js               门户渲染
    admin.js                后台外壳：登录、路由
    store.js                数据仓库，封装所有 API 调用
    auth.js                 登录/登出/会话查询
    admin/                  各功能模块
      actions.js              写操作统一入口（错误处理 + 重绘广播）
test/                   测试
```

## 数据表

| 表 | 说明 |
|---|---|
| `settings` | 站点文案，每个区块一行 JSON |
| `departments` / `members` | 组织架构 |
| `partners` / `partner_contacts` | 伙伴与联系人 |
| `projects` / `milestones` | 项目与里程碑 |
| `contracts` | 合同 |
| `transactions` | 资金流水 |
| `login_attempts` | 登录失败记录，用于限流 |

外键策略：联系人、里程碑随父记录级联删除；伙伴被项目/合同/资金引用时**拒绝删除**，
接口返回 409 并说明引用数量，避免产生孤儿记录。部门删除会连带其成员，
被引用为负责人的位置置空。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/public/site` | 公开 | 门户文案 |
| POST | `/api/auth/login` | 公开 | 登录，成功下发 Cookie |
| POST | `/api/auth/logout` | 公开 | 退出 |
| GET | `/api/auth/session` | 公开 | 查询当前会话是否有效 |
| GET | `/api/admin/bootstrap` | 需登录 | 一次性拉取全部数据 |
| GET | `/api/admin/export` | 需登录 | 导出 JSON 备份 |
| PUT | `/api/admin/site/:section` | 需登录 | 更新某个文案区块 |
| GET/POST/PUT/DELETE | `/api/admin/{partners,projects,contracts,transactions,departments,members}` | 需登录 | 增删改查 |

## 换口令

```bash
npx wrangler secret put ADMIN_PASSWORD
```

按提示输入即可，不用改代码、不用重新部署。

## 备份

后台「系统与备份」可导出全部数据为 JSON。也可以用命令导出整库 SQL：

```bash
npm run db:export     # 生成 backup.sql
```

## 换站点标识

三张图在 `public/assets/img/`：`logo.png`（完整组合标）、
`logo-mark.png`（图形标）、`favicon.png`。
覆盖同名文件后 `npm run deploy` 即可；或放新文件后到后台
「门户内容 → 站点标识」填写新路径。

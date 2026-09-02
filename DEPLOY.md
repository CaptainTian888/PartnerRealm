# 部署与配置指南

从零把「稳链同创」跑到线上，一共四件事：**建数据库 → 绑定 → 配变量 → 部署**。

全程约 10 分钟。需要一个 Cloudflare 账号（免费套餐即可，D1 免费额度对本项目绰绰有余）。

---

## 一、准备

```bash
git clone https://github.com/CaptainTian888/PartnerRealm.git
cd PartnerRealm
npm install
npx wrangler login        # 浏览器里授权，登录你的 Cloudflare 账号
npx wrangler whoami       # 确认账号正确
```

---

## 二、建库并绑定 D1

三种做法，任选一种。**推荐 A**，最省事。

### A. 部署时自动创建（推荐）

`wrangler.jsonc` 里已经写好了绑定，但故意没填 `database_id`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",                  // 代码里通过 env.DB 访问
    "database_name": "partnerrealm",
    "migrations_dir": "./migrations"
  }
]
```

首次执行 `npx wrangler deploy` 时，Wrangler 会自动创建这个数据库、完成绑定，
并把生成的 `database_id` **回写进 wrangler.jsonc**。之后记得把这个改动提交到仓库：

```bash
git add wrangler.jsonc && git commit -m "chore: 记录 D1 database_id"
```

> 自动创建目前是 Beta 功能。如果失败，改用下面的 B 或 C。

### B. 命令行先建库

```bash
npx wrangler d1 create partnerrealm
```

输出里会有一段配置，形如：

```
[[d1_databases]]
binding = "DB"
database_name = "partnerrealm"
database_id = "a1b2c3d4-...."
```

命令会问你 *Would you like Wrangler to add it on your behalf?* —— 选 **Yes**，
它会自动写进 `wrangler.jsonc`。若选了 No，就手动把 `database_id` 那一行加进去：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "partnerrealm",
    "database_id": "a1b2c3d4-....",   // ← 粘贴这里
    "migrations_dir": "./migrations"
  }
]
```

### C. 在 Cloudflare 控制台建库

1. 登录 <https://dash.cloudflare.com>
2. 左侧 **Storage & Databases** → **D1 SQL Database** → **Create**
3. 数据库名填 `partnerrealm`，地区可选（建议选靠近用户的），点 **Create**
4. 进入这个数据库，页面上能看到 **Database ID**，复制它
5. 粘贴到 `wrangler.jsonc` 的 `database_id` 字段（写法同上面 B）

> 也可以在控制台里给 Worker 加绑定（Worker → Settings → Bindings → Add → D1），
> 但用 `wrangler deploy` 部署时，**配置文件里的绑定是权威的**，会覆盖控制台设置。
> 所以只要你用命令行部署，`database_id` 就应该落在 `wrangler.jsonc` 里。

---

## 三、建表并写入初始数据

```bash
npm run db:migrate         # 等价于 wrangler d1 migrations apply partnerrealm --remote
```

会依次执行 `migrations/` 下的两个文件：

| 文件 | 作用 |
|---|---|
| `0001_init.sql` | 建 9 张表与索引 |
| `0002_seed.sql` | 写入示例数据：5 家伙伴、6 个项目、6 份合同、11 笔流水、5 个部门 |

验证：

```bash
npx wrangler d1 execute partnerrealm --remote --command "SELECT COUNT(*) FROM partners"
```

> **不想要示例数据？** 部署前删掉 `migrations/0002_seed.sql` 再执行迁移，
> 得到一个空库。但站点文案（`settings` 表）也在这个文件里，删了首页会是空的 ——
> 建议保留，之后在后台逐条改成真实内容。

本地开发用 `npm run db:migrate:local`，操作的是本机副本，不碰线上数据。

---

## 四、配置变量

**所有可调项都在 Cloudflare 里配置，代码和仓库里不留任何凭证。**

### 必填的两个机密

命令行方式（推荐，输入时不回显、不进命令历史）：

```bash
npx wrangler secret put ADMIN_PASSWORD     # 后台登录口令，自己定
npx wrangler secret put SESSION_SECRET     # 会话签名密钥，至少 32 字符
```

`SESSION_SECRET` 可以这样生成：

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

控制台方式：**Workers & Pages → partnerrealm → Settings → Variables and Secrets
→ Add → 类型选 Secret** → 填名称和值 → Save。

> 密钥少于 32 字符时，接口会直接返回 500 并说明原因，不会带着弱密钥静默运行。

### 可选的四个参数

这些**不需要配**，留空就用默认值。要调就在
**Settings → Variables and Secrets → Add → 类型选 Text**：

| 名称 | 默认 | 范围 | 作用 |
|---|---|---|---|
| `SESSION_TTL_HOURS` | 8 | 1–720 | 登录多久后需要重新输口令 |
| `LOGIN_MAX_FAILS` | 8 | 3–100 | 同一 IP 连续错几次后锁定 |
| `LOGIN_WINDOW_MINUTES` | 15 | 1–1440 | 失败计数窗口与锁定时长 |
| `PUBLIC_CACHE_SECONDS` | 60 | 0–86400 | 门户接口缓存时长，0 表示不缓存 |

填了非法值（比如中文、负数）会自动回退到默认值；超出范围会被钳到边界，不会让站点崩掉。

`wrangler.jsonc` 里设了 `"keep_vars": true`，所以**你在控制台改的变量不会被下次部署覆盖**。

### 变量改完何时生效

- **Secret / 变量**：控制台保存后即时生效，不需要重新部署。
- **代码改动**：需要 `npm run deploy`。
- **后台里改的业务数据和文案**：直接写数据库，保存即生效。

---

## 五、部署

```bash
npm run deploy
```

成功后会输出一个 `https://partnerrealm.<你的子域>.workers.dev` 地址。

打开验证：

| 检查项 | 预期 |
|---|---|
| 访问根路径 | 看到门户首页，理念四条正常显示 |
| 访问 `/admin.html` | 出现登录框 |
| 输入错误口令 | 提示「口令不正确」 |
| 输入正确口令 | 进入后台，看到 5 家伙伴 |
| 浏览器直接访问 `/api/admin/bootstrap` | 返回 401，看不到任何业务数据 |
| 访问 `/api/public/site` | 只返回文案，不含伙伴与资金信息 |

---

## 六、绑定自己的域名（可选）

1. 域名先托管到 Cloudflare（Add a site，改 NS）
2. **Workers & Pages → partnerrealm → Settings → Domains & Routes → Add → Custom Domain**
3. 填 `www.example.com` 之类，保存

证书由 Cloudflare 自动签发，几分钟内生效。

---

## 日常操作速查

| 要做的事 | 怎么做 |
|---|---|
| 改后台口令 | `npx wrangler secret put ADMIN_PASSWORD`，或控制台改同名 Secret |
| 改站点文案 | 后台 → 门户内容 |
| 改伙伴/项目/合同/资金 | 后台对应模块，保存即生效 |
| 备份数据 | 后台 → 系统与备份 → 导出；或 `npm run db:export` |
| 改代码后上线 | `npm run deploy` |
| 看线上日志 | `npx wrangler tail`，或控制台 → Worker → Logs |
| 回滚到上一版 | `npx wrangler rollback` |
| 查数据库 | `npx wrangler d1 execute partnerrealm --remote --command "SELECT ..."` |

---

## 出问题时

| 现象 | 原因与处理 |
|---|---|
| 接口返回「未绑定 D1 数据库」 | `wrangler.jsonc` 缺 `d1_databases`，或 `binding` 不叫 `DB` |
| 接口返回「未配置 SESSION_SECRET」 | 没设机密，执行 `wrangler secret put SESSION_SECRET` |
| 接口返回「SESSION_SECRET 过短」 | 换一个 ≥32 字符的随机串 |
| 门户显示「站点内容尚未初始化」 | 迁移没跑，执行 `npm run db:migrate` |
| 登录一直提示尝试次数过多 | 触发限流，等窗口过去；或临时调大 `LOGIN_MAX_FAILS` |
| 登录成功但立刻退回登录页 | 多为通过 HTTP 访问导致 Secure Cookie 未被保存，请用 HTTPS |
| 部署报数据库不存在 | `database_id` 填错或库被删了，重新执行第二步 |

看具体报错：

```bash
npx wrangler tail
```

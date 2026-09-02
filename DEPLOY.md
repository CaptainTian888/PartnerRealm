# 部署

你只需要做两件事：**建一个 D1 数据库并绑定**，**填两个变量**。

建表、写入初始数据、后续维护都由代码自己处理。

---

## 方式一：命令行（最快，约 3 分钟）

```bash
npm install
npx wrangler login                      # 浏览器里授权

npx wrangler d1 create partnerrealm     # 建库并自动写入绑定，问你时选 Yes
npx wrangler secret put ADMIN_PASSWORD  # 后台登录口令，自己定
npx wrangler secret put SESSION_SECRET  # 会话密钥，至少 32 字符

npm run deploy
```

`SESSION_SECRET` 用这个生成：

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

部署完打开输出的网址，**第一次访问时数据库会自动建表并写入初始数据**，不用跑迁移。

---

## 方式二：Cloudflare 控制台

### 1. 建数据库

<https://dash.cloudflare.com> → **Storage & Databases** → **D1 SQL Database** → **Create**

名称填 `partnerrealm` → **Create**。

建好后页面上有一串 **Database ID**，复制它，粘进本项目 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "partnerrealm",
    "database_id": "把 Database ID 粘到这里",   // ← 加这一行
    "migrations_dir": "./migrations"
  }
]
```

> 绑定的变量名必须是 **`DB`**，代码里通过 `env.DB` 访问。

### 2. 填两个变量

**Workers & Pages → partnerrealm → Settings → Variables and Secrets → Add**

| 名称 | 类型 | 值 |
|---|---|---|
| `ADMIN_PASSWORD` | Secret | 后台登录口令，自己定 |
| `SESSION_SECRET` | Secret | 至少 32 位的随机字符串 |

保存即生效，不用重新部署。

### 3. 部署

```bash
npm run deploy
```

---

## 就这些

打开网址应该看到：

- 首页显示门户，底部联系方式是 support@partnerrealm.com / 18347348633
- `/admin.html` 出现登录框，输入你设的口令进入后台
- 后台里已有 5 家伙伴、6 个项目、6 份合同的示例数据，可以直接改成真实的

---

## 可选：微调参数

不填就用默认值。要改就在 **Settings → Variables and Secrets** 加 **Text** 类型：

| 名称 | 默认 | 作用 |
|---|---|---|
| `SESSION_TTL_HOURS` | 8 | 登录多久后要重新输口令 |
| `LOGIN_MAX_FAILS` | 8 | 同一 IP 错几次后锁定 |
| `LOGIN_WINDOW_MINUTES` | 15 | 锁定时长 |
| `PUBLIC_CACHE_SECONDS` | 60 | 门户缓存秒数，0 = 不缓存 |

填错了会自动回退默认值，不会让站点崩掉。

---

## 可选：绑定自己的域名

**Workers & Pages → partnerrealm → Settings → Domains & Routes → Add → Custom Domain**

域名需要先托管在 Cloudflare。证书自动签发。

---

## 常用操作

| 要做的事 | 怎么做 |
|---|---|
| 改口令 | `npx wrangler secret put ADMIN_PASSWORD` |
| 改网站内容 | 后台 → 门户内容 |
| 改业务数据 | 后台对应模块，保存即生效 |
| 备份 | 后台 → 系统与备份 → 导出 |
| 改代码后上线 | `npm run deploy` |
| 看报错 | `npx wrangler tail` |

---

## 出问题

| 提示 | 怎么办 |
|---|---|
| 未绑定 D1 数据库 | 绑定的变量名要叫 `DB`，检查 `wrangler.jsonc` |
| 未配置 SESSION_SECRET | 没设机密，见上面第 2 步 |
| SESSION_SECRET 过短 | 换一个 32 位以上的 |
| 登录后立刻退回登录页 | 用 HTTPS 访问，HTTP 下浏览器不保存 Secure Cookie |

接口的报错信息会直接写明缺什么、去哪里配，照着做即可。

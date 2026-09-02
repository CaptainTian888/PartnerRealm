-- 稳链同创 · 初始表结构
-- 说明：D1 默认开启外键约束。父子关系（联系人、里程碑）用 CASCADE 级联删除；
-- 业务引用（伙伴 → 项目/合同/资金）用 RESTRICT，删除前必须先处理引用，
-- 由 API 返回明确的冲突提示，避免产生孤儿记录。

-- 站点文案：每个区块一行 JSON（brand / hero / about / philosophy / stats / contact / footer）
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 组织架构
CREATE TABLE departments (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES departments(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_departments_parent ON departments(parent_id);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_members_dept ON members(department_id);

-- 合作伙伴
CREATE TABLE partners (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  short_name        TEXT NOT NULL DEFAULT '',
  type              TEXT NOT NULL DEFAULT '',
  tier              TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active',
  industry          TEXT NOT NULL DEFAULT '',
  region            TEXT NOT NULL DEFAULT '',
  website           TEXT NOT NULL DEFAULT '',
  since             TEXT NOT NULL DEFAULT '',
  owner_id          TEXT REFERENCES members(id) ON DELETE SET NULL,
  intro             TEXT NOT NULL DEFAULT '',
  tags              TEXT NOT NULL DEFAULT '[]',
  visible_on_portal INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_partners_status ON partners(status);

CREATE TABLE partner_contacts (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_contacts_partner ON partner_contacts(partner_id);

-- 项目
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  partner_id  TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  owner_id    TEXT REFERENCES members(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'planning',
  start_date  TEXT NOT NULL DEFAULT '',
  end_date    TEXT NOT NULL DEFAULT '',
  progress    INTEGER NOT NULL DEFAULT 0,
  budget      REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'CNY',
  description TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_projects_partner ON projects(partner_id);
CREATE INDEX idx_projects_status ON projects(status);

CREATE TABLE milestones (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_date   TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'todo',
  note       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_milestones_project ON milestones(project_id);

-- 合同
CREATE TABLE contracts (
  id                TEXT PRIMARY KEY,
  no                TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL,
  partner_id        TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type              TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft',
  amount            REAL NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'CNY',
  sign_date         TEXT NOT NULL DEFAULT '',
  effective_date    TEXT NOT NULL DEFAULT '',
  expiry_date       TEXT NOT NULL DEFAULT '',
  our_signatory     TEXT REFERENCES members(id) ON DELETE SET NULL,
  partner_signatory TEXT NOT NULL DEFAULT '',
  payment_terms     TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_contracts_partner ON contracts(partner_id);
CREATE INDEX idx_contracts_project ON contracts(project_id);

-- 资金流水
CREATE TABLE transactions (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL DEFAULT '',
  direction   TEXT NOT NULL DEFAULT 'in',
  category    TEXT NOT NULL DEFAULT '',
  partner_id  TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  amount      REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'CNY',
  status      TEXT NOT NULL DEFAULT 'planned',
  method      TEXT NOT NULL DEFAULT '',
  invoice_no  TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_tx_partner ON transactions(partner_id);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_status ON transactions(status);

-- 登录失败记录，用于限流；成功登录后清空该来源的记录
CREATE TABLE login_attempts (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ip   TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX idx_login_ip_at ON login_attempts(ip, at);

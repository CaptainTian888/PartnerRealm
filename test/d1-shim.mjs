/**
 * 用 node:sqlite 实现 D1 的最小可用子集，让 Worker 代码可以在 Node 里直接跑测试。
 * 覆盖 prepare / bind / first / all / run / batch，行为对齐 D1 文档。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }

  #prepared() {
    return this.db.prepare(this.sql);
  }

  async first(column) {
    const row = this.#prepared().get(...this.args);
    if (row === undefined) return null;
    return column ? row[column] : row;
  }

  async all() {
    const results = this.#prepared().all(...this.args);
    return { results, success: true, meta: {} };
  }

  async run() {
    const info = this.#prepared().run(...this.args);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

class D1 {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  /** D1 的 batch 是一个隐式事务，任一语句失败则整体回滚 */
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const stmt of statements) out.push(await stmt.run());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** 建一个内存库并跑完迁移 */
export function createTestDb(migrationFiles) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const file of migrationFiles) db.exec(fs.readFileSync(file, 'utf8'));
  return new D1(db);
}

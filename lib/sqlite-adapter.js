/**
 * node:sqlite 适配层
 *
 * 背景：Hana v2 App 的入口代码跑在独立 Node 子进程里，程序以 `--permission` 启动且
 * 不开 `--allow-addons`，原生模块（better-sqlite3 的 .node）无法加载。改用 Node 内置的
 * `node:sqlite`（宿主 Node ≥ 22 自带，Hana 1.1.0-beta 为 Node 26）。
 *
 * 本文件把 `node:sqlite` 包装成 better-sqlite3 风格的同步 API 子集，让 lib/db.js 及
 * 各 domain 模块基本无需改动：
 *
 *   new Database(path)      -> new DatabaseSync(path)
 *   db.exec(sql)            -> 透传
 *   db.pragma("k = v")      -> PRAGMA k = v（本仓库仅用于设置，不读值）
 *   db.prepare(sql)         -> Statement：run / get / all
 *   db.transaction(fn)      -> 返回可调用函数；嵌套用 SAVEPOINT
 *   db.close()
 *
 * 兼容处理：
 * - 参数归一化：undefined -> null，boolean -> 0/1（node:sqlite 不接受这两种绑定）
 * - run() 返回值对齐为 { changes, lastInsertRowid }，并把 bigint 归一为 Number
 */
import { DatabaseSync } from "node:sqlite";

function normalizeParams(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

function toNumber(value) {
  return typeof value === "bigint" ? Number(value) : value;
}

class Statement {
  constructor(stmt) {
    this._stmt = stmt;
  }
  run(...params) {
    const r = this._stmt.run(...normalizeParams(params));
    return {
      changes: toNumber(r.changes),
      lastInsertRowid: toNumber(r.lastInsertRowid),
    };
  }
  get(...params) {
    return this._stmt.get(...normalizeParams(params));
  }
  all(...params) {
    return this._stmt.all(...normalizeParams(params));
  }
  iterate(...params) {
    return this._stmt.iterate(...normalizeParams(params));
  }
}

export class Database {
  constructor(filePath, options = {}) {
    this._db = new DatabaseSync(filePath, options);
    // 对齐 better-sqlite3 的 db.name（数据库文件路径）；测试与工具会读它
    this.name = filePath;
    this._txDepth = 0;
  }

  exec(sql) {
    return this._db.exec(sql);
  }

  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }

  /** 仅支持设置型 PRAGMA（better-sqlite3 的 db.pragma 读值场景本仓库未使用） */
  pragma(source) {
    this._db.exec(`PRAGMA ${source}`);
  }

  /**
   * better-sqlite3 风格的同步事务包装。
   * 返回一个函数，调用时开启事务；支持嵌套（内层用 SAVEPOINT）。
   */
  transaction(fn) {
    const self = this;
    return function (...args) {
      const depth = self._txDepth;
      const savepoint = `neo_sp_${depth}`;
      if (depth === 0) self._db.exec("BEGIN");
      else self._db.exec(`SAVEPOINT ${savepoint}`);
      self._txDepth += 1;
      let result;
      try {
        result = fn.apply(this, args);
      } catch (err) {
        self._txDepth -= 1;
        try {
          if (depth === 0) {
            self._db.exec("ROLLBACK");
          } else {
            self._db.exec(`ROLLBACK TO ${savepoint}`);
            self._db.exec(`RELEASE ${savepoint}`);
          }
        } catch {
          /* 回滚失败不掩盖原始错误 */
        }
        throw err;
      }
      self._txDepth -= 1;
      if (depth === 0) self._db.exec("COMMIT");
      else self._db.exec(`RELEASE ${savepoint}`);
      return result;
    };
  }

  close() {
    return this._db.close();
  }

  get open() {
    return this._db.isOpen;
  }
}

export default Database;

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { ActorId, Job } from '@rj/shared';
import { migrate, openSqlite } from './connection.js';
import type { EntityStore, Filter, JobStore, ListOptions, Repository, Stores } from './repository.js';
import { TABLES, type TableKey, type TableSpec, toSnake } from './tables.js';

type Row = Record<string, unknown>;

class TxGate {
  active: Promise<void> | null = null;
}

class SqliteStore<T extends Row> implements EntityStore<T> {
  private readonly fields: string[];
  private readonly columns: Map<string, string>;

  constructor(
    protected readonly db: DatabaseSync,
    protected readonly spec: TableSpec,
    protected readonly gate: TxGate | null,
  ) {
    this.fields = Object.keys(spec.schema.shape);
    this.columns = new Map(this.fields.map((f) => [f, toSnake(f)]));
  }

  /**
   * Runs a synchronous DB operation once no transaction is active. The final check and the
   * operation happen in the same tick, so a transaction can never interleave with it.
   */
  protected async run<R>(fn: () => R): Promise<R> {
    if (this.gate) while (this.gate.active) await this.gate.active;
    return fn();
  }

  protected col(field: string): string {
    const c = this.columns.get(field);
    if (!c) throw new Error(`Unknown field "${field}" on ${this.spec.table}`);
    return c;
  }

  protected encode(field: string, value: unknown): SQLInputValue {
    if (value === undefined || value === null) return null;
    if (this.spec.json.includes(field)) return JSON.stringify(value);
    if (this.spec.bool.includes(field)) return value ? 1 : 0;
    return value as SQLInputValue;
  }

  protected decode(row: Row | undefined): T | null {
    if (!row) return null;
    const out: Row = {};
    for (const f of this.fields) {
      const raw = row[this.col(f)];
      if (this.spec.json.includes(f)) out[f] = raw === null || raw === undefined ? null : JSON.parse(String(raw));
      else if (this.spec.bool.includes(f)) out[f] = raw === null ? null : Number(raw) === 1;
      else out[f] = raw ?? null;
    }
    return this.spec.schema.parse(out) as T;
  }

  protected where(filter: Filter<T> = {}): { sql: string; params: SQLInputValue[] } {
    const parts: string[] = [];
    const params: SQLInputValue[] = [];
    const ops = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;
    for (const [field, cond] of Object.entries(filter)) {
      if (cond === undefined) continue;
      const c = this.col(field);
      if (cond === null) {
        parts.push(`${c} IS NULL`);
      } else if (typeof cond === 'object' && !Array.isArray(cond) && 'op' in (cond as object)) {
        const { op, value } = cond as { op: string; value: unknown };
        if (op === 'in' || op === 'notIn') {
          const arr = value as unknown[];
          if (arr.length === 0) {
            parts.push(op === 'in' ? '1=0' : '1=1');
            continue;
          }
          parts.push(`${c} ${op === 'in' ? 'IN' : 'NOT IN'} (${arr.map(() => '?').join(',')})`);
          params.push(...arr.map((v) => this.encode(field, v)));
        } else if (value === null) {
          parts.push(`${c} ${op === 'ne' ? 'IS NOT NULL' : 'IS NULL'}`);
        } else {
          parts.push(`${c} ${ops[op as keyof typeof ops]} ?`);
          params.push(this.encode(field, value));
        }
      } else {
        parts.push(`${c} = ?`);
        params.push(this.encode(field, cond));
      }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }

  protected order(options: ListOptions<T> = {}): string {
    let sql = '';
    if (options.orderBy) sql += ` ORDER BY ${this.col(options.orderBy)} ${options.desc ? 'DESC' : 'ASC'}`;
    if (options.limit !== undefined) sql += ` LIMIT ${Math.max(0, Math.floor(options.limit))}`;
    if (options.offset !== undefined) sql += ` OFFSET ${Math.max(0, Math.floor(options.offset))}`;
    return sql;
  }

  protected insertSync(row: T, mode: 'insert' | 'upsert'): T {
    const parsed = this.spec.schema.parse(row) as T;
    const cols = this.fields.map((f) => this.col(f));
    const pk = this.col(this.spec.pk);
    const conflict =
      mode === 'upsert'
        ? ` ON CONFLICT(${pk}) DO UPDATE SET ${cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`).join(', ')}`
        : '';
    this.db
      .prepare(`INSERT INTO ${this.spec.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})${conflict}`)
      .run(...this.fields.map((f) => this.encode(f, parsed[f])));
    return parsed;
  }

  protected getSync(id: string): T | null {
    return this.decode(
      this.db.prepare(`SELECT * FROM ${this.spec.table} WHERE ${this.col(this.spec.pk)} = ?`).get(id) as Row | undefined,
    );
  }

  async insert(row: T): Promise<T> {
    return this.run(() => {
      return this.insertSync(row, 'insert');
    });
  }

  async upsert(row: T): Promise<T> {
    return this.run(() => {
      return this.insertSync(row, 'upsert');
    });
  }

  async get(id: string): Promise<T | null> {
    return this.run(() => {
      return this.getSync(id);
    });
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    return this.run(() => {
      const current = this.getSync(id);
      if (!current) throw new Error(`${this.spec.table} ${id} not found`);
      const next = this.spec.schema.parse({ ...current, ...patch, [this.spec.pk]: id }) as T;
      const fields = Object.keys(patch).filter((f) => f !== this.spec.pk && this.columns.has(f));
      if (fields.length === 0) return current;
      this.db
        .prepare(
          `UPDATE ${this.spec.table} SET ${fields.map((f) => `${this.col(f)} = ?`).join(', ')} WHERE ${this.col(this.spec.pk)} = ?`,
        )
        .run(...fields.map((f) => this.encode(f, next[f])), id);
      return next;
    });
  }

  async list(filter?: Filter<T>, options?: ListOptions<T>): Promise<T[]> {
    return this.run(() => {
      const w = this.where(filter);
      const rows = this.db.prepare(`SELECT * FROM ${this.spec.table}${w.sql}${this.order(options)}`).all(...w.params) as Row[];
      return rows.map((r) => this.decode(r)!);
    });
  }

  async first(filter?: Filter<T>, options?: ListOptions<T>): Promise<T | null> {
    const rows = await this.list(filter, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async count(filter?: Filter<T>): Promise<number> {
    return this.run(() => {
      const w = this.where(filter);
      const r = this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.spec.table}${w.sql}`).get(...w.params) as { n: number };
      return Number(r.n);
    });
  }

  async sum(field: keyof T & string, filter?: Filter<T>): Promise<number | null> {
    return this.run(() => {
      const w = this.where(filter);
      const r = this.db
        .prepare(`SELECT SUM(${this.col(field)}) AS s FROM ${this.spec.table}${w.sql}`)
        .get(...w.params) as { s: number | null };
      return r.s === null ? null : Number(r.s);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.run(() => {
      const r = this.db.prepare(`DELETE FROM ${this.spec.table} WHERE ${this.col(this.spec.pk)} = ?`).run(id);
      return Number(r.changes) > 0;
    });
  }
}

class SqliteJobStore extends SqliteStore<Job & Row> implements JobStore {
  async claim(id: string, startedAt: string): Promise<Job | null> {
    return this.run(() => {
      const r = this.db
        .prepare(`UPDATE jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'`)
        .run(startedAt, id);
      return Number(r.changes) === 1 ? this.getSync(id) : null;
    });
  }
}

function buildStores(db: DatabaseSync, gate: TxGate | null): Stores {
  const stores: Record<string, unknown> = {};
  for (const key of Object.keys(TABLES) as TableKey[]) {
    const spec = TABLES[key] as unknown as TableSpec;
    stores[key] = key === 'jobs' ? new SqliteJobStore(db, spec, gate) : new SqliteStore(db, spec, gate);
  }
  return stores as Stores;
}

function makeRepository(db: DatabaseSync, gate: TxGate, inTx: boolean, onClose: () => void): Repository {
  const stores = buildStores(db, inTx ? null : gate);
  const repo: Repository = {
    ...stores,
    dialect: 'sqlite',
    async transaction<R>(fn: (tx: Repository) => Promise<R>): Promise<R> {
      if (inTx) return fn(repo);
      // Inline loop (no extra await when idle) so the gate is taken synchronously.
      while (gate.active) await gate.active;
      let release!: () => void;
      gate.active = new Promise<void>((r) => (release = r));
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(txRepo);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        gate.active = null;
        release();
      }
    },
    async getConfig<V>(key: string): Promise<V | null> {
      const row = await stores.systemConfiguration.get(key);
      return row ? (row.value as V) : null;
    },
    async setConfig(key: string, value: unknown, updatedBy: string): Promise<void> {
      await stores.systemConfiguration.upsert({
        key,
        value,
        updatedBy: updatedBy as ActorId,
        updatedAt: new Date().toISOString(),
      });
    },
    async close(): Promise<void> {
      onClose();
    },
  };
  const txRepo: Repository = inTx ? repo : makeRepository(db, gate, true, onClose);
  return repo;
}

export interface SqliteRepositoryOptions {
  /** Run pending migrations on open (default true). */
  migrate?: boolean;
}

/** Opens a SQLite-backed repository. Pass ':memory:' for an in-memory database. */
export function createSqliteRepository(path: string, options: SqliteRepositoryOptions = {}): Repository {
  const db = openSqlite(path);
  if (options.migrate !== false) migrate(db);
  return makeRepository(db, new TxGate(), false, () => db.close());
}
